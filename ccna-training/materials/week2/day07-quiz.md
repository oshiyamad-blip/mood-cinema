# Day 7 小テスト: トランクと VLAN 設計

> 運用: 設問部分を小テスト課題の本文（またはドキュメント）に掲載。
> 「解答・解説」は講師用フォルダに保管し、**翌日 9:00** に受講者へ公開する。
> ルール: 10 問 / 30 分 / 教材参照なし。解答はコメントに「Q1: A」形式で提出。

---

## 設問

**Q1.** IEEE 802.1Q のタグは、イーサネットフレームのどこに挿入されるか。

- A. 送信元 MAC アドレスと EtherType の間
- B. 宛先 MAC アドレスの直前
- C. FCS（フレームチェックシーケンス）の直後
- D. IP ヘッダとデータの間

**Q2.** 802.1Q タグの構成として正しいものはどれか。

- A. TPID（4 バイト）のみ
- B. TCI（4 バイト）のみ
- C. VID（4 バイト）のみ
- D. TPID（2 バイト）+ TCI（2 バイト）の合計 4 バイト

**Q3.** VLAN ID（VID）フィールドのビット数と、実際に使用できる VLAN の範囲の
組み合わせとして正しいものはどれか。

- A. 12 ビット、1〜4094
- B. 8 ビット、1〜254
- C. 16 ビット、1〜65534
- D. 12 ビット、0〜4095

**Q4.** トランクリンク上で、ネイティブ VLAN に属するフレームはどのように
送信されるか。

- A. 802.1Q タグを付けて送信される
- B. ISL でカプセル化されて送信される
- C. タグを付けずに送信される
- D. 送信されずに破棄される

**Q5.** トランクの両端でネイティブ VLAN が不一致の場合に起こり得る現象は
どれか。

- A. トランクが即座にシャットダウンする
- B. すべての VLAN が自動的に削除される
- C. ポートが自動的に access モードへ変更される
- D. `%CDP-4-NATIVE_VLAN_MISMATCH` ログの出力や VLAN リーク

**Q6.** Catalyst 2960 でトランクを静的に設定するコマンドの手順として
正しいものはどれか。

- A. `switchport trunk encapsulation dot1q` の後に `switchport mode trunk` を必ず実行する
- B. `switchport mode trunk` のみでよく、encapsulation の指定コマンド自体が存在しない
- C. `switchport mode access` の後に `switchport trunk native vlan 1` を実行する
- D. VLAN データベースを先に削除してから `switchport mode trunk` を実行する

**Q7.** SW1 のトランクポートで、既に VLAN10 と VLAN20 が許可されている状態から
VLAN30 を追加で許可したい。正しいコマンドはどれか。

- A. `switchport trunk allowed vlan 30`
- B. `switchport trunk allowed vlan except 30`
- C. `switchport trunk allowed vlan add 30`
- D. `switchport trunk allowed vlan none 30`

**Q8.** SW1 のポートを `dynamic desirable`、SW2 のポートを `dynamic auto`
に設定して接続したところトランクが成立した。この状態で SW1 の
`show interfaces trunk` を実行すると、次の出力が得られた。

```
Port      Mode         Encapsulation  Status        Native vlan
Fa0/24    desirable    802.1q         trunking      99

Port      Vlans allowed on trunk
Fa0/24    10,20
```

この出力から読み取れる記述として正しいものはどれか。

- A. `dynamic desirable` と `dynamic auto` の組み合わせではトランクは成立
  しないため、この出力はあり得ない
- B. トランクは成立しており、ネイティブ VLAN は 99、VLAN30 のトラフィックは
  このトランクを通過できない
- C. トランクは成立しているが、ネイティブ VLAN は既定値の VLAN1 のままである
- D. Status が `trunking` であっても、Mode が `desirable` のままでは実際には
  アクセスポートとして動作している

**Q9.** 未使用ポートやエンドユーザー端末を接続するアクセスポートに対して、
DTP の悪用によるトランク乗っ取りを防ぐための設定として最も適切なものは
どれか。

- A. `switchport trunk allowed vlan none`
- B. `switchport mode access` と `switchport nonegotiate` の併用
- C. `switchport trunk native vlan 1`
- D. `switchport mode dynamic desirable`

**Q10.**（記述）VTP（VLAN Trunking Protocol）の 3 つのモード
（server / client / transparent）の違いを述べたうえで、リビジョン番号が
原因で発生し得るリスクについて 2〜3 文で説明せよ。

---

## 解答・解説（翌日公開・講師用）

| 問 | 解答 | 解説 |
|---|---|---|
| Q1 | A | 802.1Q タグ（4 バイト）は送信元 MAC アドレスと EtherType の間に挿入される。宛先 MAC の位置やタグの構成自体を誤解させる選択肢に注意 |
| Q2 | D | 802.1Q タグは TPID（2 バイト・固定値 0x8100）と TCI（2 バイト・PCP+DEI+VID）の合計 4 バイトで構成される |
| Q3 | A | VID は 12 ビットで 4096 通り（0〜4095）を表現できるが、0 と 4095 は予約のため使用可能な VLAN は 1〜4094 |
| Q4 | C | ネイティブ VLAN のフレームはタグを付けずに（アンタグで）送信される。既定のネイティブ VLAN は VLAN1 |
| Q5 | D | ネイティブ VLAN 不一致は CDP により検出され `%CDP-4-NATIVE_VLAN_MISMATCH` ログが出力される。異なる VLAN 間でトラフィックが漏れる VLAN リークも起こり得る |
| Q6 | B | 2960 は 802.1Q 専用機のため `switchport trunk encapsulation` コマンド自体が存在せず、`switchport mode trunk` のみで設定できる。encapsulation 指定が必要なのは 3560 など ISL/dot1q 両対応機 |
| Q7 | C | 既存の許可 VLAN リストに追加するには `add` キーワードが必須。`add` を付けずに実行するとリストが上書きされ、既存の VLAN10・VLAN20 が許可から外れてしまう |
| Q8 | B | `dynamic desirable`（積極的に働きかける）× `dynamic auto`（要求されれば応じる）はトランクが成立する組み合わせ。出力の Native vlan（99）と Vlans allowed on trunk（10,20）から、VLAN30 は許可 VLAN に含まれないため通過できないと読み取れる |
| Q9 | B | `switchport mode access` でモードを固定し、`switchport nonegotiate` で DTP フレームの送受信自体を止めることで、DTP を悪用したトランク乗っ取りを防止できる |
| Q10 | 例 | 「server は VLAN の作成・変更が可能で他へ広告する。client は同期を受けるのみで自身では VLAN を作成できない。transparent は同期に参加せず自身の VLAN データベースのみを保持するが、受け取った広告は転送する。VTP はリビジョン番号が高い広告を優先して反映するため、リビジョン番号の高い（古い）スイッチを誤って接続すると既存の VLAN データベースが上書き・消去されるリスクがある」等、3 モードの違いとリビジョン番号による上書きリスクの両方に触れていれば正解 |

**採点基準**: 1 問 10 点（満点 100 点）。70 点未満は翌朝再テストを実施する。
Q10 は趣旨が合っていれば 10 点（3 モードの違いとリビジョン番号のリスクの
両方に触れていることを目安とする）。
