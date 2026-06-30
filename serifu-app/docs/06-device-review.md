# 実機レビューの手順

実機でアプリを触ってレビューするための導線をまとめる。
このサンドボックスでは Android SDK の取得（`dl.google.com`）が組織のネットワークポリシーで
遮断され、iOS は macOS が必要なため、**端末向けビルドは GitHub Actions / 各自のマシンで行う**。

---

## A. 一番速い：GitHub Actions が作る Android APK をサイドロード

`.github/workflows/serifu-app.yml` が、push か手動実行で**サイドロード可能なデバッグAPK**を
ビルドしアーティファクトとして添付する。

1. GitHub の **Actions** タブ →「serifu-app build」→ 最新の実行を開く。
   （手動なら「Run workflow」で `claude/actor-dialogue-practice-app-t6wxsn` を選ぶ）
2. 実行完了後、**Artifacts** の `serifu-app-debug-apk` をダウンロード（zip）。
3. zip を展開して `app-debug.apk` を Android 端末へ。
   - 端末で「提供元不明のアプリ」を一時許可してインストール、または
   - `adb install app-debug.apk`
4. アプリ「セリフ稽古」を起動してレビュー。

> デバッグAPKは debug 署名済みでそのまま起動できる（ストア配布は不可）。
> 配布を広げるなら **Firebase App Distribution** にこのAPKを上げると、招待した
> レビュアーがリンクから入れられる。

## B. 自分のマシンでビルドして実機に流す

### Android（Windows/Mac/Linux）
```bash
cd serifu-app
flutter pub get
flutter devices              # 端末をUSB接続（USBデバッグON）
flutter run                  # 実機で起動
# もしくはAPK生成
flutter build apk --debug    # build/app/outputs/flutter-apk/app-debug.apk
```

### iOS（macOS + Xcode 必須）
```bash
cd serifu-app
flutter pub get
cd ios && pod install && cd ..
open ios/Runner.xcworkspace   # XcodeでSigning(Team)を設定
flutter run                   # 接続した実機で起動（無料Apple IDでも7日間試用可）
```

## C. TestFlight / 内部テスト（広くレビューを集める）
- iOS：Apple Developer Program（年$99）→ `flutter build ipa` → Transporter で App Store Connect に
  アップロード → **TestFlight** でレビュアーを招待。
- Android：Google Play Console（初回$25）→ `flutter build appbundle` → **内部テスト**トラックに
  アップロード → リンクでレビュアーを招待。
- 詳細な手順・審査・素材は `docs/04-release-runbook.md` を参照。

---

## レビュー時のチェック観点（機能別）
- 取り込み：PDF / Word(docx) / 画像・写真 / TXT → 解析結果が妥当か
- 解析修正：種別(セリフ/ト書き)・話者・本文の修正、行削除、役追加
- 役選択・ト書きON/OFF
- 声設定：性別・テンポ・声モデル選択（プロ）・試聴
- リハーサル：台本表示モード / 暗記モード、現在行ハイライト、自分の番のポーズ
- ゼロ遅延：練習開始時の事前合成 → 本番で相手役が待ち時間なく返るか
- ハンズフリー（プロ）：言い終わりで自動進行（オンデバイス認識）
- 課金：無料は台本3件まで → ペイウォール、購入/復元（RevenueCat設定時）
- 永続化：再起動後も台本・設定が残るか

## 注意（課金の実挙動を試す場合）
- RevenueCat の API キーを `--dart-define=RC_IOS_KEY=... --dart-define=RC_ANDROID_KEY=...` で渡す。
- 未設定ならアプリは**無料層として正常動作**（購入導線は「準備中」表示）。
- 実購入テストは App Store Connect / Play Console の**サンドボックス/テスター**設定が必要。
