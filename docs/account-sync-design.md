# アカウント同期（Phase B）設計 — ログイン＋クラウド保存

作成日 2026-07-24。Phase A（端末内の複数作品化・自動移行・ゴミ箱）は実装済みが前提。
決定事項：**段階的に進める／メール OTP（マジックリンク併用）／Supabase 新規プロジェクト**。

## ゴールと非ゴール

- ゴール：箱書きの作品を **アカウントに紐付けてクラウド保存** し、別端末でも続きが書ける。
- ゴール：**未ログインでも今までどおり全機能が使える**（ログインは「同期を足す」だけ）。
- ゴール：**データ喪失ゼロ**。同期がローカル作品を消す経路を作らない（設計理念）。
- 非ゴール（Phase B ではやらない）：共同編集・共有リンク・リアルタイム同期・課金。

## 全体像

```
[Hako.tsx] ── Workspace（localStorage, 真実の源のまま）
     │  保存のたび
     ▼
[cloudSync.ts] ── デバウンス push ──▶ Supabase outlines テーブル（user_id + RLS）
     ▲                                        │
     └────────── 起動時/ログイン時 pull・マージ ┘
```

**オフラインファースト**：localStorage が常に真実の源。クラウドはその複製。
ネットワークが無い・Supabase 未設定・未ログイン、いずれでも従来どおり動く。

## 実装しなければならない箇所（全リスト）

### 1. ログイン導線（UI が 4 箇所）

| 箇所 | 内容 |
|---|---|
| **ヘッダー**（`App.tsx` の `AppShell`） | 未ログイン：「ログイン」リンク → `/account`。ログイン済み：メールアドレス（省略表示）→ `/account`。Supabase 未設定なら**何も出さない**（縮退動作）。 |
| **`/account` ページ（新設）** | ①メール入力 → OTP 送信 ② 6 桁コード入力 → 検証 ③ログイン済みビュー（メール表示・同期状態・ログアウト）。マジックリンクで戻ってきた場合も自動でセッション確立（`detectSessionInUrl`）。 |
| **箱書きページ内バナー**（`Hako.tsx`） | 未ログイン時に控えめな一行「ログインすると作品を複数端末で同期できます →」。閉じたら再表示しない（localStorage フラグ）。**書く邪魔をしない**のが最優先。 |
| **同期ステータス表示**（`Hako.tsx` フッター付近） | ログイン時のみ「同期済み ✓／同期中…／オフライン（ローカルに保存済み）」。保存が失われていない安心感を常に見せる。 |

ルート追加：`/account`（ja）と `/en/account`。`prefix` を使って組み立てる（ハードコード禁止）。
`useSeo` で `noindex`（アカウントページは検索対象外）。

### 2. 認証モジュール（新規ファイル）

- `src/lib/supabase.ts` — クライアント生成。`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  未設定なら `null` を返す（**全機能がこの null チェックで縮退**）。`@supabase/supabase-js` を
  dynamic import にしてバンドルを汚さない。
- `src/lib/auth.ts` — `useAuth()` フック：`{ user, signInWithOtp(email), verifyOtp(email, code), signOut() }`。
  セッションは supabase-js が localStorage に永続化。`onAuthStateChange` を購読して React state へ。
- サインアウトは**ローカル作品を消さない**（セッション破棄のみ）。

### 3. DB スキーマ + RLS（`docs/supabase-setup.sql` として同梱）

```sql
create table outlines (
  id         text primary key,          -- ローカル uid() をそのまま使う
  user_id    uuid not null default auth.uid() references auth.users(id),
  title      text not null default '',
  structure  text not null default 'three-act',
  boxes      jsonb not null default '[]',
  updated    bigint not null,           -- ローカルの updated（ms）と同一系
  deleted_at bigint,                    -- ソフト削除もそのまま同期（ゴミ箱ごと）
  synced_at  timestamptz not null default now()
);
alter table outlines enable row level security;
create policy "own rows" on outlines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- **行 = 作品 1 件**（`Outline` を丸ごと jsonb）。箱単位の粒度は共同編集をやる時に検討。
- `deleted_at` も同期する＝**ゴミ箱がクラウドにもある**。完全削除（purge）だけが行を消す。
- 認証設定：Email プロバイダ有効化、OTP 有効。サイト URL に本番ドメインを登録。

### 4. 同期エンジン（`src/lib/cloudSync.ts` 新規）

- **pull（起動時・ログイン直後・タブがフォーカスを得た時）**：
  自分の全行を取得し、ローカル Workspace と **作品 ID ごとの LWW**（`updated` が新しい方を採用）でマージ。
  - クラウドだけにある作品 → ローカルへ追加（別端末で作った作品が現れる）。
  - ローカルだけにある作品 → **絶対に消さず**、push 対象にする。
  - 同一 ID → `updated` 比較。同値なら何もしない。
- **push（保存のたび、2 秒デバウンス）**：変更のあった作品を upsert。失敗しても
  ローカルは保存済みなので**何も失われない**（ステータス表示を「オフライン」にするだけ）。
- **初回ログイン時の移行**：既存のローカル作品を全 upsert（＝端末内 → アカウントへの引っ越し）。
  確認ダイアログ等は出さない（アップロードは非破壊なので黙って安全に行う）。
- 競合の割り切り：作品単位 LWW。同じ作品を 2 端末で同時編集すると後勝ち。
  Phase B ではこれを仕様とし、`updated` の新旧だけで判定（時計ずれは許容）。

### 5. CSP / 環境変数 / デプロイ設定

- `vercel.json` の `connect-src` に Supabase プロジェクト URL を追加：
  `connect-src 'self' https://api.themoviedb.org https://<project-ref>.supabase.co wss://<project-ref>.supabase.co;`
  （wss は将来の Realtime 用。今回は https だけでも可）
- `.env.local.example` に追記：`VITE_SUPABASE_URL=` / `VITE_SUPABASE_ANON_KEY=`（anon key は公開可・
  service_role は絶対にクライアントへ入れない）。Vercel ダッシュボードにも同じ 2 変数を設定。
- 未設定時の縮退：ログイン導線ごと非表示。既存ユーザーへの影響ゼロ。

### 6. i18n / 文言（ja・en 同形状で追加）

`account`（ページ一式：見出し・メール・コード・送信・確認・ログアウト・エラー）、
`nav.login`、`hako.syncBanner` / `hako.syncStatus.*`。既定言語は日本語、両ロケール必須。

### 7. プライバシーポリシー更新（`Privacy.tsx` ja/en）

現在は「データは端末内のみ」と書いてある。アカウント作成で **メールアドレスと作品データを
Supabase（クラウド）に保存する**旨、目的（同期）、削除方法（アカウント削除依頼）を追記。
ログインしない限り従来どおり端末内のみ、も明記。

### 8. 検証計画

1. `tsc -b` / `vite build`（strict 通過）。
2. Chromium 実機プローブ：未設定時に導線が出ないこと／`/account` の表示／
   未ログインで従来機能が全て動くこと（回帰）。
3. Supabase 実プロジェクト接続後：OTP ログイン → 初回アップロード → 別ブラウザプロファイルで
   ログイン → 作品が現れる → 双方向編集で LWW → ゴミ箱同期、を通しで確認。
4. RLS 検証：別ユーザーの anon セッションから他人の行が読めない・書けないこと。

## ユーザー（オーナー）側の準備 — これが無いと着手できない部分

1. supabase.com でプロジェクト作成（無料枠、リージョン Tokyo 推奨）
2. Authentication → Providers → **Email** を有効化
3. Project Settings → API から **Project URL** と **anon public key** を共有
   （service_role キーは共有しない）

## 実装順（1 PR ずつ）

1. **B-1**：supabase.ts / auth.ts / `/account` ページ / ヘッダー導線 / i18n / CSP / env 例
   （キー未設定でもマージ可能 — 全部縮退で隠れる）
2. **B-2**：cloudSync.ts（pull/push/初回移行）＋ Hako の同期ステータス＋バナー
3. **B-3**：SQL 適用・実環境で通し検証・プライバシーポリシー更新
