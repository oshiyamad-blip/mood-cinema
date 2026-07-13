# Day 10 ラボ手順書: WLC と Lightweight AP による WLAN 構築、CDP/LLDP による隣接機器確認

> 配置先: ドキュメント `02_ラボ手順書 > Week2 > Day10`
> 所要時間の目安: 2.5 時間 ／ 使用ツール: Cisco Packet Tracer 9.x

## ゴール

- WLC と Lightweight AP（LAP）を **CAPWAP** で接続し、正常に join した状態を
  確認できる
- WLC の GUI で **WPA2-PSK** の WLAN を 1 つ構築できる
- 無線クライアント（ノート PC）2 台を SSID に接続し、相互および有線側の
  ルータとの疎通を確認できる
- **CDP** と **LLDP** を CLI から確認し、隣接機器の情報（IP アドレス・
  プラットフォーム・接続ポート）を読み取り、両者の違いを説明できる

## 完成トポロジ

```
                          R1 (2911)
                     Gi0/0（サブIF: .10 / .100）
                              │
                        トランク（VLAN10,100）
                              │
                       ┌────SW1（2960）────┐
                       │                    │
              Gi0/2（トランク）      Fa0/1（アクセスVLAN100・PoE）
              VLAN10,100                    │
                       │                    │
                 ┌─────┴─────┐        ┌─────┴─────┐
                 │ WLC-3504  │        │    LAP    │
                 │（管理IF）  │◄──CAPWAP──┤ (LAP-PT)  │
                 └───────────┘  UDP5246/5247        └─────┬─────┘
                                                            │
                                                    無線 SSID: MC-STAFF
                                                    （VLAN10 に収容）
                                                    ┌───────┴───────┐
                                                 ノートPC1        ノートPC2

  SW1 Fa0/24（アクセスVLAN100）
        │
     管理用PC
```

### IP アドレス表

| 機器 | インタフェース | 所属 VLAN | IP アドレス | サブネットマスク | 備考 |
|---|---|---|---|---|---|
| R1 | Gi0/0.100 | 100 | 192.168.100.1 | 255.255.255.0 | 管理 VLAN ゲートウェイ・DHCP サーバ |
| R1 | Gi0/0.10 | 10 | 192.168.10.1 | 255.255.255.0 | クライアント VLAN ゲートウェイ・DHCP サーバ |
| WLC-3504 | management | 100 | 192.168.100.2 | 255.255.255.0 | セットアップウィザードで静的に設定 |
| WLC-3504 | dynamic（クライアント収容用） | 10 | 192.168.10.2 | 255.255.255.0 | GUI の Controller > Interfaces で作成 |
| LAP | Gi0 | 100 | DHCP 割当（例: 192.168.100.101） | 255.255.255.0 | VLAN100 の DHCP プールから取得 |
| 管理用 PC | Fa0 | 100 | 192.168.100.10 | 255.255.255.0 | 静的設定（WLC GUI へのアクセス用） |
| ノート PC 1 | 無線 NIC | 10 | DHCP 割当（例: 192.168.10.101） | 255.255.255.0 | SSID: MC-STAFF |
| ノート PC 2 | 無線 NIC | 10 | DHCP 割当（例: 192.168.10.102） | 255.255.255.0 | SSID: MC-STAFF |

> 使用機器: Router 2911 × 1、WLC-3504 × 1、Lightweight AP（LAP-PT、PoE 対応）× 1、
> Switch 2960（PoE 対応ポートを持つモデル）× 1、ノート PC × 2、管理用 PC × 1

---

## 手順 1: 配線とスイッチの基本設定（10 分）

1. Packet Tracer に R1（2911）、SW1（2960）、WLC-3504、LAP（LAP-PT）、管理用 PC、
   ノート PC 2 台を配置する
2. 次のとおり有線ケーブルで接続する
   - R1 Gi0/0 ─ SW1 Gi0/1
   - WLC-3504 の管理ポート ─ SW1 Gi0/2
   - LAP の Gi0 ─ SW1 Fa0/1
   - 管理用 PC の Fa0 ─ SW1 Fa0/24
3. SW1 にホスト名を設定する

   ```
   Switch(config)# hostname SW1
   ```

4. ノート PC 2 台は、この時点では有線接続せず、後の手順で無線接続する

## 手順 2: VLAN 作成とアクセスポートの割り当て（15 分）

1. SW1 で VLAN 10（クライアント用）と VLAN 100（管理用）を作成する

   ```
   SW1(config)# vlan 10
   SW1(config-vlan)# name WIRELESS-CLIENT
   SW1(config-vlan)# exit
   SW1(config)# vlan 100
   SW1(config-vlan)# name MGMT
   SW1(config-vlan)# exit
   ```

2. LAP を収容する Fa0/1 をアクセスポートとして VLAN100 に割り当て、PoE 給電を
   有効にする

   ```
   SW1(config)# interface fastEthernet 0/1
   SW1(config-if)# switchport mode access
   SW1(config-if)# switchport access vlan 100
   SW1(config-if)# power inline auto
   ```

3. 管理用 PC を収容する Fa0/24 をアクセスポートとして VLAN100 に割り当てる

   ```
   SW1(config)# interface fastEthernet 0/24
   SW1(config-if)# switchport mode access
   SW1(config-if)# switchport access vlan 100
   ```

## 手順 3: トランクポートの設定（10 分）

1. R1 側（Gi0/1）と WLC 側（Gi0/2）のポートを、VLAN10・VLAN100 の両方を許可した
   トランクポートに設定する。WLC 側の Gi0/2 は、WLC の管理インタフェースが
   タグなし（VLAN 識別子 0）で送受信する前提のため、ネイティブ VLAN を
   管理 VLAN である VLAN100 に明示的に設定する

   ```
   SW1(config)# interface gigabitEthernet 0/1
   SW1(config-if)# switchport mode trunk
   SW1(config-if)# switchport trunk allowed vlan 10,100
   SW1(config-if)# exit
   SW1(config)# interface gigabitEthernet 0/2
   SW1(config-if)# switchport mode trunk
   SW1(config-if)# switchport trunk allowed vlan 10,100
   SW1(config-if)# switchport trunk native vlan 100
   ```

   > Gi0/2 のネイティブ VLAN を VLAN100 に合わせることで、手順 5 で WLC の
   > Management Interface VLAN Identifier に `0`（タグなし）を設定した場合に、
   > その管理トラフィックが正しく VLAN100（192.168.100.0/24）として扱われます。
   > ここが不一致のままだと、WLC の管理トラフィックが既定のネイティブ VLAN
   > （VLAN1）に流れてしまい、R1 にも管理用 PC にも到達できず、手順 6 の
   > GUI ログインが失敗します。

## 手順 4: R1 のサブインタフェースと DHCP サーバ設定（20 分）

1. R1 の物理インタフェースを有効化し、VLAN ごとのサブインタフェースを作成する

   ```
   Router(config)# hostname R1
   R1(config)# interface gigabitEthernet 0/0
   R1(config-if)# no shutdown
   R1(config-if)# exit
   R1(config)# interface gigabitEthernet 0/0.100
   R1(config-subif)# encapsulation dot1Q 100
   R1(config-subif)# ip address 192.168.100.1 255.255.255.0
   R1(config-subif)# exit
   R1(config)# interface gigabitEthernet 0/0.10
   R1(config-subif)# encapsulation dot1Q 10
   R1(config-subif)# ip address 192.168.10.1 255.255.255.0
   R1(config-subif)# exit
   ```

2. DHCP で払い出さない予約範囲（ゲートウェイ・静的機器分）を除外する

   ```
   R1(config)# ip dhcp excluded-address 192.168.100.1 192.168.100.10
   R1(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10
   ```

3. AP 用（VLAN100）の DHCP プールを作成する。WLC の管理インタフェース IP
   （192.168.100.2）を **オプション 43** で通知することで、LAP が WLC の
   IP アドレスを自動的に学習できるようにする

   ```
   R1(config)# ip dhcp pool VLAN100-MGMT
   R1(dhcp-config)# network 192.168.100.0 255.255.255.0
   R1(dhcp-config)# default-router 192.168.100.1
   R1(dhcp-config)# option 43 hex f104.c0a8.6402
   R1(dhcp-config)# exit
   ```

   > オプション 43 の値 `f104.c0a8.6402` は、「タイプ 0xf1（=241、WLC IP
   > アドレス通知用）」＋「長さ 0x04（4 バイト）」＋「WLC の管理 IP アドレス
   > 192.168.100.2 を 16 進数化した c0a86402」を連結したものです。WLC の
   > 管理 IP アドレスを変更した場合は、この値も再計算して変更してください。

4. クライアント用（VLAN10）の DHCP プールを作成する

   ```
   R1(config)# ip dhcp pool VLAN10-CLIENT
   R1(dhcp-config)# network 192.168.10.0 255.255.255.0
   R1(dhcp-config)# default-router 192.168.10.1
   R1(dhcp-config)# exit
   ```

## 手順 5: WLC のコンソール初期セットアップ（15 分）

1. WLC-3504 をコンソール接続し、初回起動時の **セットアップウィザード**
   （対話形式の質問）に沿って回答する。主な入力項目は次のとおり

   | 質問項目 | 入力する値 |
   |---|---|
   | System Name | `WLC1` |
   | 管理者ユーザー名 / パスワード | 任意（例: `admin` / `Cisco123`） |
   | Management Interface IP Address | `192.168.100.2` |
   | Management Interface Netmask | `255.255.255.0` |
   | Management Interface Default Router | `192.168.100.1` |
   | Management Interface VLAN Identifier | `0`（タグなし＝ネイティブ VLAN 扱い。接続先は Gi0/2 のトランク側で、手順 3 で当該トランクのネイティブ VLAN を VLAN100 に設定済みのため、管理トラフィックは VLAN100 として扱われる） |
   | DHCP Server IP Address | `192.168.100.1`（R1 を DHCP リレー代わりに指定） |

2. 設定完了後、WLC が再起動またはログインプロンプトに戻ることを確認する

## 手順 6: WLC GUI へのログイン（5 分）

1. 管理用 PC に IP アドレス `192.168.100.10 / 255.255.255.0`（ゲートウェイ
   `192.168.100.1`）を設定する
2. 管理用 PC の Web ブラウザから `https://192.168.100.2` にアクセスする
3. 手順 5 で設定したユーザー名・パスワードでログインする

## 手順 7: ダイナミックインタフェースの作成（10 分）

1. GUI 上部メニューの **Controller > Interfaces** を開く
2. **New** から、クライアント収容用のダイナミックインタフェースを作成する
   - Interface Name: `client-vlan10`
   - VLAN Identifier: `10`
   - IP Address: `192.168.10.2`
   - Netmask: `255.255.255.0`
   - Gateway: `192.168.10.1`
3. 作成後、一覧に `client-vlan10` が VLAN10 として表示されることを確認する

## 手順 8: WLAN の作成（General タブ）（10 分）

1. 上部メニューの **WLANs > Create New** を開く
2. SSID に `MC-STAFF` と入力し、**Apply** で新規 WLAN を作成する
3. 作成された WLAN の **General** タブで次を設定する
   - Status: **Enabled**
   - Interface/Interface Group(G): 手順 7 で作成した `client-vlan10` を選択する

## 手順 9: セキュリティの設定（Security タブ）（10 分）

1. 同じ WLAN 編集画面の **Security > Layer 2** タブを開く
2. Layer 2 Security に **WPA2** を選択し、暗号方式が **AES** になっていることを
   確認する
3. Authentication Key Management で **PSK** を選択し、パスフレーズ（例:
   `MoodCinema2026`）を設定する
4. **Apply** して設定を保存する

## 手順 10: LAP の CAPWAP join 確認（10 分）

1. LAP の電源を確認し、SW1 Fa0/1 経由で DHCP から IP アドレスを取得させる
2. WLC GUI の **Wireless** メニューを開き、Access Points の一覧に LAP が
   表示され、Status が **Registered**（登録済み）になっていることを確認する
3. 表示された LAP の詳細から、CAPWAP で正常に join していること（IP アドレス・
   AP モードが Local になっていること）を確認する

## 手順 11: 無線クライアントの接続（15 分）

1. ノート PC 1・PC 2 それぞれの [Desktop] タブから無線 NIC の設定画面を開き、
   有線 NIC から **無線 NIC（PT-LAPTOP-NM-1W 相当）** に切り替える
2. SSID の一覧から `MC-STAFF` を選択して接続する
3. セキュリティ方式として WPA2-PSK を選び、手順 9 で設定したパスフレーズを
   入力する
4. 接続後、IP Configuration を確認し、VLAN10 の DHCP プール（192.168.10.0/24）
   から IP アドレスが自動取得されていることを確認する

## 手順 12: 疎通確認（10 分）

1. ノート PC 1 の Command Prompt から、ノート PC 2 と R1 へ ping する

   ```
   PC> ping 192.168.10.102
   PC> ping 192.168.10.1
   ```

2. **確認**: いずれも `Reply from ... ` が返ること。初回は CAPWAP・DHCP・
   無線アソシエーションの完了待ちでタイムアウトすることがあるため、時間を
   置いて再実行する

## 手順 13: CDP による隣接機器確認（10 分）

1. SW1 で CDP の隣接情報を確認する

   ```
   SW1# show cdp neighbors
   ```

2. 一覧に表示される R1・WLC-3504 の **デバイス ID・ローカルポート・接続先
   ポート・プラットフォーム** を記録する
3. より詳細な情報を確認する

   ```
   SW1# show cdp neighbors detail
   ```

4. 表示された **IP アドレス・IOS（またはソフトウェア）バージョン・
   プラットフォーム** を記録する

## 手順 14: LLDP の有効化と確認（10 分）

1. SW1 で LLDP を有効化する（既定では無効のため）

   ```
   SW1(config)# lldp run
   ```

2. LLDP の隣接情報を確認する

   ```
   SW1# show lldp neighbors
   ```

3. 手順 13 の CDP の結果と比較し、表示される項目や取得できた隣接機器の
   数に違いがないかを確認する

### 観察レポート（コメント提出用）

以下 3 問に答えて、課題のコメントに記入してください。

1. `show cdp neighbors detail` で表示された隣接機器の IP アドレス・
   プラットフォーム・接続ポートを 1 つ挙げ、`show lldp neighbors` の出力と
   比べて情報の違いを述べてください。
2. 作成した WLAN で選択したセキュリティ方式（WPA2・AES・PSK）を書き、
   なぜ WEP やオープン認証を選ばなかったのか理由を述べてください。
3. LAP が WLC に join するために必要だった条件（IP アドレスの取得と WLC の
   IP アドレスを知る手段）を、CAPWAP のトンネルと関連づけて説明してください。

## 提出方法

1. ファイルを `day10_氏名.pkt` の名前で保存する（例: `day10_山田太郎.pkt`）
2. Backlog のラボ課題に `.pkt` ファイルを**添付**する
3. 手順 10・13・14 で確認した画面（スクリーンショット可）と、上記の観察
   レポートを課題の**コメント**に貼る
4. 課題の状態を「処理済み」に変更する

## うまくいかないとき

| 症状 | 確認すること |
|---|---|
| LAP が WLC に join しない（Registered にならない） | LAP が DHCP で IP を取得できているか、DHCP オプション 43 の値（16 進数）が WLC の管理 IP と一致しているか、SW1 の Fa0/1 が VLAN100 のアクセスポートかつ PoE 給電されているか |
| 手順 6 で `https://192.168.100.2` に接続できない | SW1 Gi0/2 のネイティブ VLAN が VLAN100 に設定されているか（手順 3）。WLC の Management Interface VLAN Identifier が `0` のままネイティブ VLAN 側が不一致だと、管理トラフィックが VLAN1 に流れてしまい到達不能になる |
| ノート PC が SSID を発見できない | LAP が Registered になっているか、WLAN の Status が Enabled になっているか、無線 NIC への切り替えが完了しているか |
| ノート PC が接続できるが IP を取得できない | ダイナミックインタフェース `client-vlan10` の VLAN ID・IP 設定、SW1 の Gi0/2（WLC 側）トランクで VLAN10 が許可されているか |
| ノート PC 間 / R1 への ping が通らない | R1 のサブインタフェースの encapsulation dot1Q 番号と VLAN 番号の対応、SW1 の各トランクで VLAN10・VLAN100 が許可されているか |
| `show lldp neighbors` に何も表示されない | `lldp run` を投入し忘れていないか、相手機器が LLDP に対応しているか |

30 分試して解決しない場合は、状況（スクリーンショット + 試したこと）を
課題のコメントに書いて質問してください。
