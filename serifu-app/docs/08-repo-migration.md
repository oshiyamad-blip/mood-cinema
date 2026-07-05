# リポジトリ切り出し手順（serifu-app → 専用リポジトリ）

serifu-app は現在、映画レコメンドPWA（mood-cinema）のリポジトリに同居している。
本格開発の前に専用リポジトリへ切り出す。**履歴ごと移す方法（推奨）**と、
**現状スナップショットだけ移す簡単な方法**の2通りを示す。

## 事前に決めること
- リポジトリ名（例：`serifu-app`）
- 可視性：**Private 推奨**（課金・ストア公開前のアプリのため）

---

## 方法A（推奨）: `git filter-repo` で履歴ごと切り出す

serifu-app に関する履歴だけを残した新リポジトリを作れる。

```bash
# 0) 前提: git filter-repo を導入（pip install git-filter-repo など）

# 1) 作業用にクローン（元リポジトリは無傷のまま）
git clone https://github.com/oshiyamad-blip/mood-cinema.git serifu-extract
cd serifu-extract
git checkout claude/actor-dialogue-practice-app-t6wxsn

# 2) serifu-app/ 以下と関連workflowだけ残し、パスをルートへ持ち上げる
git filter-repo \
  --path serifu-app --path-rename serifu-app/: \
  --path .github/workflows/serifu-app.yml \
  --path .github/workflows/serifu-testflight.yml

# 3) GitHub で空の新リポジトリ（例: serifu-app, Private）を作成してから:
git remote add origin https://github.com/<owner>/serifu-app.git
git branch -M main
git push -u origin main
```

### 切り出し後の修正（必ず）
- `.github/workflows/*.yml` の `working-directory: serifu-app` /
  `paths: 'serifu-app/**'` / アーティファクトパスを**ルート基準に書き換える**
  （`working-directory` 行の削除、`serifu-app/build/...` → `build/...`、
  `paths` は `lib/** pubspec.yaml android/** ios/**` 等に）。
- ブランチ指定 `claude/actor-dialogue-practice-app-t6wxsn` → `main` に変更。
- README のリポジトリURL・Actionsリンクを新リポジトリに更新。
- 新リポジトリの Settings → Secrets に TestFlight 用の6つ（docs/07）を再登録。
- ルートに専用の `CLAUDE.md` を作る（mood-cinema の規約を引き継がない）。

## 方法B（簡単）: スナップショットだけ移す

履歴は捨てて現状のみ。10分で終わる。

```bash
git clone --depth 1 -b claude/actor-dialogue-practice-app-t6wxsn \
  https://github.com/oshiyamad-blip/mood-cinema.git tmp
mkdir serifu-app-new && cp -r tmp/serifu-app/. serifu-app-new/
cp tmp/.github/workflows/serifu-app.yml tmp/.github/workflows/serifu-testflight.yml \
   serifu-app-new/.github/workflows/ 2>/dev/null || \
   (mkdir -p serifu-app-new/.github/workflows && \
    cp tmp/.github/workflows/serifu-*.yml serifu-app-new/.github/workflows/)
cd serifu-app-new
git init -b main && git add . && git commit -m "serifu-app 初期コミット（mood-cinemaから切り出し）"
git remote add origin https://github.com/<owner>/serifu-app.git
git push -u origin main
```
その後の修正は方法Aと同じ（workflowのパス・Secrets・CLAUDE.md）。

## 移行後に元リポジトリで行うこと
- mood-cinema 側の `serifu-app/` と `serifu-*.yml` を削除するPRを出す
  （映画アプリの開発を汚さないため）。
- 既存の Actions アーティファクト（APK）は元リポジトリに残る（期限まで有効）。
