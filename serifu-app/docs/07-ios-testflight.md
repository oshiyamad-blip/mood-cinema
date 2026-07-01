# iOS TestFlight 配布手順

`.github/workflows/serifu-testflight.yml` で、iOS を **TestFlight** に自動アップロードする。
この環境（Linux）では署名できないため、CI（macOS ランナー）で実行する。
一度セットアップすれば、以後は「タグを打つ / 手動実行」だけで配信できる。

## 0. 前提
- Apple Developer Program（年 $99）
- bundle id：`com.serifu.serifu_app`（変更する場合は android/ios とワークフローも合わせる）

## 1. App ID とアプリ登録
1. Apple Developer → Certificates, IDs & Profiles → **Identifiers** で
   `com.serifu.serifu_app` を登録。
2. App Store Connect → **My Apps → ＋ → New App** でアプリを作成（bundle を選択）。

## 2. 署名証明書（.p12）
1. **Apple Distribution** 証明書を作成（Keychain の証明書アシスタントで CSR → Developer で発行）。
2. Keychain から証明書＋秘密鍵を **.p12** で書き出す（パスワードを設定）。
3. base64 化してシークレットに登録：
   ```bash
   base64 -i dist.p12 | pbcopy   # 中身を BUILD_CERTIFICATE_BASE64 に
   ```
   - `BUILD_CERTIFICATE_BASE64` … 上記 base64
   - `P12_PASSWORD` … .p12 のパスワード

## 3. プロビジョニングプロファイル（App Store 用）
1. Developer → Profiles → **App Store** 配布用プロファイルを作成（App ID と Distribution 証明書を選択）。
2. `.mobileprovision` をダウンロードし base64 化：
   ```bash
   base64 -i serifu.mobileprovision | pbcopy   # PROVISIONING_PROFILE_BASE64 に
   ```
3. **プロファイル名**を `ios/ExportOptions.plist` の
   `REPLACE_WITH_PROVISIONING_PROFILE_NAME` に記入。
4. **Team ID**（10桁）を同ファイルの `REPLACE_WITH_TEAM_ID` に記入。

## 4. App Store Connect API キー
1. App Store Connect → Users and Access → **Integrations（Keys）** → ＋ で API キー作成
   （App Manager 権限）。
2. 次をシークレットに登録：
   - `APPSTORE_ISSUER_ID` … Issuer ID
   - `APPSTORE_KEY_ID` … Key ID
   - `APPSTORE_PRIVATE_KEY` … ダウンロードした `AuthKey_XXXX.p8` の中身（全文）

## 5. GitHub Secrets（まとめ）
リポジトリ Settings → Secrets and variables → Actions に登録：

| Secret | 内容 |
|---|---|
| `BUILD_CERTIFICATE_BASE64` | Distribution 証明書 .p12 の base64 |
| `P12_PASSWORD` | .p12 のパスワード |
| `PROVISIONING_PROFILE_BASE64` | App Store 用プロファイルの base64 |
| `APPSTORE_ISSUER_ID` | App Store Connect API Issuer ID |
| `APPSTORE_KEY_ID` | 同 Key ID |
| `APPSTORE_PRIVATE_KEY` | 同 .p8 秘密鍵の全文 |

## 6. バージョン
`pubspec.yaml` の `version: x.y.z+N` の **ビルド番号 N はアップロード毎に増やす**
（同じ番号は再アップロード不可）。

## 7. 実行
- タグ： `git tag serifu-v0.1.0 && git push origin serifu-v0.1.0`
- または GitHub の **Actions → serifu-app TestFlight → Run workflow**

CI が IPA をビルドして TestFlight にアップロードする。処理後、App Store Connect →
TestFlight にビルドが現れる（数分〜）。**内部テスター**を追加すれば、その端末に
TestFlight アプリ経由でインストールできる（実機レビュー）。

## トラブルシュート
- 署名エラー：ExportOptions の Team ID / プロファイル名、証明書と profile の対応を確認。
- 古い Xcode：`ExportOptions.plist` の `method` を `app-store-connect` → `app-store` に。
- 「build already exists」：`pubspec.yaml` のビルド番号を上げて再実行。
