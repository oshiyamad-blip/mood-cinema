// CCNA 研修カリキュラムの課題データ定義
// 01-curriculum.md の内容と対応。変更する場合は両方を更新すること。

export const ISSUE_TYPES = [
  { name: '講義', color: '#7ea800' },
  { name: 'ラボ', color: '#2779ca' },
  { name: '小テスト', color: '#e30000' },
  { name: '週次テスト', color: '#ff9200' },
  { name: '模試', color: '#814fbc' },
]

export const CATEGORIES = [
  '1-ネットワーク基礎',
  '2-ネットワークアクセス',
  '3-IPコネクティビティ',
  '4-IPサービス',
  '5-セキュリティ基礎',
  '6-自動化とプログラマビリティ',
]

// week: 1〜5 がマイルストーンに対応
export const MILESTONES = [
  { week: 1, name: 'Week1-ネットワーク基礎' },
  { week: 2, name: 'Week2-ネットワークアクセス' },
  { week: 3, name: 'Week3-IPコネクティビティとIPサービス' },
  { week: 4, name: 'Week4-セキュリティと自動化' },
  { week: 5, name: 'Week5-試験対策' },
]

// 試験対策フェーズ（Day 21〜25）。詳細は 07-exam-phase.md
// type は ISSUE_TYPES の名前、day は開始日からの営業日数（Day1 = 1）
export const EXAM_PHASE_ISSUES = [
  {
    day: 21, type: '模試', summary: '[Day21] 模試①: 本試験形式（100問/120分）',
    description: [
      '## ルール',
      '- 100 問 / 制限時間 120 分・本試験形式（教材参照なし）',
      '- 設問は講師が当日配布（04_講師用の模試①を使用）',
      '- 解答はこの課題のコメントに「Q1: A」形式で提出',
      '',
      '## 提出後',
      '- セルフ採点し、点数とドメイン別正答率をコメントに記録',
    ].join('\n'),
  },
  {
    day: 21, type: '講義', summary: '[Day21] 誤答分析①: 模試①の誤答を誤答ノートへ・弱点ドメイン特定',
    description: [
      '## 進め方',
      '1. 模試①の全誤答を誤答ノートに記録（エラータイプ分類を忘れずに）',
      '2. ドメイン別正答率を算出し、弱点ドメインを 2 つ特定してコメント',
      '3. 明日の補強計画（読む教材・やり直すラボ）を担当講師と合意',
    ].join('\n'),
  },
  {
    day: 22, type: 'ラボ', summary: '[Day22] 弱点補強①: 弱点ドメインの教材再読・追加演習・ラボやり直し',
    description: [
      '## 進め方',
      '- 午前: 弱点ドメイン 1 の補強（教材再読 + 該当 Day の確認問題を解き直し）',
      '- 午後: 弱点ドメイン 2 の補強 + 苦手ラボのやり直し（Packet Tracer）',
      '',
      '## 完了条件',
      '- [ ] 補強した内容と「わかったこと」をコメントに記録した',
    ].join('\n'),
  },
  {
    day: 23, type: '模試', summary: '[Day23] 模試②: 本試験形式（100問/120分）',
    description: [
      '## ルール',
      '- 模試①と同じ運用（設問は講師が当日配布・コメント提出・セルフ採点）',
      '- 目標: 85% 以上（受験 GO 基準の 1 回目）',
    ].join('\n'),
  },
  {
    day: 23, type: '講義', summary: '[Day23] 誤答分析②: 模試②の誤答分析＋誤答ノート総ざらい',
    description: [
      '## 進め方',
      '1. 模試②の全誤答を誤答ノートに記録',
      '2. 誤答ノートの未卒業エントリ（✅なし）をすべて解き直す',
      '3. ドメイン別正答率の推移（模試①→②）をコメントに記録',
    ].join('\n'),
  },
  {
    day: 24, type: 'ラボ', summary: '[Day24] 弱点補強②＋総仕上げ: 暗記事項の最終確認と制限時間付きラボ',
    description: [
      '## 進め方',
      '- 午前: 残弱点の補強 + 頻出暗記事項の最終確認（ポート番号・AD値・コマンド）',
      '- 午後: 総仕上げラボ（Day20 総合演習の類題を制限時間 2 時間で）',
    ].join('\n'),
  },
  {
    day: 25, type: '模試', summary: '[Day25] 模試③: 最終判定（100問/120分）',
    description: [
      '## ルール',
      '- 本試験形式・最終判定。受験 GO 基準: 模試 2 回連続 85% 以上 +',
      '  全ドメイン 70% 以上 + 誤答ノート卒業 9 割',
      '- 結果をコメントに記録 → 講師が GO 判定',
    ].join('\n'),
  },
  {
    day: 25, type: '講義', summary: '[Day25] 受験準備: GO判定・受験予約・直前ガイダンス',
    description: [
      '## 進め方',
      '1. 講師の GO 判定を受ける（判定根拠は課題コメントに記録される）',
      '2. GO → Pearson VUE で最短の受験可能日を予約（予約完了をコメント）',
      '3. 直前ガイダンス: 当日の流れ・時間配分・見直し戦略',
      '4. 未達の場合 → 補強計画を立てて延長（07-exam-phase.md 参照）',
    ].join('\n'),
  },
]

// categories はカテゴリー名の配列（CATEGORIES の値）
// weeklyTest: true の日は小テストの代わりに週次テストを作成する
export const DAYS = [
  {
    day: 1, week: 1, categories: ['1-ネットワーク基礎'],
    theme: 'ネットワークの全体像と OSI / TCP-IP モデル',
    lecture: 'ネットワーク構成要素、2階層/3階層・Spine-Leaf トポロジ、OSI 参照モデルと TCP/IP スタック、カプセル化',
    lab: 'PT入門 — 最小構成の作成とカプセル化の観察',
    quiz: 'OSI モデルとカプセル化',
  },
  {
    day: 2, week: 1, categories: ['1-ネットワーク基礎'],
    theme: 'Cisco IOS の基本操作とデバイス初期設定',
    lecture: 'CLI アクセス、IOS の各モード、基本設定（hostname・パスワード・SSH）、設定の保存、show コマンド',
    lab: 'スイッチ・ルータの初期設定と SSH 有効化',
    quiz: 'IOS モードと基本設定コマンド',
  },
  {
    day: 3, week: 1, categories: ['1-ネットワーク基礎'],
    theme: 'IPv4 アドレッシングとサブネット化',
    lecture: 'IPv4 構造、私設アドレス、サブネットマスク、サブネット計算、VLSM',
    lab: 'VLSM によるサブネット設計とアドレス割り当て',
    quiz: 'サブネット計算と VLSM',
  },
  {
    day: 4, week: 1, categories: ['1-ネットワーク基礎'],
    theme: 'IPv6 アドレッシング',
    lecture: 'IPv6 表記ルール、アドレスタイプ（GUA/ULA/リンクローカル等）、EUI-64、SLAAC',
    lab: 'IPv6 静的設定と SLAAC の構成・確認',
    quiz: 'IPv6 表記とアドレスタイプ',
  },
  {
    day: 5, week: 1, categories: ['1-ネットワーク基礎'], weeklyTest: true,
    theme: 'TCP / UDP・スイッチング動作・物理層',
    lecture: 'TCP と UDP、主要ポート番号、スイッチの MAC 学習と転送、ケーブル・PoE、仮想化基礎',
    lab: 'MAC アドレステーブルと ARP の観察、速度/デュプレックス不一致の切り分け',
    quiz: 'Week1 全範囲（週次テスト①）',
  },
  {
    day: 6, week: 2, categories: ['2-ネットワークアクセス'],
    theme: 'VLAN の基礎',
    lecture: 'VLAN の目的、アクセスポート、データ VLAN と音声 VLAN、ポート割り当て',
    lab: 'VLAN 作成と PC 収容、分離の確認',
    quiz: 'VLAN の概念とアクセスポート設定',
  },
  {
    day: 7, week: 2, categories: ['2-ネットワークアクセス'],
    theme: 'トランクと VLAN 設計',
    lecture: '802.1Q タギング、ネイティブ VLAN、トランク設定、DTP、VTP 概要',
    lab: 'スイッチ間トランクの構成とネイティブ VLAN 不一致の障害演習',
    quiz: '802.1Q とトランク設定',
  },
  {
    day: 8, week: 2, categories: ['2-ネットワークアクセス', '3-IPコネクティビティ'],
    theme: 'VLAN 間ルーティング',
    lecture: 'Router-on-a-Stick、L3 スイッチと SVI、ルーテッドポート',
    lab: 'Router-on-a-Stick と SVI 方式による VLAN 間ルーティング',
    quiz: 'サブインターフェースと SVI',
  },
  {
    day: 9, week: 2, categories: ['2-ネットワークアクセス'],
    theme: 'STP と EtherChannel',
    lecture: 'ブリッジングループ、ルートブリッジ選出、ポートロール、RSTP、PortFast/BPDU Guard、EtherChannel（LACP）',
    lab: '冗長トポロジでの STP 観察と LACP EtherChannel の構成',
    quiz: 'STP と EtherChannel',
  },
  {
    day: 10, week: 2, categories: ['2-ネットワークアクセス'], weeklyTest: true,
    theme: '無線 LAN と検出プロトコル',
    lecture: '無線の基礎、AP と WLC のアーキテクチャ（CAPWAP）、WPA2/WPA3、CDP/LLDP',
    lab: 'WLC + AP による WLAN（WPA2-PSK）構築と CDP/LLDP の確認',
    quiz: 'Week2 全範囲（週次テスト②）',
  },
  {
    day: 11, week: 3, categories: ['3-IPコネクティビティ'],
    theme: 'ルーティングの基礎と静的ルート',
    lecture: 'ルーティングテーブル、経路選択（ロンゲストマッチ・AD・メトリック）、静的/デフォルト/フローティングスタティックルート',
    lab: 'IPv4/IPv6 静的ルートとフローティングスタティックの検証',
    quiz: 'ルーティングテーブルと静的ルート',
  },
  {
    day: 12, week: 3, categories: ['3-IPコネクティビティ'],
    theme: 'OSPFv2（シングルエリア）',
    lecture: 'リンクステート、ネイバー確立の条件、DR/BDR、コスト、router-id、パッシブインターフェース',
    lab: 'シングルエリア OSPF の構成とコストによる経路制御',
    quiz: 'OSPF の基礎',
  },
  {
    day: 13, week: 3, categories: ['3-IPコネクティビティ'],
    theme: 'OSPF 応用と FHRP',
    lecture: 'OSPF トラブルシューティング、デフォルトルート配布、FHRP の比較と HSRP の動作',
    lab: 'OSPF 障害切り分け演習と HSRP によるゲートウェイ冗長化',
    quiz: 'OSPF トラブルシュートと HSRP',
  },
  {
    day: 14, week: 3, categories: ['4-IPサービス'],
    theme: 'NAT',
    lecture: '静的 NAT / 動的 NAT / PAT、inside/outside・local/global の用語、確認コマンド',
    lab: '静的 NAT → 動的 NAT → PAT の構成と変換テーブルの観察',
    quiz: 'NAT の用語と設定',
  },
  {
    day: 15, week: 3, categories: ['4-IPサービス'], weeklyTest: true,
    theme: 'IP サービス総合',
    lecture: 'DHCP（DORA・リレー）、DNS、NTP、SNMP、Syslog、SSH/FTP/TFTP、QoS 概要',
    lab: 'DHCP サーバ + リレー、NTP、Syslog の構成',
    quiz: 'Week3 全範囲（週次テスト③）',
  },
  {
    day: 16, week: 4, categories: ['5-セキュリティ基礎'],
    theme: 'セキュリティの概念とデバイス保護',
    lecture: '脅威と対策の用語、攻撃の種類、AAA、パスワードポリシーと多要素認証、ユーザ教育',
    lab: 'デバイス堅牢化（enable secret、SSH 限定 VTY、ローカル AAA、未使用ポート閉塞）',
    quiz: 'セキュリティ用語と AAA',
  },
  {
    day: 17, week: 4, categories: ['5-セキュリティ基礎'],
    theme: 'ACL',
    lecture: '標準/拡張 ACL、暗黙の deny、ワイルドカードマスク、適用位置、VTY への適用',
    lab: '要件に基づく拡張 ACL の実装と検証',
    quiz: 'ワイルドカードマスクと ACL',
  },
  {
    day: 18, week: 4, categories: ['5-セキュリティ基礎'],
    theme: 'レイヤ 2 セキュリティと VPN 概要',
    lecture: 'DHCP スヌーピング、DAI、ポートセキュリティ、サイト間/リモートアクセス VPN・IPsec 概要',
    lab: 'ポートセキュリティと DHCP スヌーピングの構成・violation 確認',
    quiz: 'L2 セキュリティと VPN の分類',
  },
  {
    day: 19, week: 4, categories: ['6-自動化とプログラマビリティ'],
    theme: '自動化とプログラマビリティ',
    lecture: 'SDN とコントローラベース NW、Catalyst Center、REST API、JSON、Ansible/Terraform、AI のネットワーク運用への影響',
    lab: 'JSON 解析演習とネットワークコントローラへの REST API 呼び出し体験',
    quiz: 'REST API・JSON・構成管理ツール',
  },
  {
    day: 20, week: 4, weeklyTest: true, finalTest: true,
    categories: [
      '1-ネットワーク基礎', '2-ネットワークアクセス', '3-IPコネクティビティ',
      '4-IPサービス', '5-セキュリティ基礎', '6-自動化とプログラマビリティ',
    ],
    theme: '総復習と総合演習',
    lecture: '全ドメインの弱点復習（週次テストの誤答分析）、試験概要と受験手続き',
    lab: '総合演習 — 小規模企業ネットワークの構築（VLAN/OSPF/HSRP/DHCP/NAT/ACL/SSH/ポートセキュリティ）',
    quiz: '修了テスト（全範囲 60 問 / 120 分）',
  },
]

export function lectureDescription(d) {
  return [
    '## 学習目標',
    `- ${d.lecture}`,
    '',
    '## 教材',
    `- ドキュメント: 「01_教材 > Week${d.week} > Day${String(d.day).padStart(2, '0')}_${d.theme}」を参照`,
    '',
    '## 進め方',
    '1. 教材ドキュメントを通読する（3.5h 目安）',
    '2. 理解チェック（教材末尾の確認問題）を解く',
    '3. 疑問点はこの課題のコメントに書き残す → 講師が回答',
    '',
    '## 完了条件',
    '- [ ] 教材を通読した',
    '- [ ] 確認問題を解いた',
    '- [ ] 疑問点をコメントした（なければ「なし」とコメント）',
  ].join('\n')
}

export function labDescription(d) {
  return [
    '## ゴール',
    `- ${d.lab}`,
    '',
    '## 手順書',
    `- ドキュメント: 「02_ラボ手順書 > Week${d.week} > Day${String(d.day).padStart(2, '0')}」を参照`,
    '- 開始用ファイル（.pkt / .pka）はこの課題の添付を使用',
    '',
    '## 提出物',
    `- 完成した .pkt ファイル（命名: day${String(d.day).padStart(2, '0')}_氏名.pkt）をこの課題に添付`,
    '- 検証コマンドの実行結果をコメントに貼る',
    '',
    '## 完了条件',
    '- [ ] 要件どおりの疎通 / 動作を確認した',
    '- [ ] 完成ファイルを添付した',
  ].join('\n')
}

export function quizDescription(d) {
  if (d.finalTest) {
    return [
      '## 修了テスト',
      '- 全範囲 60 問 / 制限時間 120 分（本試験形式）',
      '- 正答率 75% 以上 + 総合演習ラボの要件充足で研修修了',
      '- 設問は講師が当日に本文へ追記（または配布）します',
      '',
      '## 提出',
      '- 解答はこの課題のコメントに「Q1: A」の形式で提出',
    ].join('\n')
  }
  if (d.weeklyTest) {
    return [
      `## 週次テスト（Week${d.week}）`,
      `- 範囲: ${d.quiz}`,
      '- 25 問 / 制限時間 60 分・教材参照なし',
      '- 正答率 70% 以上で当該週のマイルストーン完了',
      '- 設問は講師が当日に本文へ追記（または配布）します',
      '',
      '## 提出',
      '- 解答はこの課題のコメントに「Q1: A」の形式で提出',
    ].join('\n')
  }
  return [
    '## ルール',
    '- 10 問 / 制限時間 30 分・教材参照なしで解くこと',
    '- 解答はこの課題の**コメント**に「Q1: A」の形式で提出',
    '- 正答率 70% 未満の場合は翌朝に再テスト',
    '',
    '## 設問',
    `- 範囲: ${d.quiz}`,
    '- 設問は「03_小テスト」の当日ドキュメント（または本文への追記）で公開します',
    '',
    '## 解答・解説',
    '- 翌日 9:00 に「03_小テスト解答解説」のリンクをコメントで公開',
  ].join('\n')
}
