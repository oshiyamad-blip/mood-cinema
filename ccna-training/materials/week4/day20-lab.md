# Day 20 ラボ手順書: 総合演習 — 小規模企業ネットワークの構築

> 配置先: ドキュメント `02_ラボ手順書 > Week4 > Day20`
> 所要時間の目安: 2.5 時間 ／ 使用ツール: Cisco Packet Tracer 9.x

## ゴール

これまで 19 日間で学んだ技術をすべて 1 つのネットワークに統合し、次の
**6 つの要件**をすべて満たす小規模企業ネットワークをゼロから構築します。

1. 2 つの業務 VLAN（営業・経理）が、**HSRP で冗長化された既定ゲートウェイ**
   経由でインターネット（模擬）へ **NAT** を介して到達できる
2. **OSPF** により、社内のすべての区間で経路が到達可能である
3. **DHCP** により、PC が自動的に IP アドレスを取得できる
4. **拡張 ACL** により、経理 VLAN からサーバへは **HTTP のみ**が許可される
5. スイッチのアクセスポートが**ポートセキュリティ**で保護されている
6. ルータの管理アクセスが **SSH のみ**に制限されている

最終的には、HSRP のフェイルオーバー・NAT の変換テーブル・ACL のヒット
カウンタという 3 つの観点から、要件がすべて動作していることを実際に
検証できる状態を目指します。

## 完成トポロジ

```
                              ┌───────────┐
                              │  Server   │  8.8.8.8/24 (インターネット模擬)
                              └─────┬─────┘
                                    │
                              Gi0/1 │ 8.8.8.0/24
                              ┌─────┴─────┐
                              │  R-ISP    │
                              └─────┬─────┘
                              Gi0/0 │ 203.0.113.0/30 (WAN・NAT境界)
                                    │
                              Gi0/2 │
                              ┌─────┴─────┐            Gi0/1        Gi0/1  ┌───────────┐
                              │    R1     ├────────────────────────┤    R2     │
                              └─────┬─────┘   10.0.0.0/30 (OSPF area0)   └─────┬─────┘
                        Gi0/0（トランク）                              Gi0/0（トランク）
                    サブIF .10 / .20 / .99                         サブIF .10 / .20 / .99
                        (HSRP Active)                                (HSRP Standby)
                                    │                                       │
                              Gi0/1 │                                 Gi0/1 │
                              ┌─────┴─────┐        Gi0/2        Gi0/2 ┌─────┴─────┐
                              │   SW1     ├──────────────────────────┤   SW2     │
                              └──┬─────┬──┘        （トランク）      └──┬─────┬──┘
                            Fa0/1│     │Fa0/2                    Fa0/1│     │Fa0/2
                                 │     │                              │     │
                               PC1   PC2                            PC3   PC4
                             (VLAN10)(VLAN20)                     (VLAN10)(VLAN20)
                              営業     経理                          営業    経理
```

### IP アドレス表

| 機器 | インターフェース / VLAN | IP アドレス | サブネットマスク | 備考 |
|---|---|---|---|---|
| R1 | Gi0/0.10（VLAN10 営業） | 192.168.10.2 | 255.255.255.0 | HSRP group10 Active（priority 110） |
| R1 | Gi0/0.20（VLAN20 経理） | 192.168.20.2 | 255.255.255.0 | HSRP group20 Active（priority 110） |
| R1 | Gi0/0.99（VLAN99 管理） | 192.168.99.2 | 255.255.255.0 | ネイティブ VLAN |
| R1 | Gi0/1（R1-R2 リンク） | 10.0.0.1 | 255.255.255.252 | OSPF area0 |
| R1 | Gi0/2（WAN） | 203.0.113.1 | 255.255.255.252 | NAT outside 境界 |
| R2 | Gi0/0.10（VLAN10 営業） | 192.168.10.3 | 255.255.255.0 | HSRP group10 Standby（既定 priority 100） |
| R2 | Gi0/0.20（VLAN20 経理） | 192.168.20.3 | 255.255.255.0 | HSRP group20 Standby（既定 priority 100） |
| R2 | Gi0/0.99（VLAN99 管理） | 192.168.99.3 | 255.255.255.0 | ネイティブ VLAN |
| R2 | Gi0/1（R1-R2 リンク） | 10.0.0.2 | 255.255.255.252 | OSPF area0 |
| R-ISP | Gi0/0（WAN） | 203.0.113.2 | 255.255.255.252 | R1 の対向 |
| R-ISP | Gi0/1 | 8.8.8.1 | 255.255.255.0 | インターネット模擬セグメント |
| Server | （R-ISP Gi0/1 配下） | 8.8.8.8 | 255.255.255.0 | GW 8.8.8.1。HTTP サービスを有効化 |
| VLAN10 | HSRP 仮想 IP（group10） | 192.168.10.1 | 255.255.255.0 | 営業の既定ゲートウェイ |
| VLAN20 | HSRP 仮想 IP（group20） | 192.168.20.1 | 255.255.255.0 | 経理の既定ゲートウェイ |
| PC1 | VLAN10 / SW1 Fa0/1 | DHCP 取得 | 255.255.255.0 | GW 192.168.10.1（自動） |
| PC2 | VLAN20 / SW1 Fa0/2 | DHCP 取得 | 255.255.255.0 | GW 192.168.20.1（自動） |
| PC3 | VLAN10 / SW2 Fa0/1 | DHCP 取得 | 255.255.255.0 | GW 192.168.10.1（自動） |
| PC4 | VLAN20 / SW2 Fa0/2 | DHCP 取得 | 255.255.255.0 | GW 192.168.20.1（自動） |

使用機器: Router 2911 × 3（R1・R2・R-ISP）、Switch 2960 × 2（SW1・SW2）、
PC × 4（PC1〜4）、Server-PT × 1。R1・R2 は 2911 の 3 つのオンボード
GigabitEthernet（Gi0/0〜Gi0/2）をすべて使用します。

---

## 手順 1: VLAN の作成とアクセスポートの割当（15 分）

SW1・SW2 それぞれで VLAN を作成し、PC 接続ポートに割り当てます。

```
Switch(config)# hostname SW1
SW1(config)# vlan 10
SW1(config-vlan)# name EIGYO
SW1(config-vlan)# vlan 20
SW1(config-vlan)# name KEIRI
SW1(config-vlan)# vlan 99
SW1(config-vlan)# name MGMT
SW1(config-vlan)# exit
SW1(config)# interface FastEthernet0/1
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 10
SW1(config-if)# exit
SW1(config)# interface FastEthernet0/2
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 20
SW1(config-if)# exit
```

SW2 も同様に設定します（VLAN 定義は共通、Fa0/1 = VLAN10、Fa0/2 = VLAN20）。

```
Switch(config)# hostname SW2
SW2(config)# vlan 10
SW2(config-vlan)# name EIGYO
SW2(config-vlan)# vlan 20
SW2(config-vlan)# name KEIRI
SW2(config-vlan)# vlan 99
SW2(config-vlan)# name MGMT
SW2(config-vlan)# exit
SW2(config)# interface FastEthernet0/1
SW2(config-if)# switchport mode access
SW2(config-if)# switchport access vlan 10
SW2(config-if)# exit
SW2(config)# interface FastEthernet0/2
SW2(config-if)# switchport mode access
SW2(config-if)# switchport access vlan 20
SW2(config-if)# exit
```

## 手順 2: トランクの構成（10 分）

SW1-SW2 間、および各スイッチ-ルータ間を 802.1Q トランクにし、ネイティブ
VLAN を 99 に統一します。

```
SW1(config)# interface GigabitEthernet0/1
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk native vlan 99
SW1(config-if)# switchport trunk allowed vlan 10,20,99
SW1(config-if)# exit
SW1(config)# interface GigabitEthernet0/2
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk native vlan 99
SW1(config-if)# switchport trunk allowed vlan 10,20,99
SW1(config-if)# exit
```

SW2 も Gi0/1（R2 向け）・Gi0/2（SW1 向け）に同じ設定を行います。

> ネイティブ VLAN はトランクの両端で必ず一致させてください。不一致の
> ままだとタグなしフレームが誤った VLAN として扱われます。

## 手順 3: Router-on-a-Stick サブインターフェースの設定（15 分）

R1・R2 それぞれで、VLAN ごとのサブインターフェースを作成します。VLAN99
はネイティブ VLAN のため `encapsulation dot1Q 99 native` と指定します。

```
Router(config)# hostname R1
R1(config)# interface GigabitEthernet0/0
R1(config-if)# no shutdown
R1(config-if)# exit
R1(config)# interface GigabitEthernet0/0.10
R1(config-subif)# encapsulation dot1Q 10
R1(config-subif)# ip address 192.168.10.2 255.255.255.0
R1(config-subif)# exit
R1(config)# interface GigabitEthernet0/0.20
R1(config-subif)# encapsulation dot1Q 20
R1(config-subif)# ip address 192.168.20.2 255.255.255.0
R1(config-subif)# exit
R1(config)# interface GigabitEthernet0/0.99
R1(config-subif)# encapsulation dot1Q 99 native
R1(config-subif)# ip address 192.168.99.2 255.255.255.0
R1(config-subif)# exit
```

R2 も同様に設定します（IP アドレスのみ表のとおり `.3` に読み替え）。

```
Router(config)# hostname R2
R2(config)# interface GigabitEthernet0/0
R2(config-if)# no shutdown
R2(config-if)# exit
R2(config)# interface GigabitEthernet0/0.10
R2(config-subif)# encapsulation dot1Q 10
R2(config-subif)# ip address 192.168.10.3 255.255.255.0
R2(config-subif)# exit
R2(config)# interface GigabitEthernet0/0.20
R2(config-subif)# encapsulation dot1Q 20
R2(config-subif)# ip address 192.168.20.3 255.255.255.0
R2(config-subif)# exit
R2(config)# interface GigabitEthernet0/0.99
R2(config-subif)# encapsulation dot1Q 99 native
R2(config-subif)# ip address 192.168.99.3 255.255.255.0
R2(config-subif)# exit
```

## 手順 4: HSRP による既定ゲートウェイの冗長化（15 分）

VLAN10・VLAN20 それぞれに HSRP グループを構成します。R1 を優先的に
Active にするため、priority を既定値（100）より高い 110 にし、
`preempt`（プライオリティが上回った際に Active へ復帰する動作）を
有効にします。

```
R1(config)# interface GigabitEthernet0/0.10
R1(config-subif)# standby 10 ip 192.168.10.1
R1(config-subif)# standby 10 priority 110
R1(config-subif)# standby 10 preempt
R1(config-subif)# exit
R1(config)# interface GigabitEthernet0/0.20
R1(config-subif)# standby 20 ip 192.168.20.1
R1(config-subif)# standby 20 priority 110
R1(config-subif)# standby 20 preempt
R1(config-subif)# exit
```

R2 は既定のプライオリティ（100）のまま、仮想 IP のみ設定します
（Standby 側になります）。

```
R2(config)# interface GigabitEthernet0/0.10
R2(config-subif)# standby 10 ip 192.168.10.1
R2(config-subif)# exit
R2(config)# interface GigabitEthernet0/0.20
R2(config-subif)# standby 20 ip 192.168.20.1
R2(config-subif)# exit
```

## 手順 5: ルータ間リンク・WAN リンクの IP 設定と OSPF 有効化（15 分）

R1-R2 間のリンクと、R1-R-ISP 間の WAN リンクに IP を設定します。

```
R1(config)# interface GigabitEthernet0/1
R1(config-if)# ip address 10.0.0.1 255.255.255.252
R1(config-if)# no shutdown
R1(config-if)# exit
R1(config)# interface GigabitEthernet0/2
R1(config-if)# ip address 203.0.113.1 255.255.255.252
R1(config-if)# no shutdown
R1(config-if)# exit
```

```
R2(config)# interface GigabitEthernet0/1
R2(config-if)# ip address 10.0.0.2 255.255.255.252
R2(config-if)# no shutdown
R2(config-if)# exit
```

```
Router(config)# hostname R-ISP
R-ISP(config)# interface GigabitEthernet0/0
R-ISP(config-if)# ip address 203.0.113.2 255.255.255.252
R-ISP(config-if)# no shutdown
R-ISP(config-if)# exit
R-ISP(config)# interface GigabitEthernet0/1
R-ISP(config-if)# ip address 8.8.8.1 255.255.255.0
R-ISP(config-if)# no shutdown
R-ISP(config-if)# exit
```

R1・R2 で OSPF を有効化します。LAN 側（VLAN10/20/99）はネットワークとして
広告しつつ、隣接関係は不要なため `passive-interface` で Hello の送信を
止めます。

```
R1(config)# router ospf 1
R1(config-router)# router-id 1.1.1.1
R1(config-router)# network 10.0.0.0 0.0.0.3 area 0
R1(config-router)# network 192.168.10.0 0.0.0.255 area 0
R1(config-router)# network 192.168.20.0 0.0.0.255 area 0
R1(config-router)# network 192.168.99.0 0.0.0.255 area 0
R1(config-router)# passive-interface GigabitEthernet0/0.10
R1(config-router)# passive-interface GigabitEthernet0/0.20
R1(config-router)# passive-interface GigabitEthernet0/0.99
R1(config-router)# exit
```

```
R2(config)# router ospf 1
R2(config-router)# router-id 2.2.2.2
R2(config-router)# network 10.0.0.0 0.0.0.3 area 0
R2(config-router)# network 192.168.10.0 0.0.0.255 area 0
R2(config-router)# network 192.168.20.0 0.0.0.255 area 0
R2(config-router)# network 192.168.99.0 0.0.0.255 area 0
R2(config-router)# passive-interface GigabitEthernet0/0.10
R2(config-router)# passive-interface GigabitEthernet0/0.20
R2(config-router)# passive-interface GigabitEthernet0/0.99
R2(config-router)# exit
```

R-ISP はインターネット側を模擬する機器のため OSPF には参加させません。

## 手順 6: デフォルトルートの設定と OSPF への配布（10 分）

R1 に ISP 向けのデフォルトルートを設定し、OSPF で R2 にも配布します。

```
R1(config)# ip route 0.0.0.0 0.0.0.0 203.0.113.2
R1(config)# router ospf 1
R1(config-router)# default-information originate
R1(config-router)# exit
```

## 手順 7: DHCP サーバの構成と PC の設定（15 分）

R1・R2 の両方を DHCP サーバとして構成し、冗長化します。ただし DHCP は
サーバ間でリース情報を共有しないため、両ルータに**同一の配布範囲**を
設定すると、それぞれが独立に空き先頭アドレスから払い出してしまい、
同一 IP アドレスが 2 台の PC に重複割当されるおそれがあります。これを
避けるため、配布範囲を上位/下位で分割する**スプリットスコープ**を
採用します。R1 が `.4`〜`.128` を、R2 が `.129`〜`.254` を担当するように
`excluded-address` を非対称に設定してください（`default-router` には
HSRP の仮想 IP を指定するため、どちらのルータが応答しても同じゲートウェイ
情報が配布されます）。

```
R1(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.3
R1(config)# ip dhcp excluded-address 192.168.10.129 192.168.10.254
R1(config)# ip dhcp excluded-address 192.168.20.1 192.168.20.3
R1(config)# ip dhcp excluded-address 192.168.20.129 192.168.20.254
R1(config)# ip dhcp excluded-address 192.168.99.1 192.168.99.3
R1(config)# ip dhcp pool VLAN10-EIGYO
R1(dhcp-config)# network 192.168.10.0 255.255.255.0
R1(dhcp-config)# default-router 192.168.10.1
R1(dhcp-config)# dns-server 8.8.8.8
R1(dhcp-config)# exit
R1(config)# ip dhcp pool VLAN20-KEIRI
R1(dhcp-config)# network 192.168.20.0 255.255.255.0
R1(dhcp-config)# default-router 192.168.20.1
R1(dhcp-config)# dns-server 8.8.8.8
R1(dhcp-config)# exit
```

R2 には、配布範囲が R1 と重ならないよう**下位半分を除外**した設定を
行います。

```
R2(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.3
R2(config)# ip dhcp excluded-address 192.168.10.4 192.168.10.128
R2(config)# ip dhcp excluded-address 192.168.20.1 192.168.20.3
R2(config)# ip dhcp excluded-address 192.168.20.4 192.168.20.128
R2(config)# ip dhcp excluded-address 192.168.99.1 192.168.99.3
R2(config)# ip dhcp pool VLAN10-EIGYO
R2(dhcp-config)# network 192.168.10.0 255.255.255.0
R2(dhcp-config)# default-router 192.168.10.1
R2(dhcp-config)# dns-server 8.8.8.8
R2(dhcp-config)# exit
R2(config)# ip dhcp pool VLAN20-KEIRI
R2(dhcp-config)# network 192.168.20.0 255.255.255.0
R2(dhcp-config)# default-router 192.168.20.1
R2(dhcp-config)# dns-server 8.8.8.8
R2(dhcp-config)# exit
```

各 PC を DHCP でアドレス取得するよう設定します（[Desktop] →
**IP Configuration** → **DHCP** を選択）。

- PC1・PC3（VLAN10）: DHCP を選択するだけで自動取得されます
- PC2・PC4（VLAN20）: 同様に DHCP を選択します

## 手順 8: NAT/PAT の構成（15 分・R1 のみ）

R1 の LAN 側サブインターフェースと R1-R2 リンクを `inside`、WAN 側
インターフェースを `outside` とし、PAT（NAT オーバーロード）を設定
します。R2 配下の VLAN も OSPF 経由で R1 を通るため、R1-R2 リンクも
`inside` として扱う点に注意してください。

```
R1(config)# interface GigabitEthernet0/0.10
R1(config-subif)# ip nat inside
R1(config-subif)# exit
R1(config)# interface GigabitEthernet0/0.20
R1(config-subif)# ip nat inside
R1(config-subif)# exit
R1(config)# interface GigabitEthernet0/0.99
R1(config-subif)# ip nat inside
R1(config-subif)# exit
R1(config)# interface GigabitEthernet0/1
R1(config-if)# ip nat inside
R1(config-if)# exit
R1(config)# interface GigabitEthernet0/2
R1(config-if)# ip nat outside
R1(config-if)# exit
R1(config)# access-list 1 permit 192.168.0.0 0.0.255.255
R1(config)# ip nat inside source list 1 interface GigabitEthernet0/2 overload
```

## 手順 9: 拡張 ACL による経理 VLAN の制限（15 分・本日のメイン）

経理 VLAN（VLAN20）からサーバへの通信を **HTTP のみ**に制限する名前付き
拡張 ACL を作成します。拡張 ACL は「送信元にできるだけ近いインターフェース」
に適用する原則に従い、R1 の Gi0/0.20（経理 VLAN の入口）に適用します。
先頭の `permit udp` 行は、経理 VLAN の DHCP DISCOVER/REQUEST（ブロード
キャスト、宛先 UDP67）が ACL によって遮断され、リースの取得・更新に失敗
することを防ぐためのものです。

```
R1(config)# ip access-list extended KEIRI-TO-SRV
R1(config-ext-nacl)# permit udp any host 255.255.255.255 eq 67
R1(config-ext-nacl)# permit tcp 192.168.20.0 0.0.0.255 host 8.8.8.8 eq 80
R1(config-ext-nacl)# deny ip any any log
R1(config-ext-nacl)# exit
R1(config)# interface GigabitEthernet0/0.20
R1(config-subif)# ip access-group KEIRI-TO-SRV in
R1(config-subif)# exit
```

`deny ip any any log` は暗黙の deny と同じ効果ですが、明示的に書くことで
`show access-lists` のヒットカウンタから拒否された通信を後で確認できます。

この設定は R1 が HSRP Active のときには要件4（経理 VLAN は HTTP のみ許可）
を満たしますが、DHCP は R1・R2 の両系で冗長化している一方 ACL は R1 側にしか
無いため、HSRP フェイルオーバーで R2 が Active になった間は経理 VLAN の
通信が無制限に R2 経由で通ってしまいます。冗長構成でも要件4を維持するため、
同一 ACL を R2 の Gi0/0.20 にも適用してください。

```
R2(config)# ip access-list extended KEIRI-TO-SRV
R2(config-ext-nacl)# permit udp any host 255.255.255.255 eq 67
R2(config-ext-nacl)# permit tcp 192.168.20.0 0.0.0.255 host 8.8.8.8 eq 80
R2(config-ext-nacl)# deny ip any any log
R2(config-ext-nacl)# exit
R2(config)# interface GigabitEthernet0/0.20
R2(config-subif)# ip access-group KEIRI-TO-SRV in
R2(config-subif)# exit
```

## 手順 10: ルータ管理の SSH 化（10 分）

R1・R2 それぞれで Telnet を無効化し、SSH のみで管理できるようにします。

```
R1(config)# ip domain-name ccna-lab.local
R1(config)# crypto key generate rsa
How many bits in the modulus [512]: 1024
R1(config)# username admin secret Cisco12345
R1(config)# enable secret Cisco12345
R1(config)# line vty 0 4
R1(config-line)# transport input ssh
R1(config-line)# login local
R1(config-line)# exit
```

```
R2(config)# ip domain-name ccna-lab.local
R2(config)# crypto key generate rsa
How many bits in the modulus [512]: 1024
R2(config)# username admin secret Cisco12345
R2(config)# enable secret Cisco12345
R2(config)# line vty 0 4
R2(config-line)# transport input ssh
R2(config-line)# login local
R2(config-line)# exit
```

## 手順 11: スイッチのポートセキュリティ（10 分）

SW1・SW2 の PC 接続ポート（アクセスポート）にポートセキュリティを
設定します。

```
SW1(config)# interface FastEthernet0/1
SW1(config-if)# switchport port-security
SW1(config-if)# switchport port-security maximum 1
SW1(config-if)# switchport port-security mac-address sticky
SW1(config-if)# switchport port-security violation shutdown
SW1(config-if)# exit
SW1(config)# interface FastEthernet0/2
SW1(config-if)# switchport port-security
SW1(config-if)# switchport port-security maximum 1
SW1(config-if)# switchport port-security mac-address sticky
SW1(config-if)# switchport port-security violation shutdown
SW1(config-if)# exit
```

SW2 の Fa0/1・Fa0/2 にも同じ設定を行います。

## 手順 12: 疎通確認（10 分）

1. SRV の HTTP サービスを有効化します（[Desktop] → [Services] → HTTP → On）
2. 各 PC が DHCP でアドレスを取得できていることを確認します（[Desktop] →
   **Command Prompt** → `ipconfig`）
3. 同一 VLAN 内（PC1 ⇔ PC3、PC2 ⇔ PC4）で ping が成功することを確認します
4. 経理 VLAN（PC2/PC4）は手順9で適用した ACL『KEIRI-TO-SRV』により、
   8.8.8.8 宛 HTTP 以外の通信がすべて遮断されます。そのため PC1 ⇔ PC2 の
   VLAN 間 ping は**失敗するのが正しい動作**です（ACL の効果確認）。VLAN
   間ルーティング自体の疎通を確認したい場合は、手順9で ACL を適用する前に
   このping を実施してください
5. インターネット（模擬）への到達を確認します

   ```
   PC1> ping 8.8.8.8
   ```

   → **成功**すること（営業 VLAN は ACL の制限を受けません）

   ```
   PC2> ping 8.8.8.8
   ```

   → **失敗**すること（経理 VLAN は HTTP 以外を拒否されます）。ただし
   Web Browser から `http://8.8.8.8` へのアクセスは**成功**します

## 手順 13: 検証コマンドによる最終確認（15 分）

次のコマンドを実行し、6 つの要件がすべて成立していることを確認します。

```
R1# show ip ospf neighbor
R1# show ip route
R1# show standby brief
R1# show ip nat translations
R1# show access-lists
R2# show access-lists
SW1# show vlan brief
SW1# show port-security interface FastEthernet0/1
```

- `show ip ospf neighbor`: R1-R2 間で Full 状態のネイバーが 1 つ確認できる
- `show ip route`: OSPF 由来の経路（O）と、`default-information originate`
  による `O*E2` のデフォルトルートが R2 側にも見えることを確認する
- `show standby brief`: VLAN10・VLAN20 とも R1 が Active、R2 が Standby
- `show ip nat translations`: PC からの通信がポート番号付きで変換されている
  （PAT の動作）
- `show access-lists`: R1・R2 双方の KEIRI-TO-SRV の permit/deny 行に
  ヒットカウンタが記録されている
- `show vlan brief` / `show port-security interface`: VLAN 割当とポート
  セキュリティの状態（Secure-up、学習した MAC アドレス数）

最後に設定を保存します。

```
R1# copy running-config startup-config
R2# copy running-config startup-config
```

### 観察レポート（コメント提出用）

以下 3 問に答えて、課題のコメントに記入してください。

1. HSRP で Active 側ルータ（R1）の Gi0/0 を `shutdown` したとき、PC から
   インターネットへの ping が継続することを確認し、`show standby brief`
   の出力で Standby → Active への昇格がどう起きたかを記述してください
2. `show ip nat translations` の出力から、複数の内部 PC が同一のグローバル
   アドレスをどのように共有しているか（PAT によるポート番号の多重化）を
   説明してください
3. `show access-lists` のヒットカウンタから、許可された経理 VLAN → サーバの
   HTTP 通信の件数と、暗黙の deny（またはログ付き deny）で拒否された通信の
   件数を読み取り、ACL が要件どおり動作しているかを検証してください

## 提出方法

1. `day20_氏名.pkt` を Backlog の総合演習ラボ課題に**添付**する
2. 手順 13 の検証コマンドの出力（スクリーンショット可）と、観察レポートの
   回答を課題の**コメント**に貼る
3. 課題の状態を「処理済み」に変更する

## うまくいかないとき

| 症状 | 確認すること |
|---|---|
| VLAN 間・拠点間の ping が全て失敗する | サブインターフェースの `encapsulation dot1Q <番号>` の番号違い、トランクの `switchport trunk allowed vlan` 漏れ、ネイティブ VLAN の不一致 |
| HSRP が両方とも Active（または両方 Standby）になる | `standby <グループ> ip` の仮想 IP が両ルータで一致しているか、VLAN10/20 のグループ番号が重複していないか |
| PC が DHCP でアドレスを取得できない | `ip dhcp excluded-address` の範囲誤り、`network` コマンドのアドレス/マスク誤り、サブインターフェースがトランクに乗っているか |
| インターネットへの ping が全て失敗する（営業 VLAN も） | R1 の `ip route 0.0.0.0 0.0.0.0 203.0.113.2`、`ip nat inside`/`outside` の付け忘れ、`access-list 1` の範囲誤り |
| 経理 VLAN から HTTP も失敗する | ACL の記述順序、`eq 80` の誤記、ACL の適用インターフェース（R1・R2 双方の Gi0/0.20）・方向（in）の誤り |
| 経理 VLAN が DHCP でアドレスを取得できない（ACL 適用後） | ACL 先頭の `permit udp any host 255.255.255.255 eq 67` の記述漏れ（DHCP DISCOVER/REQUEST が deny されている） |
| PC がリンクダウンしてしまう | ポートセキュリティの `maximum` を超える MAC アドレスが学習されていないか（`violation shutdown` により errdisable 状態になっている可能性） |
| SSH で接続できない | `crypto key generate rsa` の未実行、`transport input ssh` の設定漏れ、`login local` の設定漏れ、`ip domain-name` の未設定 |

30 分試して解決しない場合は、状況（スクリーンショット + 試したこと）を
課題のコメントに書いて質問してください。
