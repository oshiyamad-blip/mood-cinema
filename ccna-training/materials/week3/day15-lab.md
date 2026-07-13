# Day 15 ラボ手順書: DHCP リレー・NTP 同期・Syslog 収集の統合構成

> 配置先: ドキュメント `02_ラボ手順書 > Week3 > Day15`
> 所要時間の目安: 2.5 時間 ／ 使用ツール: Cisco Packet Tracer 9.x

## ゴール

- R1 を 2 つのサブネット（ローカル LAN／リモート LAN）向けの DHCP サーバとして構成できる
- 離れたサブネットの PC が、R2 の `ip helper-address`（DHCP リレー）経由でアドレスを
  取得できることを確認できる
- R1 を NTP マスタ、R2 を NTP クライアントとして時刻を同期させ、`show ntp status` /
  `show ntp associations` で同期状態を確認できる
- R1・R2 のログを Syslog サーバへ送出し、severity 付きメッセージが記録されることを
  検証できる

## 完成トポロジ

```
                 192.168.1.0/24（ローカル LAN）
PC1(DHCP) ── Fa0/2 ┐
PC2(DHCP) ── Fa0/3 ┤   SW1(2960)
Syslogサーバ ── Fa0/4 ┘  Fa0/1
192.168.1.10 固定       │
                    Gi0/0 (192.168.1.1/24) ★DHCP/NTPマスタ
                     R1 (2911)
                    Gi0/1 (10.0.0.1/30)
                         │
                    Gi0/1 (10.0.0.2/30)
                     R2 (2911) ★DHCPリレー/NTPクライアント
                    Gi0/0 (192.168.2.1/24)
                         │  Fa0/1
                       SW2(2960)
PC3(DHCP) ── Fa0/2 ┐    Fa0/2
PC4(DHCP) ── Fa0/3 ┘
                 192.168.2.0/24（リモート LAN）
```

### IP アドレス表

| 機器 | インターフェース | IP アドレス | 備考 |
|---|---|---|---|
| PC1 | Fa0 | DHCP 取得 | LAN1 プールから 192.168.1.x を取得 |
| PC2 | Fa0 | DHCP 取得 | LAN1 プールから 192.168.1.x を取得 |
| Syslog サーバ | FastEthernet0 | 192.168.1.10/24（固定） | GW: 192.168.1.1、Services > SYSLOG を有効化 |
| SW1 | Fa0/1〜Fa0/4 | — | L2 スイッチ、設定不要 |
| R1 | Gi0/0 | 192.168.1.1/24 | `ip nat` 等は使用しない。LAN1 の DHCP デフォルトゲートウェイ |
| R1 | Gi0/1 | 10.0.0.1/30 | R2 との WAN リンク、NTP マスタ（stratum 3） |
| R2 | Gi0/1 | 10.0.0.2/30 | R1 との WAN リンク |
| R2 | Gi0/0 | 192.168.2.1/24 | LAN2 の DHCP デフォルトゲートウェイ、`ip helper-address` 設定対象 |
| SW2 | Fa0/1〜Fa0/3 | — | L2 スイッチ、設定不要 |
| PC3 | Fa0 | DHCP 取得 | LAN2 プールから 192.168.2.x をリレー経由で取得 |
| PC4 | Fa0 | DHCP 取得 | LAN2 プールから 192.168.2.x をリレー経由で取得 |

R1 が DHCP サーバと NTP マスタを兼務し、R2 は DHCP リレーエージェントと NTP
クライアントを兼務します。DHCP・NTP・Syslog のすべてのサーバ役を、ローカル LAN 側の
Syslog サーバ（192.168.1.10）とルータ自身が分担する構成です。

---

## 手順 1: 基本ネットワーク構成（25 分）

1. トポロジ図のとおりに R1・R2・SW1・SW2・PC1〜PC4・Syslog サーバを配置し、
   ケーブルで接続する（ルータ間・ルータ-スイッチ間はストレート、または
   自動判定のケーブルを使用）
2. Syslog サーバの IP を手動設定する: `192.168.1.10` / `255.255.255.0` /
   GW `192.168.1.1`
3. R1・R2 の各インターフェースに IP アドレスを設定し `no shutdown` する

   ```
   R1(config)# interface GigabitEthernet0/0
   R1(config-if)# ip address 192.168.1.1 255.255.255.0
   R1(config-if)# no shutdown
   R1(config-if)# exit
   R1(config)# interface GigabitEthernet0/1
   R1(config-if)# ip address 10.0.0.1 255.255.255.252
   R1(config-if)# no shutdown
   ```

   ```
   R2(config)# interface GigabitEthernet0/1
   R2(config-if)# ip address 10.0.0.2 255.255.255.252
   R2(config-if)# no shutdown
   R2(config-if)# exit
   R2(config)# interface GigabitEthernet0/0
   R2(config-if)# ip address 192.168.2.1 255.255.255.0
   R2(config-if)# no shutdown
   ```

4. 相互のサブネットへ静的ルートを設定し、全区間の疎通を確保する

   ```
   R1(config)# ip route 192.168.2.0 255.255.255.0 10.0.0.2
   ```

   ```
   R2(config)# ip route 192.168.1.0 255.255.255.0 10.0.0.1
   ```

5. R1 から `ping 10.0.0.2`、`ping 192.168.1.10` を実行し、この時点での疎通を確認する
   （PC・Syslog サーバはまだ DHCP 未取得のため、PC 側からの ping はこの後の手順で
   確認します）

## 手順 2: R1 の DHCP サーバ構成（20 分）

1. 固定用に使うアドレスを除外する（ローカル LAN 側の予約範囲とリモート LAN 側の
   ゲートウェイアドレス）

   ```
   R1(config)# ip dhcp excluded-address 192.168.1.1 192.168.1.10
   R1(config)# ip dhcp excluded-address 192.168.2.1 192.168.2.1
   ```

2. ローカル LAN 用のプールを作成する

   ```
   R1(config)# ip dhcp pool LAN1
   R1(dhcp-config)# network 192.168.1.0 255.255.255.0
   R1(dhcp-config)# default-router 192.168.1.1
   R1(dhcp-config)# dns-server 192.168.1.10
   R1(dhcp-config)# lease 0 8 0
   R1(dhcp-config)# exit
   ```

3. リモート LAN 用のプールを作成する（デフォルトゲートウェイは R2 の Gi0/0）

   ```
   R1(config)# ip dhcp pool LAN2
   R1(dhcp-config)# network 192.168.2.0 255.255.255.0
   R1(dhcp-config)# default-router 192.168.2.1
   R1(dhcp-config)# dns-server 192.168.1.10
   R1(dhcp-config)# exit
   ```

4. `show ip dhcp pool` を実行し、2 つのプール（LAN1・LAN2）が作成されたことを確認する

## 手順 3: PC1・PC2 の DHCP 取得確認（15 分）

1. PC1・PC2 の [Desktop] → [IP Configuration] で **DHCP** に設定する
2. 両 PC が `192.168.1.11` 以降のアドレスを取得できることを `ipconfig` で確認する
   （除外範囲 `192.168.1.1〜.10` の外側から払い出されることを確認する）
3. PC1 から `ping 192.168.1.10`（Syslog サーバ）を実行し、疎通を確認する

## 手順 4: R2 の DHCP リレー構成（10 分）

1. R2 のクライアント側インターフェース（Gi0/0）に、DHCP サーバ（R1 の Gi0/1）を
   指す `ip helper-address` を設定する

   ```
   R2(config)# interface GigabitEthernet0/0
   R2(config-if)# ip helper-address 10.0.0.1
   ```

   これにより、PC3・PC4 が送出する DHCP Discover（ブロードキャスト）が、
   R2 によってユニキャストへ変換されて R1 へ転送されるようになります。

## 手順 5: PC3・PC4 の DHCP 取得確認と binding の確認（20 分）

1. PC3・PC4 の [IP Configuration] で **DHCP** に設定する
2. 両 PC が `192.168.2.2` 以降のアドレスを、リレー経由で取得できることを
   `ipconfig` で確認する（デフォルトゲートウェイが `192.168.2.1` になっていることも
   確認する）
3. R1 で `show ip dhcp binding` を実行し、**4 台分**（PC1〜PC4）のリースが
   登録されていることを確認する

   ```
   R1# show ip dhcp binding
   ```

4. PC3 から Syslog サーバ（`ping 192.168.1.10`）への疎通を確認する

## 手順 6: NTP マスタ／クライアントの構成と確認（20 分）

1. R1 の時刻を手動設定し、NTP マスタとして動作させる

   ```
   R1# clock set 10:00:00 13 July 2026
   R1(config)# ntp master 3
   ```

2. R2 を R1 に同期する NTP クライアントとして設定する

   ```
   R2(config)# ntp server 10.0.0.1
   ```

3. 数分待ってから、R2 で同期状態を確認する

   ```
   R2# show ntp status
   R2# show ntp associations
   ```

   - `show ntp associations` の出力で、R1（`10.0.0.1`）の行の先頭に `*` が
     付いていれば、そのピアと**同期中**であることを示します
   - `show ntp status` で `Clock is synchronized` と、stratum が **4**
     （R1 の stratum 3 より 1 つ大きい値）になっていることを確認する

## 手順 7: Syslog の構成とイベント発生・確認（25 分）

1. R1・R2 の両方で、タイムスタンプ付きログと Syslog サーバへの送出を設定する

   ```
   R1(config)# service timestamps log datetime msec
   R1(config)# logging host 192.168.1.10
   R1(config)# logging trap informational
   ```

   ```
   R2(config)# service timestamps log datetime msec
   R2(config)# logging host 192.168.1.10
   R2(config)# logging trap informational
   ```

2. R2 のいずれかのインターフェース（例: Gi0/0）で `shutdown` → `no shutdown` を
   実行し、意図的にリンクの up/down イベントを発生させる

   ```
   R2(config)# interface GigabitEthernet0/0
   R2(config-if)# shutdown
   R2(config-if)# no shutdown
   ```

3. Syslog サーバの [Services] タブ → **SYSLOG** 画面を開き、`%LINK` /
   `%LINEPROTO` を含むメッセージが記録されていることを確認する
4. R2 で `show logging` を実行し、コンソール上でも同様のメッセージが
   バッファに記録されていることを確認する

## 手順 8: 総合検証と保存（15 分）

1. 各ルータで次のコマンドを実行し、設定全体を検証する

   ```
   R1# show ip dhcp pool
   R1# show ntp status
   R1# show logging
   R2# show ntp status
   R2# show logging
   ```

2. `File > Save As` で `day15_氏名.pkt` として保存する

### 観察レポート（コメント提出用）

以下 3 問に答えて、課題のコメントに記入してください。

1. PC3・PC4 がリレー経由で取得した IP アドレスとデフォルトゲートウェイは
   何だったか。R2 の `ip helper-address` を外すと PC3・PC4 のアドレス取得は
   どうなるか、その理由（DHCP Discover がブロードキャストである点）と
   あわせて述べよ。
2. R2 で `show ntp status` / `show ntp associations` を実行したとき、
   同期状態と R2 の stratum 値はいくつだったか。R1 の `ntp master` の値との
   関係を説明せよ。
3. Syslog サーバに記録されたインターフェース down/up メッセージ
   （`%LINK-x-UPDOWN` 等）の severity レベルは何番で、その名称は何か。
   `logging trap` のレベルを `warning` に変えると、このメッセージは
   送出されるか。あわせて、同時に記録される `%LINEPROTO-5-UPDOWN`
   （severity 5）についても、`logging trap warning` で送出されるかどうかを
   確認し、`%LINK-3-UPDOWN` との違いとその理由（severity としきい値の
   大小関係）を記述せよ。

## 提出方法

1. `day15_氏名.pkt` を Backlog のラボ課題に**添付**する
2. `show ip dhcp binding` / `show ntp status` / `show ntp associations` /
   Syslog サーバの記録画面のスクリーンショットと、観察レポートの回答を
   課題の**コメント**に貼る
3. 課題の状態を「処理済み」に変更する

## うまくいかないとき

| 症状 | 確認すること |
|---|---|
| PC1・PC2 が DHCP アドレスを取得できない | R1 の `ip dhcp pool LAN1` の `network` 設定、R1 Gi0/0 の `no shutdown`、除外アドレス範囲の誤り |
| PC3・PC4 が DHCP アドレスを取得できない | R2 Gi0/0 に `ip helper-address 10.0.0.1` が設定されているか、R1↔R2 間の静的ルート（往復とも）が入っているか |
| R1 で `show ip dhcp binding` に PC3・PC4 が出ない | リレーで転送されたパケットが R1 へ届いていない可能性。R1↔R2 間の疎通・ルーティングを再確認 |
| R2 が NTP に同期しない（`show ntp status` が unsynchronized） | R1 の `ntp master` 設定漏れ、R2 の `ntp server` の宛先 IP 誤り、しばらく時間をおいて再確認（同期には数分かかることがある） |
| Syslog サーバに何も記録されない | R1・R2 の `logging host 192.168.1.10` の設定漏れ、Syslog サーバの IP・GW 設定、`logging trap` のレベル設定 |
| リンク up/down のログが出ない | `shutdown` → `no shutdown` を確実に実行したか、対象インターフェースを取り違えていないか |

30 分試して解決しない場合は、状況（スクリーンショット + 試したこと）を
課題のコメントに書いて質問してください。
