# アーキテクチャ設計

## データフロー

```
[各コレクター]
  SlackCollector
  GmailCollector        →  RawLog[]  →  deduplicateLogs()  →  extractSignals()  →  Notion (シグナル DB)
  CalendarCollector
  VoiceLogCollector

[週次バッチ]
  listSignals()  →  buildStory()  →  saveStory()  →  Notion (ストーリー DB)

[対話時]
  listDecisionRules()  ┐
  listSignals()        ├→  buildSystemPrompt()  →  Claude API  →  回答
  listStories()        ┘
```

## ディレクトリ責務

| パス | 責務 |
|------|------|
| `src/collectors/` | 外部サービスからの RawLog 取得のみ。副作用なし。 |
| `src/lib/dedup.ts` | RawLog の重複除去。純粋関数。 |
| `src/lib/claude.ts` | Anthropic API の薄いラッパー。副作用は API 呼び出しのみ。 |
| `src/lib/notion.ts` | Notion DB の CRUD。型安全なアクセサ。 |
| `src/app/api/` | HTTP 境界。認証・バリデーション・エラーハンドリング。 |
| `src/app/` | UI。API Route を呼ぶのみ。DB を直接参照しない。 |
| `scripts/` | バッチ。API Route を HTTP で呼ぶか、lib を直接呼ぶ。 |
| `mcp/` | Claude Code からの Google Workspace 読み取りブリッジ。 |

## 認証フロー

```
バッチスクリプト
  → POST /api/collect
  → Header: x-internal-secret: $INTERNAL_API_SECRET
  → 一致すれば処理継続

UI（対話ページ）
  → POST /api/chat
  → Header: x-user-email: <ユーザーのメールアドレス>（Next-Auth 等から取得）
  → ALLOWED_EMAILS に含まれる場合のみ処理継続
```

> ⚠ 現在の認証は簡易実装です。本番導入前に Next-Auth（Google OAuth）等で
> セッション管理を実装し、`x-user-email` の自己申告を廃止してください。

## Notion スキーマ設計の意図

Notion を DB として採用した理由：
1. 経営者・経営企画が直接データを目視・編集できる
2. シグナルやストーリーへのコメント・補足が容易
3. ビュー（フィルタ・ソート）でデータを多角的に確認可能
4. 初期の意思決定ルール登録が非エンジニアでも可能

## Claude プロンプト設計

### シグナル抽出プロンプト（`lib/claude.ts`）

1ログ = 1 リクエスト。コスト削減のため、まず雑談判定をして重要なものだけ詳細抽出。

### システムプロンプト（対話用）

毎回の対話で以下を注入：
- 意思決定ルール（優先度順、最大 15 件）
- 直近シグナル（最大 30 件）
- 関連ストーリー（最大 5 件）

プロンプトサイズが大きくなるため、将来的には RAG（ベクトル検索）で関連性の高い
シグナル・ストーリーのみを注入する形に移行を検討。
