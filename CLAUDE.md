# CLAUDE.md

このリポジトリで作業する AI アシスタント向けのガイドです。

## 概要

**Tsumugi（紬）** は脚本開発の統合エディタです（旧・映画レコメンドアプリ mood-cinema から
全面ピボットし、**2026-07 に旧レコメンド機能を完全撤去**しました。リポジトリ名だけが
旧名のまま残っています）。方針・情報設計・命名の原則は
[`docs/tsumugi-concept.md`](docs/tsumugi-concept.md) を正とします。

- **エディタ `/hako`** — 主役。メモ帳（白い紙にただ書く。1 行＝1 箱、字下げ＝入れ子）と
  カード（並べ替え・幕振り）の 2 表示。複数作品・ゴミ箱・取り込み・JSON バックアップ。
- **逆ハコ `/gyaku`** — 映画を一時停止しながらシーンを打刻し、開始時刻つきの箱書きに
  分解する勉強ツール。TMDB で作品検索・尺・配信先を取得（未設定なら手入力に縮退）。
- **アカウント `/account`** — メール OTP ログイン。作品単位 LWW のクラウド同期
  （Supabase。未設定なら導線ごと非表示に縮退）。

**バックエンドは持ちません**。完全なクライアントサイド SPA で、localStorage が真実の源。
TMDB・Supabase はクライアントから直接呼びます。ユーザー向けの文言やコード内コメントの
多くは日本語です。この慣習を維持してください。

### 最上位の設計理念：絶対にユーザーのデータを消さない

破壊的操作は明示的・確認つき・復元可能に（ソフト削除＝ゴミ箱、対象限定の Undo、
JSON バックアップ）。自動処理でユーザーの本文を静かに失わない（同期は作品単位 LWW で
ローカルを絶対に落とさない、メモ帳の書き戻しは id と打刻時刻を引き継ぐ）。迷ったら
消さない方に倒す。

## 技術スタック

- **React 19** + **react-router-dom 7**（SPA ルーティング）
- **Vite 8**（開発サーバー + ビルド）、`@vitejs/plugin-react` を使用
- **TypeScript 5.9**、strict モード、プロジェクト参照構成
  （`src` 用の `tsconfig.app.json` と、ビルドツール用の `tsconfig.node.json`）
- CSS フレームワークなし — 手書き CSS（`src/styles/` の `tokens.css`
  デザイントークン + `global.css`）
- **Vercel** または **Cloudflare Pages** にデプロイ（設定は `vercel.json` と
  `public/_headers` / `public/_redirects` の両方を同内容で保持）
- **テストランナーと ESLint の設定はありません**。自動チェックは
  TypeScript コンパイラ（`tsc -b`）のみで、strict 設定
  （`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`）です。

## コマンド

```bash
npm install            # 依存関係をインストール
npm run setup          # .env.local をサンプルから生成（node scripts/setup.mjs）
npm run dev            # vite 開発サーバー（既定 http://localhost:5173）
npm run build          # tsc -b && vite build && dist/sitemap.xml を生成
npm run preview        # 本番ビルドをローカルで配信
```

`lint` や `test` スクリプトはありません。変更がコンパイルできるか確認するには
`npm run build`（または `npx tsc -b`）を実行します。自明でない変更の後は必ず
ビルドを実行してください。strict TS に通らないとデプロイが失敗します。

## 環境変数

すべての環境変数は `VITE_` プレフィックス付き（Vite によりクライアントへ公開）です。
`.env.local.example` を `.env.local` にコピーしてください。アプリの動作に必須なのは
`VITE_TMDB_TOKEN` のみで、それ以外は未設定でも安全に縮退動作します。

| 変数 | 必須 | 用途 |
|------|------|------|
| `VITE_TMDB_TOKEN` | ✅ | TMDB API v4 Read Access Token（Bearer）。未設定だと `/result` で設定エラーを表示。 |
| `VITE_AMAZON_TAG` | | Amazon 検索リンクに付与するアソシエイトタグ。 |
| `VITE_UNEXT_REDIRECT_PREFIX` | | U-NEXT リンクを包む A8.net リダイレクトテンプレート。未設定なら素の U-NEXT URL。 |
| `VITE_ADSENSE_CLIENT` | | AdSense パブリッシャー ID。未設定なら広告枠は何も描画しない。 |
| `VITE_SITE_URL` | | OGP / canonical / sitemap 用の正規オリジン。既定は `https://mood-cinema.example.com`。 |

## アーキテクチャとデータフロー

中核は **箱書きのデータモデル（`src/lib/hakogaki.ts`）** です。

1. **`src/lib/hakogaki.ts`** — 単一の真実の源。`Workspace`（複数作品）→ `Outline`（作品）→
   `Box[]`（flat な並び。`depth` で入れ子、`act` で幕、`at` で逆ハコの打刻秒）。
   localStorage（`mc:hakogaki:ws`）へ自動保存。純関数群：メモ帳の往復
   （`outlineToNotepad` / `parseNotepad` / `reconcileBoxes` — **id と打刻時刻を引き継ぐ**）、
   幕またぎ移動（`moveBoxAcross` / `setBoxAct`）、選択の入れ子化（`nestSelection`）、
   テキスト取り込み（`parseOutlineText`）、JSON バックアップ、旧データ移行。
2. **`src/pages/Hako.tsx`** — エディタ画面。メモ帳（既定）とカードの 2 表示、
   素早い書き出し欄、取り込み、バックアップ、ゴミ箱、クラウド同期の結線。
3. **`src/pages/Gyaku.tsx`** — 逆ハコ。打刻セッションは `mc:gyaku:session` に常時保存
   （リロードしても復元）。保存すると通常の作品としてワークスペースへ追加。
4. **`src/lib/tmdb.ts`** — TMDB クライアント（検索・尺・日本の配信先）。24 時間
   localStorage キャッシュ（`mc:tmdb:`）。トークン未設定なら `TmdbConfigError` を投げ、
   逆ハコは手入力に縮退。
5. **`src/lib/cloudSync.ts` / `auth.ts` / `supabase.ts`** — 作品単位 LWW の同期と
   メール OTP 認証。Supabase の env 2 変数が無ければ全機能が縮退（導線ごと非表示）。
   ローカルの作品は絶対に落とさない。SQL / RLS は `docs/supabase-setup.sql`。
6. **`src/lib/affiliate.ts`** — 逆ハコの配信先リンク（`providerUrl`。U-NEXT / Amazon は
   アフィリエイト経路に載る）。

### ルーティングと i18n

`src/App.tsx` は同一の `AppShell` から **2 つの**ルートツリーをマウントします。

- `/*` → 日本語（`prefix = ''`、`lang = 'ja'`）
- `/en/*` → 英語（`prefix = '/en'`、`lang = 'en'`）

ルートは `/`（ホーム）、`/hako`、`/gyaku`、`/account`、`/about`、`/privacy`、`/contact`。
シェル内のルートは prefix 相対です。**リンクやルートを追加する際は、必ず
`useI18n()` から得た `prefix` を使ってパスを組み立て**（例: `` `${prefix}/hako` ``）、
ハードコードしないでください。翻訳は `src/i18n/ja.ts` と `src/i18n/en.ts`
（同じ形状 — `Translations` は `typeof ja`）。新しいユーザー向け文字列は必ず両方に追加。

## 慣習と注意点

- **ページを増やしたら `scripts/generate-sitemap.mjs` の `CORE_PATHS` も更新**すること。
- **縮退動作は意図的。** TMDB / Supabase / アフィリエイトの環境変数が未設定でも
  UI が壊れてはいけません。`?? ''` / `Boolean(...)` のガードや空状態処理を維持してください。
- **localStorage のキーは公開 API 扱い**（`mc:hakogaki:ws`・`mc:gyaku:session`・
  `mc:hako:view` 等）。形を変えるときは必ず旧データからの移行を書くこと。
- **strict TS、未使用シンボル禁止。** 未使用の import/変数/引数を残さないこと —
  ビルドが失敗します。既存の型付き・関数型のスタイルに合わせてください。
- **localStorage アクセスは常に try/catch で包む**（quota / プライベートモード対策）。
  新しい永続化処理でもこのパターンに従ってください。
- **CSP は厳格に制限**されています。script/style は `'self'` + `'unsafe-inline'`、
  画像は `image.tmdb.org` のみ、通信は `api.themoviedb.org` と `*.supabase.co` のみ。
  新しい外部オリジンを追加する場合は **`vercel.json` と `public/_headers` の両方**を
  同内容で更新すること。
- このプロジェクトでは UI 文言・コメント・コミットの文脈の既定言語は日本語です。
  新しいユーザー向け文字列はバイリンガルで（`ja.ts` と `en.ts` の両方に追加）してください。

## デプロイ

GitHub にプッシュ → Vercel / Cloudflare Pages が自動ビルド（`npm run build`）し `dist/` を配信します。
**ランニングコスト ¥0 の構成（Cloudflare Pages ＋ Supabase Free ＋ Stripe）と移行手順は
[`docs/deploy-zero-cost.md`](docs/deploy-zero-cost.md) を参照。** Vercel の Hobby は規約上
商用利用不可なので、収益化する場合は Cloudflare Pages へ移すこと。
ホスティング設定は 2 系統を同内容で維持する（`vercel.json` ／ `public/_headers`・`public/_redirects`）
— **CSP やリダイレクトを変えるときは必ず両方を直す。**
`vercel.json` が SPA リライト（すべて → `index.html`）、`/quiz`→`/mood`
リダイレクト、manifest の content-type、セキュリティヘッダーを処理します。環境変数は
Vercel ダッシュボードで設定してください。公開・アフィリエイトの全手順は
`README.md` / `QUICKSTART.md`（いずれも日本語）を参照。

## Git ワークフロー

今回の作業ブランチ: `claude/claude-md-docs-lamsf5`。明確なメッセージでコミットし、
`git push -u origin <branch>` でプッシュします。明示的に依頼されない限りプルリクエストは
作成しないでください。
