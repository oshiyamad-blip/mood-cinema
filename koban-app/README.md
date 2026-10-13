# KOBAN（仮称）段階1：日々スケの配布と確認

`docs/prepro-app/03-requirements.md`（v0.3）第7章の段階1を実装したアプリです。香盤表を取り込み、撮影日ごとの日々スケを作り、関係者一人ひとりに LINE で貼れるリンクで配り、「確認しました」を集めます。差し替えたら同じリンクの中身が新しい版になり、前の版からの差分が先頭に出て、影響を受ける人と未確認の人にだけ再送の文面を作れます。

リポジトリ直下の Tsumugi とは独立したアプリで、ビルドも依存関係も別です。

## 動かす

```bash
cd koban-app
npm install
npm run dev        # http://localhost:5173 （編集画面）。閲覧ページは /v/#<リンクの秘密>
npm test           # 核の処理の単体テスト（vitest）
npm run build      # tsc -b && vite build（dist/ と dist/v/ ができる）
```

Supabase の環境変数が無いと**デモの状態**で動きます。作品はブラウザの localStorage にだけ保存され、配布のリンクも同じブラウザの中でしか開けません。取り込みから配布・確認・再配布まで、一通りの流れはこの状態で試せます。

確認用のスクリプトが二つあります。

```bash
# 通しの動作確認（Playwright。デモの状態で取り込み〜再配布まで操作し、画面を撮る）
npm run build && npx vite preview --port 4173 &
PW=playwright CHROMIUM=/path/to/chromium node e2e/flow.mjs /tmp/koban-shots

# サーバー側の SQL（PostgreSQL 16 以上。Supabase の auth と役割を真似た上で、権限・無料枠・取り消し・退会を確かめる）
PGHOST=... PGPORT=... PGUSER=postgres sh supabase/test/run.sh

# Stripe の webhook 署名の検証（Deno）
deno test --allow-env supabase/functions/_shared/stripe.test.ts
```

## 構成

| 場所 | 中身 |
|---|---|
| `src/core/` | 純関数。取り込み（`tabular.ts`）、時間割と検査（`schedule.ts`）、日々スケの導出（`callsheet.ts`）、版の差分・閲覧データの伏せ字・LINE の文面・確認の集計（`share.ts`） |
| `src/store/` | 端末への保存（ゴミ箱30日・直前の状態・JSON 書き出し）、作品単位の同期、配布の手順、ログイン |
| `src/backend/` | 配布の受け口。Supabase（`supabase.ts`）と、未設定時のデモ（`local.ts`）。閲覧ページは依存のない `viewer.ts` だけを使う |
| `src/pages/` | 編集画面 |
| `src/view/` | 閲覧ページ（受け取る人）。入口が別（`v/index.html`）で、編集画面のコードを読み込まない |
| `src/components/CallSheetView.tsx` | 日々スケの表示。編集画面の印刷（PDF）と閲覧ページで同じものを使う |
| `supabase/schema.sql` | テーブル（非公開の `koban` スキーマ）と、利用者が呼べる `public.koban_*` 関数 |
| `supabase/functions/` | 課金の Edge Function（`billing`、`stripe-webhook`） |

localStorage のキー（`koban:v1:*`）は公開 API 扱いです。形を変えるときは `normalizeProject` に移行を書いてください。

## 本番の準備

### Supabase

1. プロジェクトを作り、SQL エディタで `supabase/schema.sql` を丸ごと実行する（何度実行しても同じ状態になる）。
2. Authentication → Providers で Email を有効にし、Email Templates の「Magic Link」の本文に `{{ .Token }}` を入れて6桁のコードが届くようにする。
3. Authentication → URL Configuration の Site URL に本番のオリジンを入れる。
4. 環境変数 `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定する（`.env.local.example`）。

### Stripe（課金を出すとき）

1. 商品を二つ作る。作品プラン（¥19,800・一回）と会社プラン（¥29,800・月額）。どちらも税込の価格にする。
2. 税率（10%・内税）を作り、ID を控える。適格請求書の登録番号は Edge Function の環境変数に入れる。
3. Edge Function を配置し、秘密を設定する。

```bash
supabase functions deploy billing
supabase functions deploy stripe-webhook --no-verify-jwt
supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_PROJECT=price_... STRIPE_PRICE_COMPANY=price_... STRIPE_TAX_RATE=txr_... \
  INVOICE_REGISTRATION_NUMBER=T0000000000000 APP_ORIGIN=https://<本番のオリジン>
```

4. Stripe の webhook の送り先を `https://<project>.supabase.co/functions/v1/stripe-webhook` にし、`checkout.session.completed`・`invoice.paid`・`invoice.marked_uncollectible`・`customer.subscription.created/updated/deleted` を送らせる。
5. 請求書の自動の催促（期日前後のメール）は、Stripe の設定（Billing → Invoices の reminders）で有効にする。
6. 環境変数 `VITE_BILLING_ENABLED=true` にすると、アカウントの画面に申し込みが出る。

### 配信

Cloudflare Pages（収益化するならこちら。Vercel の Hobby は商用不可）で、ルートディレクトリを `koban-app`、ビルドコマンドを `npm run build`、出力を `dist` にする。ヘッダーとリライトは `public/_headers`・`public/_redirects` に、Vercel 用は `vercel.json` に同じ内容で入れてある。CSP や配信先を変えるときは両方を直す。

## 要件との対応

| 要件 | 状態 |
|---|---|
| A-1〜A-6 作品と取り込み | 実装済み。xlsx・CSV（UTF-8 と Shift_JIS）・貼り付け。列の割り当ては見出しで覚えて使い回す。取り込み直しは差分を出し、消えたシーンは削除せず「消えたシーン」に退避して撮影日から外す。A-3 は見本の香盤表と一般的な見出しを自動で割り当てる。競合の書き出し形式は実物を入手してから足す |
| B-1〜B-6 台帳の最小限 | 実装済み。25:30 の表記、NG日はエラー、撤収超過・拘束12時間・休息10時間は警告 |
| C-1〜C-4 日々スケ | 実装済み。上書きした値に「手入力」の印と自動に戻すボタン。PDF はブラウザの印刷（A4 横） |
| D-1〜D-10 配布と確認 | 実装済み。電話は既定で伏せ、詳しい住所は指定した人のリンクだけ、閲覧者の名前の透かし、期限と取り消し |
| E-1〜E-4 アカウントと課金 | 実装済み。ただし Stripe は本番・テストの鍵での通しの確認をまだしていない（型検査と署名検証のテストまで） |
| 9章 性能 | シーン300・人物100で、取り込み 61ms、30日分の検査と日々スケ 13ms（`src/core/perf.test.ts`）。画面では香盤表の初回表示が約1.9秒 |

## 要件から外れているところ

- **リンクのプレビュー（D-2）**：秘密をリンクの `#` 以降に置いているので、LINE のプレビューは固定の「日々スケ」になり、作品名と日付は出ない（作品名と日付は文面に入る）。個人情報は出ない。作品名と日付を出すには、リンクを `/v/<id>` にしてサーバー側でプレビューを返す仕組みが要る。
- **閲覧ページの配信（9章）**：中身は配布の時点で人ごとに作って保存しているが、配信は Supabase の関数を経由している。Supabase が止まると、前に一度開いた人（端末に写しが残る）以外は開けない。そのときは「グループ用の文面と PDF」で手作業に戻る。Cloudflare R2 などへの静的な書き出しは、運用を始めてから足す。
- **LINE のアプリ内ブラウザ**：実機での確認がまだ。印刷（PDF 保存）ができない場合に備え、「ブラウザで開く」の案内を出している。
- **法定の表記**：`src/pages/LegalPage.tsx` の【要記入】を埋め、公開前に専門家の確認を受ける。
