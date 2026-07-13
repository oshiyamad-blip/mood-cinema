# Day 15 小テスト（Week3 週次テスト）: IP サービス ほか Week3 総合

> 運用: 設問部分を小テスト課題の本文（またはドキュメント）に掲載。
> 「解答・解説」は講師用フォルダに保管し、**翌日 9:00** に受講者へ公開する。
> ルール: 25 問 / 60 分 / 教材参照なし。解答はコメントに「Q1: A」形式で提出。
> 本テストは Week3（Day11〜15）の週次テストを兼ねるため、Day11〜14 の内容
> （静的ルート・OSPF・FHRP・NAT）も出題範囲に含む。

---

## 設問

**Q1.** ルータが同じ宛先に対して複数の経路情報を保持している場合、
最終的に使用する経路を決定する順序として正しいものはどれか。

- A. ロンゲストマッチ → AD → メトリック
- B. AD → メトリック → ロンゲストマッチ
- C. メトリック → ロンゲストマッチ → AD
- D. AD → ロンゲストマッチ → メトリック

**Q2.** ネクストホップ指定で静的ルートを設定するコマンドはどれか。

- A. ip route 192.168.3.0 255.255.255.0 GigabitEthernet0/0
- B. ip route 192.168.3.0 255.255.255.0 10.0.0.2
- C. ip default-gateway 10.0.0.2
- D. ip route 0.0.0.0 0.0.0.0 192.168.3.0

**Q3.** OSPF（AD110）をプライマリ経路として使用し、同一宛先へのフローティング
スタティックルートをバックアップとして設定する場合、末尾に指定する AD 値として
適切なものはどれか。

- A. 1
- B. 90
- C. 130
- D. 110

**Q4.** IP アドレスからホスト名を求める逆引き（Reverse Lookup）に使用する
DNS レコード種別はどれか。

- A. A
- B. AAAA
- C. CNAME
- D. PTR

**Q5.** OSPF のネイバーが Full 状態まで正常に到達するために、両インターフェースで
一致している必要がある項目はどれか。

- A. Hello/Dead タイマーとエリア ID
- B. Router ID
- C. インターフェースの IP アドレス
- D. ホスト名

**Q6.** マルチアクセスネットワークにおける DR 選出の基準として正しいものはどれか。

- A. Router ID が最小のルータが常に選ばれる
- B. インターフェースの OSPF プライオリティが最大のルータ、同値の場合は Router ID が最大のルータ
- C. 最初に Hello を送信したルータが常に DR になる
- D. ループバックインターフェースを持つルータが優先的に DR になる

**Q7.** OSPF のインターフェースコストを計算する式として正しいものはどれか
（既定の参照帯域幅を使用する場合）。

- A. インターフェース帯域幅 ÷ 参照帯域幅
- B. 参照帯域幅 × インターフェース帯域幅
- C. 参照帯域幅 ÷ インターフェース帯域幅
- D. ホップ数 × 10

**Q8.** OSPF の Router ID の決定順序として正しいものはどれか。

- A. 最大の物理インターフェース IP → 最大のループバック IP → router-id コマンド
- B. 最小のループバック IP → router-id コマンド → 最大の物理インターフェース IP
- C. ランダムに割り当てられる
- D. router-id コマンド → 最大のループバック IP → 最大の物理インターフェース IP

**Q9.** 2 台のルータ間で OSPF ネイバーが Exstart または Exchange の状態で
停滞している場合、まず疑うべき原因はどれか。

- A. MTU の不一致
- B. VLAN の不一致
- C. デフォルトルートの未設定
- D. ホスト名の重複

**Q10.** OSPF で特定のインターフェースに passive-interface を設定した場合の
効果として正しいものはどれか。

- A. そのインターフェースの IP アドレスが無効化される
- B. そのインターフェースから Hello パケットの送信が止まるが、属するネットワークは引き続き広告される
- C. そのインターフェースが属するネットワークが OSPF から完全に除外される
- D. OSPF プロセス自体が停止する

**Q11.** HSRP・VRRP・GLBP に関する記述として正しいものはどれか。

- A. VRRP はシスコ独自プロトコルであり、他社製品では利用できない
- B. HSRP は業界標準プロトコルである
- C. GLBP は複数台のルータが同時にトラフィックを転送できる唯一の方式である
- D. FHRP はすべて同一のアルゴリズムで動作し違いはない

**Q12.** HSRP において、端末のデフォルトゲートウェイ宛の ARP 要求に応答する
アドレスと、その応答を行うルータの状態の組み合わせとして正しいものはどれか。

- A. 実 IP アドレスで、Standby 状態のルータが応答する
- B. 仮想 MAC アドレスで、Standby 状態のルータが応答する
- C. 実 MAC アドレスで、Active 状態のルータが応答する
- D. 仮想 MAC アドレスで、Active 状態のルータが応答する

**Q13.** 内部 PC の私設アドレスが外部から見えるときの変換後アドレスを指す
用語はどれか。

- A. inside global
- B. outside local
- C. inside local
- D. outside global

**Q14.** PAT（NAT オーバーロード）が複数の内部ホストを 1 つのグローバル
アドレスに集約しながら、戻りパケットを正しい内部ホストへ振り分けられるのは
なぜか。

- A. 内部ホストの MAC アドレスを記録しているため
- B. グローバルアドレスに加えて L4 のポート番号を組み合わせて識別しているため
- C. ホスト名で識別しているため
- D. VLAN 番号で識別しているため

**Q15.** 社内 Web サーバを固定のグローバルアドレスで常時外部公開したい場合に
適した設定はどれか。

- A. ip nat inside source list 1 pool NATPOOL overload
- B. ip nat pool NATPOOL 203.0.113.20 203.0.113.29 netmask 255.255.255.0
- C. ip nat inside source static 192.168.1.10 203.0.113.10
- D. ip helper-address 203.0.113.10

**Q16.** `show ip nat translations` の出力で、Pro 列に tcp や udp が表示され、
Inside global / Inside local 双方にポート番号が付与されているエントリは
どの変換方式のものか。

- A. 静的 NAT
- B. 動的 NAT
- C. DHCP リレー
- D. PAT（NAT オーバーロード）

**Q17.** DHCP の DORA プロセスにおいて、Discover の次に送信されるメッセージと、
DHCP サーバが使用する UDP ポート番号の組み合わせとして正しいものはどれか。

- A. Offer、UDP 67
- B. Request、UDP 68
- C. Ack、UDP 67
- D. Offer、UDP 68

**Q18.** クライアントと DHCP サーバが異なるサブネットにある場合、
クライアント側インターフェースに設定する必要があるコマンドはどれか。

- A. ip nat inside
- B. ip helper-address <DHCP サーバの IP アドレス>
- C. ip dhcp relay enable
- D. ip forward-protocol dhcp

**Q19.** 次は R1 の `show running-config` の一部（DHCP プール設定）である。
クライアントへ配布するネットワーク範囲を規定している行はどれか。

```
ip dhcp pool LAN1
 network 192.168.1.0 255.255.255.0
 default-router 192.168.1.1
 dns-server 192.168.1.10
 lease 0 8 0
```

- A. default-router 192.168.1.1
- B. network 192.168.1.0 255.255.255.0
- C. dns-server 192.168.1.10
- D. lease 0 8 0

**Q20.** L2 のマーキング（CoS）と L3 のマーキング（DSCP）が使用するビット数の
組み合わせとして正しいものはどれか。

- A. CoS 6 ビット／DSCP 3 ビット
- B. CoS 3 ビット／DSCP 6 ビット
- C. CoS 8 ビット／DSCP 4 ビット
- D. CoS 3 ビット／DSCP 8 ビット

**Q21.** 次の Syslog メッセージがルータに出力された。

```
%SYS-4-CONFIG_I: Configured from console by vty0
```

このメッセージの severity 番号と名称の組み合わせとして正しいものはどれか。
また `logging trap warning` を設定している場合、このメッセージはサーバへ
送出されるか。

- A. severity 3（Error）、送出される
- B. severity 4（Warning）、送出される
- C. severity 5（Notification）、送出されない
- D. severity 6（Informational）、送出されない

**Q22.** SNMPv3 のセキュリティレベルのうち、認証は行うが暗号化は行わない
ものはどれか。

- A. noAuthNoPriv
- B. authNoPriv
- C. authPriv
- D. community-based

**Q23.** QoS において、超過トラフィックをバッファに貯めて送出を遅延させる
ことでレートを平滑化する処理はどれか。

- A. ポリシング
- B. マーキング
- C. シェーピング
- D. キューイング

**Q24.** SSH を有効化するために必要な設定の組み合わせとして正しいものは
どれか。

- A. telnet enable → crypto key generate rsa
- B. ip nat inside → username 作成のみ
- C. ip domain-name の設定 → crypto key generate rsa → username 作成 →
  line vty での transport input ssh（login local は設定しない）
- D. ip domain-name の設定 → crypto key generate rsa → username 作成 →
  line vty での login local と transport input ssh

**Q25.**（記述）離れたサブネットの PC が DHCP アドレスを取得できるように
するため、なぜ `ip helper-address`（DHCP リレー）が必要かを、DHCP Discover が
ブロードキャストであることと、ルータがブロードキャストを転送しない点を
踏まえて説明せよ。

---

## 解答・解説（翌日公開・講師用）

| 問 | 解答 | 解説 |
|---|---|---|
| Q1 | A | 経路選択は「ロンゲストマッチ（最長一致）→ AD（管理距離）→ メトリック」の順で行う |
| Q2 | B | ネクストホップ指定は `ip route <宛先> <マスク> <ネクストホップIP>` の形式。A は出力インターフェース指定、D はデフォルトルートの誤った書き方 |
| Q3 | C | フローティングスタティックは主経路（OSPF、AD110）より大きい AD を末尾に指定する。130 は 110 より大きく適切 |
| Q4 | D | 逆引き（IP アドレス → ホスト名）には PTR レコードを使用する。A/AAAA は正引き、CNAME は別名の対応 |
| Q5 | A | エリア ID・サブネット・Hello/Dead タイマー・認証・スタブフラグなどの一致が Full 状態への到達に必要。Router ID は一致条件ではなく一意性が必要 |
| Q6 | B | DR はインターフェースの OSPF プライオリティ（既定 1）が最大のルータ、同値の場合は Router ID が最大のルータが選ばれる |
| Q7 | C | OSPF のコストは「参照帯域幅（既定 10^8）÷ インターフェース帯域幅」で計算される |
| Q8 | D | Router ID は router-id コマンドによる明示指定が最優先、次に最大のループバック IP、最後に最大の物理インターフェース IP の順で決まる |
| Q9 | A | Exstart／Exchange での停滞は、DBD 交換が完了できない MTU 不一致が典型的な原因 |
| Q10 | B | passive-interface は Hello の送信（ネイバー形成）のみを止め、そのインターフェースが属するネットワークの広告自体は継続する |
| Q11 | C | GLBP は AVG が複数の AVF に負荷を分散させる、複数台同時転送に対応する唯一の FHRP。VRRP は業界標準（RFC 5798）、HSRP はシスコ独自 |
| Q12 | D | Active ルータが仮想 MAC アドレスで ARP 要求に応答する。Standby ルータは応答しない |
| Q13 | A | inside global は内部端末が外部から見えるときの変換後（公開）アドレスを指す |
| Q14 | B | PAT はグローバル IP に加え L4 のポート番号を変換テーブルに記録し、戻りパケットの宛先ポートから内部ホストを一意に特定する |
| Q15 | C | `ip nat inside source static` は 1 対 1 固定のマッピングを行う静的 NAT のコマンドで、サーバの常時公開に適する |
| Q16 | D | ポート番号付きで Pro 列にプロトコルが表示されるのは PAT（NAT オーバーロード）の特徴。静的 NAT はポート番号を伴わない |
| Q17 | A | DORA の順序は Discover → Offer → Request → Ack。DHCP サーバは UDP 67 を使用する |
| Q18 | B | `ip helper-address <DHCPサーバIP>` をクライアント側インターフェースに設定すると、ブロードキャストのDHCPリクエストをユニキャストに変換してサーバへ転送する |
| Q19 | B | `network` の行が DHCP プールの配布対象ネットワーク範囲を規定する。他の行はゲートウェイ・DNS・リース時間の指定 |
| Q20 | B | L2 の CoS は 802.1Q タグ内 3 ビット、L3 の DSCP は IP ヘッダの ToS フィールド内 6 ビット |
| Q21 | B | メッセージ中の `%SYS-4-CONFIG_I` の `4` が severity（Warning）。`logging trap warning` はしきい値 4 のため、severity 4 のメッセージも送出される |
| Q22 | B | 認証あり・暗号化なしは authNoPriv。noAuthNoPriv は認証・暗号化とも無し、authPriv は両方あり |
| Q23 | C | シェーピングは超過分をバッファに貯めて遅延させ送出レートを平滑化する。ポリシングは即時に破棄・再マークしバッファしない |
| Q24 | D | SSH 有効化には ip domain-name の設定、crypto key generate rsa による鍵生成、username によるローカルアカウント作成に加え、line vty で `login local`（ローカルユーザデータベースでの認証）と `transport input ssh` の両方が必要。C は `login local` が抜けており、これだけでは username/secret による認証が有効にならず SSH ログインが成立しない |
| Q25 | 例 | 「DHCP の Discover メッセージは宛先を `255.255.255.255` とするブロードキャストであり、ルータは既定でブロードキャストを他のセグメントへ転送しないため、クライアントと DHCP サーバが別サブネットにある場合、Discover はサーバまで届かない。クライアント側インターフェースに `ip helper-address <サーバIP>` を設定すると、ルータが受信したブロードキャストを DHCP サーバ宛のユニキャストに変換して転送するため、サブネットをまたいでも DHCP による配布が可能になる」という趣旨で、ブロードキャストが転送されない点とユニキャスト変換の役割に触れていれば正解 |

**採点基準**: 1 問 4 点（25 問 × 4 点 = 100 点満点）、70 点未満は再テスト対象とする。
Q25 は記述式のため、DHCP Discover がブロードキャストである点・ルータがブロード
キャストを転送しない点・`ip helper-address` によるユニキャスト変換のいずれかに
触れていれば部分点を含め満点として扱う。
