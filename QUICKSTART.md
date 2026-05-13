# クイックスタート

## あなたがやること：たった3ステップ

---

### Step 1 — TMDB トークンを取得する（3分）

1. https://www.themoviedb.org/signup でアカウント作成
2. ログイン後 → 右上のアイコン → 「設定」→「API」→「Developer 申請」
   - 用途: `Personal Website / App` で OK
   - 即日承認される
3. **「API Read Access Token (v4 auth)」** をコピーする

---

### Step 2 — ローカルで動かす（2分）

```bash
cd mood-cinema
npm run setup        # .env.local を自動作成
```

作成された `.env.local` を開いて、`VITE_TMDB_TOKEN=` の後にトークンを貼る：

```
VITE_TMDB_TOKEN=eyJhbGciOiJIUzI1NiJ9...（コピーしたトークン）
```

```bash
npm run dev          # → http://localhost:5174 で確認
```

---

### Step 3 — Vercel にデプロイする（5分）

1. **GitHub にリポジトリを作成してプッシュ**
   ```bash
   cd mood-cinema
   git init
   git add .
   git commit -m "init mood-cinema"
   # GitHub で新規リポジトリ作成後:
   git remote add origin https://github.com/あなたのユーザー名/mood-cinema.git
   git push -u origin main
   ```

2. **Vercel で公開**
   - https://vercel.com/new を開く
   - 「Import Git Repository」でさっきのリポジトリを選択
   - 「Environment Variables」で **1つだけ** 設定：
     ```
     VITE_TMDB_TOKEN = （Step 1 のトークン）
     ```
   - 「Deploy」ボタンを押す → 2分で公開完了

3. **確認**
   - 発行された URL（例: `https://mood-cinema-xxx.vercel.app`）で診断が動けば完成

---

## 公開後にやること（急がなくていい）

| タイミング | 作業 | 所要時間 |
|-----------|------|---------|
| デプロイ直後 | Google Search Console で sitemap 登録 | 5分 |
| デプロイ直後 | Amazon アソシエイト申請 | 10分 |
| 記事 3 本以上 + PV が出始めたら | A8.net 登録 → U-NEXT 提携申請 | 15分 |
| 月 1,000 PV 超えたら | Google AdSense 申請 | 10分 |
| 独自ドメイン取りたくなったら | Cloudflare Registrar でドメイン取得 → `.env.local` に `VITE_SITE_URL=https://あなたのドメイン` を追加してビルド → Vercel に設定 | 20分 |

> 独自ドメインは AdSense 審査に必要ですが、まず Vercel の無料サブドメインで稼働させてから取得で十分です。
