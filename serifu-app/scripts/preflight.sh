#!/usr/bin/env bash
# 提出前セルフ点検（ホンヨミ）。
#
# ストア提出前に「リリースブロッカーが残っていないか」を機械的に総点検する。
# serifu-app/ ディレクトリで実行する:  bash scripts/preflight.sh
#
# 出力の意味:
#   [ OK ]   問題なし
#   [WARN]   リリース前に対応が必要（現時点では想定内のものを含む）
#   [FAIL]   リリースを妨げる致命的な問題（0件であるべき）
#
# FAIL が1件でもあれば終了コード1（CIに組み込む場合の目印）。WARN は0のまま。
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

fail=0
warn=0
ok() { printf '[ OK ] %s\n' "$1"; }
warning() { printf '[WARN] %s\n' "$1"; warn=$((warn+1)); }
failure() { printf '[FAIL] %s\n' "$1"; fail=$((fail+1)); }

section() { printf '\n== %s ==\n' "$1"; }

PLIST=ios/Runner/Info.plist
MANIFEST=android/app/src/main/AndroidManifest.xml
GRADLE=android/app/build.gradle.kts
TEST_ADMOB_APP='3940256099942544'

section "ビルド健全性"
if command -v flutter >/dev/null 2>&1; then
  if flutter analyze >/tmp/preflight_analyze.log 2>&1; then
    ok "flutter analyze: 問題なし"
  else
    failure "flutter analyze でエラー（/tmp/preflight_analyze.log 参照）"
  fi
  if flutter test >/tmp/preflight_test.log 2>&1; then
    ok "flutter test: 全パス"
  else
    failure "flutter test に失敗（/tmp/preflight_test.log 参照）"
  fi
else
  warning "flutter コマンドが見つからず analyze/test を実行できません"
fi

section "バージョン"
VER=$(grep -E '^version:' pubspec.yaml | awk '{print $2}')
if [ "${VER%%+*}" = "0.1.0" ]; then
  warning "version が $VER。ストア公開時は 1.0.0+1 へ更新すること"
else
  ok "version = $VER"
fi

section "iOS 設定 (Info.plist)"
grep -q 'ITSAppUsesNonExemptEncryption' "$PLIST" \
  && ok "輸出コンプライアンス（ITSAppUsesNonExemptEncryption）記載あり" \
  || failure "ITSAppUsesNonExemptEncryption が未設定（提出時に毎回ダイアログ／審査で確認）"
grep -q 'NSMicrophoneUsageDescription' "$PLIST" \
  && ok "マイク用途文言あり" \
  || failure "NSMicrophoneUsageDescription が未設定（実行時クラッシュ／リジェクト）"
grep -q 'NSSpeechRecognitionUsageDescription' "$PLIST" \
  && ok "音声認識用途文言あり" \
  || failure "NSSpeechRecognitionUsageDescription が未設定"
grep -q "$TEST_ADMOB_APP" "$PLIST" \
  && warning "iOS AdMob アプリIDがテストIDのまま。本番IDへ差し替えること" \
  || ok "iOS AdMob アプリID: テストIDではない"

section "Android 設定"
grep -q "$TEST_ADMOB_APP" "$MANIFEST" \
  && warning "Android AdMob アプリIDがテストIDのまま。本番IDへ差し替えること" \
  || ok "Android AdMob アプリID: テストIDではない"
grep -q 'useReleaseSigning' "$GRADLE" \
  && ok "リリース署名の配線あり（鍵があれば本番署名）" \
  || failure "リリース署名の配線が見当たらない（debug署名のまま提出不可）"
grep -q 'allowBackup="false"' "$MANIFEST" \
  && ok "OSバックアップ無効（台本を端末外に出さない方針）" \
  || warning "allowBackup が false でない（台本がGoogleバックアップに含まれ得る）"

section "同意・広告（全世界配信）"
grep -q 'requestConsentInfoUpdate' lib/ads/ads_mobile.dart \
  && ok "UMP同意フロー（GDPR/EEA）実装あり" \
  || failure "UMP同意フローが見当たらない（全世界配信でポリシー違反の恐れ）"
grep -q 'nonPersonalizedAds: true' lib/ads/ads_mobile.dart \
  && ok "非パーソナライズ広告のみ要求" \
  || warning "nonPersonalizedAds の指定が見当たらない"

section "法務・公開ページ"
for f in web/privacy.html web/terms.html web/support.html; do
  [ -f "$f" ] && ok "$f あり" || failure "$f が無い（ストア登録URLに必要）"
done

section "秘密情報の混入チェック"
if git ls-files 2>/dev/null | grep -E 'key\.properties$|\.jks$|\.keystore$|\.p12$|\.mobileprovision$' | grep -v '\.example$' | grep -q .; then
  failure "署名鍵/資格情報がリポジトリに含まれている可能性（要確認）"
else
  ok "署名鍵/資格情報のコミットは検出されず"
fi

section "結果"
printf 'FAIL=%d  WARN=%d\n' "$fail" "$warn"
if [ "$fail" -gt 0 ]; then
  echo "→ FAIL を解消してから提出してください。"
  exit 1
fi
if [ "$warn" -gt 0 ]; then
  echo "→ 致命的な問題なし。WARN はストア公開の直前チェックリスト（本番ID・バージョン）です。"
else
  echo "→ 提出前チェック クリア。"
fi
exit 0
