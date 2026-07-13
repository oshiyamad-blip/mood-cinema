# CCNA 研修プログラム（Backlog 構築用）

CCNA 200-301 v1.1 に準拠した 1 ヶ月（20 営業日 / 140 時間）の社内研修を、
Nulab **Backlog** 上に構築するための設計ドキュメント・教材・ツール一式です。

## 構成

| ファイル / ディレクトリ | 内容 |
|---|---|
| [`00-feasibility.md`](./00-feasibility.md) | 実現可能性調査の結果（リサーチレポート） |
| [`01-curriculum.md`](./01-curriculum.md) | 20 日間のカリキュラム表（日次テーマ・ラボ・小テスト） |
| [`02-backlog-design.md`](./02-backlog-design.md) | Backlog プロジェクト構成設計（種別・カテゴリー・マイルストーン・課題テンプレート・ドキュメント構成・小テスト運用） |
| [`03-packet-tracer-manual.md`](./03-packet-tracer-manual.md) | 仮想環境（Cisco Packet Tracer）導入・操作マニュアル（受講者配布用） |
| [`04-guidance.md`](./04-guidance.md) | 受講者向けガイダンス「研修の進め方」（Backlog `00_ガイダンス` 用） |
| [`05-instructor-guide.md`](./05-instructor-guide.md) | 講師用運用ガイド（開講前チェックリスト・日次運用・採点基準。受講者非公開） |
| [`06-rolling-operations.md`](./06-rolling-operations.md) | ローリング型運用ガイド（随時入学・卒業のプロジェクト構成、入学/卒業手順、負荷目安) |
| [`07-exam-phase.md`](./07-exam-phase.md) | 試験対策フェーズ（Day 21〜）。模試サイクルで合格まで伴走する設計（自習期間なし） |
| [`materials/`](./materials/) | 教材本体（Day 1〜20 の講義・ラボ手順書・小テスト） |
| [`scripts/`](./scripts/) | 運用スクリプト（課題一括投入 / Wiki 教材投入 / 選択式の機械採点 / AI 一次採点） |
| [`samples/`](./samples/) | Day 1 のサンプル教材（講義ドキュメント・ラボ手順書・小テスト） |

## 使い方（構築フロー）

1. Backlog に研修用プロジェクト（例: キー `CCNA`）を作成する
2. `02-backlog-design.md` に従い、ドキュメント機能に教材フォルダを作成する
3. `scripts/create-backlog-issues.mjs` で 20 日分の課題（講義・ラボ・小テスト）を一括投入する

   ```bash
   BACKLOG_SPACE_URL=https://your-space.backlog.jp \
   BACKLOG_API_KEY=xxxxxxxx \
   node ccna-training/scripts/create-backlog-issues.mjs --project CCNA --start 2026-08-03 --dry-run
   ```

   `--dry-run` を外すと実際に投入されます。

4. 教材を投入する: `scripts/upload-wiki.mjs` で `materials/` と各マニュアルを
   Wiki へ一括投入し、Backlog の「Wiki → ドキュメント移行機能」でドキュメント化する

   ```bash
   BACKLOG_SPACE_URL=... BACKLOG_API_KEY=... \
   node ccna-training/scripts/upload-wiki.mjs --project CCNA --dry-run
   ```

   小テスト（解答・解説を含む）は既定で投入対象外です。設問部分のみ毎日、
   小テスト課題の本文へ貼る運用にしてください（詳細は `05-instructor-guide.md`）。

5. 研修開始後の採点は `scripts/grade-quiz.mjs` で支援できます（コメント解答の自動採点）

## 注意事項

- 教材はすべて **オリジナル執筆** です。Cisco NetAcad・市販書籍・他者の教材の転載は
  著作権上できません（試験トピック一覧そのものの参照は可）。
- Backlog の**ドキュメント機能には現時点で API がありません**。教材の自動投入は
  Wiki API → ドキュメント移行機能を経由するか、手動で貼り付けます。
- 準拠試験: CCNA 200-301 **v1.1**（2024 年 8 月改訂）。Cisco による改訂があった場合は
  カリキュラムの見直しが必要です。
