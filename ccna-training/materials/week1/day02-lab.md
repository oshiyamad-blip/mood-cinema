# Day 2 ラボ手順書: IOS の基本操作とデバイス初期設定

> 配置先: ドキュメント `02_ラボ手順書 > Week1 > Day02`
> 所要時間の目安: 2.5 時間 ／ 使用ツール: Cisco Packet Tracer 9.x

## ゴール

- ルータ 1 台・スイッチ 2 台に、ホスト名・`enable secret`・コンソール/VTY パスワード・
  管理 IP アドレスを設定できる
- SSHv2 を有効化し、Telnet を排除した状態を作れる
- Admin-PC から各機器へ SSH でリモートログインし、show コマンドで状態を確認できる
- 設定を startup-config に保存し、`show running-config` で保存内容を検証できる

## 完成トポロジ

```
                 Gi0/0                    Fa0/1
        R1 ─────────────── SW1 ─────────────────── PC1
   192.168.1.1/24     Fa0/24  |  Fa0/2       192.168.1.101/24
                               |   \
                               |    \___ Admin-PC (192.168.1.100/24)
                          Fa0/23
                               |
                          Fa0/23
                              SW2 ─────────────────── PC2
                          192.168.1.12/24  Fa0/1  192.168.1.102/24
```

※ コンソール接続（ロールオーバーケーブル）は Admin-PC の RS232 ポートと、設定対象の
機器（R1 → SW1 → SW2 の順）の Console ポートを、手順ごとに順次つなぎ替えて使用します。

### IP アドレス割り当て表

| 機器 | インタフェース | IP アドレス | サブネットマスク | デフォルトゲートウェイ |
|---|---|---|---|---|
| R1 | Gi0/0 | 192.168.1.1 | 255.255.255.0 | — |
| SW1 | VLAN 1（SVI） | 192.168.1.11 | 255.255.255.0 | 192.168.1.1 |
| SW2 | VLAN 1（SVI） | 192.168.1.12 | 255.255.255.0 | 192.168.1.1 |
| PC1 | NIC | 192.168.1.101 | 255.255.255.0 | 192.168.1.1 |
| PC2 | NIC | 192.168.1.102 | 255.255.255.0 | 192.168.1.1 |
| Admin-PC | NIC | 192.168.1.100 | 255.255.255.0 | 192.168.1.1 |

### 配線一覧

| 接続元 | ポート | 接続先 | ポート | ケーブル種別 |
|---|---|---|---|---|
| R1 | Gi0/0 | SW1 | Fa0/24 | ストレート |
| SW1 | Fa0/1 | PC1 | FastEthernet0 | ストレート |
| SW1 | Fa0/2 | Admin-PC | FastEthernet0 | ストレート |
| SW1 | Fa0/23 | SW2 | Fa0/23 | クロス |
| SW2 | Fa0/1 | PC2 | FastEthernet0 | ストレート |

---

## 手順 1: R1 へのコンソール接続とモード遷移確認（5 分）

1. Admin-PC の [Desktop] → **Terminal** を開き、R1 の Console ポートへロールオーバー
   ケーブルで接続する（設定はデフォルトの 9600/8-N-1 のままで OK）
2. 接続後に表示される `Router>` プロンプトで `enable` を実行し、`Router#` に
   変わることを確認する
3. `configure terminal` を実行し、`Router(config)#` に変わることを確認する

## 手順 2: R1 の基本設定（ホスト名・enable secret・バナー）（10 分）

```
Router(config)# hostname R1
R1(config)# enable secret cisco123
R1(config)# enable password cisco456
R1(config)# banner motd #Authorized access only#
```

## 手順 3: R1 のコンソール保護と管理 IP（15 分）

```
R1(config)# line console 0
R1(config-line)# password consolepw
R1(config-line)# login
R1(config-line)# logging synchronous
R1(config-line)# exit
R1(config)# interface gigabitEthernet 0/0
R1(config-if)# ip address 192.168.1.1 255.255.255.0
R1(config-if)# no shutdown
R1(config-if)# exit
```

## 手順 4: R1 の SSH 前提条件の設定（15 分）

```
R1(config)# ip domain-name example.local
R1(config)# crypto key generate rsa
```

鍵長を聞かれたら `1024` を入力します。

```
How many bits in the modulus [512]: 1024
```

続けて SSHv2 への固定とローカルユーザを作成します。

```
R1(config)# ip ssh version 2
R1(config)# username admin privilege 15 secret adminpw
```

## 手順 5: R1 の VTY を SSH 限定に設定（5 分）

```
R1(config)# line vty 0 4
R1(config-line)# transport input ssh
R1(config-line)# login local
R1(config-line)# exit
```

## 手順 6: R1 の保存と確認（10 分）

```
R1(config)# end
R1# copy running-config startup-config
```

続けて以下のコマンドを実行し、結果を記録します。

```
R1# show ip ssh
R1# show ip interface brief
```

## 手順 7: SW1 の基本設定（10 分）

Admin-PC のロールオーバーケーブルを SW1 の Console ポートへつなぎ替え、手順 2・3 と
同様に基本設定を行います。

```
Switch(config)# hostname SW1
SW1(config)# enable secret cisco123
SW1(config)# enable password cisco456
SW1(config)# banner motd #Authorized access only#
SW1(config)# line console 0
SW1(config-line)# password consolepw
SW1(config-line)# login
SW1(config-line)# logging synchronous
SW1(config-line)# exit
```

## 手順 8: SW1 の管理 IP（SVI）とデフォルトゲートウェイ（10 分）

```
SW1(config)# interface vlan 1
SW1(config-if)# ip address 192.168.1.11 255.255.255.0
SW1(config-if)# no shutdown
SW1(config-if)# exit
SW1(config)# ip default-gateway 192.168.1.1
```

## 手順 9: SW1 の SSH 有効化（10 分）

```
SW1(config)# ip domain-name example.local
SW1(config)# crypto key generate rsa
```

鍵長は `1024` を入力します。

```
SW1(config)# ip ssh version 2
SW1(config)# username admin privilege 15 secret adminpw
SW1(config)# line vty 0 4
SW1(config-line)# transport input ssh
SW1(config-line)# login local
SW1(config-line)# exit
```

## 手順 10: SW2 も同様に設定（15 分）

Admin-PC のロールオーバーケーブルを SW2 の Console ポートへつなぎ替え、手順 7〜9 を
繰り返します。ホスト名は `SW2`、管理 IP は `192.168.1.12 255.255.255.0` とし、それ
以外のパスワード・SSH 設定は SW1 と同じ値で構いません。

## 手順 11: 全機器の保存と service password-encryption の比較（10 分）

R1・SW1・SW2 それぞれで設定を保存します。

```
copy running-config startup-config
```

SW1 で `show running-config` を実行し、`enable password`・`enable secret`・
`line` 配下の `password` の表示を確認したら、続けて次のコマンドを実行して差分を
観察します。

```
SW1(config)# service password-encryption
```

再度 `show running-config` を実行し、`enable password` とコンソール/VTY の
`password` の表示がどう変化したか、また `enable secret` の行に変化があったかを
記録します。

## 手順 12: PC の IP 設定と疎通確認（10 分）

1. PC1・PC2・Admin-PC それぞれの [Desktop] → **IP Configuration** で、上記の IP
   アドレス割り当て表のとおりに IP アドレス・サブネットマスク・デフォルトゲートウェイ
   を設定する
2. Admin-PC の Command Prompt から、R1・SW1・SW2 へそれぞれ ping を実行し、すべて
   成功することを確認する

```
ping 192.168.1.1
ping 192.168.1.11
ping 192.168.1.12
```

## 手順 13: Admin-PC から SW1 へ SSH 接続（10 分）

Admin-PC の Command Prompt から次のコマンドを実行します。

```
ssh -l admin 192.168.1.11
```

パスワード `adminpw` を入力してログインし、リモートセッション上で次のコマンドを
実行して結果を記録します。

```
SW1# show ip interface brief
```

## 手順 14: SW1 での状態確認（5 分）

SW1 のコンソール側（または SSH セッション）で、次のコマンドを実行し出力を記録します。

```
SW1# show ssh
SW1# show mac address-table
SW1# show version
```

## 手順 15: Telnet が拒否されることの確認（10 分）

Admin-PC の Command Prompt から R1 へ Telnet 接続を試みます。

```
telnet 192.168.1.1
```

`transport input ssh` を設定した VTY では Telnet が拒否される（接続が確立しない）
ことを確認し、結果を記録します。

### 観察レポート（コメント提出用）

以下 3 問に答えて、課題のコメントに記入してください。

1. `service password-encryption` を有効化する前と後で、`show running-config` の
   `enable password`・`line` 配下の `password`・`enable secret` の表示はそれぞれ
   どう変わったか。`enable secret` が影響を受けなかった理由は何か。
2. Admin-PC から SW1 へ SSH できたが、`transport input ssh` を設定した VTY に対して
   Telnet 接続は成功したか失敗したか。その結果になった理由を述べよ。
3. SW1 の VLAN1 インタフェースに `ip default-gateway` を設定しなかった場合、別
   サブネットの PC から SW1 へ管理アクセスできるか。スイッチが管理 IP を SVI に
   持つ理由とあわせて説明せよ。

## 提出方法

1. ファイルを `day02_氏名.pkt` の名前で保存し、Backlog のラボ課題に**添付**する
2. 手順 6・13・14・15 の実行結果（スクリーンショット可）と、観察レポートの
   3 問の解答を課題の**コメント**に貼る
3. 課題の状態を「処理済み」に変更する

## うまくいかないとき

| 症状 | 確認すること |
|---|---|
| コンソールに何も表示されない | ケーブルの接続先ポート、端末エミュレータのビットレート（9600）設定 |
| `enable secret` を設定したのに `Router#` のまま反映されない | コマンドの打ち間違い、`end` または `exit` でモードを抜けたか |
| SSH で接続できない（Connection refused 等） | `crypto key generate rsa` を実行したか、`ip ssh version 2` が設定済みか、VTY の `transport input` に `ssh` が含まれているか |
| SSH のパスワードが通らない | `username` コマンドのユーザ名・パスワードと、ログイン時に入力した値の一致、`login local` の設定漏れ |
| SW1 で ping が届くが SSH が届かない | `ip domain-name` の設定漏れ、RSA 鍵の未生成、VTY の `login local` 設定漏れ |
| 別サブネットから SW1 に管理アクセスできない | `ip default-gateway` の設定漏れ（SVI に IP はあるがゲートウェイ未設定） |
| `no shutdown` 後もインタフェースが up/up にならない | 対向ポートの状態、ケーブル種別（ストレート/クロス）の誤り |

30 分試して解決しない場合は、状況（スクリーンショット + 試したこと）を
課題のコメントに書いて質問してください。
