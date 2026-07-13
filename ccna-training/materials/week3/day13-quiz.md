# Day 13 小テスト: OSPF 応用と FHRP

> 運用: 設問部分を小テスト課題の本文（またはドキュメント）に掲載。
> 「解答・解説」は講師用フォルダに保管し、**翌日 9:00** に受講者へ公開する。
> ルール: 11 問 / 30 分 / 教材参照なし。解答はコメントに「Q1: A」形式で提出。
> 配点: 選択式（Q1〜Q10）各 9 点、記述式（Q11）10 点（合計 100 点）。

---

## 設問

**Q1.** 次のうち、OSPF ネイバー成立に一致が必要な項目の組み合わせとして
正しいものはどれか。

- A. エリア ID、Hello / Dead タイマー
- B. Router ID、MTU
- C. エリア ID、Router ID
- D. スタブフラグ、Router ID

**Q2.** OSPF のネイバー状態遷移として正しい順序はどれか。

- A. Down→2-Way→Init→Exstart→Exchange→Loading→Full
- B. Down→Init→Exstart→2-Way→Exchange→Loading→Full
- C. Down→Init→2-Way→Exstart→Exchange→Loading→Full
- D. Down→Init→2-Way→Exchange→Exstart→Loading→Full

**Q3.** OSPF ネイバーが Exstart または Exchange の状態で停滞している場合、
最も疑うべき原因はどれか。

- A. Hello / Dead タイマー不一致
- B. エリア ID 不一致
- C. 認証不一致
- D. MTU 不一致

**Q4.** OSPF ネイバーが Init のまま 2-Way に進まない場合の典型的な原因と、
ブロードキャスト / P2P ネットワークにおける既定の Hello / Dead タイマーの
組み合わせとして正しいものはどれか。

- A. サブネット不一致、Hello 30 秒 / Dead 120 秒
- B. Hello / Dead タイマー不一致、Hello 10 秒 / Dead 40 秒
- C. MTU 不一致、Hello 10 秒 / Dead 40 秒
- D. 認証不一致、Hello 5 秒 / Dead 20 秒

**Q5.** あるインターフェースが `show ip ospf neighbor` にネイバーとして
一切現れない場合、`passive-interface` の誤設定と `network` 文の漏れを
切り分けるために有効なコマンドの組み合わせはどれか。

- A. `show ip protocols` と `show ip ospf interface brief`
- B. `show version` と `show running-config`
- C. `show standby` と `show vlan brief`
- D. `show ip ospf database` と `show cdp neighbor`

**Q6.** ASBR となるルータ自身のルーティングテーブルにデフォルトルートが
存在しない場合でも、OSPF ドメインへデフォルトルートを常に配布したいときに
必要な設定はどれか。

- A. `default-information originate`
- B. `redistribute static subnets`
- C. `network 0.0.0.0 255.255.255.255 area 0`
- D. `default-information originate always`

**Q7.** FHRP（First Hop Redundancy Protocol）の主な目的として正しいものは
どれか。

- A. スイッチ間のループ防止
- B. デフォルトゲートウェイの単一障害点を排除し、ゲートウェイを冗長化すること
- C. ルーティングプロトコル同士の再配送
- D. VLAN 間のトランク設定の自動化

**Q8.** HSRP・VRRP・GLBP の説明として正しいものはどれか。

- A. HSRP は業界標準プロトコルであり、複数ベンダ環境で利用できる
- B. VRRP はシスコ独自プロトコルであり、Active / Standby で動作する
- C. GLBP は複数のルータが同時にトラフィックを転送する負荷分散が可能である
- D. HSRP・VRRP・GLBP はいずれもプリエンプトが既定で有効である

**Q9.** HSRP のプライオリティに関する説明として正しいものはどれか。

- A. 既定値は 100 であり、値が高いルータが Active になる。同値の場合は
  IP アドレスが大きい方が優先される
- B. 既定値は 0 であり、値が低いルータが Active になる
- C. 既定値は 100 であり、値が高いルータが Active になる。同値の場合は
  IP アドレスが小さい方が優先される
- D. プライオリティの既定値はグループ番号と同じ値になる

**Q10.** HSRP v1・グループ番号 10 で使われる仮想 MAC アドレスはどれか。

- A. `0000.0C07.AC10`
- B. `0000.0C07.AC0A`
- C. `0000.0C9F.F00A`
- D. `0000.5E00.010A`

**Q11.**（記述）あるルータの OSPF ネイバーが確立せず、`show ip ospf
neighbor` に対象ネイバーが一切表示されないと報告された。考えられる原因を、
**下位層から上位層への切り分けの手順**に沿って列挙し、それぞれをどの
`show`（または `debug`）コマンドで確認し、どのように修正するかを説明せよ。

---

## 解答・解説（翌日公開・講師用）

| 問 | 解答 | 解説 |
|---|---|---|
| Q1 | A | エリア ID と Hello/Dead タイマーは一致が必須。Router ID は一致条件ではなく、ドメイン内での一意性が必須。MTU も一致が必要だが、選択肢の組み合わせとしては A が正しい |
| Q2 | C | Down→Init→2-Way→Exstart→Exchange→Loading→Full の順。2-Way は双方向疎通の確認、Exstart は DBD 交換の主従関係決定、Full で LSDB 同期完了 |
| Q3 | D | MTU 不一致は DBD 交換を完了できず、Exstart または Exchange で停滞する典型原因。Hello/Dead タイマー不一致は主に Init で停滞する原因 |
| Q4 | B | Hello/Dead タイマー不一致が Init 停滞の典型原因。ブロードキャスト/P2P の既定値は Hello 10 秒・Dead 40 秒（NBMA は Hello 30 秒・Dead 120 秒） |
| Q5 | A | `show ip protocols` で `network` 文の対象ネットワークと Passive Interface の一覧を確認でき、`show ip ospf interface brief` でインターフェースが OSPF プロセスに参加しているかを確認できる |
| Q6 | D | `always` キーワードを付けると、自身にデフォルトルートが存在しなくても常に広告する。`always` なしの `default-information originate` は自身にデフォルトルートが存在する場合のみ広告する |
| Q7 | B | FHRP は複数ルータで仮想 IP / 仮想 MAC を共有し、デフォルトゲートウェイの単一障害点（Single Point of Failure）を排除する仕組み |
| Q8 | C | GLBP は AVG（Active Virtual Gateway）が複数の AVF（Active Virtual Forwarder）に負荷を分散させ、複数台のルータが同時に転送できる点が HSRP・VRRP と異なる。HSRP・GLBP はシスコ独自、VRRP が業界標準（RFC 5798）で、HSRP のプリエンプトは既定で無効 |
| Q9 | A | HSRP のプライオリティ既定値は 100（範囲 0〜255）。値が高いルータが Active になり、同値の場合は IP アドレスが大きい方が優先される |
| Q10 | B | HSRP v1 の仮想 MAC アドレスは `0000.0C07.ACXX`（XX はグループ番号を 16 進数 2 桁で表したもの）。グループ番号 10 は 16 進で `0A` になるため `0000.0C07.AC0A`。A は 10 進の「10」をそのまま置いた誤り、C は HSRP v2 の形式（`0000.0C9F.FXXX`）との混同、D は VRRP の仮想 MAC 形式（`0000.5E00.01XX`）との混同 |
| Q11 | 例 | (1) 物理／データリンク層: リンクが up か（`show ip interface brief`）。(2) インターフェースが OSPF に参加しているか: `network` 漏れや `passive-interface` 誤設定の有無（`show ip protocols`、`show ip ospf interface brief`）。(3) タイマー一致: Hello/Dead interval（`show ip ospf interface`）。(4) サブネット／エリア ID／認証の一致（`show ip ospf interface`、`show running-config`）。(5) MTU 一致（`show ip interface`）。(6) 詳細確認が必要な場合は `debug ip ospf adj` / `debug ip ospf hello` で Hello パケットの送受信やネゴシエーションの過程を確認する。原因と確認コマンド・修正方法が対応し、下位層から上位層の順序で述べられていれば正解 |

**採点**: 選択式（Q1〜Q10）各 9 点、記述式（Q11）は趣旨が合っていれば 10 点（合計 100 点）。70 点未満は翌朝再テスト。
