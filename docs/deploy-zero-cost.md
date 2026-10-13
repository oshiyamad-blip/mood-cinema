# ランニングコスト ¥0 で運用する構成

作成日 2026-07-24。固定費を発生させずに公開・収益化するための構成と手順。

## 構成

| 役割 | 使うもの | 費用 | 備考 |
|---|---|---|---|
| ホスティング | **Cloudflare Pages** | ¥0 | **商用利用可・帯域無制限**。ここが要 |
| 同期 DB ＋ 認証 | **Supabase Free** | ¥0 | 500MB。実測でヘビーユーザー約 4,000 人分 |
| 決済 | **Stripe** | ¥0 | 固定費なし。売れたときだけ 3.6% |
| 決済の受け口 | **Supabase Edge Functions** | ¥0 | 月 50 万回まで無料 |
| ドメイン | 任意 | 年 ¥1,500 | `*.pages.dev` のままなら ¥0 |

固定費は実質ドメイン代のみ。1 本売れた時点で黒字になる。

### なぜ Vercel から移すのか

Vercel の **Hobby プランは規約で商用利用が不可**で、収益化するなら Pro（月 $20）が必要になる。
Cloudflare Pages は無料枠で商用利用が認められているため、同じ静的 SPA を無料で運用できる。
（趣味の範囲で公開し続けるだけなら Vercel Hobby のままでも問題ない。`vercel.json` は残してある。）

## データ量の実測

1 作品（箱書き）の同期 JSON サイズ：

| 規模 | サイズ |
|---|---|
| 20 箱 | 6.1 KB |
| 40 箱 | 12.1 KB |
| 60 箱 | 18.1 KB |
| ヘビーユーザー（40 箱 × 10 作品） | 121 KB |

テキストのみなので極小。**ユーザーが増えても変動費はほぼゼロ**で、効いてくるのは固定費だけ。

## Cloudflare Pages への移行手順

設定ファイルは移植済み（`public/_headers` / `public/_redirects` → ビルドで `dist/` に入る）。
`vercel.json` と同じ内容（SPA リライト、`/quiz`→`/mood`、CSP 等のセキュリティヘッダー、
manifest の Content-Type）を保っている。

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. このリポジトリを選択
3. ビルド設定：
   - **Framework preset**: なし（または Vite）
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. **環境変数**（Settings → Environment variables）に設定：
   - `VITE_TMDB_TOKEN`（必須。無いと参考作品・逆ハコの作品検索が使えない）
   - `VITE_SITE_URL`（公開 URL。OGP / canonical / sitemap に使う）
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（同期を有効にする場合）
   - `VITE_AMAZON_TAG` / `VITE_UNEXT_REDIRECT_PREFIX`（アフィリエイト）
5. デプロイ → `*.pages.dev` で確認 → 独自ドメインを当てる場合は Custom domains から

移行後、`_headers` が効いているかは
`curl -I https://<公開URL>/` で `content-security-policy` が返るかで確認できる。

## 無料枠の注意点と対策

- **Supabase の無料プロジェクトは 7 日間アクセスが無いと休止する。**
  日常的に使われていれば起きないが、リリース直後は起こり得る。GitHub Actions の
  スケジュール実行（公開リポジトリは無料）で週 1 回叩けば回避できる。
- **無料枠には自動バックアップが無い。**
  Tsumugi は localStorage を真実の源とする設計なので、クラウド側が消えても端末のデータは
  無傷。加えてエディタの「バックアップ」から**全作品を 1 つの JSON で持ち出せる**
  （戻すときは作品単位 LWW でマージするので、手元の新しい編集が古い控えで上書きされない）。
  この 2 つで無料枠の弱点を埋めている。
- **Supabase の無料プロジェクトは 2 つまで。**

## 収益化（未実装）

「全機能無料 ＋ 同期だけ有料（買い切り）」を想定。課金ラインが作者のコストラインと
一致するため値付けの説明が要らない、という利点がある。

必要な実装：

1. Stripe Checkout（買い切り）へのリンク
2. `profiles` テーブルに `plan`（RLS で本人のみ参照）
3. Stripe webhook を **Supabase Edge Function** で受けて `plan` を更新（唯一サーバーが要る箇所）
4. 同期（`cloudSync.ts`）を `plan` で開閉する

損益分岐（1 本 ¥2,000、Stripe 3.6% → 手取り ¥1,928）：

| 構成 | 年間固定費 | 分岐点 |
|---|---|---|
| 全部無料枠 | 約 ¥1,500 | 年 1 本 |
| Vercel Pro ＋ Supabase Free | 約 ¥37,500 | 年 20 本 |
| Vercel Pro ＋ Supabase Pro | 約 ¥83,000 | 年 43 本 |

広告とアフィリエイトの切り分け方針：**エディタ・逆ハコには広告を置かない**
（書く道具に広告は毒）。参考作品ファインダーと特集記事側のアフィリエイトだけ残す。
