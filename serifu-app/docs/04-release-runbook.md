# フェーズ4：リリース・ランブック（App Store / Google Play 公開手順）

> 対象アプリ：**serifu_app**（日本語の俳優セリフ練習・オーディション練習アプリ / Flutter, iOS・Android）
> 本書は、ストア公開までの**実行可能なチェックリスト/ランブック**である。コマンドはそのまま実行できる形で示す。
> 前提：`serifu-app/` で `flutter create .` 済み（`android/` `ios/` フォルダが生成済み）、`flutter pub get` が通る状態。

---

## 0. 全体の流れ（チェックリスト）

- [ ] 事前準備（アカウント・ID 決定）… §1
- [ ] 署名設定（iOS / Android）… §2
- [ ] バージョニング & ビルド … §3
- [ ] プラグイン別のプラットフォーム設定 … §4
- [ ] 審査・コンプライアンス対応 … §5
- [ ] プライバシーポリシー / サポート URL … §6
- [ ] ストア掲載素材（アイコン / スクショ / 説明文）… §7
- [ ] TestFlight / 内部テスト … §8
- [ ] 提出前 QA（本アプリ機能）… §9
- [ ] 段階的リリース … §10

---

## 1. 事前準備（アカウント・ID）

### 1-1. 開発者アカウント
- [ ] **Apple Developer Program** に登録（**年 $99**、個人 or 法人 / D-U-N-S 要）。
  - <https://developer.apple.com/programs/>
- [ ] **Google Play Console** に登録（**初回のみ $25**、買い切り）。
  - <https://play.google.com/console/signup>
  - 2023/11 以降の個人アカウントは**公開前に 12 名 14 日間のクローズドテスト**が必須（§8 参照）。

### 1-2. 識別子の決定（後から変更不可。最初に固定する）
- [ ] **bundle id（iOS）/ applicationId（Android）** を決める。逆ドメイン形式。
  - 例：`com.example.serifu` → **自分の所有ドメインに置き換える**（例 `com.yourname.serifu`）。
- [ ] iOS：Apple Developer の **Certificates, Identifiers & Profiles → Identifiers** で App ID を登録。
- [ ] App Store Connect / Play Console 双方で**同一の表示名**「セリフ稽古」を確保。

```bash
# applicationId の確認・変更（Android）
#   android/app/build.gradle(.kts) の applicationId を編集
# bundle id の確認（iOS）
#   ios/Runner.xcodeproj を Xcode で開き、Runner > Signing & Capabilities > Bundle Identifier
# パッケージ名を一括変更したい場合（任意ツール）
flutter pub global activate rename
flutter pub global run rename setBundleId --targets ios,android --value com.yourname.serifu
flutter pub global run rename setAppName --targets ios,android --value "セリフ稽古"
```

---

## 2. 署名設定

### 2-1. iOS（証明書・プロビジョニング）
推奨は **Xcode の自動署名（Automatically manage signing）**。

- [ ] Xcode で `ios/Runner.xcworkspace` を開く（`.xcodeproj` ではなく **workspace**）。
- [ ] **Runner ターゲット → Signing & Capabilities**
  - [ ] *Automatically manage signing* を ON
  - [ ] **Team** を選択（有料 Apple Developer の Team）
  - [ ] **Bundle Identifier** を §1-2 の値に設定
- [ ] App Store Connect で**アプリレコードを作成**（同じ bundle id）。
  - <https://appstoreconnect.apple.com/>
- 手動署名が必要な場合（CI 等）は Distribution 証明書 + App Store プロビジョニングプロファイルを作成し、`ExportOptions.plist` で指定する。

### 2-2. Android（keystore 生成 + Play App Signing）

```bash
# 1) アップロード鍵（keystore）を生成。パスワードは安全に保管
keytool -genkey -v \
  -keystore ~/serifu-upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload

# 2) android/key.properties を作成（gitignore する。コミット厳禁）
cat > android/key.properties <<'EOF'
storePassword=********
keyPassword=********
keyAlias=upload
storeFile=/Users/you/serifu-upload-keystore.jks
EOF
```

- [ ] `android/key.properties` を `.gitignore` に追加（**鍵・パスワードを絶対にコミットしない**）。
- [ ] `android/app/build.gradle(.kts)` に署名設定を追加：

```kotlin
// android/app/build.gradle.kts（Kotlin DSL の例）
import java.util.Properties
import java.io.FileInputStream

val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) load(FileInputStream(f))
}

android {
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = (keystoreProperties["storeFile"] as String?)?.let { file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

- [ ] **Play App Signing** を有効化（Play Console の既定）。アップロード鍵で署名した AAB をアップすると、Google が**配信用署名鍵**を管理。アップロード鍵を紛失しても再登録で復旧可能。

---

## 3. バージョニング & ビルド

### 3-1. バージョン（`pubspec.yaml` の `version: x.y.z+build`）
- `x.y.z` = ユーザー向けバージョン名（iOS `CFBundleShortVersionString` / Android `versionName`）
- `+build` = ビルド番号（iOS `CFBundleVersion` / Android `versionCode`）。**提出のたびに必ず増やす**。

```yaml
# pubspec.yaml（現状 0.1.0+1 → 公開初版の例）
version: 1.0.0+1
```

### 3-2. ビルドコマンド

```bash
# 共通：クリーン
flutter clean && flutter pub get

# iOS：App Store 提出用 .ipa（要 macOS + Xcode）
flutter build ipa --release
#   → build/ios/ipa/serifu_app.ipa
#   Transporter.app か Xcode Organizer、または:
xcrun altool --upload-app -f build/ios/ipa/serifu_app.ipa \
  -t ios -u "APPLE_ID" -p "APP_SPECIFIC_PASSWORD"
# （現在は xcrun altool は非推奨。Transporter.app / Xcode からのアップロード推奨）

# Android：Play 提出用 App Bundle（AAB）。.apk ではなく AAB を提出
flutter build appbundle --release
#   → build/app/outputs/bundle/release/app-release.aab

# 動作確認用に分割 APK（任意・実機サイドロード）
flutter build apk --release --split-per-abi
```

- [ ] iOS：`build/ios/ipa/*.ipa` を **Transporter.app** で App Store Connect へアップロード。
- [ ] Android：`app-release.aab` を Play Console の対象トラックへアップロード。

---

## 4. プラグイン別プラットフォーム設定

本アプリの依存（`flutter_tts`, `file_picker`, `syncfusion_flutter_pdf`, `archive`, `xml`,
`google_mlkit_text_recognition`, `speech_to_text`, `audioplayers`, `pdfx`, `path_provider`）に必要な設定。

### 4-1. iOS（`ios/Runner/Info.plist`）— 用途文字列（必須）
未設定だと**実行時クラッシュ & 審査リジェクト**。日本語で具体的に書く。

```xml
<key>NSMicrophoneUsageDescription</key>
<string>セリフ練習のハンズフリー進行で、あなたの声をマイクで取得します。音声は端末内で処理し、外部送信しません。</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>自分のセリフの言い終わりを判定するために音声認識を使用します。台本・音声は端末外へ送信しません。</string>
```

- [ ] **マイク**（`speech_to_text`）：`NSMicrophoneUsageDescription`
- [ ] **音声認識**（`speech_to_text`）：`NSSpeechRecognitionUsageDescription`
- [ ] **file_picker**：iOS は通常追加権限不要。iCloud Drive 等から選ぶ場合は Capabilities で iCloud を有効化（ローカル選択のみなら不要）。写真ライブラリ経由で画像を取り込む UI を使う場合のみ `NSPhotoLibraryUsageDescription` を追加。
- [ ] **ML Kit（`google_mlkit_text_recognition`）日本語**：iOS は Podfile 自動連携。Podfile で `platform :ios, '15.5'` 以上を確認（ML Kit は新しめの最低 iOS を要求）。日本語スクリプトの pod が追加されることを確認。
- [ ] **最低 iOS バージョン**：`ios/Podfile` の `platform :ios, 'XX.X'` と Xcode の Deployment Target を ML Kit が要求するバージョンに合わせる。
- [ ] Pod 再取得：

```bash
cd ios && pod repo update && pod install && cd ..
```

### 4-2. Android（`android/app/src/main/AndroidManifest.xml`）

```xml
<!-- speech_to_text：録音権限 -->
<uses-permission android:name="android.permission.RECORD_AUDIO"/>

<!-- Android 11+ で音声認識アプリへ問い合わせる場合に必要な queries -->
<queries>
  <intent>
    <action android:name="android.speech.RecognitionService" />
  </intent>
</queries>
```

- [ ] **RECORD_AUDIO**（`speech_to_text`）を追加。実行時に runtime permission をリクエスト。
- [ ] **ML Kit（`google_mlkit_text_recognition`）**：日本語モデルをアプリ同梱（バンドル）する場合は `AndroidManifest.xml` の `<application>` に：

```xml
<meta-data
    android:name="com.google.mlkit.vision.DEPENDENCIES"
    android:value="ocr_japanese" />
```

- [ ] **`minSdkVersion`**：ML Kit / 各プラグインの要求に合わせ **21 以上**（できれば 23+）に設定（`android/app/build.gradle(.kts)`）。
- [ ] **`file_picker`**：Android 13+ は細分化メディア権限だがファイル選択（SAF）は通常権限不要。古い OS 互換が必要な場合のみ READ 系を検討。
- [ ] **`pdfx` / `syncfusion_flutter_pdf`**：追加権限なし（ファイルは file_picker 経由で受領）。`pdfx` はネイティブのレンダラを使うため、ビルドが通ること・実機で画像 PDF がラスタライズできることを確認。
- [ ] **`audioplayers` / `path_provider`**：追加権限なし。
- [ ] **`archive` / `xml`**（docx 解析）：純 Dart のため設定不要。
- [ ] ProGuard/R8（リリース最適化）で ML Kit / speech が壊れないこと（minify 有効時は keep ルールを確認）。

> 設定後、最終確認のため**実機で**マイク・OCR・PDF レンダリングを必ず動作確認（エミュレータでは ML Kit/録音が不安定なことがある）。

---

## 5. 審査・コンプライアンス対応

### 5-1. App Privacy（Apple）/ データセーフティ（Google）
台本・音声はオンデバイス処理で端末外へ出さない。**ただし無料提供のため
広告SDK（AdMob）を組み込んでおり、広告ID/デバイスIDが広告目的で収集・
共有される**。この点を正しく申告する（「データ収集なし」は不可・虚偽申告になる）。
詳細な申告内容は docs/14-legal-checklist.md を正とする。

- [ ] **App Store Connect → App Privacy**：
  - 「Identifiers → Device ID」を**収集・第三者と共有（用途: Third-Party Advertising）**
    として申告（AdMob・非パーソナライズ）。トラッキングには該当しないため
    App Tracking Transparency（ATT）ダイアログは不要。
  - 台本・録音・音声認識：端末内処理で外部送信しないため「収集」に該当しない。
- [ ] **Google Play → アプリのコンテンツ → データセーフティ**：
  - 「デバイスまたはその他のID」を**収集・共有: 広告またはマーケティング目的**で申告。
  - 台本・録音・音声：収集なし（オンデバイス処理・端末内保存のみ）。
  - 「台本データはオンデバイスで処理される」旨を記載。

> 将来クラウド TTS/LLM を**オプトイン**で追加した場合は、両フォームを更新し、
> 送信データ種別・第三者・学習非利用を明記すること（仕様書 §3-8）。

### 5-2. 輸出コンプライアンス（暗号化）
- [ ] **`ios/Runner/Info.plist`** に追加：

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

  - 標準の HTTPS/OS 提供の暗号化のみで、独自の非標準暗号を実装していない場合は `false`。これにより毎回の輸出申告ダイアログを省略できる。
- [ ] Google Play 側にも特別な暗号申告は通常不要（標準暗号のみ）。

### 5-3. 著作権注記（ユーザーがアップロードする台本）
- [ ] アプリ説明文 & プライバシーポリシーに**著作権の責任所在**を明記：
  - 「本アプリはユーザーが取り込んだ台本を**端末内のみ**で処理します。取り込む台本の権利・利用許諾はユーザーの責任です。」
- [ ] 初回取り込み時に**注意書き**（任意）：「権利を持つ／許諾された台本のみ取り込んでください」。
- [ ] アプリ内に他者の著作物（既製台本）を**同梱しない**（サンプルは自作 or パブリックドメインのみ）。

### 5-4. 年齢レーティング
- [ ] **App Store**：Age Rating 質問票に回答 → 暴力/性的表現なしのため最低区分（4+ 相当）を想定。ユーザー生成コンテンツ（台本）を扱う旨は質問票で正直に申告。
- [ ] **Google Play**：コンテンツ レーティング質問票（IARC）に回答 → 全年齢相当を想定。

---

## 6. プライバシーポリシー & サポート URL（必須）

両ストアとも**公開 URL が必須**。

- [ ] **プライバシーポリシー URL**（必須・公開アクセス可能なこと）に最低限明記：
  - 収集データ：**なし**（完全オンデバイス）。
  - 台本データ：**端末内のみで保存・処理し、AI 学習には使用しない**（仕様書 §3-8）。
  - マイク/音声認識：ハンズフリー進行のためにのみ使用し、音声は端末外へ送信しない（OS の音声認識を利用する場合の挙動を正確に記載）。
  - 連絡先・問い合わせ先。
- [ ] **サポート URL**（App Store 必須）/ 連絡先メール（Play 必須）を用意。
  - 例：GitHub Pages / Notion 公開ページ / 自前サイトのいずれか。
- [ ] ストア掲載フォームの該当欄に URL を入力（App Store Connect / Play Console 双方）。

> 注意：OS 標準の音声認識（iOS の Speech / Android の SpeechRecognizer）は**実装によりサーバ送信される場合がある**。実際の挙動を確認し、プライバシーポリシーの表現を実態に合わせること（「端末外送信なし」と書くなら on-device 認識を保証する設定であること）。

---

## 7. ストア掲載素材

### 7-1. アイコン
- [ ] マスターアイコン **1024×1024 PNG（透過なし・角丸なし）** を用意。
- [ ] `flutter_launcher_icons` で各サイズを生成（推奨）：

```bash
flutter pub add --dev flutter_launcher_icons
# pubspec.yaml に設定を追記後:
dart run flutter_launcher_icons
```

  - iOS：App Store 用 1024px。Android：アダプティブアイコン（foreground/background）。

### 7-2. スクリーンショット（端末別）
- [ ] **iOS（必須）**：
  - 6.7"/6.9"（iPhone Pro Max 系）… 必須
  - 6.5"（任意だが推奨）
  - 12.9"/13" iPad（iPad 対応で配信する場合のみ必須）
- [ ] **Android**：携帯電話用スクショ 2〜8 枚、フィーチャーグラフィック **1024×500**。
- 推奨カット：ホーム（台本一覧）/ 取り込み・解析結果 / 役選択 / 声設定 / リハーサル画面（ハイライト）。

### 7-3. 説明文（日 / 英）
- [ ] **日本語**（主言語）：
  - タイトル：セリフ稽古 — 台本読み合わせ練習
  - 概要：台本を取り込み、相手役をアプリが読み上げ。完全オンデバイスでプライバシー安心。
- [ ] **英語**（ローカライズ追加）：
  - Title: Serifu Keiko — Script Rehearsal
  - Subtitle: On-device line practice for actors & auditions.
- [ ] キーワード / プロモーションテキスト（App Store）、簡単な説明（Play, 80 字）も用意。
- [ ] 「**完全オンデバイス / 台本は AI 学習に使わない**」を訴求点として両言語に記載。

---

## 8. TestFlight / 内部テスト

### 8-1. iOS（TestFlight）
- [ ] `flutter build ipa` → アップロード（§3）→ App Store Connect の **TestFlight** タブに表示。
- [ ] **内部テスト**：チームメンバー（最大 100）。即時配布、審査ほぼ不要。
- [ ] **外部テスト**：最大 10,000 名。初回はベータ App Review が必要。
- [ ] テスト項目は §9 の QA チェックリストを使用。

### 8-2. Android（内部テスト / クローズドテスト）
- [ ] Play Console の **テスト → 内部テスト**トラックに AAB をアップロード、テスターのメールリスト/オプトイン URL を配布。
- [ ] 個人アカウントは**クローズドテスト 12 名以上・14 日間**の実績が本番公開の前提（要件を満たすこと）。
- [ ] 内部テスト → クローズド → 本番 と昇格（プロモート）していく。

---

## 9. 提出前 QA チェックリスト（本アプリ機能）

実機（iOS / Android 各 1 台以上）で確認。

**取り込み（ImportFlow）**
- [ ] **PDF（テキスト埋込）** を取り込み → テキスト抽出が成功する。
- [ ] **docx** を取り込み → `archive`+`xml` で本文抽出できる。
- [ ] **画像 / 画像 PDF** を取り込み → `pdfx` でラスタライズ → **ML Kit OCR（日本語）**で抽出。
- [ ] **TXT** を取り込み（README のサンプル台本）→ 抽出できる。
- [ ] 抽出失敗時に OCR へ自動フォールバックする。
- [ ] `file_picker` のキャンセル・不正ファイルで**クラッシュしない**。

**解析（RuleBasedParser / 修正 UI）**
- [ ] 役名・セリフ・ト書きが概ね正しく分類される。
- [ ] 「登場人物」ブロックが役名辞書として効く。
- [ ] `ScriptEditScreen` で type / speaker / 本文の修正・行削除・役追加ができる。

**役選択・声設定**
- [ ] 自分の役を単一選択できる。
- [ ] 役ごとに 性別（男/女）・速度（0.5〜2.0）・ピッチを設定でき、**試聴**が鳴る（flutter_tts）。
- [ ] グローバル既定が自分以外の役へ適用される。

**リハーサル（両モード）**
- [ ] **手動モード**：自分の番でポーズ＆ハイライト、`▶次へ`で進む。相手役は設定声で TTS 再生＆ハイライト。
- [ ] **ハンズフリーモード**：マイク ON で自分のセリフ言い終わりを検知 → 自動で相手役再生。
- [ ] ト書き ON/OFF で読み上げ/表示が切り替わる。
- [ ] 速度クイック変更・前後行・頭出し・進捗バーが機能。

**ハンズフリー / 権限**
- [ ] 初回マイク権限ダイアログが出て、許可後に音声認識が動く。
- [ ] 権限拒否時にクラッシュせずガイダンス表示。

**永続化（script_store）**
- [ ] 台本保存 → アプリ再起動後も一覧・声設定・自分の役が復元される（JSON ラウンドトリップ）。
- [ ] ストレージ書き込み失敗時に try/catch で握り潰さず適切に扱う。

**横断**
- [ ] リリースビルド（`--release`）で minify 後も ML Kit / speech / TTS が動く。
- [ ] オフライン（機内モード）で取り込み〜リハーサルまで完結する（オンデバイス保証の確認）。
- [ ] ダークモード / 大きい文字サイズで UI 崩れなし。

```bash
# 純Dart部分は自動テストで担保
flutter test
```

---

## 10. 段階的リリース（Staged Rollout）

### 10-1. Android
- [ ] 本番トラックで **段階的公開** を有効化：5% → 10% → 20% → 50% → 100%。
- [ ] 各段でクラッシュ率（Android vitals）/ ANR / レビューを監視し、問題があれば**ロールアウトを一時停止 or ハルト**。

### 10-2. iOS
- [ ] App Store の **Phased Release for automatic updates** を有効化（既存ユーザーへ 7 日かけて配信）。新規ダウンロードは即時。
- [ ] Crash（Xcode Organizer / App Store Connect）と評価を監視。問題時は Phased Release を一時停止。

### 10-3. リリース後
- [ ] バージョンタグ付け（例 `v1.0.0`）と変更履歴の記録。
- [ ] 次版は `pubspec.yaml` の `+build`（versionCode / CFBundleVersion）を必ずインクリメント。
- [ ] ユーザー問い合わせ（サポート URL）対応フローを用意。

---

> 補足：本リポジトリには Flutter SDK / プラットフォームフォルダが未生成のため、本書の手順は
> `flutter create .` 済みの環境で実行すること。実機依存（マイク・OCR・PDF ラスタライズ・段階公開）は
> 必ず実機で最終確認する。
