# CLAUDE.md

このリポジトリで作業する AI アシスタント向けのガイドです。

## 概要

> **ピボット中（2026-07 〜）**: 本プロダクトは映画レコメンドアプリ **mood-cinema** から、
> 脚本開発の統合エディタ **Scene Studio** へ全面ピボットしています。方針・情報設計・命名の
> 原則は [`docs/scene-studio-concept.md`](docs/scene-studio-concept.md) を正とします。
> 旧レコメンド機能（気分バルーン → TMDB → 5 本）は撤去せず「**参考作品ファインダー**」
> （`/mood` → `/result`）として、書いている物語のトーンに近い作品を引く素材ツールに転生。
> エディタ本体は `/hako`（箱書き）。以下の記述のうち "映画を観る人向け" の文脈は、
> この参考作品ファインダーの説明として読み替えてください。

**mood-cinema** は、ユーザーの「今の気分」と「シチュエーション」に基づいて映画を
レコメンドする、日英バイリンガルの PWA です。ユーザーが絵文字の「バルーン」
（気分・シーン・雰囲気 …）をいくつか選ぶと、その組み合わせを
[TMDB](https://www.themoviedb.org/) Discover API のパラメータに変換し、
マッチする映画トップ 5 を表示します。各作品にはアフィリエイトリンク
（U-NEXT / Amazon）と SEO コンテンツが付きます。

**バックエンドは存在しません**。完全なクライアントサイド SPA で、すべてのロジックは
ブラウザ上で動作します。TMDB はリードトークンを使ってクライアントから直接呼び出し、
レスポンスは `localStorage` にキャッシュします。収益化はアフィリエイトリンクと
（承認後の）Google AdSense で行います。ユーザー向けの文言やコード内コメントの多くは
日本語です。この慣習を維持してください。

## 技術スタック

- **React 19** + **react-router-dom 7**（SPA ルーティング）
- **Vite 8**（開発サーバー + ビルド）、`@vitejs/plugin-react` を使用
- **TypeScript 5.9**、strict モード、プロジェクト参照構成
  （`src` 用の `tsconfig.app.json` と、ビルドツール用の `tsconfig.node.json`）
- CSS フレームワークなし — 手書き CSS（`src/styles/` の `tokens.css`
  デザイントークン + `global.css`）
- **Vercel** にデプロイ（設定は `vercel.json`）
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
ビルドを実行してください。strict TS に通らないと Vercel のデプロイが失敗します。

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

中核となるループは **バルーン選択 → マッピング → TMDB クエリ → 結果表示** です。

1. **`src/pages/Mood.tsx`** — 選択画面。選択中のバルーン ID は URL
   （`/mood?s=cry,solo`）に保持され、送信すると `/result?b=cry,solo` へ遷移します。
   選択数は 2〜6 個に制限されています。
2. **`src/data/balloons.ts`** — `BALLOONS` のカタログ。各バルーンは `category`
   （`mood`/`scene`/`intensity`/`theme`/`atmosphere`/`with`）と `weights`
   （気分スコア、ジャンルスコア、runtime、atmosphere など）を持ちます。
   クイズコンテンツの単一の真実の源（source of truth）です。
3. **`src/lib/balloonMapper.ts`** — `buildParamsFromBalloons()` がアプリの心臓部。
   バルーンの weights を集約して主気分・上位ジャンル・除外ジャンル・runtime・
   評価しきい値などを求め、TMDB `DiscoverParams` と表示ラベル、推薦理由テキストを
   生成します。`dailyPage()` が TMDB の取得ページを日替わりでローテーションし、
   結果に新鮮味を持たせています。
4. **`src/data/moodMapping.ts`** — `GENRE` の ID 定数、`MOOD_CONFIG`
   （気分 → 基本ジャンル + 理由テンプレート）、`DiscoverParams` 型、
   `buildRecommendReason()`。
5. **`src/lib/tmdb.ts`** — 型付き TMDB クライアント。`/discover/movie` と
   日本の配信プロバイダ取得をラップします。全リクエストは `localStorage` に 24 時間
   キャッシュ（`mc:tmdb:` プレフィックス）。`TmdbConfigError`（トークン未設定）または
   `TmdbApiError`（非 2xx）を投げ、いずれも `Result.tsx` で処理します。
6. **`src/pages/Result.tsx`** — 取得して映画 5 件にスライスし、`MovieCard` +
   `AdBanner` + 関連記事を描画、履歴保存、アナリティクス送信を行います。
   このページはクエリ依存のため `noindex` です。

### ルーティングと i18n

`src/App.tsx` は同一の `AppShell` から **2 つの**ルートツリーをマウントします。

- `/*` → 日本語（`prefix = ''`、`lang = 'ja'`）
- `/en/*` → 英語（`prefix = '/en'`、`lang = 'en'`）

シェル内のルートは prefix 相対です。**リンクやルートを追加する際は、必ず
`useI18n()` から得た `prefix` を使ってパスを組み立て**（例: `` `${prefix}/mood` ``）、
`/mood` のようにハードコードしないでください。翻訳は `src/i18n/ja.ts` と
`src/i18n/en.ts` にあり（同じ形状 — `Translations` は `typeof ja`）、`useI18n()`
経由でアクセスします。`/quiz` は `/mood` へリダイレクトするレガシーパスです
（`vercel.json` でも強制）。

### その他のライブラリ（`src/lib/`）

- `seo.ts` — `useSeo()` フックが `<head>`（title、meta、OG、canonical、hreflang、
  JSON-LD）を命令的に管理。`buildArticleJsonLd` / `buildBreadcrumbJsonLd` ヘルパー
  あり。SPA は SSR なしのため、SEO はページごとにクライアントサイドで行います。
- `history.ts` — 直近 10 件の診断を `localStorage`（`mc:history`）に保存。
- `analytics.ts` — GA4 `gtag` の薄いラッパー（`track.*`）。`index.html` に GA を
  組み込むまでは no-op。
- `affiliate.ts` — タグ付きの Amazon / U-NEXT 検索 URL を生成。
- `courseNames.ts` — 選択 ID から日本語の「コース」ラベルを生成。

### コンテンツデータ（`src/data/`）

- `articles.ts` / `articles.en.ts` — SEO 用ロングフォーム記事（日/英）。
  各ファイルが `ARTICLES` と `ARTICLE_MAP` をエクスポート。
- `sceneLandings.ts` — `/scene/:slug` の静的 SEO ランディングページ。バルーンの
  組み合わせをプリセットします。
- `moodArticleMap.ts` — バルーン ID → `/result` で表示する関連記事のマッピング。

## 慣習と注意点

- **sitemap のスラッグ一覧は重複している。** `scripts/generate-sitemap.mjs` は
  `ARTICLE_SLUGS` と `SCENE_SLUGS` をハードコードしています。`articles.ts` に記事を、
  または `sceneLandings.ts` にランディングを追加・削除したら、**sitemap スクリプト側の
  対応するリストも更新**してください。さもないと新ページがインデックスされません。
- **バルーン ID は実質的な公開 API。** URL（`?b=`、`?s=`）、`i18n/*.ts` のショートカット、
  `moodArticleMap.ts`、`sceneLandings.ts`、`courseNames.ts` に登場します。バルーン ID を
  リネームすると共有リンクやこれらの相互参照が壊れるため、変更前に必ず grep してください。
- **縮退動作は意図的。** アフィリエイト/広告/アナリティクスの環境変数が未設定でも
  UI が壊れてはいけません。`?? ''` / `Boolean(...)` のガードや空状態処理を維持してください。
- **strict TS、未使用シンボル禁止。** 未使用の import/変数/引数を残さないこと —
  ビルドが失敗します。既存の型付き・関数型のスタイルに合わせてください。
- **localStorage アクセスは常に try/catch で包む**（quota / プライベートモード対策）。
  新しい永続化処理でもこのパターンに従ってください。
- **CSP は `vercel.json` で厳格に制限**されています。script/style は `'self'` +
  `'unsafe-inline'`、画像は `image.tmdb.org` のみ、通信は `api.themoviedb.org` のみ。
  新しい外部オリジン（アナリティクス、広告、フォント）を追加する場合は、そこの CSP
  ヘッダーと `index.html` 内の対応するスニペットの両方を更新する必要があります。
- このプロジェクトでは UI 文言・コメント・コミットの文脈の既定言語は日本語です。
  新しいユーザー向け文字列はバイリンガルで（`ja.ts` と `en.ts` の両方に追加）してください。

## デプロイ

GitHub にプッシュ → Vercel が自動ビルド（`npm run build`）し `dist/` を配信します。
`vercel.json` が SPA リライト（すべて → `index.html`）、`/quiz`→`/mood`
リダイレクト、manifest の content-type、セキュリティヘッダーを処理します。環境変数は
Vercel ダッシュボードで設定してください。公開・アフィリエイトの全手順は
`README.md` / `QUICKSTART.md`（いずれも日本語）を参照。

## Git ワークフロー

今回の作業ブランチ: `claude/claude-md-docs-lamsf5`。明確なメッセージでコミットし、
`git push -u origin <branch>` でプッシュします。明示的に依頼されない限りプルリクエストは
作成しないでください。
