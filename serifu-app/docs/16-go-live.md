# ゴーライブ手順（ホンヨミ / 実機リリース）

ストア公開までの「いま何をすればよいか」を1本にまとめた実行手順。
配布方針は**完全無料＋非パーソナライズのバナー広告**（練習中は非表示）。

細かい背景は docs/04（ランブック）/ docs/07（TestFlight）/ docs/10（掲載素材）/
docs/12（チェックリスト）/ docs/14（法務）/ docs/15（運用）を参照。ここは最短経路。

---

## 全体像：3つのレーン

| レーン | 進める人 | 状態 |
|---|---|---|
| A. コード・CI の準備 | こちら（実装） | **ほぼ完了**（下記「準備済み」） |
| B. アカウント・鍵・ID | **あなた**（本人確認/課金が必要） | 未着手（下記「あなたの作業」） |
| C. 提出・審査 | 両者 | B完了後 |

Bはお金と本人確認が絡むため代行できない。**Bが律速**。Bが揃えば提出まで一気に進む。

---

## 準備済み（コード側・レーンA）

- ✅ パッケージID `jp.honyomi.app`（iOS/Android共通・変更不可の確定値）
- ✅ アプリ名「ホンヨミ」、アイコン組み込み済み
- ✅ 権限の用途文字列（マイク・音声認識）を日本語で記載（Info.plist）
- ✅ 輸出コンプライアンス `ITSAppUsesNonExemptEncryption=false`
- ✅ 非パーソナライズ広告のみ（ATTダイアログ不要）・練習中は広告非表示
- ✅ **全世界配信向けの同意管理（UMP/GDPR）**：起動時にEEA/UK等で同意フォーム、
  同意前は広告を出さない。設定に「広告の同意設定」（必要地域のみ表示）
- ✅ 台本・録音・設定は端末内のみ／OSバックアップ無効（allowBackup=false）
- ✅ 公開ポリシー：プライバシー・利用規約・サポートページ（GitHub Pages）
- ✅ **Android リリース署名の配線**（key.properties / CI環境変数 → 無ければdebug）
- ✅ **署名済みAAB生成ワークフロー**（`serifu-play.yml`・Secrets待ち）
- ✅ **TestFlight配布ワークフロー**（`serifu-testflight.yml`・Secrets待ち）
- ✅ 自動テスト158本＋`flutter analyze`クリーン／実機レビュー用APK自動配布中

残るコード側の作業は「本番AdMob IDの差し替え」と「バージョンを1.0.0へ」だけ
（下記 手順3・4 で実施）。

---

## あなたの作業（レーンB）— 順番に

### 1. 開発者アカウント登録
- ☐ **Google Play Console**（初回 $25 買い切り）https://play.google.com/console/signup
  - 個人アカウントは公開前に**クローズドテスト 12名・14日間**が必須（手順6）
- ☐ **Apple Developer Program**（年 $99）https://developer.apple.com/programs/

### 2. AdMob 登録 → 本番ID発行 ＋ 同意メッセージ作成（全世界配信で必須）
- ☐ https://admob.google.com でアプリを登録（Android/iOS 別々）
- ☐ 発行される値を控える（4つ）：
  - アプリID（Android）`ca-app-pub-XXXX~XXXX`
  - アプリID（iOS）`ca-app-pub-XXXX~XXXX`
  - バナー ユニットID（Android）`ca-app-pub-XXXX/XXXX`
  - バナー ユニットID（iOS）`ca-app-pub-XXXX/XXXX`
- ☐ この4つを共有いただければ、こちらで手順3の差し替えを行う
- ☐ **AdMob →「プライバシーとメッセージ」→ GDPR** で同意メッセージを作成・公開
  （全世界配信ではこれが無いとEEAで同意フォームが出ない）。CCPA/米国州法向けの
  メッセージも同画面で作成できる。アプリ側の表示ロジックは実装済み。

### 3. 本番 AdMob ID への差し替え（手順2の値をもらったら こちらで実施）
- アプリID → `AndroidManifest.xml`（APPLICATION_ID）と `Info.plist`（GADApplicationIdentifier）
- バナーユニットID → CI変数 `ADMOB_BANNER_ANDROID` / `ADMOB_BANNER_IOS`（下記Secrets/Variables）

### 4. Android 署名鍵の作成 → GitHub Secrets 登録
- ☐ アップロード鍵を作成（パスワードは安全に保管・紛失注意）：
  ```bash
  keytool -genkey -v -keystore ~/honyomi-upload.jks \
    -keyalg RSA -keysize 2048 -validity 10000 -alias upload
  ```
- ☐ GitHub リポジトリの Settings → Secrets and variables → Actions に登録：

  | Secret 名 | 値 |
  |---|---|
  | `ANDROID_KEYSTORE_BASE64` | `base64 -i ~/honyomi-upload.jks`（macは `base64 -i`、Linuxは `base64 -w0`）の出力 |
  | `ANDROID_KEYSTORE_PASSWORD` | keystore のパスワード（storePassword） |
  | `ANDROID_KEY_ALIAS` | `upload` |
  | `ANDROID_KEY_PASSWORD` | 鍵のパスワード（keyPassword） |

  （任意）Variables に `ADMOB_BANNER_ANDROID` を登録すると本番バナーIDでビルドされる。

- ローカルでビルドする場合は Secrets の代わりに `android/key.properties`
  （`android/key.properties.example` をコピー）。どちらも gitignore 済み。

### 5. iOS 署名情報 → GitHub Secrets 登録（TestFlight用）
- ☐ docs/07-ios-testflight.md の手順で証明書・プロファイル・App Store Connect
  APIキーを作成し、次の Secrets を登録：
  `BUILD_CERTIFICATE_BASE64` / `P12_PASSWORD` / `PROVISIONING_PROFILE_BASE64` /
  `APPSTORE_ISSUER_ID` / `APPSTORE_KEY_ID` / `APPSTORE_PRIVATE_KEY`

### 6. ストア掲載物（あなた＋こちら）
- ☐ スクリーンショット（実機 or Web版で撮影。文言・構成は docs/10）
- ☐ フィーチャーグラフィック 1024×500（Playのみ・こちらで生成可）
- ☐ 説明文（docs/10 にドラフト完成済み → そのまま貼り付け）
- ☐ データセーフティ / App Privacy 回答（docs/04 §5-1・docs/14 のとおり
  「デバイスID＝広告目的で収集・共有」を申告）
- ☐ 各ストアに登録するURL：
  - プライバシーポリシー `https://oshiyamad-blip.github.io/mood-cinema/privacy.html`
  - 利用規約 `https://oshiyamad-blip.github.io/mood-cinema/terms.html`
  - サポート `https://oshiyamad-blip.github.io/mood-cinema/support.html`
  - サポートメール `oshiyamad@gmail.com`

---

## 提出（レーンC）— B完了後にこちらで実施

1. `pubspec.yaml` を `1.0.0+1` に更新（以後、提出のたびに `+build` を増やす）
2. **Android**：`git tag serifu-vX.Y.Z && git push --tags` で `serifu-play.yml` が
   署名済みAABを生成 → アーティファクトをDL → Play Console にアップロード
   → 内部テスト → クローズドテスト（12名/14日）→ 製品版申請
3. **iOS**：同じタグで `serifu-testflight.yml` が IPA を TestFlight へアップロード
   → 内部テスト → 審査提出
4. 公開範囲は**全世界**（方針決定済み）。UIは日本語のみだが英語のストア説明文は
   用意済み（docs/10）。EEA/UK向けの同意はUMPで対応済み（手順2のAdMob同意メッセージ必須）
5. 段階的リリース（Android 5%→…→100% / iOS Phased Release）で様子を見る

---

## 便利ツール（こちらで用意済み）

- **提出前セルフ点検**: `bash scripts/preflight.sh` — analyze/test・バージョン・
  本番AdMob ID・署名配線・暗号化申告・UMP・公開ページ・秘密混入を一括点検。
  FAIL が0なら致命的な問題なし、WARN は公開直前の差し替え項目。
- **ストア用スクショ生成**: `scripts/screenshots/`（`flutter build web` →
  `node capture.mjs`）。ホーム・設定・台本準備の高解像度キャプチャを再現可能に生成。
  参考出力は `scripts/screenshots/samples/`。

## いま着手できる最短の一歩

**手順1（アカウント登録）と手順2（AdMob登録）**があなたの最初のアクション。
この2つが終われば、AdMob IDの差し替え・署名鍵の登録・提出まではほぼ機械的に進む。
AdMobの4つのIDを共有いただければ、こちらで差し替えとバージョン更新を行う。
