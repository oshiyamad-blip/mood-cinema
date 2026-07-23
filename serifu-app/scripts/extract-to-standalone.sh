#!/usr/bin/env bash
# serifu-app を独立リポジトリ用の内容に切り出す（履歴つき）。
#
# mood-cinema リポジトリ内の serifu-app/ を、ルートに持ち上げた独立リポジトリの
# 中身として ../serifu-app-standalone に組み立てる。CI（.github/workflows）は
# ルート基準に書き換えたものを生成し、ルート用の README / CLAUDE.md も置く。
#
# ※ このスクリプトは「切り出し済みリポジトリの中身」を作るところまで。
#   最後の「GitHubで空リポジトリを作成 → push」はネットワーク/権限の都合で
#   各自の環境で実行する（手順は最後に表示する）。
#
# 使い方（mood-cinema のどこかで）:
#   bash serifu-app/scripts/extract-to-standalone.sh [出力先ディレクトリ]
set -euo pipefail

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
OUT=${1:-"$ROOT/../serifu-app-standalone"}
SPLIT_BRANCH=_serifu_split_tmp
SRC_WF="$ROOT/.github/workflows"

cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "!! 作業ツリーに未コミットの変更があります。コミット/退避してから実行してください。"
  exit 1
fi
if [ -e "$OUT" ]; then
  echo "!! 出力先が既に存在します: $OUT （別の場所を指定するか削除してください）"
  exit 1
fi

echo "==> serifu-app/ を履歴ごと分離（git subtree split）"
git branch -D "$SPLIT_BRANCH" >/dev/null 2>&1 || true
git subtree split --prefix=serifu-app -b "$SPLIT_BRANCH"

echo "==> 作業クローンを作成: $OUT"
git clone --quiet --branch "$SPLIT_BRANCH" --single-branch "$ROOT" "$OUT"
cd "$OUT"
git checkout --quiet -b main
git remote remove origin 2>/dev/null || true

echo "==> ルート基準の CI ワークフローを生成"
mkdir -p .github/workflows
# 既存の serifu-*.yml を ①段組の working-directory を除去 ②serifu-app/ パスを
# ルート化 ③トリガーブランチを main 化 して取り込む。
transform() {
  # $1: 入力yml  $2: 出力名
  # ①段組の working-directory ブロックを除去 ②`serifu-app/` プレフィックスを
  # すべてルート化（build/・app-path・コメント内の docs パス等）③トリガー
  # ブランチを main 化 ④参照するワークフロー名 serifu-app.yml → ci.yml。
  perl -0pe 's/\n[ \t]*defaults:\n[ \t]*run:\n[ \t]*working-directory: serifu-app//g' "$1" \
    | sed -e 's#\.github/workflows/serifu-app\.yml#.github/workflows/ci.yml#g' \
          -e 's#serifu-app/##g' \
          -e "s#claude/actor-dialogue-practice-app-t6wxsn#main#g" \
    > ".github/workflows/$2"
}
[ -f "$SRC_WF/serifu-app.yml" ]        && transform "$SRC_WF/serifu-app.yml" ci.yml
[ -f "$SRC_WF/serifu-testflight.yml" ] && transform "$SRC_WF/serifu-testflight.yml" testflight.yml
[ -f "$SRC_WF/serifu-play.yml" ]       && transform "$SRC_WF/serifu-play.yml" play.yml
[ -f "$SRC_WF/serifu-web.yml" ]        && transform "$SRC_WF/serifu-web.yml" pages.yml

echo "==> ルート README / CLAUDE.md を生成"
cat > README.md <<'MD'
# ホンヨミ（HonYomi）

台本を取り込むと相手役をアプリが読み上げ、あなたのセリフで止まって待つ——
俳優のセリフ稽古・オーディション対策のための Flutter アプリ（iOS / Android / Web）。
完全オフライン処理・完全無料＋非パーソナライズ広告。

## 開発

```bash
flutter pub get
flutter run                 # 実機/エミュレータ
flutter test                # 自動テスト
bash scripts/preflight.sh   # 提出前セルフ点検
```

リリース手順は `docs/16-go-live.md` を参照。
MD
# CLAUDE.md は元リポジトリの serifu-app 用ガイドを引き継ぐ（あれば docs から要点を集約）。
cat > CLAUDE.md <<'MD'
# CLAUDE.md（ホンヨミ / serifu-app）

このリポジトリは俳優向けセリフ練習アプリ「ホンヨミ」。Flutter（iOS/Android/Web）、
ルールベース解析（AI非使用）、完全オンデバイス、完全無料＋非パーソナライズ広告。

- 変更後は `flutter analyze` と `flutter test` を通すこと。
- ストア提出前は `bash scripts/preflight.sh`。
- リリース全体の順路は `docs/16-go-live.md`。
- ユーザー向け文言・コメントの既定言語は日本語。新規UI文言は ja/en 両方に追加。
MD

git add -A
git commit --quiet -m "standalone: ルート用CI・README・CLAUDE.mdを追加（mood-cinemaから切り出し）"

cd "$ROOT"
git branch -D "$SPLIT_BRANCH" >/dev/null 2>&1 || true

cat <<EOF

==> 完了: $OUT に独立リポジトリの中身を用意しました（履歴つき・ブランチ main）。

次の手順（各自の環境で）:
  1) GitHub で空の新リポジトリを作成（例: serifu-app, Private 推奨）
  2) cd "$OUT"
     git remote add origin https://github.com/<owner>/serifu-app.git
     git push -u origin main
  3) 新リポジトリの Settings → Secrets に署名情報を登録（docs/16-go-live.md）
     - iOS TestFlight: BUILD_CERTIFICATE_BASE64 ほか（docs/07）
     - Android AAB: ANDROID_KEYSTORE_BASE64 ほか（docs/16 手順4）
  4) GitHub Pages を有効化（Settings → Pages → GitHub Actions）
     → プライバシー/利用規約/サポートの公開URLが新リポジトリ側に移るため、
       ストア登録URLを新URLに差し替える
  5) 元の mood-cinema から serifu-app/ と serifu-*.yml を削除するPRを出す

生成した CI: $(cd "$OUT" && ls .github/workflows | tr '\n' ' ')
EOF
