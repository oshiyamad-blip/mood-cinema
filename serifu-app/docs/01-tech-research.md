# フェーズ2：技術選定の深掘り（TTS音質・料金 / 台本解析 / フレームワーク）

> 対象アプリ：日本語の俳優セリフ練習・オーディション練習アプリ（iOS / Android）
> 主要機能：Word/PDF台本の取り込み → 役の選択 → 相手役をTTSで読み上げ（声の性別・テンポ調整、ト書きの読み上げON/OFF）

---

## 0. 結論（先に要点）

| 論点 | 推奨 | 理由 |
|---|---|---|
| フレームワーク | **Flutter** | `flutter_tts` が rate/pitch/voice/言語に対応。1コードで両OS。 |
| MVPの音声 | **端末内蔵TTS** | 無料・無制限・オフライン。全機能を成立させられる。 |
| 課金版の音声 | **クラウドTTS（段階導入）**：第一候補 **Google Cloud TTS（Chirp3 HD / Neural2）**、演技重視なら **ElevenLabs**、読み補正重視なら **Amazon Polly** | 音質と料金・読み精度のバランス。 |
| 音声のコスト戦略 | **「一度合成してキャッシュ→以後は無料再生」** | セリフは反復再生されるため、毎回合成しなければ premium でも激安。 |
| 台本解析 | **正規表現ルール + LLM構造化のハイブリッド** | 多様な書式に頑健。崩れた書式はLLMで吸収。 |

---

## 1. TTS（読み上げ）音声の比較

### 1-1. 方式の二択

**A. 端末内蔵TTS（オフライン）**
- iOS `AVSpeechSynthesizer` / Android `TextToSpeech`。Flutterからは `flutter_tts` で統一的に利用。
- **対応する要件**：日本語、男性/女性ボイス、`setSpeechRate()`（テンポ）、`setPitch()`、`setVoice()`。
- **コスト：無料・文字数無制限・通信不要**。
- 弱点：声がやや機械的。役者の「演技する相手役」感は弱い。OSやバージョンでボイス品揃えが変わる。

**B. クラウドTTS（高品質・有料）**
- 自然な抑揚・感情表現が可能。課金オプション／プレミアム機能として追加する。

> **設計指針：`SpeechEngine` インターフェースで抽象化**し、内蔵TTSとクラウドを差し替え可能にする。
> 無料版＝内蔵、有料版＝クラウド、という展開が自然にできる。

### 1-2. クラウドTTS 料金比較（100万文字あたり）

> 日本語はUTF-8で1文字が複数バイトでも「1文字」として課金される（Google公式）。

| サービス | モデル | 料金 (/100万字) | 無料枠 | 日本語の特徴 |
|---|---|---|---|---|
| **Google Cloud** | Standard | $4 | 4M字/月（恒久） | 声数多い |
| | WaveNet | $4 | 1M字/月（恒久） | 自然 |
| | Neural2 | $16 | 〃 | より自然 |
| | **Chirp3: HD** | $30 | 1M字/月（恒久） | 最新・高品質 |
| | Studio | $160 | — | ナレーション級 |
| **Amazon Polly** | Standard | $4 | 5M字/月（初年のみ） | 女性Mizuki/男性Takumi |
| | Neural (NTTS) | $16 | 1M字/月（初年のみ） | **読み仮名指定で誤読補正可** |
| **OpenAI** | tts-1 / tts-1-hd | $15 / $30 | — | プロンプトで口調指定可 |
| | gpt-4o-mini-tts | 約$0.015/分（≈$15相当） | — | 「落ち着いた」等の演技指示が可能 |
| **Azure** | Neural | 約$15 | あり（F0枠） | 安定・多言語 |
| **ElevenLabs** | Multilingual v2 | 1クレジット/字 | 10,000クレジット/月 | **最も自然・感情豊か**。日本語実用水準 |
| | Flash / Turbo v2.5 | 0.5クレジット/字 | 〃 | 低遅延・半額 |

ElevenLabsはサブスク制（例：Creator $22で121,000クレジット ≒ $0.18/1,000字）。**文字単価は最も高いが音質は最上位**。

### 1-3. 「キャッシュ前提」でのコスト試算（重要）

セリフ練習は**同じ台本を何度も再生**する。よって **合成は台本ごとに1回だけ行いMP3をキャッシュ**し、以後の再生は無料にする。これでコストは劇的に下がる。

**前提**：1シーン台本のうち相手役のセリフ＝約3,000文字（≒1〜3ページ相当）を一度だけ合成する場合の**1台本あたり一回限りコスト**：

| サービス/モデル | 1台本(3,000字)あたり |
|---|---|
| Google Standard / WaveNet | **約 $0.012** |
| Google Neural2 / Polly Neural / Azure | 約 $0.045〜0.05 |
| OpenAI tts-1 / gpt-4o-mini-tts | 約 $0.045 |
| Google Chirp3 HD | 約 $0.09 |
| ElevenLabs Flash v2.5 | 約 $0.27 |
| ElevenLabs Multilingual v2 | 約 $0.54 |

→ **キャッシュすれば、最高品質のElevenLabsでも1台本0.3〜0.5ドル程度の「使い切り」コスト**。無料枠だけでも個人利用は十分賄える。MVPは端末内蔵TTS（無料）で出し、プレミアムでクラウドへ、が合理的。

### 1-4. 補足：日本語特化の無料/OSS選択肢
- **VOICEVOX**：高品質な日本語キャラクター音声。ただしアニメ寄りで、商用利用はキャラごとの規約確認が必要。練習用相手役としては声色が限定的。
- **Web Speech API**：ブラウザ専用のため、ネイティブアプリでは対象外。

---

## 2. 台本解析（最重要・最難関）

入力はユーザーが用意した**書式バラバラなWord/PDF**。これを `{character, type: 'dialogue'|'direction', text}` の構造化データに変換するのが品質の肝。

### 2-1. テキスト抽出
| 入力 | 方式 |
|---|---|
| Word (.docx) | 実体はXMLのzip。`docx`系ライブラリ、またはサーバ側 `mammoth` 等で本文抽出。 |
| PDF（テキスト埋込） | `pdf.js` / ネイティブPDFライブラリでテキスト抽出。 |
| PDF（スキャン画像） | **OCR必須**：Apple Vision / Google Cloud Vision / ML Kit。 |

### 2-2. 構造解析：ルールベース + LLM のハイブリッド
日本語シナリオの定石（出典：脚本作法）：
- **セリフ**＝行頭に人物名、続くカギカッコ内に発話。複数行は2行目以降を1字下げ。
  - 例：`太郎「おはよう」` / `太郎：おはよう` / `太郎　おはよう`
- **ト書き**＝場面・動作の説明。地の文・カッコ書き・インデントで表現。
  - 例：`（ため息をついて）` / 行頭字下げの説明文

**ステップ：**
1. **正規表現ルール**で第一次パース：
   - 役名候補：行頭の `^([^\s「：（]{1,8})[「：　]` 等で抽出。冒頭の「登場人物」リストがあれば優先辞書化。
   - ト書き：`^\s*（.*）$` やインデント開始行、カギカッコを含まない地の文。
2. **崩れた書式・曖昧行はLLMで構造化**（最も頑健）：
   - Claude等に「この台本テキストを {speaker, type, text} のJSON配列にせよ」と指示。
   - 役名のゆれ（太郎／タロウ／T）を名寄せ、ト書きとセリフの境界判定も任せられる。
   - 出典付き構造抽出のため LangExtract のようなライブラリ的アプローチも参考になる。
3. **ユーザーによる確認・修正UI**を必ず用意（解析は100%にならない前提）。役の取り違え・ト書き誤判定をワンタップで直せるようにする。

### 2-3. プライバシー / 著作権
- 台本は著作物。**既定は端末内処理**。クラウド（LLM/TTS）送信時は規約で明示し、オプトインに。
- アップロード台本をサーバ保存する場合は暗号化＋ユーザー削除導線。

---

## 3. 発展機能（差別化）

- **セリフ終わりの自動検知**：音声認識（`speech_to_text` / Apple Speech / Picovoice）で自分の発話終了を検知し、相手役を自動再生 → 「本物の相手役と稽古」体験。既存の俳優向けアプリ（coldRead / Act-On-Cue / Acting Pal）の中核機能。
- **暗記モード**：自分の役を隠す／徐々に消す（穴埋め暗記）。
- **自己テープ録画**：オーディション提出用の録音・録画。
- **役ごとの声プロファイル**：役Aは女性・落ち着いた、役Bは男性・速め、を保存。

---

## 4. 推奨アーキテクチャ（まとめ図）

```
[取り込み] PDF/Word/画像
     │  テキスト抽出（docx/pdf/OCR）
     ▼
[解析] 正規表現ルール → LLM構造化 → ユーザー確認UI
     │  → 台本データ {scenes:[{lines:[{speaker,type,text}]}]}
     ▼
[設定] 自分の役 / 相手役の声(性別・速度) / ト書きON-OFF
     ▼
[再生] SpeechEngine（内蔵TTS or クラウドTTS）
     │  自分のセリフ=ポーズ＋ハイライト、相手=読み上げ
     │  ※クラウド時は合成結果をMP3キャッシュ
     ▼
[発展] 音声認識でハンズフリー進行 / 暗記モード / 録画
```

---

## 5. 出典（Sources）

- [Amazon Polly Pricing（AWS公式）](https://aws.amazon.com/polly/pricing/)
- [Review pricing for Text-to-Speech（Google Cloud公式）](https://cloud.google.com/text-to-speech/pricing)
- [ElevenLabs Pricing](https://elevenlabs.io/pricing)
- [OpenAI TTS Pricing 解説（TextToLab）](https://texttolab.com/blog/openai-tts-pricing)
- [Microsoft Azure Text to Speech Pricing（Speechify）](https://speechify.com/blog/microsoft-azure-pricing-plans/)
- [flutter_tts（Flutterパッケージ）](https://pub.dev/packages/flutter_tts)
- [LangExtract 解説（株式会社一創）](https://www.issoh.co.jp/tech/details/9025/)
- [脚本の書き方｜7つのルール（かかねば）](https://kakaneba.com/script-how-to-write-7-rules/)
- [LLMで長文から構造化データを抽出する（DROBE）](https://tech.drobe.co.jp/entry/2023/09/12/120000)
- [coldRead](https://www.coldreadapp.com/) / [Act-On-Cue](https://actoncue.com/) / [Acting Pal](https://www.actingpal.com/)
