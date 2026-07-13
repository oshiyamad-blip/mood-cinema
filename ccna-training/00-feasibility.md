# CCNA 研修を Backlog 上に構築する — 実現可能性調査

調査日: 2026-07-13

## 結論: 実現可能（ただし「小テスト」は運用で工夫が必要）

必要なリソース（試験範囲・参考教材・無料の仮想環境）はすべて揃っており、
Backlog の機能（ドキュメント・課題・Wiki・API）で研修の骨格は問題なく構築できる。
唯一ネイティブに存在しないのが「自動採点付きの小テスト」で、ここは課題＋コメント方式
などの代替設計になる。

## 1. 教材を作るためのリソース → 十分にある

現行の [CCNA 200-301 v1.1](https://learningnetwork.cisco.com/s/ccna-exam-topics)
（2024 年 8 月改訂）は 6 ドメイン構成で、配点比率も公式に公開されている。

| ドメイン | 配点 |
|---|---|
| 1. ネットワーク基礎 | 20% |
| 2. ネットワークアクセス（VLAN / STP / 無線） | 20% |
| 3. IP コネクティビティ（ルーティング / OSPF） | 25% |
| 4. IP サービス（NAT / DHCP / NTP など） | 10% |
| 5. セキュリティ基礎 | 15% |
| 6. 自動化とプログラマビリティ（REST API / JSON / Ansible） | 10% |

この公式シラバスをそのまま研修カリキュラムの骨格（Backlog のマイルストーン /
カテゴリー）に使える。参考にできる無料リソース:

- [Cisco 公式試験ページ](https://www.cisco.com/site/us/en/learn/training-certifications/exams/ccna.html)
- [Jeremy's IT Lab 無料フルコース](https://courses.jeremysitlab.com/p/ccna)（Packet Tracer ラボ付き・英語）
- [Cisco NetAcad の無料コース群](https://www.netacad.com/cisco-packet-tracer)
- [Packet Tracer 演習シナリオ集（日本語）](https://nwstudy.github.io/scenario/01_static.html)

**重要な注意点:** 既存教材（NetAcad、Jeremy's IT Lab、市販書籍など）を Backlog の
ドキュメントへコピーすることは著作権上できない。試験範囲（トピック一覧）自体は事実の
羅列なので参照自由だが、**教材本文はオリジナルで書き起こす必要がある**。
これが本プロジェクトの作業量の大半を占める。

## 2. Backlog（Nulab）上での構築 → 機能は揃っている

- **ドキュメント機能**: [2025 年 12 月 1 日に正式リリース済み](https://nulab.com/ja/press/pr-2511-backlog-document-release/)。
  フォルダ階層・同時編集・権限管理に対応し、体系化された教材の置き場所に適する。
  [Wiki からの移行機能](https://backlog.com/ja/blog/backlog-update-document-202512/)も提供。
- **制約: ドキュメント機能の API は未提供**（提供予定はアナウンス済み）。一方
  [Wiki API は完備](https://developer.nulab.com/docs/backlog/api/2/add-wiki-page/)。
  現実的な投入パイプラインは「教材を Markdown で執筆 → Wiki API で一括投入 →
  移行機能でドキュメントへ変換」、または手動貼り付け。
- **課題**: [Backlog API](https://developer.nulab.com/docs/backlog/) で課題を一括作成
  できるため、20 営業日分の日次課題（マイルストーン = 週、カテゴリー = ドメイン、
  期限日付き）をスクリプトで自動生成可能。
  [課題テンプレート](https://support-ja.backlog.com/hc/ja/articles/360035642034)や
  [チェックリスト運用](https://support-ja.backlog.com/hc/ja/articles/360051919474)も定番。
- **小テスト**: Backlog に自動採点機能はない。選択肢は:
  1. **課題ベースの小テスト（推奨）** — 設問を課題本文に記載し、解答をコメントで提出。
     解答・解説は翌日公開のドキュメントで提供。完了状況はボード / ガントで追跡。
  2. Google Forms（自動採点あり）へのリンクを課題に貼る — 採点は自動化できるが
     Backlog の外に出る。
  3. Backlog API を使った採点 Bot の自作 — 開発工数が別途かかる。

## 3. 仮想環境での操作練習 → 無料で解決可能

| ツール | 費用 | CCNA 適性 |
|---|---|---|
| **Cisco Packet Tracer**（推奨） | [無料（NetAcad アカウント登録のみ）](https://www.netacad.com/cisco-packet-tracer) | CCNA 範囲のラボをほぼ全てカバー。導入が最も容易 |
| [CML Free](https://goldfishnetworks.com/guides/how-to-get-cisco-cml-free) | 無料（5 ノード上限） | 実 IOS イメージだがノード数がネック |
| [GNS3](https://www.netpilot.io/blog/best-ccna-lab-tools-2026) | 無料（IOS イメージは自己調達 = ライセンス問題あり） | 上級者向け |

**Packet Tracer 一択で問題ない。** 受講者各自が無料アカウントで入手する運用にすれば
配布ライセンスの問題もない。導入手順 + ラボ操作マニュアルをオリジナルで作成し、
Backlog のドキュメント / 課題の添付ファイル（`.pka` 含む）として配布できる。

## 4. 140 時間（1 ヶ月）というボリューム → 妥当

CCNA の標準学習時間は[初学者で 200〜300 時間、経験者で 80〜200 時間](https://www.examcert.app/blog/how-long-to-study-for-ccna/)
とされる。140 時間は「体系化された教材 + 毎日のラボ + 小テスト」というガイド付き研修
なら現実的な設定（独学より効率が良いため）。1 日 7 時間 × 20 営業日で、6 ドメインを
配点比率に応じて配分する。ただし完全未経験者が 1 ヶ月で合格レベルに達するのはタイト
なので、「研修修了 = 基礎習得、+2〜4 週間の試験対策で受験」という位置づけが安全。

## リスクと制約

1. **教材は全てオリジナル執筆が必要**（著作権）— 最大の工数
2. **ドキュメント API が未提供** — Wiki 経由の投入か手動移行のワンクッションが必要
3. **小テストの自動採点は Backlog 単体では不可** — 課題 + コメント運用 / Forms 併用 / Bot 自作
4. **試験範囲の改訂リスク** — 教材に準拠バージョン（v1.1）を明記する
