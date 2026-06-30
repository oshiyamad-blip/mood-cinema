# セリフ稽古（serifu_app）

日本語の俳優セリフ練習・オーディション練習アプリ（iOS / Android, Flutter）。
台本（PDF/TXT）を取り込み、**自分の役を選ぶと相手役をアプリが読み上げ**ます。
相手役の声は **男性/女性・テンポ（速度）** を調整でき、**ト書きの読み上げ ON/OFF** も切り替えられます。

> **プライバシー（重要）**：MVPは**完全オンデバイス**。台本の抽出・解析・読み上げはすべて端末内で行い、
> クラウドへ送信しません。したがって**台本データがAI学習に使われる経路は存在しません**。
> 詳細は `docs/02-spec-and-screens.md` の「データ取り扱い・非学習ポリシー」を参照。

## ドキュメント
- `docs/01-tech-research.md` … 技術選定（TTS音質・料金比較、台本解析方式、フレームワーク）
- `docs/02-spec-and-screens.md` … 機能仕様・画面設計・データモデル・非学習ポリシー

## この雛形に含まれるもの（MVPコア）
```
lib/
  main.dart
  models/script.dart              … 台本/行/声設定のデータモデル
  parser/rule_based_parser.dart   … 日本語台本のルールベース解析（端末内）
  speech/speech_engine.dart       … 読み上げエンジンの抽象
  speech/device_speech_engine.dart… 端末内蔵TTS実装（flutter_tts）
  services/text_extractor.dart    … PDF/TXTテキスト抽出（端末内）
  data/script_repository.dart     … 台本の保管（MVPは端末メモリ内）
  screens/
    home_screen.dart              … 一覧 + 取り込み
    script_detail_screen.dart     … 役選択 / ト書きON-OFF / 声設定への導線
    voice_settings_screen.dart    … 役ごとの 性別・テンポ + 試聴
    rehearsal_screen.dart         … 再生（自分の番はポーズ、相手はTTS、ハイライト）
test/
  rule_based_parser_test.dart     … 解析器の単体テスト
```

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
- **docx 取り込み**：未対応（PDF/TXTのみ）。docx解析を追加する。
- **画像PDFのOCR**：未対応。ML Kit / Apple Vision を追加する。
- **永続化**：MVPはメモリ内。`sqflite`/`hive` で端末ローカル保存に。
- **解析修正UI**：役の取り違え・ト書き誤判定を直す画面（仕様書 §3-3）。
- **クラウドTTS（任意）**：高品質音声を*オプトイン*で。学習非利用が保証されたAPIのみ・
  Zero Data Retention 設定で（仕様書 §3-8）。
- **音声認識**：セリフ終わりの自動検知でハンズフリー進行。

> このリポジトリではFlutterのSDKが無いためビルド検証は未実施。
> 解析器（`rule_based_parser.dart`）は純Dartで `flutter test` により検証可能。
