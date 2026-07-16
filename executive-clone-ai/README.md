# 経営者クローン AI システム

経営者の意思決定の仕組みと思考をデジタル化し、経営企画・部門長が会議前に AI と壁打ちできるシステムです。
事前準備による会議回数の削減と、意思決定速度の向上を目的とします。

## システム概要

```
日常データ収集
(Slack / Gmail / Calendar / 会議録音 / 音声ライフログ)
        ↓
   シグナル抽出
(Claude API で重要情報を自動フィルタリング)
        ↓
  ストーリー構築
(因果関係を持つ意思決定パターンとして整理)
        ↓
  対話インターフェース
(経営者の分身として壁打ち)
```

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 14 + TypeScript（App Router） |
| AI エンジン | Anthropic Claude API（claude-opus-4-8）|
| データベース | Notion API（シグナル / ストーリー / ルール） |
| データ収集 | Slack API / Gmail API / Google Calendar API |
| 音声文字起こし | OpenAI Whisper |
| 社内データ連携 | MCP（Google Drive / Docs） |

## セットアップ

```bash
# 1. 依存関係インストール
npm install

# 2. 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集して各キーを設定

# 3. 開発サーバー起動
npm run dev
```

http://localhost:3000 でアクセス。

### 必須環境変数

| 変数 | 用途 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API（Anthropic コンソールで取得） |
| `NOTION_API_KEY` | Notion Integration Token |
| `NOTION_SIGNAL_DB_ID` | シグナル保存先 Notion DB の ID |
| `NOTION_STORY_DB_ID` | ストーリー保存先 Notion DB の ID |
| `NOTION_DECISION_RULE_DB_ID` | 意思決定ルール Notion DB の ID |

## Notion DB の準備

### シグナル DB

| プロパティ名 | 型 |
|------------|-----|
| ID | タイトル |
| カテゴリ | セレクト（hypothesis / key_person / idea / policy / market / other） |
| 要約 | テキスト |
| 発生日時 | 日付 |
| ソース | セレクト |
| 抽出理由 | テキスト |
| 原文 | テキスト |

### ストーリー DB

| プロパティ名 | 型 |
|------------|-----|
| タイトル | タイトル |
| 要約 | テキスト |
| 結果 | テキスト |
| パターン | セレクト |
| 生成日時 | 日付 |

### 意思決定ルール DB

| プロパティ名 | 型 |
|------------|-----|
| タイトル | タイトル |
| 内容 | テキスト |
| 優先度 | 数値（1 = 最高） |

## 日次バッチ処理

```bash
# データ収集 + シグナル抽出（毎朝 cron で実行）
npm run collect

# ストーリー生成（毎週末に実行）
npm run story
```

## MCP（Google Workspace 連携）

```bash
# Google Drive / Docs を Claude Code から読み取るための MCP サーバー
npx tsx mcp/google-workspace/index.ts
```

CLAUDE.md に以下を追記してください：

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["tsx", "mcp/google-workspace/index.ts"]
    }
  }
}
```

## セキュリティ

- すべての LLM API 呼び出しは API Route 経由（クライアントへの直接公開なし）
- `ALLOWED_EMAILS` で対話インターフェースへのアクセスを制限
- `INTERNAL_API_SECRET` でバッチ → API 間の認証
- Anthropic API はデータ学習除外エンドポイントを使用
- `robots: noindex` により検索エンジンに非公開

## ディレクトリ構成

```
executive-clone-ai/
├── src/
│   ├── app/               # Next.js ページ + API Route
│   │   ├── chat/          # 対話インターフェース
│   │   ├── signals/       # シグナル一覧
│   │   ├── stories/       # ストーリー一覧
│   │   └── api/           # バックエンド API
│   ├── collectors/        # データコレクター
│   │   ├── slack.ts
│   │   ├── gmail.ts
│   │   ├── calendar.ts
│   │   └── voice.ts       # 音声ライフログ（Whisper）
│   ├── lib/               # コアロジック
│   │   ├── claude.ts      # Claude API クライアント
│   │   ├── notion.ts      # Notion DB クライアント
│   │   └── dedup.ts       # 重複ログ除去
│   └── types/             # 型定義
├── mcp/
│   └── google-workspace/  # MCP サーバー
└── scripts/               # バッチスクリプト
    ├── collect.ts
    └── build-stories.ts
```

## 運用上の注意

1. **経営者の全面協力が前提** — 録音・ログ収集に心理的に順応し、自らも AI と対話するコミットメントが不可欠
2. **アナログ情報のデジタル化** — 手書きメモが多い場合は収集が停滞する。デジタルファーストな情報共有が前提
3. **意思決定ルールの初期登録** — 15 個程度のルールを Notion に手動登録してからシステムを運用開始する
4. **データ保護** — 経営機密を含むため `ALLOWED_EMAILS` による厳格なアクセス制限を必ず設定すること
