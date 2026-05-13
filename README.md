# mood-cinema

気分で選ぶ映画レコメンド診断 PWA。React 19 + Vite + TypeScript。

## セットアップ

```bash
cd mood-cinema
npm install
cp .env.local.example .env.local
# .env.local に VITE_TMDB_TOKEN を設定
npm run dev
```

## 環境変数 (.env.local)

| 変数 | 必須 | 取得元 |
|------|------|--------|
| `VITE_TMDB_TOKEN` | ✅ | https://www.themoviedb.org/settings/api (API Read Access Token) |
| `VITE_AMAZON_TAG` |  | https://affiliate.amazon.co.jp |
| `VITE_UNEXT_REDIRECT_PREFIX` |  | A8.net 提携後の媒体管理画面 |
| `VITE_ADSENSE_CLIENT` |  | AdSense 承認後 (例: `ca-pub-XXXXXXXX`) |
| `VITE_SITE_URL` |  | 公開後の独自ドメイン |

未設定でも UI は動作するが、TMDB トークンが無いと `/result` で取得エラーが出る。

## デプロイ

1. GitHub にプッシュ
2. Vercel に接続 (Vite 自動認識)
3. Vercel ダッシュボードで上記環境変数を設定
4. 独自ドメインを設定 (AdSense・A8.net 提携にほぼ必須)

## アフィリエイト設定の流れ

詳しくはプランファイル `~/.claude/plans/hazy-rolling-mist.md` を参照。

1. TMDB API トークン取得 (即日)
2. Vercel デプロイ + 独自ドメイン取得
3. プライバシーポリシー / 運営者情報 / お問い合わせを公開状態にする
4. A8.net 登録 → U-NEXT 提携申請
5. Amazon アソシエイト申請
6. PV 安定 (記事 10 本前後・月 1000PV 程度) で AdSense 申請

## ディレクトリ構成

```
src/
  pages/      画面 (Home, Quiz, Result, Article, ArticleList, Privacy, About, Contact, NotFound)
  components/ MovieCard, AffiliateButtons, AdBanner, StepIndicator, ShareButtons
  lib/        tmdb (API), affiliate (URL builder), seo (meta), history (localStorage)
  data/       questions (診断設問), moodMapping (TMDB パラメータ変換), articles (SEO 記事)
  styles/     tokens.css, global.css
```

## 検証

- 開発: `npm run dev`
- 本番ビルド: `npm run build && npm run preview`
- 診断フロー: 5 ステップ → 結果 5 件カード表示
- TMDB API 呼び出しは 24h `localStorage` キャッシュ済み
