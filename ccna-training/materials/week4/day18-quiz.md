# Day 18 小テスト: レイヤ 2 セキュリティと VPN 概要

> 運用: 設問部分を小テスト課題の本文（またはドキュメント）に掲載。
> 「解答・解説」は講師用フォルダに保管し、**翌日 9:00** に受講者へ公開する。
> ルール: 10 問 / 30 分 / 教材参照なし。解答はコメントに「Q1: A」形式で提出。

---

## 設問

**Q1.** ポートセキュリティの violation モードのうち、上限を超える MAC
アドレスを検出した際にフレームを破棄するが、Syslog/SNMP 通知も違反
カウンタの増加も行わないものはどれか。

- A. restrict
- B. protect
- C. shutdown
- D. err-disable

**Q2.** ポートセキュリティの sticky MAC アドレスに関する記述として正しい
ものはどれか。

- A. 手動で入力した MAC アドレスのみを指す
- B. VLAN 間の通信でのみ有効になる
- C. 保存しなくても再起動後に自動的に維持される
- D. 動的に学習した MAC アドレスを running-config に自動的に書き込む

**Q3.** `switchport port-security maximum` を明示的に指定しなかった場合の
既定値と、上限を超える MAC アドレスを検出したとき（violation は既定の
まま）にポートが取りうる状態の組み合わせとして正しいものはどれか。

- A. 既定値 1、ポートは err-disabled になりうる
- B. 既定値 2、ポートはトランクへ自動的に変更される
- C. 既定値 0、ポートは常に restrict で稼働を継続する
- D. 既定値 1、ポートは常に VLAN 1 へ強制的に切り替わる

**Q4.** violation shutdown によって err-disabled になったポートを手動で
復旧する操作として正しいものはどれか。

- A. インターフェースで `no switchport port-security` を実行する
- B. スイッチ全体を reload する
- C. 該当インターフェースで `shutdown` → `no shutdown` を実行する
- D. 該当インターフェースの VLAN を変更する

**Q5.** DHCP スヌーピングにおいて、untrusted ポートから受信した場合に
破棄される代表的なサーバ発メッセージの組み合わせはどれか。

- A. DHCPDISCOVER と DHCPREQUEST
- B. DHCPOFFER、DHCPACK、DHCPNAK
- C. DHCPREQUEST のみ
- D. すべての ARP メッセージ

**Q6.** DHCP スヌーピングを VLAN 10 で動作させるために必要なコマンドの
組み合わせとして正しいものはどれか。

- A. `ip dhcp snooping` のみ
- B. `ip dhcp snooping vlan 10` のみ
- C. `ip arp inspection vlan 10` のみ
- D. `ip dhcp snooping` と `ip dhcp snooping vlan 10` の両方

**Q7.** DAI（ダイナミック ARP インスペクション）に関する記述として正しい
ものはどれか。

- A. DAI は DHCP スヌーピングのバインディングテーブルと照合して ARP の
  正当性を検証する
- B. DAI は単独で動作し、DHCP スヌーピングを必要としない
- C. DAI は trusted ポートの ARP のみを検査する
- D. DAI は MAC アドレステーブルの溢れを防ぐ機能である

**Q8.** L2 攻撃と対策機能の組み合わせとして正しいものはどれか。

- A. MAC フラッディング対策 = DHCP スヌーピング
- B. 不正 DHCP サーバ対策 = DAI
- C. ARP スプーフィング対策 = DAI
- D. VLAN ホッピング対策 = ポートセキュリティ

**Q9.** サイト間 VPN とリモートアクセス VPN の違いに関する記述として
正しいものはどれか。

- A. サイト間 VPN は個々の端末にクライアントソフトウェアのインストールが
  必要である
- B. リモートアクセス VPN はゲートウェイ同士を接続し、ネットワーク全体を
  透過的につなぐ
- C. リモートアクセス VPN は常に GRE のみを使用する
- D. サイト間 VPN はゲートウェイ間でトンネルを確立し、端末側の設定は
  不要である

**Q10.**（記述）IPsec が提供する 4 つのセキュリティサービスを挙げ、ESP と
AH の役割の違いを説明せよ。

---

## 解答・解説（翌日公開・講師用）

| 問 | 解答 | 解説 |
|---|---|---|
| Q1 | B | protect はフレームを破棄するのみで、通知も違反カウンタの増加も行わない。restrict は通知とカウンタ増加あり、shutdown はさらにポートを err-disabled にする |
| Q2 | D | sticky は動的に学習した MAC アドレスを running-config に自動的に書き込む機能。保存には `copy running-config startup-config` が必要 |
| Q3 | A | `switchport port-security maximum` の既定値は 1。既定の violation（shutdown）では上限超過時にポートが err-disabled になりうる |
| Q4 | C | err-disabled からの手動復旧は該当インターフェースでの `shutdown` → `no shutdown`。自動復旧には `errdisable recovery cause psecure-violation` を使う |
| Q5 | B | untrusted ポートで破棄されるのはサーバ発のメッセージ（DHCPOFFER・DHCPACK・DHCPNAK）。クライアント発の DHCPDISCOVER/DHCPREQUEST は対象外 |
| Q6 | D | `ip dhcp snooping`（グローバル）と `ip dhcp snooping vlan <VLAN>` の両方が揃って初めて該当 VLAN で動作する |
| Q7 | A | DAI は DHCP スヌーピングバインディングテーブルの IP-MAC-ポート情報と ARP パケットを照合する。DHCP スヌーピングが前提として必要 |
| Q8 | C | ARP スプーフィング対策は DAI。MAC フラッディング対策はポートセキュリティ、不正 DHCP サーバ対策は DHCP スヌーピング |
| Q9 | D | サイト間 VPN はゲートウェイ間でトンネルを確立し端末側の設定は不要。クライアントソフトが必要なのはリモートアクセス VPN |
| Q10 | 例 | 「機密性（暗号化）・完全性（改ざん検知）・認証（相手確認）・アンチリプレイ（再送検知）の 4 つを提供する。ESP は暗号化と完全性の両方を提供するが、AH は完全性・認証のみを提供し暗号化は行わない」等、4 サービスと ESP/AH の違い（AH に暗号化がない点）に触れていれば正解 |

**採点**: 1 問 10 点、70 点未満は翌朝再テスト。Q10 は趣旨が合っていれば 10 点。
