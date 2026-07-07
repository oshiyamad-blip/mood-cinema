# セリフ稽古（serifu_app）

日本語の俳優セリフ練習・オーディション練習アプリ（iOS / Android, Flutter）。
台本（PDF / Word / 画像・写真 / TXT）を取り込み、**自分の役を選ぶと相手役をアプリが読み上げ**ます。

主な機能：
- 相手役の声を **男性/女性・声モデル選択・テンポ（速度）** 調整、**ト書きの読み上げ ON/OFF**
- **台本表示モード**（テレプロンプター風に追従）と **暗記モード**（台本を隠して練習・チラ見可）
- **ハンズフリー進行**（自分のセリフを言い終わると音声認識で自動的に相手役を再生）
- **ゼロ遅延**：相手役の音声をバックグラウンドで事前合成し、本番は再生のみ＝
  「自分が言い終わってからAIが返すまで」の処理待ちをなくす設計。
  **準備完了を待たずに開始でき**、未準備の行だけライブ合成で読む

> **プライバシー（重要）**：MVPは**完全オンデバイス**。台本の抽出・解析・読み上げはすべて端末内で行い、
> クラウドへ送信しません。したがって**台本データがAI学習に使われる経路は存在しません**。
> 詳細は `docs/02-spec-and-screens.md` の「データ取り扱い・非学習ポリシー」を参照。

## ドキュメント
- `docs/01-tech-research.md` … 技術選定（TTS音質・料金比較、台本解析方式、フレームワーク）
- `docs/02-spec-and-screens.md` … 機能仕様・画面設計・データモデル・非学習ポリシー
- `docs/03-monetization.md` … 課金モデルの検討と実装要件
- `docs/04-release-runbook.md` … App Store / Google Play 公開までの手順
- `docs/05-security-review.md` … セキュリティレビューと対応
- `docs/06-device-review.md` … 実機レビューの手順（CIのAPK / 自前ビルド / TestFlight）
- `docs/07-ios-testflight.md` … iOS TestFlight 自動配布のセットアップ（CI・Secrets）
- `docs/08-repo-migration.md` … 専用リポジトリへの切り出し手順
- `docs/09-commercial-roadmap.md` … 商用化ロードマップ（フェーズ・担当・KPI）
- `docs/10-store-listing.md` … ストア掲載文（日/英）・スクショ計画・審査注意
- `legal/` … プライバシーポリシー・利用規約（アプリ内 設定→法的情報 にも表示）
- `design/` … Claude Design 取込用のUIデザイン一式（HTMLプレビュー）

## 実機レビュー
GitHub Actions（`.github/workflows/serifu-app.yml`）が push/手動実行で
**サイドロード可能な Android デバッグAPK**を生成（Artifacts）。iOSはコンパイル検証。
手順は `docs/06-device-review.md` を参照。

## Web版（PC確認用）
PCのブラウザでURLを開くだけでアプリを確認できます。

- **URL**: https://oshiyamad-blip.github.io/mood-cinema/
- GitHub Actions（`.github/workflows/serifu-web.yml`）が push/手動実行で
  Flutter Web をビルドし **GitHub Pages** へ自動デプロイします。
- **初回のみ**: リポジトリの Settings → Pages → 「Build and deployment」の
  Source を **GitHub Actions** に変更してください（未設定だとデプロイが失敗します）。

Web版はあくまで**動作確認用**で、モバイル版と以下の違いがあります。

| 項目 | Web版の挙動 |
|------|------------|
| 取り込み | PDF（テキスト埋込）/ docx / TXT のみ。**画像・写真、画像PDFのOCRは未対応**（ML KitがWeb非対応） |
| 読み上げ | 事前合成（ゼロ遅延）は行わず、常に**ライブ合成**（ブラウザの SpeechSynthesis）で読む |
| 課金 | 無効。確認しやすいよう**全機能を解放**（`--dart-define=UNLOCK_ALL=true` でビルド） |
| 永続化 | なし（メモリのみ）。**リロードすると台本・設定は消えます** |
| 音声認識 | ブラウザ依存（Chrome推奨）。利用不可の場合は手動進行に縮退 |

## この雛形に含まれるもの（MVPコア）
```
lib/
  main.dart
  theme/app_theme.dart            … デザイントークン→ThemeData（design/と一致）
  billing/                        … 課金（RevenueCat）
    purchase_service.dart         …   エンタイトルメント管理（未設定でも無料動作）
    features.dart                 …   無料/有料の機能ゲート
    billing_config.dart           …   APIキー（dart-defineで注入）
  models/script.dart              … 台本/行/声設定のデータモデル
  parser/rule_based_parser.dart   … 日本語台本のルールベース解析（端末内）
  speech/speech_engine.dart       … 読み上げエンジンの抽象
  speech/device_speech_engine.dart… 端末内蔵TTS実装（flutter_tts）
  speech/speech_recognizer.dart   … 音声認識ラッパー（ハンズフリー進行・オンデバイス優先）
  speech/line_audio_preparer.dart … 相手役音声の事前合成（本番ゼロ遅延）
  services/text_extractor.dart    … 取り込み振り分け（PDF/docx/画像/TXT、端末内）
  services/docx_text_extractor.dart… .docx 抽出（zip+XML, 純Dart）
  services/ocr_service.dart       … OCR（ML Kit, 日本語, オンデバイス）
  data/script_repository.dart     … 台本の保管（端末ローカルに永続化）
  data/script_store.dart          … JSONファイル保存/読込（オンデバイス）
  screens/
    home_screen.dart              … 一覧 + 取り込み
    script_detail_screen.dart     … 役選択 / ト書きON-OFF / 声設定への導線
    script_edit_screen.dart       … 解析結果の確認・修正（種別/話者/本文/削除）
    voice_settings_screen.dart    … 役ごとの 性別・テンポ + 試聴
    rehearsal_screen.dart         … 再生（台本表示/暗記の2モード、ハンズフリー、事前合成再生）
    paywall_screen.dart           … アップグレード（ペイウォール）
  rehearsal/rehearsal_controller.dart … リハーサル進行のステートマシン（純Dart・テスト可能）
  theme/role_colors.dart          … 役バッジ配色（インデックスでパレット循環）
test/
  rule_based_parser_test.dart     … 解析器の単体テスト
  docx_text_extractor_test.dart   … docx抽出の単体テスト
  script_serialization_test.dart  … 保存/読込のラウンドトリップテスト
  app_settings_test.dart          … 設定のラウンドトリップテスト
  rehearsal_controller_test.dart  … 進行ロジックのテスト（フェイク読み上げ器で
                                     停止/再開/ト書き/ジャンプ/連続自分セリフ等を検証）
  widget_smoke_test.dart          … ホーム画面のビルド検証
```

## テストの実行
```bash
flutter test            # 全テスト（進行ロジック含む・端末不要）
flutter analyze         # 静的解析
```
リハーサルの進行は `RehearsalController` に分離してあり、読み上げは
`RehearsalLineSpeaker` 抽象を差し替えることで**実機なしで**進行の振る舞いを
テストできる（`test/rehearsal_controller_test.dart` がフェイク実装の例）。

## セットアップと実行
> この雛形は `lib/` などのソースのみを含みます。プラットフォームフォルダ
> （android/ios等）は各自の環境で生成してください。

```bash
# 1) Flutter SDK を用意（https://docs.flutter.dev/get-started/install）
flutter --version

# 2) このディレクトリでプラットフォームフォルダと設定を生成
cd serifu-app
flutter create .          # 既存の lib/ は維持される

# 3) 依存を取得
flutter pub get

# 4) 解析テストを実行
flutter test

# 5) 実機/シミュレータで起動
flutter run
```

### 動作確認の流れ
1. 「台本を取り込む」で PDF または TXT を選択（サンプルは下記）。
2. 自動解析の結果（役名・行）を確認。
3. 「あなたの役」を選択 → 必要なら「相手役の声設定」で男性/女性・テンポを調整。
4. 「練習開始」→ 相手のセリフが読み上げられ、自分の番で止まる。「言えた・次へ」で進む。

### 動作確認用サンプル台本（TXTで保存して取り込み）
```
登場人物
太郎
花子

（朝、駅のホーム）
太郎「おはよう、花子」
花子「おはよう。今日は早いね」
太郎「うん、オーディションがあるんだ。
緊張してきたよ」
花子「大丈夫、練習した通りにやれば」
```

## 既知の制約 / 次の実装（TODO）
- **docx 取り込み**：✅ 対応済み（`docx_text_extractor.dart`、純Dart・テスト付き）。
- **OCR（写真・画像PDF）**：✅ 対応済み（`ocr_service.dart`、ML Kit・オンデバイス）。
  画像PDFはテキスト抽出に失敗したとき自動でOCRへフォールバック。
  ※ OCR/PDFラスタライズは実機依存のため本環境では未検証。
- **永続化**：✅ 対応済み（`script_store.dart`、端末ローカルのJSONファイル。テスト付き）。
  hive/sqflite への置き換えも可能だが、コード生成不要で確実なJSON方式を採用。
- **解析修正UI**：✅ 対応済み（`script_edit_screen.dart`。種別/話者/本文の修正・行削除・役追加）。
- **クラウドTTS（任意）**：高品質音声を*オプトイン*で。学習非利用が保証されたAPIのみ・
  Zero Data Retention 設定で（仕様書 §3-8）。
- **音声認識（ハンズフリー進行）**：✅ 対応済み（`speech_recognizer.dart`。リハーサル画面の
  マイクアイコンでON/OFF。自分のセリフを言い終わると自動で相手役を再生）。
  ※ 下記「権限設定」が必要。実機依存のため本環境では未検証。

## 権限設定（音声認識・OCRに必要）
`flutter create .` 後、各プラットフォームに以下を追記してください。

**iOS（`ios/Runner/Info.plist`）**
```xml
<key>NSMicrophoneUsageDescription</key>
<string>セリフ練習でのハンズフリー進行に音声を使用します。</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>自分のセリフの言い終わりを判定するために音声認識を使用します。</string>
```

**Android（`android/app/src/main/AndroidManifest.xml`）**
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
```
（`google_mlkit_text_recognition` / `speech_to_text` の追加設定は各パッケージのREADMEを参照）

---

## 課金（RevenueCat）
- 無料：端末内蔵TTS・台本表示/暗記モード・男女ボイス・台本3件まで。
- プロ：台本無制限・ハンズフリー進行・声モデル選択・（将来）クラウド高品質音声・広告なし。
- APIキーは `--dart-define=RC_IOS_KEY=... --dart-define=RC_ANDROID_KEY=...` で注入。
  **未設定でも無料層として正常動作**（購入導線は「準備中」表示）。
- エンタイトルメント識別子は `pro`（RevenueCatダッシュボードと一致させる）。

## クラウド高品質音声（オプトイン・Pro）
- 端末TTSが既定。Pro かつ 設定ONで、リハーサルの相手役を**クラウドTTSで事前合成**して再生。
- **鍵はクライアントに置かない**：アプリは自前の「TTSプロキシ」だけを呼ぶ。
  - 参照実装：`server/tts-proxy.example.mjs`（Google Cloud TTS 例。ElevenLabs にも差し替え可）
  - 注入：`--dart-define=CLOUD_TTS_ENDPOINT=https://<host>/api/tts --dart-define=CLOUD_TTS_TOKEN=<token>`
- 未設定なら自動的に端末TTSへ縮退（機能は壊れない）。学習非利用・最小送信の方針は `docs/05` 参照。

## 検証状況
- ✅ `flutter pub get` 成功（Flutter 3.44 / Dart 3.10 で確認）
- ✅ `flutter analyze` … **No issues found!**（エラー・警告・infoなし）
- ✅ `flutter test` … **全9件パス**（解析器 / docx抽出 / 保存ラウンドトリップ /
  ホーム画面のウィジェット・スモークテスト＝テーマ適用UIが実ビルドできることを確認）
- ✅ デザインを全画面に反映（`design/` のトークン → `theme/app_theme.dart`）
- ⏳ TTS / OCR / 音声認識 / 事前合成・音声再生 / 課金（実購入）は**実機/シミュレータ依存**のため、
  実機での通し確認は別途必要（CIではユニット+ウィジェットテストのみ）。

## 多言語対応について
読み上げ・音声認識・声の切替は**ロケール指定で多言語化しやすい**構造：
- TTS（`flutter_tts`）／音声認識（`speech_to_text`）はロケール（`en-US` / `fr-FR` /
  `ko-KR` / `zh-CN` 等）を渡すだけで対応。声モデルも各言語のものを選択可能。
- アプリUIは Flutter の i18n（`flutter_localizations` + `intl`）で多言語化。
- 唯一の言語依存は**台本解析**（`rule_based_parser` は日本語の「」/：/ト書き前提）。
  他言語は書式が異なる（英語 `JOHN: ...` など）ため、言語別ルールの追加、または
  **LLM解析（言語非依存）**で吸収するのが効率的。
- まとめ：**「読む・聞く・声を選ぶ」は“ほぼワンタッチ”で多言語化可能**。解析だけ各言語対応が必要。

