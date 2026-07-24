# Supabase セットアップ手順（アカウント同期 Phase B）

オーナー（あなた）がやる作業。5〜10 分。ここで発行する 2 つのキーを共有してもらえれば、
同期エンジン（B-2）と通し検証（B-3）を実装します。

## 1. プロジェクト作成
1. https://supabase.com にサインイン → **New project**
2. リージョンは **Northeast Asia (Tokyo)** 推奨、無料枠でOK
3. データベースパスワードは任意（同期には使わない。控えておくだけ）

## 2. メールログインを有効化
- **Authentication → Providers → Email** を有効化
- 「Confirm email」はオンのままでOK（メールのリンク／6桁コードでログイン＝パスワード不要）
- **Authentication → URL Configuration → Site URL** に本番URL（Vercel のドメイン）を登録
  （ローカル確認用に `http://localhost:5173` も Redirect URLs に足しておくと便利）

## 3. スキーマ + RLS を適用
- **SQL Editor** を開き、[`docs/supabase-setup.sql`](./supabase-setup.sql) の中身を貼って **Run**
- `outlines` テーブルと RLS ポリシーが作成される（何度流しても安全な冪等スクリプト）

## 4. キーを2つ共有
**Project Settings → API** から以下を渡してください：
- **Project URL**（例 `https://xxxxxxxx.supabase.co`）
- **anon public** key（公開して安全な鍵）

> ⚠️ **service_role** key は絶対に共有しない・クライアントに入れない（全RLSを無視できる管理鍵）。

## 5. こちらの実装（キー受領後）
- `.env.local` / Vercel に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定
- `src/lib/cloudSync.ts`：オフラインファーストの同期（作品単位 LWW・非破壊マージ・初回アップロード）
- 箱書きに同期ステータス表示、ログイン導線バナー
- 実機で通し検証（別ブラウザでログイン→作品が現れる、双方向編集の LWW、ゴミ箱同期、RLS で他人の行が読めないこと）

設計の詳細は [`account-sync-design.md`](./account-sync-design.md) を参照。
