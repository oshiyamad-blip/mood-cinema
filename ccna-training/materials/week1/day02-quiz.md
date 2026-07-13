# Day 2 小テスト: Cisco IOS の基本操作とデバイス初期設定

> 運用: 設問部分を小テスト課題の本文（またはドキュメント）に掲載。
> 「解答・解説」は講師用フォルダに保管し、**翌日 9:00** に受講者へ公開する。
> ルール: 10 問 / 30 分 / 教材参照なし。解答はコメントに「Q1: A」形式で提出。

---

## 設問

**Q1.** IOS のプロンプトが `Switch(config-if)#` と表示されているとき、現在のモード
として正しいものはどれか。

- A. インタフェースのサブ設定モード
- B. 特権 EXEC モード
- C. グローバル設定モード
- D. ユーザ EXEC モード

**Q2.** IOS のモード遷移に関する説明として正しいものはどれか。

- A. 特権 EXEC から `configure terminal` を実行するとグローバル設定モードへ移行する
- B. `Router(config-if)#` の状態で `end` を実行すると `Router(config)#` に戻る
- C. 特権 EXEC で `exit` を実行すると、ユーザ EXEC モード（`Router>`）に戻る
- D. `disable` はグローバル設定モードからユーザ EXEC へ直接戻るコマンドである

**Q3.** `enable secret` と `enable password` に関する説明として正しいものはどれか。

- A. `enable password` は MD5 相当のハッシュとして保存される
- B. 両方設定されている場合は `enable password` が優先される
- C. `enable secret` はハッシュとして保存され、両方設定されている場合は
  `enable secret` が優先される
- D. `enable secret` は平文のまま保存される

**Q4.** SSH を有効化するために必要な前提設定の組み合わせとして正しいものはどれか。

- A. `banner motd` と `exec-timeout` の設定のみ
- B. `line console 0` での `password` 設定のみ
- C. `enable secret` の設定のみ
- D. `hostname`・`ip domain-name`・`crypto key generate rsa`・ローカルユーザ・
  `transport input ssh`

**Q5.** スイッチに管理用 IP アドレスを設定する場所として正しいものはどれか。

- A. VLAN インタフェース（SVI。例: `interface vlan 1`）
- B. 任意のアクセスポート（例: `FastEthernet0/1`）
- C. AUX ポート
- D. `line vty 0 4`

**Q6.** running-config と startup-config に関する説明として正しいものはどれか。

- A. 設定変更を保存するには `copy startup-config running-config` を実行すればよい
- B. running-config は RAM 上にある現在の稼働設定で、電源を切ると消える
- C. startup-config は RAM 上にあり、電源を切ると消える
- D. running-config は NVRAM に保存され不揮発性である

**Q7.** コンソール接続の端末エミュレータに設定するデフォルトパラメータとして正しい
ものはどれか。

- A. 115200 bps、8-N-1、フロー制御あり
- B. 9600 bps、7-E-1、フロー制御なし
- C. 9600 bps、8-N-1、フロー制御なし
- D. 9600 bps、8-N-1、フロー制御あり

**Q8.** VTY 回線に `transport input ssh` を設定した場合の動作として正しいものは
どれか。

- A. Telnet と SSH の両方が許可される
- B. Telnet のみ許可され、SSH は拒否される
- C. Telnet と SSH の両方が拒否される
- D. SSH のみ許可され、Telnet は拒否される

**Q9.** SW1 の管理 IP への `ping` は成功するが、SSH だけ接続できない
（Connection refused 等）。最も可能性の高い原因はどれか。

- A. インタフェースに `no shutdown` を実行していない
- B. `crypto key generate rsa` を実行しておらず、RSA 鍵ペアが生成されていない
- C. デフォルトゲートウェイが未設定である
- D. ケーブル種別（ストレート/クロス）を間違えている

**Q10.**（記述）`enable secret`・`service password-encryption`・SSH 限定の VTY
（`transport input ssh`）を用いてデバイスへのアクセスを保護する初期設定の手順を、
使用する IOS コマンドを挙げながら説明せよ。

---

## 解答・解説（翌日公開・講師用）

| 問 | 解答 | 解説 |
|---|---|---|
| Q1 | A | `(config-if)#` はインタフェースのサブ設定モードのプロンプト。`#` だけなら特権EXEC、`(config)#` はグローバル設定モード |
| Q2 | A | `configure terminal`（省略形 `conf t`）は特権EXEC→グローバル設定モードへの遷移コマンド。`end`（Ctrl+Z）はどのサブモードからでも特権EXECまで一気に戻るため、config-ifからendするとRouter#になりBは誤り。特権EXECでの`exit`はユーザEXECに戻らずセッションそのものを終了するためCは誤り。`disable`は特権EXEC→ユーザEXECの遷移コマンドでグローバル設定モードからは使えないためDも誤り |
| Q3 | C | `enable secret` はMD5相当のハッシュで保存され、`enable password`（平文）と両方設定されていれば `enable secret` が優先される |
| Q4 | D | SSH有効化には hostname・ip domain-name・RSA鍵生成・ローカルユーザ・`transport input ssh` がすべて必要 |
| Q5 | A | L2スイッチは物理ポートにIPを持たず、SVI（`interface vlan`）に管理IPを設定する |
| Q6 | B | running-configはRAM上の現在の稼働設定で揮発性。startup-configはNVRAM上で不揮発性。保存コマンドは source→destination の順で `copy running-config startup-config` が正しく、Aはこれの逆方向（`copy startup-config running-config`）で、直前の未保存の変更を破棄してしまうため誤り |
| Q7 | C | コンソール接続のデフォルトは9600bps・8-N-1（データ8・パリティなし・ストップ1）・フロー制御なし |
| Q8 | D | `transport input ssh` を設定するとVTYで許可される接続プロトコルがSSHのみになり、Telnetは拒否される |
| Q9 | B | pingが成功している時点でL1〜L3（ケーブル・IP到達性・ゲートウェイ）は問題ない。SSH固有の前提はhostname→ip domain-name→`crypto key generate rsa`→ローカルユーザ→VTYの`login local`/`transport input ssh`で、どれかが欠けるとSSHのみ失敗する。RSA鍵未生成は代表的な原因。A・C・Dはping自体が失敗する原因であり、pingが通っている本問には当てはまらない |
| Q10 | 例 | 「`enable secret <pw>` で特権EXECパスワードをハッシュ保存する。`service password-encryption` で残る平文パスワード（enable passwordやline password）をType7で隠す。VTYは `line vty 0 4` → `transport input ssh` → `login local` でSSH接続のみ許可し、Telnetを排除する」等、3要素すべてに触れ、目的（ハッシュ化・平文の隠蔽・暗号化された接続への限定）を説明できていれば正解 |

**採点**: 1 問 10 点、70 点未満は翌朝再テスト。Q10 は趣旨が合っていれば 10 点。
