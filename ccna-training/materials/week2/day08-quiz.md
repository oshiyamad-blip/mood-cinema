# Day 8 小テスト: VLAN 間ルーティング

> 運用: 設問部分を小テスト課題の本文（またはドキュメント）に掲載。
> 「解答・解説」は講師用フォルダに保管し、**翌日 9:00** に受講者へ公開する。
> ルール: 10 問 / 30 分 / 教材参照なし。解答はコメントに「Q1: A」形式で提出。

---

## 設問

**Q1.** VLAN10 に所属する PC と VLAN20 に所属する PC が通信するために、
必ず必要になる機器はどれか。

- A. ハブ
- B. L3 機器（ルータまたは L3 スイッチ）
- C. リピータ
- D. L2 スイッチのみ

**Q2.** Router-on-a-Stick でサブインターフェースを設定する際、正しい
コマンドの順序はどれか。

- A. `ip address` → `encapsulation dot1q`
- B. `no shutdown` → `encapsulation dot1q`
- C. `encapsulation dot1q` → `ip address`
- D. `ip address` → `no shutdown`

**Q3.** ネイティブ VLAN 用のサブインターフェースを設定するコマンドはどれか。

- A. `encapsulation dot1q 1 native`
- B. `switchport mode native`
- C. `native vlan 1`
- D. `encapsulation native dot1q 1`

**Q4.** Router-on-a-Stick 構成で、R1 のサブインターフェース `Gi0/0.10` に
`encapsulation dot1q 100` が設定されている。接続先スイッチの該当ポートは
アクセスポートで VLAN10 に割り当てられている。VLAN10 の PC からデフォルト
ゲートウェイ（R1）への ping が失敗する。最も可能性の高い原因はどれか。

- A. `ip routing` が無効になっている
- B. PC のデフォルトゲートウェイが未設定である
- C. サブインターフェースの `encapsulation dot1q` の VLAN-ID（100）が、
     スイッチのアクセス VLAN（10）と一致していない
- D. スイッチ側の接続ポートがトランクになっていない

**Q5.** L3 スイッチで VLAN 間ルーティングを有効にするために、グローバル
コンフィギュレーションで入力する必要があるコマンドはどれか。

- A. `ip routing`
- B. `router ospf 1`
- C. `ip route 0.0.0.0 0.0.0.0`
- D. `switchport mode trunk`

**Q6.** SVI（`interface vlan`）に割り当てた IP アドレスは何になるか。

- A. トランクポートのネイティブ VLAN の IP
- B. その VLAN のデフォルトゲートウェイ
- C. DHCP サーバのアドレス
- D. スイッチの管理用 IP アドレスのみ

**Q7.** SVI が up/up になるための条件として**誤っているもの**はどれか。

- A. 対応する VLAN が VLAN データベースに存在する
- B. その VLAN に割り当てられたポートが 1 つ以上 up している
- C. SVI に `no shutdown` が設定されている
- D. ルータとの間で OSPF ネイバーが確立している

**Q8.** L3 スイッチの物理ポートで `no switchport` を実行したときの説明として
正しいものはどれか。

- A. VLAN に所属したまま IP アドレスを持てない
- B. トランクポートに自動的に変換される
- C. VLAN に所属しない純粋な L3 のルーテッドポートになる
- D. アクセス VLAN が自動的に VLAN1 になる

**Q9.** `show ip route` の出力で、VLAN10 のサブネットが直接接続経路として
表示されるときに使われる記号はどれか。

- A. S
- B. C
- C. O
- D. D

**Q10.**（記述）Router-on-a-Stick 構成で VLAN 間 ping が失敗しているとき、
どのような手順・確認コマンドでトラブルシュートするか。考えられる典型的な
原因を 2 つ以上挙げて説明せよ。

---

## 解答・解説（翌日公開・講師用）

| 問 | 解答 | 解説 |
|---|---|---|
| Q1 | B | VLAN は別サブネットであり、L2 スイッチは MAC アドレスしか見ないため、IP アドレスで転送判断する L3 機器が必要 |
| Q2 | C | サブインターフェースでは `encapsulation dot1q <ID>` で VLAN を紐付けてから `ip address` を割り当てる |
| Q3 | A | ネイティブ VLAN 用サブインターフェースには `encapsulation dot1q <ID> native` を使う |
| Q4 | C | サブインターフェースの `encapsulation dot1q` はスイッチ側で送出される VLAN タグと一致している必要がある。ここでは VLAN10 のフレームに対し R1 側が VLAN100 を期待しているためタグが一致せず、ゲートウェイ宛の通信ができない（`ip routing` は L3 スイッチ側の設定で Router-on-a-Stick には無関係。他の選択肢は前提と矛盾する） |
| Q5 | A | L3 スイッチはデフォルトで L2 動作のため、`ip routing` を有効化しないと VLAN 間ルーティングができない |
| Q6 | B | SVI（`interface vlan`）に割り当てた IP がその VLAN のデフォルトゲートウェイになる |
| Q7 | D | SVI が up/up になる条件は VLAN の存在・所属ポートの up・no shutdown の 3 つ。OSPF ネイバーは無関係 |
| Q8 | C | `no switchport` により物理ポートは VLAN に所属しない L3 のルーテッドポートになり、直接 IP を割り当てられる |
| Q9 | B | Cisco IOS の `show ip route` では、直接接続された経路は `C` で表示される |
| Q10 | 例 | `show vlan brief` でアクセスポートの VLAN 割り当て、`show interfaces trunk` でトランク化とネイティブ VLAN の一致、`show running-config` でサブインターフェースの `encapsulation dot1q` の有無・VLAN-ID、`show ip route` で経路の有無を確認する。典型原因として、encapsulation dot1q の設定漏れ/VLAN-ID 違い、スイッチ側ポートがトランクになっていない、ネイティブ VLAN の不一致、PC のデフォルトゲートウェイ誤設定などが挙げられていれば正解 |

**採点**: 1 問 10 点、70 点未満は翌朝再テスト。Q10 は趣旨が合っていれば 10 点。
