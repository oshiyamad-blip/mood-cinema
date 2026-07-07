# ストア掲載素材（App Store / Google Play）

審査提出時にコピペで使える掲載文とスクリーンショット計画。
（アイコン・スクショ画像の制作は roadmap 1-9 / 下記「スクリーンショット計画」参照）

## アプリ名・サブタイトル

| 項目 | 日本語 | English |
|---|---|---|
| アプリ名 | ホンヨミ | HonYomi – Line Rehearsal |
| サブタイトル(iOS 30字) | 台本を読み込んで、AIが相手役に | Practice lines with an AI scene partner |
| 短い説明(Play 80字) | 台本を読み込むと相手役をアプリが読み上げ。ひとりでセリフ稽古・オーディション対策 | Import your script and rehearse — the app reads every other role aloud. |

## 説明文（日本語）

```
■ ひとりでも、相手役がいる稽古を
台本（PDF・Word・写真・テキスト）を読み込んで自分の役を選ぶだけ。
残りの役はアプリが読み上げるので、いつでもどこでも本読み・セリフ稽古ができます。
オーディション前の追い込みに、劇団・養成所・演劇部の自主練に。

■ 主な機能
・台本の自動解析：役名・セリフ・ト書きを自動で判別（手動修正もかんたん）
・相手役の読み上げ：役ごとに男性/女性・テンポを調整。ト書きの読み上げON/OFF
・待たない稽古：相手役の音声は先に準備。あなたが言い終えた瞬間に返ってきます
・返しの間：相手が返すまでの「間」を0〜3秒で調整
・台本表示モード：読み上げに合わせて現在のセリフへ自動スクロール
・暗記モード：台本を隠して稽古。思い出せない時だけ「チラ見」
・ハンズフリー（プロ）：あなたのセリフの言い終わりを検知して自動で進行

■ 台本は端末の外に出ません
台本の解析・読み上げはすべて端末内で処理。サーバに送信されず、
AIの学習に使われることもありません。安心して未発表の台本をお使いください。

■ 無料ではじめて、必要ならプロへ
無料：台本3件まで・読み上げ・両モードなど基本機能
プロ（サブスクリプション）：台本無制限／ハンズフリー進行／声モデル選択 など
```

## Description (English)

```
Rehearse with an AI scene partner — anywhere, anytime.
Import your script (PDF, Word, photo, or text), pick your role,
and the app reads every other character's lines aloud.

FEATURES
• Automatic script parsing: roles, dialogue, and stage directions (easy manual fixes)
• Scene partner playback: per-role voice (male/female) and tempo; toggle stage directions
• Zero-wait rehearsal: partner lines are pre-synthesized and answer instantly
• Reply pause: add a 0–3s beat before your partner responds
• Script view with auto-scroll, or Memorize mode that hides the text (with peek)
• Hands-free (Pro): detects when you finish your line and continues automatically

YOUR SCRIPT STAYS ON YOUR DEVICE
Parsing and speech run entirely on-device. Scripts are never uploaded
and never used to train AI.

Free: up to 3 scripts and all core features.
Pro (subscription): unlimited scripts, hands-free mode, voice model selection.
```

## キーワード（iOS 100字以内）

```
セリフ,台本,稽古,演技,俳優,声優,オーディション,本読み,読み合わせ,暗記,演劇,朗読
```

## 分類・レーティング

- カテゴリ：教育（サブ：エンターテインメント）
- 年齢：4+ / 全年齢（ユーザー生成コンテンツはあるが共有機能なし）
- App Privacy / データセーフティ：**「データ収集なし」**（購入=RevenueCatは
  「アプリの機能に必要な購入履歴」として申告。docs/04 §5 参照）

## スクリーンショット計画（6.7インチ / 6.5インチ / iPad, Android各種）

各画面＋キャッチコピーのオーバーレイ構成（デザイントークン準拠の枠で統一）：

1. ホーム（台本一覧）—「台本を読み込むだけ」
2. 解析結果（役チップ）—「役名・セリフ・ト書きを自動判別」
3. リハーサル台本表示（現在行ハイライト）—「相手役はアプリが読む」
4. 暗記モード（舞台ダーク）—「台本を隠して、本番の緊張感」
5. 声設定（性別・テンポ）—「相手の声は自由に調整」
6. 設定（返しの間）—「芝居の“間”までデザイン」

撮影方法：実機 or エミュレータで `flutter run --release` → 各画面でスクショ →
Figma/Canva等でコピーを載せる（テンプレは design/ のトークンに合わせる）。

## 審査の注意（本アプリ固有）

- マイク権限の使用理由がUI上で分かること（ハンズフリーONの時だけ要求）→ 実装済み
- サブスクの価格・期間・解約方法の明示（ペイウォールに記載済み）＋
  利用規約/プライバシーポリシーへのリンク（アプリ内 設定→法的情報。
  **ストア側にも公開URLの登録が必要** → roadmap 1-7）
- 「AIが学習しない」訴求は事実に基づく（docs/02 §3-8）— 誇大表現にしない
