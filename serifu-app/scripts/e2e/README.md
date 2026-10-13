# 総合E2E（Web版）

本番（GitHub Pages）と同じ `/mood-cinema/` 配下のリリースビルドを、実ブラウザ
（Playwright + Chromium）で操作して確認する総合テストです。Flutter の
セマンティクス（アクセシビリティ）ツリー経由でボタンを押すので、画面座標や
文言の細かな変更に比較的強くなっています。

## 確認していること

- 起動：変則ロケール（`C.UTF-8`・空・`en_US.UTF-8@posix`）やPC幅でも落ちない
- 取り込み：TXT（UTF-8 / Shift_JIS）・Word・テキストPDF・画像だけのPDF（案内表示）
- 練習：相手役の読み上げ順・一時停止/再開で二重再生や飛ばしが起きない・
  速度/高さ設定の反映・伏せ字・リザルトと記録の表示
- データ：再読み込み後も残る・書き出し（`.honyomi.json`）→再取り込み・削除の確認ダイアログ
- 設定/ヘルプ/OSSライセンス（日本語表示）
- ハンズフリー：マイクが使えない環境で理由を表示し、手動進行に戻る
- 全体を通して実行時エラーが出ない

読み上げは `speechhook.js` が `speechSynthesis` を置き換えて記録します（音は出ません）。

## 実行

```bash
cd serifu-app
flutter build web --release --base-href "/mood-cinema/" --dart-define=UNLOCK_ALL=true
cd scripts/e2e
npm install            # playwright
npx playwright install chromium   # 未導入の場合のみ
node full.mjs          # すべて PASS なら終了コード 0
```

既存の Chromium を使う場合は `PLAYWRIGHT_CHROMIUM=/path/to/chromium node full.mjs`。
スクショは `shots/`、書き出したファイルは `downloads/` に保存されます（どちらも git 管理外）。

## テスト用台本

`fixtures/` はすべてこのテスト用に作った架空の台本です（実在作品は入れないこと）。
作り直す場合：

```bash
python3 fixtures/make_fixtures.py fixtures /path/to/NotoSansJP-Regular.ttf   # reportlab が必要
```

`yudachi_sjis.txt`（Shift_JIS）と `image_only.pdf`（文字情報の無いPDF）は手作りです。
