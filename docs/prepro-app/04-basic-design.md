# 基本設計書：撮影準備の台帳アプリ（仮称 KOBAN）

| 項目 | 内容 |
|---|---|
| 文書バージョン | 0.2（全面改訂） |
| 作成日 | 2026-10-12 |
| 改訂日 | 2026-10-12 |
| 入力 | `02-evaluation.md` v0.2、`03-requirements.md` v0.2、`08-adversarial-review.md` |
| 対象範囲 | フェーズ1（20週の Web ベータ）の全機能。フェーズ2・3は方式のみ（第25章、第12章） |
| 位置づけ | 既存プロダクトとは独立した新規リポジトリで実装する前提の設計 |
| 文書間の優先 | 要件は `03` を正とする。方式は本書、関数・SQL・画面項目などの細部は `05-detailed-design.md` v0.2 を正とする。v0.2 の時点で本書と `05` の食い違いは無い |

### v0.1 からの主な変更

| 変更 | 内容 | 主な箇所 |
|---|---|---|
| 製品の定義 | 「台本から香盤表を作る統合アプリ」から「香盤を事故らずに回し続ける台帳」へ。設計方針に台本の秘匿（V5）を加えた | 第1章 |
| フェーズ1の範囲 | Web（PWA）だけの無料ベータ、20週。改訂の追従、根拠、配布と確認、版の履歴、上書きの復元、Excel/CSV 取り込み、話、本文の暗号化、退会をフェーズ1へ。課金・メンバー・ストア版・ショットリスト以降はフェーズ2へ | 第2・24・25章 |
| データモデル | 話（`episodes`）、印の根拠、尺（秒）と撮影見積（分）の分離、人物の区分、柱からのロケ地抽出、日々スケの上書きを欄ごとの行に分割、配布、暗号化の鍵、墓標 | 第6・7章 |
| 識別子 | 論理的に一意な行（香盤のセル、撮影日の割り当て、日々スケなど）は決定的な ID にする | 7.2 |
| 権限 | 内部関数とテーブルを公開しないスキーマへ移し、関数の実行権限を既定から取り消す。テーブルへの直接の書き込みは不可。作品の行は管理者だけが許可した列だけ書ける | 7.6 |
| 同期 | 行ごとの例外の捕捉と結果、同じ版の再送は受理済み、送信待ちが新しい編集を巻き戻さない、サーバーの時計で未来の版を拒否、引き込みを1文の SQL に、作品登録の冪等化、削除時刻をサーバー時刻に、墓標、上書き履歴を作品の存続中は残す | 第8章 |
| 暗号化 | 作品ごとの鍵で台本の本文を端末で暗号化。アカウントの鍵、復旧コード、端末間の受け渡し | 第9章 |
| 配布 | フェーズ2からフェーズ1へ。閲覧者ごとの表示、確認、差分つきの再配布、鍵の保管場所と IV の規定、濫用対策、LINE の文面 | 第11章 |
| LLM | AI 下書き（フェーズ2、許可制）と接続口（フェーズ2は読み取り、フェーズ3は提案）の方式を追加 | 第12章 |
| 画面と帳票 | 香盤表を高密度に。取り込み、改訂の差分と影響、配布と確認、上書きの確認と復元、版の履歴、撮影日一覧を追加。用紙の選択、スマホ幅の日々スケ、衣裳表・小道具表・出番表 | 第13・14章 |
| フォント | Google Fonts を実行時に読まず、自前で同梱する | 14.2 |
| 費用と計画 | 独自 SMTP（Resend Pro など）を計上。RevenueCat はフェーズ2。1週目に同期エンジンを判断する20週の計画 | 第23・24章 |
| 誤りの訂正 | 例の曜日（2026-10-20 は火曜、10-21 は水曜）、章番号の参照、人物列の並び順を明示 | 全体 |

## 1. 設計方針

設計判断で迷ったときは、次の7原則の上から順に優先する。

1. **利用者のデータを失わない。** 削除はすべてソフト削除で、物理削除はサーバーの時刻でゴミ箱に入って30日を過ぎたものだけ。同期・改訂の取り込み・制限の判定のどれも、本文を黙って消さない。他の端末や他の人の変更で上書きされた版は、作品が存続する間すべて残す。迷ったら消さない方に倒す。
2. **台本の本文は、運営者にも読めない形で預かる。** 本文は端末で作品ごとの鍵で暗号化してから送る。本文を解析の改善・統計・AI の学習・第三者への提供に使わない。原則1と衝突するのは「鍵を失うと本文が読めない」場面だけで、本文に限っては秘匿を優先し、復旧コード・端末内の自動バックアップ・台本ファイルの再取り込みで補う。構造のデータ（柱・人物・撮影日）は暗号化しないので、鍵を失っても台帳は動く。
3. **端末だけで全部動く。** 端末内のデータベースが正で、クラウドは行単位の複製。電波のないロケ地で、閲覧・編集・PDF 出力が完結する。
4. **一つの台帳、複数の見え方（V1）。** 香盤表・総スケ・日々スケは保存せず、シーン・要素・人物・撮影日から毎回同じ関数で導出する。時刻のように両方に出る値は、正本を一か所にだけ置く。
5. **すべての印に根拠を残し、機械で検査する（V3）。** 印がどこから来たか（台本の行、手入力、Excel、AI の提案）を行に持ち、NG日・時間・重複・抜け漏れを編集のたびに検査する。判断は人に残し、検査は割り当てを止めない。
6. **個人情報は必要な人にだけ。** 連絡先は別テーブルにして権限で守る。配布の中身は端末で暗号化し、配布の基盤は中身を読めない。
7. **固定費を小さく。** マネージドサービスの無料枠と低額プランの範囲で回る構成にする。

## 2. 要件からの確定事項

| 区分 | 要件での記述 | 基本設計での決定 | 理由 |
|---|---|---|---|
| 確定 | クライアントは React＋TypeScript。フェーズ1は Web（PWA） | フェーズ1は **Web（PWA）だけ**。フェーズ2で同じコードを **Capacitor** でストア版にする | 縦書き台本を CSS `writing-mode` で素直に描け、巨大な香盤表も DOM で描ける。ストア審査とストア課金をフェーズ1から外せる |
| 確定 | 同期は行単位の最終更新優先 | **行単位の最終更新優先（LWW）＋上書き履歴**。ただし送られなかった列は現行の値を残す（8.3） | 別の行の編集は自然に両立し、同じ行の衝突も負けた版を履歴に残せる。古いアプリや鍵の無い端末が、知らない列や本文を消さない |
| 確定 | 同期エンジンは自作か既製品か、最初の1週間で決める | **1週目に PowerSync を試し、判断基準（8.11）で決める**。本書と `05` は自作の場合を正として書き、既製品を採った場合に変わる箇所を明記する | どちらでも、サーバー側の書き込みの判定（8.3）は自前で持つ |
| 確定 | 本文は端末側で暗号化 | **作品ごとの鍵（AES-256-GCM）**で暗号化し、作品の鍵をアカウントの鍵で包む。アカウントの鍵は復旧コードと端末間の受け渡しで戻せる（第9章） | 運営者・クラウド事業者が本文を読めない仕組みにする |
| 確定 | 配布はリンクで、アプリもアカウントも不要 | **Cloudflare Worker＋R2＋D1**。中身は端末で暗号化し、鍵は URL のフラグメントに置く（第11章） | 本体が止まっても閲覧でき、配布の基盤は連絡先を平文で持たない |
| 確定 | 日照 | 日の出入りは**端末で計算**（suncalc） | 外部 API に頼らず、オフラインでも出る |
| 確定 | 地図・住所検索 | **国土地理院**の住所検索 API と地理院タイル（MapLibre） | 無料で商用利用でき、日本の住所に強い |
| 確定 | PDF は端末内で生成 | **@react-pdf/renderer**＋同梱フォント。日本語の折り返しと速度は1週目の試作で実測する | 個人情報をサーバーへ送らない |
| 確定 | ログイン | **メールの確認コード（6桁）だけ**。送信は独自 SMTP | Supabase 標準のメール送信は、プロジェクトのメンバー宛てにしか届かず、1時間2通が上限である |
| 確定 | 無料枠を端末だけの作品にも適用 | 端末とサーバーの両方で判定する（第16章） | ログインしなければ何本でも作れる抜け穴を塞ぐ |
| 明示 | 撮影難度（v0.1 の要件にあった） | **持たない** | `03` v0.2 の要件から外れた。黙って落としたのではないことを記す |
| 明示 | 香盤表の人物列の並び | **既定は出番の多い順**。名前順・手動も選べる | v0.1 の基本設計は役名順、詳細設計は出番順で食い違っていた。量産現場の香盤表は主要人物を左に置く慣習に合わせる |

## 3. システム構成

```
┌──────────────────────── 利用者の端末（フェーズ1は Web/PWA のみ）────────────────┐
│  KOBAN アプリ（React + TypeScript）                                           │
│   ├─ UI 層（画面・帳票テンプレート）                                           │
│   ├─ core（純粋関数：台本解析・改訂差分・香盤導出・検査・日々スケ・配布の差分）│
│   ├─ crypto（作品の鍵・アカウントの鍵・列の暗号化）                            │
│   ├─ repository（ローカルDBの読み書き＋変更通知）                             │
│   ├─ sync（送信待ち・HLC・押し込み／引き込み）                                 │
│   └─ ローカルDB：SQLite WASM（opfs-sahpool、専用 Worker）                      │
│  フェーズ2：同じコードを Capacitor で iOS / Android（@capacitor-community/sqlite）│
└───────┬──────────────────────────────┬─────────────────────────────────────┘
        │ HTTPS（JWT）                 │ HTTPS（JWT／配布者）
        ▼                              ▼
┌──────── Supabase ─────────────┐  ┌──── Cloudflare ───────────────────────────┐
│ Auth（メールの確認コード）     │  │ Pages：Web アプリの配信                    │
│   └ 独自 SMTP（Resend など）   │  │ Worker share：配布 API と閲覧ページ /s/{code}│
│ Postgres                       │  │   R2：暗号化した日々スケ                    │
│   koban スキーマ（非公開）     │  │   D1：配布のメタデータ・確認               │
│     テーブル・内部関数         │  │   Durable Object：厳密な試行回数（予備方式）│
│   api スキーマ（公開）         │  │   Rate Limiting：閲覧・確認の粗い制限       │
│     許可した RPC だけ          │  └───────────────────────────────────────────┘
│ Storage（ロケ地の写真）        │        ▲ 閲覧者（アプリもアカウントも不要）
│ Edge Functions（退会の後処理） │        │ LINE などに貼られたリンク
│ pg_cron（物理削除・集計）      │
└────────────────────────────────┘
外部：国土地理院（住所検索・地図タイル）、Sentry（本文・人物名・連絡先を送らない）
フェーズ2：RevenueCat（ストア課金）、Stripe（Web 決済・請求書）、FCM／APNs、LLM の処理事業者
```

閲覧者（キャスト・スタッフ）はアプリもアカウントも要らない。リンクを開くと Worker が閲覧ページを返し、ページが暗号文を取ってきて、URL のフラグメントにある鍵で端末内で復号する。

## 4. 技術選定

| 領域 | 採用 | 主な代替案と不採用の理由 |
|---|---|---|
| 言語・UI | TypeScript 5、React 19、Vite | — |
| ネイティブ化（フェーズ2） | Capacitor | React Native・Flutter は縦書きと大きな表の描画が弱い |
| ルーティング | React Router 7 | — |
| 状態管理 | 画面状態は Zustand、データはローカルDB＋変更通知フック | サーバーキャッシュ系のライブラリは正がサーバーにある前提で、オフラインファーストに合わない |
| ローカルDB | SQLite WASM の `opfs-sahpool` VFS（専用 Worker で動かす。COOP/COEP ヘッダーが要らない） | IndexedDB は SQL の集計が書けない。`opfs-sahpool` は同時に1接続しか持てないので、タブ間の引き継ぎを設計する（7.7） |
| 同期エンジン | 自作（第8章）、または PowerSync（1週目に判断、8.11） | どちらでも書き込みの判定はサーバーの RPC が持つ |
| 暗号 | Web Crypto（AES-256-GCM、HKDF-SHA-256、ECDH P-256、HMAC-SHA-256） | 独自実装や JS の暗号ライブラリは使わない。鍵の包みも AES-GCM で行う（AES-KW は使わない）。復旧コードは十分に長い乱数なので、遅い KDF（Argon2 など）は要らない（9.3） |
| 表の仮想化 | TanStack Virtual（縦横の2軸） | — |
| ドラッグ | dnd-kit（キーボード操作つき） | — |
| 地図 | MapLibre GL＋地理院タイル | Google Maps は課金と規約が重い |
| PDF | @react-pdf/renderer＋Noto Sans JP（静的 TTF、OFL） | ブラウザ印刷は端末ごとに組みがばらつく |
| Excel・CSV | ExcelJS（読み書き）。CSV は自前の読み取り（UTF-8／Shift_JIS は `TextDecoder`） | SheetJS 無償版は書式の出力が弱い |
| 台本取り込み | pdf.js（PDF）、mammoth（docx）、自前パーサ（txt・貼り付け） | Fountain・fdx はフェーズ2 |
| 認証・同期・保存 | Supabase（Auth、Postgres、Storage、Edge Functions、pg_cron） | Firebase は行単位の権限と SQL の集計で不利 |
| 配布 | Cloudflare Workers、R2、D1、Durable Objects、Rate Limiting、Pages | — |
| メール | Resend（SMTP）を Supabase Auth の独自 SMTP に設定。代替は Amazon SES | Supabase 標準の送信は本番に使えない |
| テスト | Vitest、fast-check（同期の性質テスト）、Playwright、pgTAP（SQL と権限）、`@cloudflare/vitest-pool-workers` | — |
| 監視 | Sentry | — |
| 課金（フェーズ2） | Stripe（Web・請求書払い）、RevenueCat（ストア） | — |

## 5. リポジトリとモジュール構成

新規リポジトリをモノレポ（pnpm workspaces）で作る。業務ロジックは `packages/core` に純粋関数として集め、UI・DB・ネットワークに依存させない。テストの大半をここに置く。

```
koban/
├─ apps/
│  └─ app/                 React アプリ本体（Web。フェーズ2で Capacitor を追加）
│     ├─ src/screens/      画面（第13章）
│     ├─ src/print/        帳票テンプレート（PDF・Excel、第14章）
│     ├─ src/data/         repository、ローカルDBアダプタ
│     ├─ src/sync/         同期エンジン（第8章）
│     ├─ src/crypto/       鍵の管理と列の暗号化（第9章）
│     └─ public/fonts/     同梱フォント（14.2）
├─ packages/
│  ├─ core/                ドメイン型と純粋関数
│  │   ├─ script/          台本解析（txt・貼り付け・PDF テキスト・docx）
│  │   ├─ tabular/         Excel・CSV の列の割り当て
│  │   ├─ revision/        改訂差分・根拠の引き継ぎ・影響の算出
│  │   ├─ koban/           香盤導出
│  │   ├─ schedule/        見積・時間割・検査
│  │   ├─ callsheet/       日々スケの導出
│  │   ├─ share/           配布の中身と差分
│  │   ├─ sun/             日の出入り
│  │   ├─ ids/             決定的な ID
│  │   ├─ order/           並べ替えキー
│  │   └─ hlc/             ハイブリッド論理時計
│  ├─ schema/              テーブル定義（Postgres DDL、SQLite DDL、同期関数を生成する元）
│  └─ share-viewer/        配布閲覧ページ（Worker が配信する軽量バンドル）
├─ workers/share/          配布 API・閲覧ページ・後片付け
├─ supabase/
│  ├─ migrations/          DDL・権限・RLS・同期関数（生成物を含む）
│  ├─ tests/               pgTAP（権限の監査を含む）
│  └─ functions/           退会の後処理
├─ templates/              公開用の無料 Excel テンプレートと列定義
└─ fixtures/scripts/       台本解析のゴールデンテスト用サンプル（権利者の許諾済みのみ）
```

## 6. ドメイン設計

### 6.1 保存するもの、導出するもの

保存するのは「事実」だけにする。作品、話、改訂稿、シーン、要素、印、人物、ロケ地、撮影日、割り当て、日々スケの手入力分、配布の記録である。香盤表・総スケ・日々スケ・衣裳表・小道具表・人物別の出番表は、すべて保存データから導出する。

```
 改訂稿(本文は暗号化) ──解析──▶ シーン（行範囲を持つ） ◀── 印(根拠つき) ── 要素 ── 人物(キャスト/エキストラ)
   │                              │  ▲                                     └ スタッフは要素にならない
   └─ 版ごとのシーン対応表          │  └─ ロケ地（柱の見出しから抽出）
                                  ▼
 撮影日(集合・予定撤収) ── 割り当て(並び・開始の固定) ──▶ 総スケ（導出）
   │                                                     │ 同じ buildTimeline
   └── 日々スケ = 導出 ＋ 欄ごとの上書き行 ────────────────┘
          └── 配布（版ごとの中身・確認）
 香盤表 = シーン × 要素 の射影（導出）
```

### 6.2 話

作品の下に話（`episodes`）を置き、シーンは必ずどれかの話に属する。シーン番号は話の中で一意で、表示は複数の話がある作品では「3-12」（話番号-シーン番号）とする。単発作品は話を1つだけ持ち、画面では話の層を出さない（話が1つかどうかで切り替える）。台本の取り込みは1話ずつで、取り込み先の話を選ぶ。香盤表と総スケは話をまたいで並べられる。番号の一意性はデータベースの制約にせず、アプリの検査（`NUMBER_DUP`）で示す。改訂のたびに番号が一斉に動き、端末間で一時的に重なるのは普通に起きるからである。

### 6.3 根拠

印（`scene_elements`）は、根拠の種別と中身を行の列として持つ。

| 種別 `ev_kind` | 中身 | 表示 |
|---|---|---|
| `script` | 改訂稿の ID と行の範囲（`ev_version_id`、`ev_line_from`、`ev_line_to`） | 押すと台本の該当行を開く |
| `manual` | 入力者と日時（`ev_by`、`ev_device`、`ev_at`） | 「手入力：〇〇、10/14 21:03」 |
| `excel` | 取り込んだファイル名・シート・行（`ev_ref`）、取り込んだ人と日時 | 「Excel：香盤_v3.xlsx 香盤表!12行」 |
| `ai`（フェーズ2） | 提案の根拠の行と、採用した人と日時 | 「AI の提案（採用：〇〇）」 |

改訂でその行が消えた印は `ev_lost_in_version_id` に版を入れ、表の上で見分けられるようにする。「根拠のない印」とは、台本の行による裏づけがない印（`manual`・`excel`・`ai` で行を持たないもの）を指し、香盤表で絞り込みと強調ができる。手入力の印が悪いわけではなく、台本と照合されていないことを見える化するためである。シーン自体も、取り込み元の版と行範囲（`source_version_id`、`line_from`、`line_to`）を根拠として持つ。人物とロケ地は、どこから作られたか（`origin`：台本の版、Excel、手入力）を持つ。

### 6.4 人物の区分

人物は `kind` で キャスト（`cast`）・エキストラ（`extra`）・スタッフ（`staff`）に分ける。香盤表の列になるのはキャストとエキストラだけで、それぞれの人物に1つずつ、人物カテゴリかエキストラカテゴリの要素を結び付ける（`elements.person_id`）。スタッフには要素を作らず、人物マスタと日々スケの部署・連絡先にだけ現れる。エキストラは人物を持たない要素（「通行人10名」）としても登録できる。衣裳やメイクの要素に「誰のものか」を付けたいときは、`elements.for_person_id` を使う（`person_id` とは意味が違う）。

### 6.5 ロケ地

ロケ地は要素ではなく、シーンの属性（`scenes.location_id`）として持つ。台本の取り込みでは、柱の見出しを `・` で区切った先頭の部分をロケ地の候補にし（「太郎の家・居間」→「太郎の家」）、同じ名前をまとめてロケ地マスタを作る。「同・夜」のように見出しが「同」で始まる柱は、直前のシーンのロケ地を引き継ぐ。これで取り込み直後から、ロケ地順の並べ替え・移動時間・日照の検査が働く。

### 6.6 尺と撮影見積

シーンは尺（`duration_sec`、本編での長さ、秒、任意）と撮影見積（`est_shoot_min`、段取りと本番を含む撮影時間、分、任意）を別々に持つ。総スケの時間割に使うのは撮影見積だけで、無ければペラ数×作品設定の係数（既定は1ペラ＝60分）で見積もる。尺は香盤表と帳票で表示・合計するだけで、時間割には使わない。フェーズ2でカットの見積があるシーンは、カットの合計を撮影見積に使う。

### 6.7 時刻の正本

時刻はすべて「撮影日の0時からの分（整数）」で持ち、24時を超える値（25:30＝1530）を許す。列名は必ず `_min` で終える。集合時刻とシーン開始の正本は撮影日の側に一つだけ置く。

| 値 | 正本 | 備考 |
|---|---|---|
| 全体の集合時刻 | `shoot_days.call_min` | 日々スケで直しても、この列を書き換える |
| 予定の撤収時刻 | `shoot_days.wrap_min` | 撤収見込みとの比較に使う |
| シーンの開始の固定 | `shoot_day_scenes.fixed_start_min` | 日々スケでシーンの開始時刻を直すと、この列を書き換える |
| 食事 | `call_sheet_items`（`kind='meal'`）。未設定なら作品設定の既定の昼食 | 時間割の休憩として `buildTimeline` が読む |
| 部署別・人物別の集合 | `call_sheet_items`（`dept_call`・`person_call`） | 時間割には影響しない |

総スケと日々スケは同じ関数 `buildTimeline` に同じ入力を渡して時間割を作るので、食い違いは構造的に起きない。

### 6.8 主要な型（core）

```ts
type Id = string;            // UUIDv7、または決定的な ID（UUIDv5、7.2）
type Hlc = string;           // "0019a3f2c4b10-0000-k3x9q2ma"（8.6）
type SortKey = string;       // 分数インデックス
type TimeOfDay = 'dawn'|'morning'|'day'|'evening'|'night'|'midnight'|'unknown';
type IntExt = 'int'|'ext'|'unknown';
type EvidenceKind = 'script'|'manual'|'excel'|'ai';

interface Episode { id: Id; projectId: Id; number: string; title: string; sortKey: SortKey }
interface Scene {
  id: Id; projectId: Id; episodeId: Id;
  number: string; heading: string; locationId?: Id;
  timeOfDay: TimeOfDay; intExt: IntExt;
  pages: number;             // ペラ（200字詰め1枚＝1）
  durationSec?: number;      // 尺
  estShootMin?: number;      // 撮影見積
  status: 'active'|'orphaned';
  sourceVersionId?: Id; lineFrom?: number; lineTo?: number;
  changedInVersionId?: Id; changeReviewed: boolean;
  note?: string; sortKey: SortKey;
}
interface Element { id: Id; projectId: Id; categoryId: Id; name: string; personId?: Id; forPersonId?: Id; sortKey: SortKey }
interface SceneElement {
  id: Id; sceneId: Id; elementId: Id; note?: string;
  evKind: EvidenceKind; evVersionId?: Id; evLineFrom?: number; evLineTo?: number;
  evRef?: string; evBy?: Id; evDevice?: string; evAt: string; evLostInVersionId?: Id;
}
interface Person { id: Id; projectId: Id; name: string; roleName?: string; kind: 'cast'|'extra'|'staff'; dept?: string; ngDates: { date: string; note?: string }[] }
interface ShootDay { id: Id; projectId: Id; date: string; label: string; callMin?: number; wrapMin?: number; note?: string; sortKey: SortKey }
interface ShootDayScene { id: Id; shootDayId: Id; sceneId: Id; part: string; sortKey: SortKey; fixedStartMin?: number }
```

## 7. データ設計

### 7.1 共通カラムとサーバーだけが決める列

同期対象のすべてのテーブルに、次の共通カラムを持たせる。

| カラム | 型 | 意味 | 書くのは |
|---|---|---|---|
| `id` | uuid | 行の ID（7.2） | 端末 |
| `project_id` | uuid | 所属作品。権限判定と同期の単位 | 端末（作成時のみ。以後は変えられない） |
| `rev` | text collate "C" | 最終更新の HLC。勝敗をこれで決める。C 照合でバイト順に比べる | 端末（サーバーが形式と未来すぎないかを検査） |
| `updated_by` | uuid | 最終更新者 | サーバー（`auth.uid()`） |
| `deleted_at` | timestamptz null | ソフト削除の時刻 | 端末は「削除した／戻した」だけを送り、時刻はサーバーが `now()` で付ける（7.4） |
| `server_seq` | bigint | サーバーが更新のたびに振る通し番号。引き込みに使う | サーバー |

作品の行には、さらにサーバーだけが決める列 `owner_id`、`plan`、`created_at`、`archived_at` がある（7.6）。端末から送られたこれらの値は無視する。

### 7.2 識別子

ふつうの行は端末で採番する UUIDv7 とする。論理的に一意な行（同じ組み合わせが2行あってはならない行）は、親の ID から計算する**決定的な ID**（UUIDv5、名前空間は KOBAN 固定の UUID）にする。2台の端末がオフラインで同じセルに印を付けても同じ ID になり、重複行ではなく同じ行の LWW になる。印を外して付け直すと、新しい行ではなく同じ行の復元になる。

| テーブル | 一意な組み合わせ | ID の元 |
|---|---|---|
| `scene_elements` | （シーン、要素） | `{project_id}/scene_elements/{scene_id}/{element_id}` |
| `shoot_day_scenes` | （撮影日、シーン、部分） | `{project_id}/shoot_day_scenes/{shoot_day_id}/{scene_id}/{part}` |
| `call_sheets` | （撮影日） | `{project_id}/call_sheets/{shoot_day_id}` |
| `call_sheet_items` | （撮影日、種別、キー） | `{project_id}/call_sheet_items/{shoot_day_id}/{kind}/{key}` |
| `shares` | （撮影日） | `{project_id}/shares/{shoot_day_id}` |
| `share_publications` | （配布、版） | `{project_id}/share_publications/{share_id}/{version}` |
| `script_version_scenes` | （改訂稿、シーン） | `{project_id}/script_version_scenes/{version_id}/{scene_id}` |
| `categories`（既定カテゴリ） | （作品、キー） | `{project_id}/categories/{key}` |
| `elements`（人物の要素） | （人物） | `{project_id}/elements/person/{person_id}` |
| `person_contacts` | （人物） | `{project_id}/person_contacts/{person_id}` |

JSON バックアップから復元するときは、作品の ID から振り直すので、決定的な ID も新しい親の ID から計算し直す。

### 7.3 テーブル定義（Postgres、`koban` スキーマ）

SQLite 側は同じ列構成を `packages/schema` から生成する（`jsonb` は TEXT、`timestamptz` は ISO 文字列、`uuid` は TEXT）。`/* 共通列 */` は 7.1 の `rev text collate "C" not null, updated_by uuid, deleted_at timestamptz, server_seq bigint` を表す。

```sql
-- 作品・話・メンバー
create table koban.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users,            -- サーバーだけが決める
  title text not null, kind text not null default 'film',  -- film|short_drama|series|cm|mv|other
  shoot_start date, shoot_end date,
  settings jsonb not null default '{}',                    -- 05 の ProjectSettings
  script_storage text not null default 'cloud',            -- cloud|device（F10-5）
  plan text not null default 'free',                       -- サーバーだけ。フェーズ1は free|beta
  archived_at timestamptz,                                 -- サーバーだけ。保管＝閲覧と書き出しのみ
  created_at timestamptz not null default now(),           -- サーバーだけ
  rev text collate "C" not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table koban.project_members (       -- フェーズ1は作成者の admin 行だけ
  project_id uuid references koban.projects, user_id uuid references auth.users,
  role text not null check (role in ('admin','editor','viewer')),
  joined_at timestamptz not null default now(), primary key (project_id, user_id)
);
create table koban.episodes (
  id uuid primary key, project_id uuid not null, number text not null, title text not null default '',
  sort_key text collate "C" not null, /* 共通列 */
);

-- 台本と改訂
create table koban.script_versions (
  id uuid primary key, project_id uuid not null, episode_id uuid not null,
  name text not null, revised_on date,                     -- 版名（準備稿・決定稿・青…）と改訂日
  source_kind text not null,                               -- txt|pdf|docx|paste
  raw_text_enc text,                                       -- 全文の暗号文（第9章）。端末だけの作品では null
  line_count int not null,                                 -- 行の索引の大きさ。行番号は全文を改行で分けた位置
  based_on_version_id uuid,                                -- 直前の版
  /* 共通列 */
);
create table koban.scenes (
  id uuid primary key, project_id uuid not null, episode_id uuid not null,
  number text not null, heading text not null, location_id uuid,
  time_of_day text not null default 'unknown', int_ext text not null default 'unknown',
  pages numeric(6,2) not null default 0, duration_sec int, est_shoot_min int,
  status text not null default 'active',                   -- active|orphaned
  source_version_id uuid, line_from int, line_to int,      -- 現在の版での行範囲（本文は改訂稿から切り出す）
  changed_in_version_id uuid, change_reviewed boolean not null default false,
  note text, sort_key text collate "C" not null, /* 共通列 */
);
create table koban.script_version_scenes (                 -- 版ごとのシーン対応表（差分と版の参照）
  id uuid primary key, project_id uuid not null, version_id uuid not null, scene_id uuid not null,
  number text not null, heading text not null, line_from int not null, line_to int not null,
  body_mac text not null,                                  -- 本文の HMAC（作品の鍵から導出した鍵。9.4）
  /* 共通列 */
);

-- ブレイクダウン
create table koban.categories (
  id uuid primary key, project_id uuid not null, key text not null, label text not null,
  kind text not null default 'item',                       -- cast|extra|item
  color text, builtin boolean not null default false, hidden boolean not null default false,
  sort_key text collate "C" not null, /* 共通列 */
);
create table koban.elements (
  id uuid primary key, project_id uuid not null, category_id uuid not null, name text not null,
  person_id uuid,                                          -- キャスト・エキストラの人物そのもの
  for_person_id uuid,                                      -- 衣裳・メイクなどの持ち主
  note text, sort_key text collate "C" not null, /* 共通列 */
);
create table koban.scene_elements (                        -- 印。id は決定的（7.2）
  id uuid primary key, project_id uuid not null, scene_id uuid not null, element_id uuid not null,
  note text,
  ev_kind text not null,                                   -- script|manual|excel|ai
  ev_version_id uuid, ev_line_from int, ev_line_to int, ev_ref text,
  ev_by uuid, ev_device text, ev_at timestamptz not null,
  ev_lost_in_version_id uuid,                              -- 改訂で根拠の行が消えた版
  /* 共通列 */
);

-- 人物とロケ地（連絡先は別テーブル）
create table koban.persons (
  id uuid primary key, project_id uuid not null, name text not null, role_name text,
  kind text not null default 'cast',                       -- cast|extra|staff
  dept text, ng_dates jsonb not null default '[]',         -- [{date, note}]
  origin text, sort_key text collate "C" not null, /* 共通列 */
);
create table koban.person_contacts (                       -- id は決定的（人物ごとに1行）
  id uuid primary key, project_id uuid not null, person_id uuid not null,
  tel text, email text, line_id text, note text, /* 共通列 */
);
create table koban.locations (
  id uuid primary key, project_id uuid not null, name text not null, address text,
  lat double precision, lng double precision,
  available_from_min int, available_to_min int,            -- 利用可能時間（F6-7 の検査はフェーズ2）
  origin text, note text, /* 共通列 */
);
create table koban.media (                                 -- フェーズ1はロケ地の写真だけ（7.8）
  id uuid primary key, project_id uuid not null, kind text not null,  -- location（フェーズ2で frame|board 等）
  storage_path text, thumb_path text, width int, height int, bytes int,
  location_id uuid, taken_at timestamptz, /* 共通列 */
);

-- スケジュールと日々スケ
create table koban.shoot_days (
  id uuid primary key, project_id uuid not null, date date not null, label text not null,
  call_min int, wrap_min int,                              -- 集合・予定撤収（0時からの分）
  note text, sort_key text collate "C" not null, /* 共通列 */
);
create table koban.shoot_day_scenes (                      -- 割り当て。id は決定的
  id uuid primary key, project_id uuid not null, shoot_day_id uuid not null, scene_id uuid not null,
  part text not null default '',                           -- '' は全体。分けて撮るときは「前半」「1/2」など
  est_shoot_min int,                                       -- 部分撮影の見積。null ならシーンの撮影見積を割り当ての数で等分
  sort_key text collate "C" not null, fixed_start_min int, /* 共通列 */
);
create table koban.call_sheets (                           -- 撮影日ごとに1行。id は決定的
  id uuid primary key, project_id uuid not null, shoot_day_id uuid not null,
  meeting_location_id uuid, meeting_note text, /* 共通列 */
);
create table koban.call_sheet_items (                      -- 日々スケの上書きを欄ごとに1行。id は決定的
  id uuid primary key, project_id uuid not null, shoot_day_id uuid not null,
  kind text not null,                                      -- dept_call|person_call|meal|note|dept_note|contact
  key text not null, value jsonb,                          -- null は「自動の値に戻した」
  sort_key text collate "C" not null, /* 共通列 */
);

-- 配布（第11章）
create table koban.shares (                                -- 撮影日ごとに1行。id は決定的
  id uuid primary key, project_id uuid not null, shoot_day_id uuid not null,
  code text not null,                                      -- リンクの公開 ID（128bit の乱数）
  link_key_enc text not null,                              -- リンクの鍵を作品の鍵で暗号化したもの
  status text not null default 'active',                   -- active|revoked
  expires_at timestamptz not null, published_version int not null default 0, published_at timestamptz,
  ref_map jsonb not null default '{}',                     -- 人物 ID → 閲覧用の参照 ID
  /* 共通列 */
);
create table koban.share_publications (                    -- 配布した版の中身（差分の計算用）
  id uuid primary key, project_id uuid not null, share_id uuid not null, version int not null,
  payload_enc text not null, published_at timestamptz not null, /* 共通列 */
);

-- 上書き履歴と墓標（同期の対象外。サーバーだけが書く）
create table koban.row_history (
  id bigserial primary key, project_id uuid not null, table_name text not null, row_id uuid not null,
  rev text collate "C" not null,                           -- 退避した版
  replaced_by_rev text collate "C",                        -- その版を上書きした版（rejected では現行の版）
  reason text not null check (reason in ('overwritten','rejected')),
  data jsonb not null,                                     -- 変わった列の、退避した版での値だけ
  actor uuid, recorded_at timestamptz not null default now()
);
create table koban.purged_rows (                           -- 物理削除の墓標。作品が存続する間は残す
  project_id uuid not null, table_name text not null, row_id uuid not null,
  server_seq bigint not null, purged_at timestamptz not null default now(),
  primary key (project_id, table_name, row_id)
);

-- アカウント・制限・鍵
create table koban.accounts (
  user_id uuid primary key references auth.users, plan text not null default 'beta',
  created_at timestamptz not null default now(), deletion_requested_at timestamptz
);
create table koban.plan_limits (plan text primary key, max_active_projects int, max_shoot_days int);
  -- free: 2, 5 ／ beta: 値は第16章（null は無制限）
create table koban.account_keys (
  user_id uuid primary key references auth.users,
  recovery_envelope text not null,                         -- 復旧コードで包んだアカウントの鍵
  public_key jsonb not null, private_key_enc text not null,-- 共有用の鍵の組（フェーズ2で使う。フェーズ1で作っておく）
  updated_at timestamptz not null default now()
);
create table koban.project_keys (
  project_id uuid not null, user_id uuid not null, key_version int not null,
  wrapped_key text not null, wrap_kind text not null,      -- account（フェーズ1）| member（フェーズ2）
  created_at timestamptz not null default now(), primary key (project_id, user_id, key_version)
);
create table koban.device_links (                          -- 端末間で鍵を渡す要求（9.3）
  id uuid primary key, user_id uuid not null, label text not null,
  requester_commit text not null,                          -- 新しい端末の公開鍵の SHA-256（先に約束）
  responder_pub jsonb, requester_pub jsonb, envelope text,  -- 既存の端末の公開鍵 → 新しい端末の公開鍵 → 封筒 の順に入る
  created_at timestamptz not null default now(), expires_at timestamptz not null, completed_at timestamptz
);
create table koban.daily_counts (date date, name text, dim text, count bigint, primary key (date, name, dim));
```

主要な索引は、全同期テーブルの `(project_id, server_seq)`。加えて `scene_elements(scene_id)`、`scene_elements(element_id)`、`scenes(episode_id, sort_key)`、`shoot_day_scenes(shoot_day_id, sort_key)`、`call_sheet_items(shoot_day_id)`、`row_history(project_id, id)`。論理的な一意性は決定的な ID で守るので、`call_sheets(shoot_day_id)` などの一意制約は置かない（v0.1 の一意制約は、2台で同じ日々スケを作ると同期を永久に止めた）。

### 7.4 削除・墓標・物理削除

| 場面 | 扱い |
|---|---|
| 行の削除・復元 | 端末は `deleted_at` に端末の時刻か null を入れて送る。サーバーは、削除されていなかった行が削除されたら `now()` を付け、すでに削除済みなら元の時刻を保ち、null なら null にする。30日の起算は常にサーバーの時刻 |
| 作品の削除 | 作品の行に `deleted_at` を付けるだけで、配下の行には触れない |
| 物理削除 | 日次ジョブが、`deleted_at` がサーバー時刻で30日を過ぎた行を消し、同じトランザクションで墓標 `purged_rows` を作る。作品ごとの勧告ロック（8.5）を取ってから行い、墓標にも `server_seq` を振る |
| 墓標の保持 | 作品が存続する間は残す（ID だけなので小さい）。作品ごと物理削除したときは、作品の墓標だけを残す |
| 長期オフラインの端末 | 引き込みで墓標を受け取り、端末の行を消す。ただしその行に未送信の変更があれば消さず、上書きの確認画面の「同期できない項目」に移す（8.4）。墓標のある行への送信は `purged` で拒否する。行の復活と分岐が起きない |
| 端末だけの作品 | 自動の物理削除をしない。端末の時計は信用できないため、ゴミ箱の「30日を過ぎた項目を消す」を利用者が押したときだけ消す |

### 7.5 暗号化する列

フェーズ1で暗号化するのは `script_versions.raw_text_enc`（取り込んだ全文）だけである。シーンの本文は全文と行範囲から切り出すので、別に持たない（`03` 第9章の Scene の本文は、この形で実現する）。配布の鍵 `shares.link_key_enc` と配布した中身 `share_publications.payload_enc` も作品の鍵で暗号化する。柱の見出し・人物・要素の名前・撮影日などの構造は暗号化しない。台帳の機能は本文が読めなくても動く。

連絡先は暗号化せず、権限で守る（閲覧者は読めない）。暗号化するかは未決事項とする（第27章）。改訂差分に使う `body_mac` は、平文のハッシュだと短い本文が総当たりで推測できるので、作品の鍵から導出した HMAC にする。

暗号文の列は、端末のローカルDBでは平文の列（`raw_text`）と暗号文の列（`raw_text_enc`）の両方を持つ。鍵があれば平文を使い、送るときに暗号化する。鍵が無い端末は暗号文をそのまま保ち、送るときはその列を送らない（サーバーは送られなかった列を現行の値のまま残す。8.3）。

### 7.6 権限

#### スキーマと実行権限

| 対象 | 方針 |
|---|---|
| テーブル・内部関数 | `koban` スキーマに置く。PostgREST の公開スキーマ（Supabase の API 設定）には入れない |
| 公開する RPC | `api` スキーマに置き、公開スキーマは `api` だけにする（`public` は公開しない） |
| 関数の実行権限 | Postgres は関数の実行権限を既定で PUBLIC に与え、Supabase は `anon`・`authenticated` にも既定で与える。マイグレーションの冒頭で既定の権限を取り消し（`alter default privileges ... revoke execute on functions from public` と、`anon`・`authenticated` からの取り消し）、各関数でも `revoke execute ... from public, anon, authenticated` を明示する。そのうえで、許可した `api` の関数だけに `grant execute ... to authenticated` を与える |
| `security definer` | `api` の関数だけ。内部関数（`koban.member_role` や生成した upsert）は `api` の関数の中から呼ばれ、その所有者の権限で動く。すべての関数を `set search_path = ''` とし、本文では `koban.scenes`・`auth.uid()` のように完全修飾で書く |
| テーブルへの直接の読み書き | `koban` スキーマの使用権限と、全テーブルの権限を `anon`・`authenticated` から取り消す。読み書きは RPC だけで行う。RLS も全テーブルで有効にし、`anon`・`authenticated` 向けのポリシーは置かない（すべて拒否。権限の取り消しとの二重の防御） |
| 監査 | CI で「`anon`・`authenticated` が実行できる関数」と「直接触れるテーブル」を問い合わせ、許可一覧と一致しなければ失敗させる（21章） |

公開する RPC は次のとおり（引数と戻り値は `05` 第5章）。

| RPC | 用途 | 呼べる人 |
|---|---|---|
| `api.sync_push` | 行の送信 | 作品の管理者・編集者 |
| `api.sync_pull` | 行の引き込み | 作品のメンバー |
| `api.create_project` | 作品の登録（冪等） | ログインした人 |
| `api.my_projects`・`api.my_limits` | 自分の作品・役割・制限 | ログインした人 |
| `api.set_project_active` | 進行中と保管の切り替え | 作品の管理者 |
| `api.list_overwrites` | 上書き履歴の取得 | 作品の管理者・編集者 |
| `api.share_authorize` | 配布 Worker からの権限照会 | 作品の管理者・編集者 |
| `api.get_keys`・`api.put_account_keys`・`api.put_project_key` | 鍵の封筒の取得と登録 | 本人 |
| `api.create_device_link`・`api.respond_device_link`・`api.reveal_device_link`・`api.complete_device_link`・`api.get_device_link`・`api.list_device_links` | 端末間の鍵の受け渡し | 本人 |
| `api.request_account_deletion`・`api.cancel_account_deletion` | 退会と取り消し | 本人 |
| `api.track` | 件数の計測 | ログインした人 |

#### 作品の行

作品の行（`projects`）は通常の upsert で扱わない。`sync_push` の中の専用の内部関数 `koban.apply_project` が受け、呼び出し元が**管理者**のときだけ、許可した列（`title`、`kind`、`shoot_start`、`shoot_end`、`settings`、`script_storage`、`deleted_at`）だけを LWW で反映する。`owner_id`・`plan`・`created_at`・`archived_at` はサーバーだけが決め、端末の値は無視する。端末の作品行に `created_at` が無くても、題名を変えたときに作成日時が消えることはない。

#### 役割ごとの可否（フェーズ1は作成者＝管理者だけ。表はフェーズ2を含む）

| 対象 | 管理者 | 編集者 | 閲覧者 | 非メンバー |
|---|---|---|---|---|
| 作品の設定・削除・保管の切り替え（フェーズ2はメンバー管理も） | 読み書き | 読み | 読み | 不可 |
| 話・台本・シーン・要素・印・撮影日・日々スケ | 読み書き | 読み書き | 読み | 不可 |
| 人物（名前・役名・区分・NG日） | 読み書き | 読み書き | 読み | 不可 |
| 人物の連絡先 `person_contacts` | 読み書き | 読み書き | **不可** | 不可 |
| 配布の作成・更新・取り消し、確認の集計 | 可 | 可 | 不可 | 不可 |
| 上書き履歴 `row_history` の閲覧と復元 | 可 | 可 | **不可** | 不可 |
| 配布した中身 `share_publications`・配布の鍵 | 読み書き | 読み書き | **不可** | 不可 |

閲覧者を除外するテーブルは、`sync_pull` が返さず、閲覧者の端末から消す（8.9）。連絡先を別テーブルにしたのは、行単位でしか隠せないからである。

### 7.7 ローカルDB

端末側は同じテーブル群（端末では `projects.owner_id` を空にでき、`created_at` などサーバーだけの列は引き込んだ値を保持するだけ）に加えて、端末だけの管理テーブルを持つ。

| テーブル | 内容 |
|---|---|
| `meta` | 端末 ID、HLC の状態、スキーマの版、サーバーとの時計のずれ、最後に確認した制限 |
| `outbox` | 未送信の変更（表、行 ID、作品、その時点の `rev`、試行回数、最後のエラー） |
| `sync_state` | 作品ごとの最終引き込み `server_seq`、登録済みか、最後に知った役割、上書き履歴の既読位置 |
| `conflicts` | 端末で負けた版・同期できない行・墓標と衝突した行（上書きの確認と復元の画面の元） |
| `snapshots` | 自動バックアップの記録。種別（日次・マイグレーション前・改訂の取り込み前・復元前）で分けて持つ（8.10） |
| `import_drafts` | 取り込み確認の途中の状態。リロードしても手直しを失わない |
| `ui_prefs` | 列の表示設定、最後に開いた画面など |

鍵は SQLite に入れず、IndexedDB に `CryptoKey` として置く（9.5）。Web では起動時に `navigator.storage.persist()` を要求する。OPFS が使えないブラウザでは起動時に案内を出し、JSON バックアップを促す。

`opfs-sahpool` は同じ DB に同時に1つの接続しか持てない（2つ目のタブの初期化は失敗する）。そこで Web Locks で1タブだけが DB を持ち、別のタブが「こちらで開く」を押したときは、持っているタブに BroadcastChannel で手放しを頼む。持っているタブは書き込みと同期を止め、DB を閉じ、VFS を一時停止（`pauseVfs()`、SQLite 3.50 以降）してからロックを放す。応答の無いタブ（凍結など）からは `steal` で奪うが、奪われた側のコードは止まらないので、奪った側はファイルを開けるまで間隔を延ばして再試行し、奪われた側は次の操作の前にロックの所有を確かめて読み取り専用の案内に切り替わる（`05` 4.3）。

### 7.8 ロケ地の写真

写真は端末で長辺2,048px に縮小し、400px のサムネイルを作ってから OPFS に置く。クラウドには Supabase Storage の非公開バケット `media/{project_id}/{media_id}.jpg` へ送り、Storage の権限も作品メンバーの判定で守る。フェーズ1の容量上限は1作品あたり500MB とし、超えたら端末内に残したまま送信だけ止める。

## 8. 同期設計

### 8.1 方式

行単位の最終更新優先（LWW）とする。勝敗は HLC（ハイブリッド論理時計）で決める。端末の時計がずれていても因果の順序が崩れないためである。負けた版は捨てず、サーバーでは `row_history`、端末では `conflicts` に残す。ただし LWW の単位は行でも、**送られてこなかった列は現行の値を残す**。古いアプリが知らない列や、鍵の無い端末が作れない本文を消さないためである。

### 8.2 書き込みの流れ

```
編集操作
  └─ repository.write(projectId, fn)       1トランザクション
       ├─ rev = hlc.now() を付与
       ├─ ローカルDBへ書き込み（即座に画面へ反映）
       ├─ outbox に (table, id, rev) を追加
       └─ 変更通知 → 購読中の画面が再計算
同期ワーカー（3秒デバウンス／前面復帰時／通信回復時／30秒ごと）
  ├─ push：outbox の行を最大50行ずつ api.sync_push へ（行ごとの結果を受ける）
  └─ pull：api.sync_pull(project, since) を最大1,000行ずつ
```

1回の送信を50行にするのは、行ごとの例外の捕捉（8.3）がサブトランザクションを使い、1トランザクションのサブトランザクションが64を超えると Postgres の性能が落ちるからである。シーン300の作品の初回の送信（約5,000行）は100回の呼び出しになり、1回0.1〜0.2秒として10〜20秒で終わる。

### 8.3 サーバー側の判定（`api.sync_push`）

```
入口：呼び出し元が作品の管理者・編集者でなければ全体を拒否（E_FORBIDDEN）
      アプリのスキーマ版が最低版より古ければ全体を拒否（E_SCHEMA_TOO_OLD）
      作品ごとの勧告ロックを取る（8.5）
各行について（行ごとに例外を捕まえ、1行の失敗で他の行を止めない）：
  作品が保管中・ゴミ箱で、作品の行以外        → error（E_READ_ONLY。送信待ちは残し、進行中に戻ったら送る）
  表が許可一覧に無い／形式が不正             → error（E_BAD_TABLE／E_ROW_INVALID）
  rev の物理時刻がサーバー時刻＋5分より先    → skew（適用しない）
  墓標がある                                 → purged
  既存なし                                   → 挿入。送られなかった列は既定値で補う → applied
  既存の作品が違う                           → error（E_PROJECT_MISMATCH）
  incoming.rev = 既存.rev                    → duplicate（受理済み。何もしない）
  incoming.rev > 既存.rev                    → 現行の行を土台に、送られた列だけを重ねて更新 → applied
                                               別の端末か別の人の版を上書きしたなら、変わった列の旧値を row_history('overwritten') へ
  incoming.rev < 既存.rev                    → 適用せず row_history('rejected') へ。現行の行を返す → rejected
  無料枠を超える撮影日の追加・復元           → ゴミ箱に入れた状態で保存 → limited（第16章）
サーバーだけが決める列（updated_by、server_seq、deleted_at の時刻、作品のサーバー列）は常にサーバーが付ける
```

v0.1 の判定にあった三つの致命的な穴は、次のように塞いだ。送られなかった列を NULL にしていた（`jsonb_populate_record(null::…)`）のを、更新は現行の行を土台に（`jsonb_populate_record(現行の行, …)`）、挿入は欠けた列に列の既定値を補う形にした。1行の例外で全体が巻き戻っていたのを、行ごとの例外の捕捉と結果の配列にした。同じ版の再送を拒否として偽の衝突にしていたのを、受理済み（`duplicate`）にした。

### 8.4 送信待ちの扱い（端末）

送信待ちは「送った分だけ」を消し、送信中に生まれた新しい編集を巻き戻さない。

| 結果 | 端末の処理 |
|---|---|
| `applied`・`duplicate` | その行の、送った `seq` 以下の送信待ちを消す |
| `rejected` | 送った `seq` 以下の送信待ちを消し、送った版を `conflicts` に残す。端末の行の `rev` が送った版と同じときだけ、サーバーの現行版で上書きする。送信中に新しい編集があれば、それを残す（次の送信で改めて勝敗を決める） |
| `limited` | サーバーの版（ゴミ箱に入った状態）を取り込み、通知する |
| `skew` | 時計を補正し（8.6）、未来の `rev` を持つ行を新しい `rev` で打ち直して送り直す |
| `purged` | 端末の版を `conflicts` に移し、送信待ちを消す。利用者は新しい行として復元できる |
| `error` | 送信待ちを残し、試行回数を増やす。5回失敗したら `conflicts`（同期できない項目）に移して再試行を止め、他の行の同期は続ける。`E_READ_ONLY` は試行回数に数えず、作品が進行中に戻るまで保留する |

引き込んだ行は、`rev` が端末より新しいときだけ上書きする。等しいときは、サーバーだけが決める列（`deleted_at` の時刻、`updated_by`、`server_seq`）だけを取り込む。端末に未送信の変更がある行が負けたときは、端末の版を `conflicts` に残し、画面上部の通知「別の端末の変更で上書きされた項目が1件あります」から復元できるようにする。

### 8.5 引き込み（単一スナップショット）

`api.sync_pull(p_project, p_since, p_limit)` は、全同期テーブルと墓標の `server_seq > p_since` の行を、**1文の SQL**（テーブルごとの選択を `union all` でつなぎ、`server_seq` 順に `limit` を掛ける）で返す。1文なので、Postgres の READ COMMITTED でも一つのスナップショットで読まれる。戻り値の `next` は**返した最後の行の `server_seq`**（返す行が無ければ `p_since`）、`more` は件数が `p_limit` に達したかどうか、`server_now_ms` はサーバーの時刻である。

引き込み漏れが起きない理由は次のとおりで、どれか一つでも崩すと成り立たない。

1. 同期対象の行への書き込み（`sync_push`、物理削除のジョブ、退会の処理）は、すべて最初に作品ごとの勧告ロック `pg_advisory_xact_lock` を取り、ロックを持ったまま `server_seq` を採番し、コミットでロックを放す。
2. したがって同じ作品では、先にロックを取ったトランザクションの番号はすべて後のものより小さく、しかも後のものが番号を取る前にコミットしている。
3. 引き込みのスナップショットに番号 s の行が見えるなら、s より小さい番号の行を書いたトランザクションはすべてコミット済みで、それらも見える。見える行は、作品ごとに番号の途切れない前半部分になる。
4. 引き込みは1文なので、その前半部分を一度に読む。`next` を「返した最後の番号」にすれば、`limit` で切っても次の呼び出しで続きから読める。

例外の捕捉で巻き戻ったサブトランザクションも番号を消費するので、番号には穴が空く。穴は「その番号の行が無い」だけで、上の論証には影響しない。

### 8.6 時計の保護

| 対策 | 内容 |
|---|---|
| サーバーでの拒否 | `rev` の物理時刻がサーバー時刻＋5分より先なら `skew` で拒否する。未来の版が勝ち続けて、誰も編集できなくなることを防ぐ |
| 端末の補正 | 送信と引き込みの応答の `server_now_ms` から時計のずれを測り、60秒を超えていれば HLC の壁時計に補正値を足す |
| 打ち直し | `skew` を受けたら、HLC の状態を補正後の時刻まで戻し、物理時刻が補正後の時刻＋5分より先の `rev` を持つ行をすべて打ち直す（それらはサーバーに受理されていないので、打ち直しても他の端末と矛盾しない） |
| 受け取り側 | 引き込んだ `rev` が補正後の時刻より10分以上先なら、行は取り込むが HLC は進めない（サーバーの拒否があるので通常は起きない） |

### 8.7 作品の登録と利用制限

作品の登録は専用の RPC `api.create_project` で行う。作品の行と、作成者を管理者とするメンバー行を同時に作る。**冪等**にし、同じ ID の作品がすでにあって所有者が呼び出し元なら成功を返す（応答が失われて端末が再送しても、永久に「未登録」にならない）。所有者が違えば `E_ID_CONFLICT` を返す。

制限を超えても登録は断らない。進行中の作品の数が上限を超えるなら、**保管**（`archived_at` あり、閲覧と書き出しのみ）の状態で登録し、クラウドに保存はする。進行中にする作品は利用者が `api.set_project_active` で選ぶ（上限の中で）。ゴミ箱からの作品の復元も制限で止めない。上限を超えるなら保管の状態で戻し、そう伝える。v0.1 の「無料で唯一の作品をゴミ箱から戻せない」不具合はこれで無くなる。

### 8.8 上書き履歴

`row_history` は作品が存続する間すべて残す（v0.1 の90日の削除は取りやめた）。膨らみを抑えるため、次の二つを決めた。

- **同じ端末による連続した編集の途中経過は残さない。** 上書きする版と上書きされる版の端末（HLC の末尾）と更新者がどちらも同じなら記録しない。記録するのは、別の端末か別の人の版を上書きしたときと、拒否したときだけである。
- **変わった列の旧値だけを残す。** 復元は列単位で行う（「この値に戻す」）ので、変わっていない大きな列を毎回写す必要が無い。

物理削除は作品ごとの物理削除のときだけで、そのときは作品の履歴もまとめて消す。

### 8.9 役割の変更（フェーズ2）

閲覧者から編集者へ上がったら、閲覧者には返していなかったテーブル（`person_contacts`、`share_publications`、`shares`）を `p_tables` を指定して番号0から取り直す。下がったら、それらのテーブルを端末から消す（その時点の未送信の変更は `conflicts` に移し、JSON で書き出せるようにする）。端末は `api.my_projects` が返す役割を `sync_state` に覚え、変わったときにこの処理を行う。フェーズ1は作成者だけなので起きないが、仕組みはフェーズ1で入れておく。

### 8.10 端末内の自動バックアップと版の履歴

同期とは別に、作品ごとの JSON スナップショット（gzip、本文を含む）を端末内に保存する。種別ごとに別の枠で持ち、日次の自動保存が他の種別を上書きすることはない。

| 種別 | いつ | 残す数 |
|---|---|---|
| 日次 | 編集のあった日の最後の状態（起動時と、最後の書き込みから10分後に更新） | 直近30日分、それより古いものは週に1つを26週分 |
| マイグレーション前 | スキーマのマイグレーションを適用する直前（全作品） | 最新の3回分。かつ90日間は消さない |
| 改訂の取り込み前 | 改訂を確定する直前 | 最新の10回分 |
| 復元前 | 版の履歴や上書きの確認から戻す直前 | 最新の10回分 |

版の履歴の画面（F9-1）は、これらを日付順に並べ、前の版とのシーン数・人物数・撮影日数の差分を添える。選ぶと「この版を新しい作品として開く」ができ、既存の作品は上書きしない。版の履歴は端末ごとのもので、作品の本体はクラウドにあるので、端末を失っても台帳そのものは失わない。

### 8.11 同期エンジンの判断（1週目）

1週目に、PowerSync（Supabase の Postgres と組み、端末に SQLite を持つ既製の同期エンジン）を試す。PowerSync を採っても、端末からの書き込みはアップロードの処理（`uploadData`）から自前の `api.sync_push` へ送るので、8.3・8.4・8.6 の判定は自前で持つ。置き換わるのは、引き込み（8.5）、端末の DB とタブ間の扱い（7.7）、送信待ちの保存である。

| 判断の基準 | 合格の条件 |
|---|---|
| データを失わない | 05 の性質テスト（端末3台）を PowerSync の上で通せる。拒否された版を `conflicts` に残せる |
| 列を残す更新 | 送らなかった列を現行の値のまま残す、という更新を送れる |
| 権限 | 閲覧者に連絡先を返さない、を同期の規則で書ける |
| 削除 | 墓標と同じ効果（長期オフラインの端末で行が復活しない）がある |
| Web | Safari と Chrome で、複数タブとオフライン起動が動く |
| 将来 | Capacitor（フェーズ2）でも同じ構成で動く |
| 費用 | 無料枠は1週間使わないと停止するので本番に向かない。有料（月 US$49 から）を固定費に入れて見合うか |

基準を一つでも満たさなければ自作する。自作の場合の工数はフェーズ1の計画（第24章）に含めてある。

## 9. 台本の秘匿（暗号化）

### 9.1 鍵の構成

| 鍵 | 中身 | どこにあるか |
|---|---|---|
| 作品の鍵 | 作品ごとの256bit の乱数。HKDF で用途別に「列の暗号化の鍵（AES-256-GCM）」と「本文の HMAC の鍵」を導く。版（`key_version`）を持つ | サーバーには、アカウントの鍵で暗号化した封筒（`project_keys`）だけ。端末ではメモリ |
| アカウントの鍵 | アカウントごとの256bit の乱数。初回ログイン時に端末で作る | 端末の IndexedDB。サーバーには、復旧コードで暗号化した封筒（`account_keys.recovery_envelope`）だけ |
| 復旧コード | 120bit の乱数（Crockford Base32 で24字＋検査1字） | 利用者だけ（印刷・保管を促す） |
| 共有用の鍵の組（フェーズ2） | ECDH P-256。秘密鍵はアカウントの鍵で暗号化してサーバーに置く | フェーズ2のメンバー共有で使う。フェーズ1で作っておく |

暗号はすべて Web Crypto で行う。乱数の IV（96bit）は暗号化のたびに新しく作り、同じ鍵で同じ IV を使わない。暗号文には、どの表のどの行のどの列か（と鍵の版）を AAD として結び付け、暗号文を別の行へ差し替えても復号に失敗するようにする。

### 9.2 何を暗号化し、何をしないか

| 暗号化する（フェーズ1） | 暗号化しない |
|---|---|
| 改訂稿の全文、配布した中身、配布の鍵。フェーズ2で注釈、AI の下書きの入力 | 柱の見出し、話・シーン番号、時間帯・屋内外、ペラ・尺・撮影見積、要素と人物の名前、NG日、ロケ地、撮影日、日々スケの時刻とメモ、連絡先（権限で守る） |

端末だけの作品（ログインしていない作品）は端末の外へ出ないので暗号化しない。端末のローカルDBとスナップショットは平文を持つ（端末は利用者の管理下にあり、検索と表示に要る）。JSON バックアップは本文を含めるのが既定で、「本文を含めない」も選べる。

### 9.3 鍵の受け渡しと復旧

| 場面 | 流れ |
|---|---|
| 初回ログイン | 端末でアカウントの鍵と復旧コードを作り、復旧コードから HKDF で導いた鍵でアカウントの鍵を暗号化してサーバーに置く。復旧コードを画面に出し、保管したことの確認（最後のまとまり5字の入力）を取る |
| 作品を初めて同期する | 作品の鍵を作り、アカウントの鍵で暗号化して `project_keys` に置く |
| 新しい端末（既存の端末がある） | 新しい端末が一時的な ECDH の鍵の組を作り、公開鍵のハッシュ（先に約束だけ）を `device_links` に登録する。既存の端末に「新しい端末からの要求」が出て、既存の端末も一時的な鍵の組を作って公開鍵を返す。新しい端末はそのあとで自分の公開鍵を明かす（約束と照合する）。両方の画面に、二つの公開鍵から計算した6桁の確認番号を出し、一致を確かめてから既存の端末が承認し、ECDH で導いた鍵でアカウントの鍵を暗号化して返す。公開鍵を約束してから明かす順にするのは、運営者が公開鍵をすり替えたうえで確認番号をそろえる（6桁なら総当たりで足りる）攻撃を防ぐためである。要求は10分で失効する |
| 新しい端末（既存の端末が無い） | 復旧コードを入れる |
| 鍵が無いまま使う | 復旧コードも承認もせずに使い始められる。構造のデータはすべて使え、本文の欄に「この端末には本文の鍵がありません」と出る。改訂の取り込みは、新しい版の本文で行うので使えるが、旧版の本文を読めないため対応づけは見出しと番号だけで行う（10.3） |
| 復旧コードの再発行 | 鍵を持つ端末で新しいコードを作り、封筒を差し替える。古いコードは無効になる |
| 復旧コードも端末もすべて失った | 本文は誰にも読めない。構造のデータは残るので、台本ファイルを同じ版名で取り込み直せば本文は戻る。この性質を、復旧コードの発行時に説明する |

復旧コードは120bit の乱数で、人が覚える合言葉ではないので、総当たりに耐えるための遅い KDF は要らない。HKDF-SHA-256 で十分である。

### 9.4 改訂差分と HMAC

改訂差分は端末で、旧版と新版の平文を比べて行う。版ごとのシーン対応表の `body_mac` は、本文の HMAC-SHA-256（作品の鍵から導いた鍵）で、別の端末が「どのシーンが前の版から変わっていないか」を本文を復号せずに判定できる。運営者は鍵を持たないので、短い本文を推測して照合することもできない。

### 9.5 端末での鍵の保存とその代償

アカウントの鍵は IndexedDB に、取り出し可能な `CryptoKey` として置く。取り出し不可にすると、新しい端末への受け渡しと復旧コードの再発行ができなくなるからである。代償として、画面に悪意のあるスクリプトが入り込めば鍵を持ち出せる。ただし同じ端末のローカルDBには平文の本文があるので、取り出し不可にしても守れる範囲はわずかである。防御の中心は厳格な CSP（17章）と、外部のスクリプトを読まない構成に置く。

### 9.6 本文を端末だけに置く（F10-5）

作品設定で「本文をクラウドに上げず、この端末だけに置く」（`script_storage='device'`）を選べる。この作品では暗号文の列を送らず、サーバーは本文を持たない。クラウドに上げていた作品で切り替えると、サーバーの `raw_text_enc` と、それを含む上書き履歴の列を消す。別の端末では本文が出ない。

### 9.7 メンバーへの鍵の受け渡し（フェーズ2）

作品の鍵を、メンバーの公開鍵（ECDH）で暗号化した封筒（`wrap_kind='member'`）として渡す。メンバーから外した人がいたら、作品の鍵の版を上げ、以後の本文は新しい鍵で暗号化し、残るメンバーにだけ新しい封筒を作る。外した人が手元に持っていた旧版の本文は取り戻せないが、以後の本文は読めない（F10-4）。

## 10. 主要アルゴリズム

### 10.1 台本解析

すべての入力を「行の列」に正規化してから、日本式の規則で行の種別を判定する。判定用の文字列だけを NFKC で揃え、表示用の本文は原文のまま残す。正規表現と語彙は `05` 3.4 にある。

| 入力 | 正規化の方法 |
|---|---|
| txt・貼り付け | 文字コードを判定（UTF-8／Shift_JIS）し、改行で分割 |
| docx | mammoth で段落テキストを抽出 |
| PDF | pdf.js の `getTextContent()` で文字片を取る。縦書きの判定は、文字片の向きではなく**フォントの縦書きフラグ**（`styles[fontName].vertical`）と変換行列の回転で行う。pdf.js は縦書きの文字片の幅に字の大きさ、高さに列の長さを入れるので、列は x 座標で束ね、許容幅は**字の大きさの中央値**から決める。右の列から読む |
| 画像だけの PDF | 1ページあたりの文字数が極端に少なければ取り込みを止め、貼り付けか Excel 取り込みへ誘導する（F2-8） |

v0.1 の規則は、レビューで次の誤りが再現された。それぞれ次の規則で直した。

| 誤り | 直し方 |
|---|---|
| 「○ 3丁目の路地」「○ 101号室」の数字を番号と取り違える | 柱の番号は、直後に空白か区切り記号（`.`・`、`・`:`）か行末が来るときだけ番号とみなす。番号が前に来る形（「12 ○公園」）も認める |
| 「〇田が入ってくる」を柱にする | 漢数字のゼロ `〇` は、直後が空白のときだけ柱の記号とみなす。見出しに `「」『』。` を含む行は柱にしない |
| 「遠くで「おーい」と声がする」を話者「遠くで」のセリフにする | 閉じ括弧のあとに文が続く行はト書きにする。音や方向の語（遠くで・奥から…）は話者にしない |
| 「花子が小声で「ばか」」を話者「花子が小声で」にする | 話者の候補に「が」「は」が入っていれば前後に分け、前の語が台本全体で2回以上話者として出ていればその人のセリフ（後ろは修飾）、そうでなければト書き |
| 「テロップ「三年後」」を話者「テロップ」にする | テロップ・字幕・スーパー・タイトル・看板・音・アナウンスなどは人物にしない語彙として持ち、ト書き（字幕・音）にする |
| 「太郎（受話器に向かって）「もしもし」」が一致しない | 括弧の修飾を20字まで許す |
| 「太郎の家・翌朝」「居酒屋・十六夜」の時間帯を誤る | 時間帯は「括弧の中」か「`・`・空白で区切られた最後の部分の全体」が時間帯の語（翌朝・早朝などの複合を含む）に一致するときだけ取る |
| 閉じない括弧が後続の柱を飲み込む | 括弧のつなぎは柱の行で止める（最大20行） |
| 入れ子の括弧を照合しない | 「」と『』を積み上げで照合する |
| 字間を空けた名前（「花　子」）を拾えない | 1字ずつ空白で区切られた話者名は空白を詰める |
| 屋内外を1字の部分一致で数え、人名（山田・森田）に反応する | 見出しを `・` と空白で区切り、各部分の末尾との最長一致か、部分そのもの（「外」「表」「内」）で判定する |
| 話者の判定が出現回数に依存しない場面がある | 話者の確定は常に台本全体での出現回数を条件にする。1回だけの話者は確認画面で印（`single_speaker`）を付ける |

シーン番号の無い台本は出現順に振る。同じ話者を人物の候補にまとめ、表記揺れ（「太郎」と「タロウ」）は取り込み確認で利用者がまとめる。判定に自信のない行には印を付け、確認画面に一覧で出す。

### 10.2 Excel・CSV の取り込み

ExcelJS で xlsx を、自前の読み取りで CSV（UTF-8／Shift_JIS）を読む。利用者が見出し行を選び、各列を「話・番号・柱・時間帯・屋内外・ペラ・尺・撮影見積・撮影日・ロケ地・人物（キャスト）・エキストラ・カテゴリ（衣裳など）・取り込まない」に割り当てる。公開テンプレートと同じ列定義（`templates/columns.ts`）の見出しなら自動で割り当てる。要素の列は、セルが空でなければ印にする（「●」「○」「1」「✓」は印のみ、それ以外の文字は印と備考）。柱の列は台本と同じ規則で時間帯・屋内外・ロケ地を取り出す。印の根拠は `excel`（ファイル名・シート・行）になる。撮影日の列があれば撮影日と割り当てを作る。

### 10.3 改訂差分と引き継ぎ、影響の算出（フェーズ1）

改訂稿は取り込み先の話を選んで解析し、その話の現在のシーン列と対応づける。

1. 本文（判定用に正規化したもの）の HMAC が一致するシーンを「変更なし」として確定する。
2. 残りについて、見出しの類似度と本文の類似度（文字3-gram の Jaccard 係数）を `0.4×見出し＋0.6×本文` で採点する。台本上の順位の差が全体の30%を超える対応は0.1を引く。
3. 0.5以上の候補を、点数の高い順に1対1で確定する。
4. 確定しなかった旧シーンは「削除候補」、新シーンは「追加」とする。
5. 対応した各シーンで、旧本文と新本文の行の差分（Myers 法）を取り、旧版の行番号を新版の行番号へ写す表を作る。

確認画面で、利用者は対応を手で付け替えられる。旧版の本文が読めない端末（鍵が無い）では、1〜3を見出しと番号だけで行い、その旨を出す。

| 対象 | 提案と反映 |
|---|---|
| 変更なし | 番号と行範囲だけ更新 |
| 変更あり | 見出し・番号・行範囲を更新し、`changed_in_version_id` を付ける。紐づく印・割り当て・日々スケはそのまま |
| 印の根拠 | 台本の行を根拠とする印は、行の写像で新しい行範囲に移す。根拠の行がすべて消えたら `ev_lost_in_version_id` を付ける（印は外さない） |
| 話者の増減 | 増えた話者は印の追加を、消えた話者は印を外すことを提案する。外すのは提案だけで、自動では外さない |
| ト書きの要素 | 既存の要素の名前が新しい本文に現れたら印の追加を、旧本文にあって新本文から消えたら外すことを提案する |
| ロケ地 | 柱の見出しの先頭部分が変わったら、ロケ地の付け替えを提案する |
| 追加 | 新しいシーンを作る。話者は人物と印の候補として示す |
| 削除候補 | 行は消さず `status='orphaned'` にする。紐づく印と割り当ては「未割当」の一覧に残り、別のシーンへ付け替えるか、利用者が明示的にゴミ箱へ入れる（F3-5） |

**影響の算出（F3-4）。** 提案を採用した状態の台帳をメモリ上で作り、変わったシーンを含む撮影日ごとに、時間割と日々スケのモデルを前後で比べる。「撮影3日目：出演者に花子が加わります」「撮影3日目：S12 が削除候補になり、時間割から外れます」「撮影5日目：配布済みの版2と内容が変わります（再配布が必要）」の形で一覧にし、新しく起きる検査の結果（NG日など）も添える。確定は1トランザクションで行い、直前に「改訂の取り込み前」のスナップショットを取る。変更の強調表示は、利用者がシーンを「確認済み」（`change_reviewed`）にするまで続ける。

### 10.4 香盤表の導出

```
行   = 削除されていない active のシーン。並びは 話→台本順（既定）・ロケ地順・撮影日順
列   = 固定列（話・番号・柱・時間帯・屋内外・ペラ・撮影見積・撮影日）
       ＋ 列設定で選んだカテゴリの要素（キャスト・エキストラは出番の多い順が既定、他は名前順）
セル = 削除されていない scene_elements があれば印。根拠の種別と、根拠を失ったかどうかを持つ
撮影日列 = shoot_day_scenes から引いた撮影日ラベル（複数可）
```

セルの印を切り替えると、決定的な ID の `scene_elements` を作るか復元するか、`deleted_at` を付ける。手で付けた印の根拠は `manual`。香盤表とブレイクダウンは同じ行を見ているので、どちらで編集しても両方に出る。スタッフは列にならない。尺は列設定で任意に出せる。

### 10.5 総スケの見積と検査

撮影見積は、シーンの `est_shoot_min` があればそれ、無ければ `round(ペラ × minPerPage)`。部分撮影の割り当て（`part` が空でない）は、割り当ての `est_shoot_min` があればそれ、無ければシーンの見積をそのシーンの割り当ての数で等分する。時間割は `call_min + prepMin` から始め、前のシーンとロケ地が変われば `moveMin` を足し、食事の時刻にかかれば休憩を入れ、`fixed_start_min` があればそこまで進める。最後のシーンの終了に `wrapBufferMin` を足したものを撤収見込みとする。編集のたびに、関わる撮影日だけを再計算する。結果は警告として出し、割り当て自体は止めない。

| 検査 | 内容 | 重さ | 要件 |
|---|---|---|---|
| NG日 | その日のシーンに出るキャスト・エキストラの NG日に撮影日が含まれる | エラー | F6-3 |
| スタッフの NG日 | スタッフの NG日に、作品のいずれかの撮影日が含まれる | エラー | F6-3 |
| 撤収の超過 | 撤収見込みが `wrap_min` を超える（ちょうどは超過としない） | 警告 | F6-4 |
| 重複 | 同じシーンが2つ以上の撮影日に入り、そのどれかが部分指定なし | 警告 | F6-5 |
| 未割当 | どの撮影日にも入っていない active のシーン（作品単位の一覧） | 一覧 | F6-5 |
| 日照 | 屋外でロケ地に座標がある。朝・昼・夕のシーンが日の出前か日の入り後にかかる、または夜のシーンが日の入り前にかかる | 注意 | F6-6 |
| 開始の固定の矛盾 | 固定した開始時刻が、前のシーンの終了より前 | 警告 | F7-3 |
| 番号の重複 | 同じ話の中で番号が重なる | 警告 | F1-2 |

ロケ地の利用可能時間（F6-7）と人物別の拘束日一覧（F6-8）はフェーズ2で、列だけ先に持つ。撮影日ごとに、撮影見積・ペラ・出演者数（キャストとエキストラの人数）の合計を出す（F6-2）。日の出・日の入りは suncalc で端末内で求め、撮影日の**正午**の時刻を渡す（0時を渡すと時差で前日の値になりうる）。

### 10.6 日々スケの導出

1. 時間割は 10.5 の `buildTimeline` をそのまま使う。
2. 出演者の入り時間は、初出番の開始時刻から `makeupMin` を引いた値。`person_call` の上書きがあればそれを使う。
3. 部署別の集合は、既定で全体の集合時刻。`dept_call` の上書きがあればそれを使う。部署は作品設定の一覧（演出部・制作部・撮影部・照明部・録音部・美術部・衣裳部・メイク部など）。
4. 各部の準備物は、その日のシーンに紐づく人物以外の要素をカテゴリ別に並べたもの。`dept_note` のメモを足せる。
5. 食事は、時間割が作品設定の既定の昼食（12:00、60分）にかかるときに自動で入る。`meal` の行で時刻・長さ・名前を直したり、外したりできる。
6. 連絡先は作品設定の既定の一覧に `contact` の上書きを重ねる。電話番号は既定で伏せる（F8-7）。
7. 手で上書きした値には印を付け、「自動の値に戻す」で上書きの行の `value` を null にする。

日々スケの上書きを欄ごとの行に分けたので、二人が別の欄を直しても片方が丸ごと負けることはない。日々スケの画面で集合時刻やシーンの開始時刻を直すと、日々スケの上書きではなく撮影日側の正本（6.7）を書き換える。

## 11. 配布と確認（フェーズ1）

### 11.1 流れ

```
[配布者のアプリ]
  1. 日々スケのモデルから配布用の中身（JSON）を作る。前の版の中身との差分を先頭に入れる
  2. 撮影日の配布行（決定的な ID）が無ければ、リンクの鍵 K（256bit）と公開 ID（128bit）を作る
     K は作品の鍵で暗号化して shares.link_key_enc に保存（同期で配布者の他の端末にも届く）
  3. Worker に POST /api/shares（Supabase の JWT 付き。冪等）
  4. 中身を K と新しい IV で AES-256-GCM 暗号化し、PUT /api/shares/{code}/blob（版番号つき）
  5. 配布した中身を作品の鍵で暗号化して share_publications に保存（次の差分の元）
  6. LINE に貼る文面とリンク https://<配布ドメイン>/s/{code}#k=<K> を作る
[閲覧者]
  7. リンクを開く → Worker が閲覧ページを返す（OGP は「日々スケ」と撮影日のラベルだけ）
  8. ページが暗号文を取り、# 以降の K で端末内で復号して表示
  9. 名前を選ぶと、自分の入り時間と出番が先頭に出る。「確認しました」→ POST /s/{code}/ack
```

URL のフラグメントはブラウザからサーバーへ送られないので、Worker・R2・D1 は日々スケの中身も名前も読めない。

### 11.2 リンクと鍵の保管

| 項目 | 決定 | 代償 |
|---|---|---|
| リンクの形 | `/s/{code}#k={K}`。code は128bit、K は256bit の乱数（base64url） | URL が約90字と長い。LINE に貼る分には問題ない |
| K の保管 | 作品の鍵で暗号化して `shares.link_key_enc` に置く。配布者のどの端末からでも同じリンクに再配布できる | 作品の鍵が無い端末からは再配布できない。その場合は新しいリンクを発行し、古いリンクを取り消す |
| IV | 暗号化のたびに新しい96bit の乱数。K は再配布のたびに使い続けるので、IV の使い回しを禁じる | — |
| AAD | `koban-share:v1:{code}:{版}`。古い版の暗号文を新しい版として差し替えられない | — |
| 有効期限 | 既定は撮影日の2日後の終わり（作品のタイムゾーン）。最長は撮影日の30日後 | — |
| 取り消し | R2 の暗号文を消し、以後は「この配布は取り消されました」を返す | — |

### 11.3 閲覧者ごとの表示

中身には、その日に関わる人物（キャスト・エキストラ・日々スケに載せるスタッフ）の一覧を、配布ごとに振った参照 ID（8字の乱数、`shares.ref_map`）つきで入れる。閲覧者が一度自分の名前を選ぶと、選択を閲覧者の端末に記憶し、以後は先頭に「あなたの入り 7:30・出番 S2、S5」を出す。スマホで読める組み（1段組、集合時刻を最大の字、表は縦に積む）を最優先にする。

### 11.4 確認

「確認しました」は（配布、版、参照 ID）の組で D1 に入れ、同じ組は1回だけ数える。配布者は版ごとに、確認した人・前の版だけ確認した人・未確認の人を一覧で見られる（F8-4）。厳密な本人確認はしない。リンクを知る人なら誰の名前でも押せるが、目的は「見たかどうか」の把握で、なりすましの利益が小さいからである。参照 ID と人物の対応は配布者の端末だけが知っているので、運営者には誰が確認したかも分からない。

### 11.5 更新と差分

日々スケを直して再配布すると、同じリンクの中身が新しい版になる（F8-5）。差分は配布者の端末で、前の版の中身（`share_publications` を復号したもの）と新しい中身を比べて作り、集合時刻・場所・シーンの追加と削除と時刻・出演者の増減・人ごとの入り時間の変化を先頭に出す。差分で入り時間や出番が変わった人を「影響を受けた人」とし、未確認の人と合わせて再送用の文面を作れる（F8-6）。日々スケの現在の内容が配布済みの最新版と違う撮影日には、日々スケと撮影日一覧に「再配布が必要」を出す（保存せず、毎回比べて導出する）。

### 11.6 LINE の文面

```
【日々スケ】撮影2日目 10/21(水)
集合 8:00 太郎の家
https://<配布ドメイン>/s/xxxxxxxxxxxxxxxxxxxxxx#k=…
自分の名前を選ぶと入り時間が出ます。見たら「確認しました」を押してください。
```

再配布のときは2行目に「版3に更新：集合が 8:00→7:30 に変わりました」を入れ、未確認の人の名前を末尾に並べられる。文面に入れるのはロケ地の名前だけで、住所・電話番号は入れない。リンクのプレビュー（OGP）には作品名も人名も出さない（未公開作品の題名も守る）。

### 11.7 濫用対策

| 対象 | 方式 |
|---|---|
| 暗号文の取得・閲覧ページ | Workers の Rate Limiting（IP と code の組、60秒あたりの上限）。この制限は場所ごとの概算で厳密ではないが、K が256bit なので総当たりの心配は無く、帯域の濫用を抑えるためだけに使う |
| 確認の送信 | 同上（IP と code の組で60秒に10回）。同じ組の重複は D1 の一意性で無視する |
| 配布の作成・更新 | Supabase の JWT を Worker が `api.share_authorize` に渡して照会し、管理者・編集者だけ通す。結果は60秒だけキャッシュする |

### 11.8 フラグメントが落ちる場合の予備方式

LINE のアプリ内ブラウザで URL のフラグメントが保たれることを、1週目に iOS・Android の実機で確かめる。保たれない環境が見つかった場合に限り、配布ごとに「アクセスコード方式」を選べるようにする。v0.1 の「4桁のコードから鍵を導く」方式は、暗号文を落とせば手元で総当たりできるので採らない。予備方式では Worker が K を預かり（Worker の秘密鍵で暗号化して D1 に置く）、8桁のコードがサーバー側で照合できたときだけ K を返す。試行回数は Durable Object で配布ごとに厳密に数え、5回失敗で15分止め、累計20回で配布者が解除するまで止める。代償として、この方式の配布は運営者が技術的には読める。配布の画面にその旨を出し、既定はフラグメント方式のままにする。

## 12. LLM

### 12.1 AI の下書き（フェーズ2、許可制）

作品ごとに管理者が明示的に有効にした場合だけ使う（F11-1）。有効化の画面で、本文が外部の処理事業者へ送られること、学習に使われないこと（事業者の契約で学習と保存をしないものに限る）を示して同意を取り、同意の日時と人を記録する。

```
端末：対象のシーンの本文を復号 → Edge Function（記録しない中継）→ 処理事業者の LLM
LLM：要素の候補を「名前・カテゴリ・根拠の行範囲」の形で返す
端末：検査 ─ 行範囲が実在するか、名前がその行に現れるか（文字列で照合）
      └ 照合できない候補には「根拠を確認できない」の印を付ける
画面：提案の一覧 → 一件ずつ、またはまとめて採用 → 根拠 ev_kind='ai'（採用者と日時）で印を作る
```

送るのは作品の鍵で守られた本文の平文なので、この機能を使う作品では V5 の「運営者にも読めない」は処理の瞬間に限って破れる。そのことを同意の画面に書く。中継の Edge Function は本文を記録せず、Sentry にも送らない。利用量の上限は有料プランに含める（`03` 第12章）。

### 12.2 接続口（フェーズ2は読み取り、フェーズ3は提案）

利用者がふだん使っている LLM から台帳を読めるよう、MCP（Model Context Protocol）のリモートサーバーを Cloudflare Worker で提供する。認可は OAuth 2.1 で、利用者が作品ごとに許可する。

| 項目 | フェーズ2 | フェーズ3 |
|---|---|---|
| 道具 | 作品の一覧、香盤表、総スケ、日々スケ、検査の結果、版の差分の取得 | 変更の提案（印の追加・削除、割り当ての変更、時刻の変更） |
| 本文 | **返さない**。サーバーは鍵を持たないので、構造のデータだけを返す。本文が要る作業は、利用者が自分で台本を LLM に渡す | 同左 |
| 書き込み | しない | 提案は `proposals`（新設）に「承認待ち」として入れるだけで、台帳は変えない。利用者がアプリで開くと、端末が人の変更と同じ検査（10.5）を走らせて結果を添え、承認したものだけを通常の書き込みとして反映する。根拠は `ai`（接続口の名前と承認者）、履歴にも残る（F11-4） |

## 13. 画面設計

### 13.1 フェーズ1の画面一覧

| 画面 | ルート | 主な内容 | 要件 |
|---|---|---|---|
| 作品一覧 | `/` | 作品カード（保存状態・保管・クラウド未保存の理由）、新規作成、ゴミ箱、版の履歴への導線 | F1-1、F9-1 |
| 新規作成 | `/new` | 題名・種別・撮影期間、始め方（台本／Excel・CSV／空の表） | F1-1、F2-7 |
| 取り込み | `/p/:pid/import` | 台本ファイル・貼り付け・Excel/CSV、取り込み先の話、版名と改訂日 | F2-1、F2-6 |
| 取り込み確認 | `/p/:pid/import/:draftId/review` | 原文と解析結果、印の一覧、結合・分割・番号の振り直し、話者とロケ地の整理、列の割り当て（Excel） | F2-3〜F2-6 |
| 台本 | `/p/:pid/script` | 縦書き表示（横書き切替）、版の切替、改訂の取り込みへの導線 | F3-1、F3-6 |
| 改訂の差分と影響 | `/p/:pid/revisions/:draftId` | 対応の一覧と付け替え、提案の採否、撮影日と日々スケへの影響 | F3-2〜F3-5 |
| 香盤表 | `/p/:pid/koban` | 高密度のマトリクス、根拠の表示と絞り込み、列の検索、詳細パネル（既定は閉） | F5 |
| 素材 | `/p/:pid/assets` | 人物（区分・部署・NG日・連絡先）、ロケ地、カテゴリ、話 | F4-1、F4-2、F4-6、F4-7、F1-2 |
| 総スケ | `/p/:pid/schedule` | 未割当と撮影日の列、検査の結果、組み替えの影響 | F6 |
| 撮影日一覧 | `/p/:pid/days` | 撮影日ごとの集合・ロケ地・配布の版・確認率・再配布の要否 | F7、F8 |
| 日々スケ | `/p/:pid/days/:did` | 導出と上書き、プレビュー、PDF（A4横・スマホ幅） | F7、F15 |
| 配布と確認 | `/p/:pid/days/:did/share` | 配布・再配布・取り消し、LINE の文面、版ごとの確認、再送の文面 | F8 |
| 上書きの確認と復元 | `/p/:pid/overwrites` | 上書きされた項目と同期できない項目、列ごとの旧値と「この値に戻す」 | F9-2 |
| 版の履歴 | `/p/:pid/history` | 日ごとの版と差分、新しい作品として開く | F9-1 |
| ゴミ箱 | `/trash` | 作品と項目の復元、30日の期限 | F1-3 |
| 作品設定 | `/p/:pid/settings` | 既定値、本文の保存先、保管の切り替え、JSON バックアップ | F1-4、F10-5 |
| 設定・アカウント | `/settings` | ログイン、本文の鍵と復旧コード、端末の承認、表示、退会 | F10-3、F16-1、F16-2 |
| ログイン | `/login` | メールアドレスと6桁のコード | F16-1 |
| 規約・プライバシー・外部送信 | `/legal/*` | 利用規約（本文を学習に使わない旨）、プライバシーポリシー、外部送信の公表 | F10-1 |
| 配布閲覧（アプリ外） | `<配布ドメイン>/s/:code` | スマホ向けの日々スケ、自分の入り時間、確認ボタン | F8-2、F8-4 |

### 13.2 画面遷移

```
起動
 └─ 作品一覧 ─┬─ 新規作成 ─┬─ 台本 → 取り込み → 取り込み確認 → 香盤表
             │            ├─ Excel/CSV → 取り込み → 取り込み確認（列の割り当て）→ 香盤表
             │            └─ 空の表 → 香盤表（最下行の「シーンを足す」）
             ├─ ゴミ箱 ・ 設定・アカウント ・ ログイン
             └─ 作品を開く → 作品ワークスペース（タブ）
                 ├─ 台本（版の切替・改訂の取り込み → 改訂の差分と影響）
                 ├─ 香盤
                 ├─ スケジュール（総スケ）
                 ├─ 日々スケ（撮影日一覧 → 日々スケ → 配布と確認）
                 ├─ 素材（人物・ロケ地・カテゴリ・話）
                 └─ その他（上書きの確認と復元・版の履歴・作品設定）
配布リンク（閲覧者）→ 配布閲覧ページ（アプリ外）
```

### 13.3 レイアウトの基本

| 画面幅 | 構成 |
|---|---|
| 1,024px以上（PC） | 左にタブの縦レール、中央に本体、右に詳細パネル（香盤表では既定で閉じる） |
| 768〜1,023px | 左レールをアイコンのみにし、詳細パネルは下から出るシート |
| 767px以下（スマホ） | 下部タブ5つ（香盤・スケジュール・日々スケ・素材・その他）、詳細は全画面シート |

画面上部の右端に保存状態を常に出す。「端末に保存済み」「同期済み」「同期待ち3件（端末には保存済み）」で、どの状態でも書いたものが端末にあることを伝える。文字の大きさは rem で組み、OS とブラウザの文字サイズに追従する。

### 13.4 主要画面

香盤表（PC、高密度）

```
┌ 香盤 ──── [話:すべて▾][並び:話→台本順▾][列:人物▾ 🔍人物名][根拠の強調][書き出し▾] ┐
│話│ #  │ 柱           │時│内│ペラ│見積│撮影日│太│花│父│母│店│…│衣│衣│小│小│…            │
│ 1│ 1  │ 公園         │夜│外│1.5 │ 90 │1日目 │●│●│  │  │  │ │●│  │●│  │             │
│ 1│ 2  │ 太郎の家・居間│朝│内│2.0 │120 │2日目 │●│  │●ᴴ│  │  │ │  │  │  │  │             │
│ 1│ 3* │ 駅前         │夕│外│0.5 │ 30 │ ─    │  │●!│  │  │  │ │  │  │  │  │             │
│ … 縦横とも仮想スクロール。固定列と見出し行は動かない。セル28px（タッチ端末は44px）       │
└ * 改訂で変わったシーン ᴴ 手入力（台本の行の裏づけなし） ! 改訂で根拠を失った印 ─────────┘
```

1,440px 幅の PC では、タブレール88px と固定列約452px を除いて、28px のセルの要素列が約31列、行が約23行見える（v0.1 の44px では約11列だった）。1,024px 幅でも約16列見える。柱の列は96px まで縮められる。表は WAI-ARIA の grid の作法で作り、タブ停止は表全体で1つ、矢印でセルを移り、スペースで印を切り替える。

総スケ（PC）

```
┌ スケジュール ──────────────────────────────────────── [＋撮影日][書き出し▾] ┐
│ 未割当(4)        │ 1日目 10/20(火) 公園     │ 2日目 10/21(水) 太郎の家      │
│ ┌──────────┐     │ 集合 6:30 撤収予定 19:00 │ 集合 8:00 撤収予定 20:00      │
│ │S3 駅前 夕│     │ ┌S1 公園 夜 1.5p 90分┐  │ ┌S2 居間 朝 2.0p 120分┐       │
│ └──────────┘     │ └────────────────────┘  │ └─────────────────────┘       │
│                  │ ほか4シーン               │ ほか1シーン                   │
│                  │ 見積計 690分 出演 4人     │ ⛔ 父：NG日                    │
│                  │ ⚠ 撤収見込み 20:30 > 19:00│                               │
│                  │ ⓘ S1 夜：日の入り前にかかる│                              │
└ シーン片はドラッグか「移動先を選ぶ」で割り当て・並べ替え。警告を押すと原因へ ─────┘
```

1日目の撤収見込みは、集合6:30＋準備60分で7:30開始、見積計690分と昼食60分を積んで20:00終了、撤収までの30分を足して20:30（10.5 の規則どおり。同じロケ地なので移動は無い）。S1 は夜のシーンだが、この並びでは日の入り前にかかるので注意が出る。

日々スケ（スマホ、フェーズ1版）

```
┌ 2日目 10/21(水) ───────── [配布] ┐
│ 集合 8:00  太郎の家（地図）      │
│ 日の出 5:58 日の入 16:48          │
│ ─ 変更点（版3） ─                 │
│ 集合 8:30→8:00                    │
│ ─ 予定 ─                          │
│ 9:00  S2 居間・朝   太郎・父      │
│ 11:00 S5 玄関・昼   太郎          │
│ 12:00 昼食（60分）                │
│ ─ 出演者の入り ─                  │
│ 太郎 7:30 ✎  父 8:00              │
│ ─ 部署別の集合 ─ 撮影部 7:30 …    │
│ ─ 準備物 ─ 衣裳：制服 / 小道具：傘│
│ ─ 移動・注意事項・連絡先 ─        │
│ 確認 5/8  [確認状況]              │
└───────────────────────────────────┘
```

時刻は 10.5・10.6 の規則どおり（集合8:00＋準備60分で9:00開始、S2 の見積120分で11:00、S5 の見積60分で12:00、昼食はその境目に入る。父の入りは初出番9:00の60分前）。✎ は手で上書きした値（太郎は自動なら8:00）で、押すと「自動の値に戻す」が出る。日の出・日の入りは例で、計算結果ではない。

### 13.5 共通の振る舞い

| 振る舞い | 設計 |
|---|---|
| 取り消し | 作品内の直近の編集を Ctrl/⌘+Z と画面上のボタンで戻せる |
| 削除 | どの項目も「ゴミ箱へ移す」で、トーストに「元に戻す」を5秒出す |
| 警告 | エラー・警告・注意の3段階。色だけに頼らず記号と語を併記する |
| 空状態 | 各画面で「次にやること」を一文と一つのボタンで示す |
| 閲覧のみ | 保管中の作品・別のタブで開いている・スキーマが新しすぎる、のときは上部に理由の帯を出し、編集の部品を無効にする。書き出しはできる |
| 本文の鍵が無い | 本文の欄に理由と「復旧コードを入れる」「ほかの端末で承認する」を出す |

## 14. 帳票設計

### 14.1 帳票の一覧

帳票は画面と同じ導出データを帳票テンプレートに流して出す。PDF はすべて端末内で生成する（寸法は `05` 第10章）。

| 帳票 | 形式 | 用紙（選択） | 構成 | 要件 |
|---|---|---|---|---|
| 香盤表 | PDF・Excel | A3横（既定）・A4横 | 表題・作品名・版・出力日。行＝シーン、列＝固定列＋選択カテゴリ。改ページで見出し行と固定列を繰り返す | F15-1、F15-2 |
| 総スケ | PDF・Excel | A4横（既定）・A3横 | 撮影日ごとの見出し（日付・ロケ地・集合・撤収見込み・合計）とシーン行（番号・柱・時間帯・屋内外・ペラ・撮影見積・出演者） | F15-1 |
| 日々スケ | PDF・Excel | A4横（既定）・スマホ幅（90×160mm の縦長。PDF のみ） | 集合・場所・変更点・予定・出演者の入り・部署別の集合・食事・準備物・移動・注意事項・連絡先 | F15-1、F15-2 |
| 衣裳表 | PDF・Excel | A4縦 | 衣裳カテゴリの要素を持ち主ごとにまとめ、出るシーンと撮影日を並べる | F15-1 |
| 小道具表 | PDF・Excel | A4縦 | 小道具・美術などの要素ごとに、出るシーンと撮影日 | F15-1 |
| 人物別の出番表 | PDF・Excel | A4縦 | キャスト・エキストラごとに、出るシーンと撮影日、撮影日ごとの入り時間 | F15-1 |

A4横の日々スケを幅390px のスマホで開くと、幅842pt が390px に縮むので 1pt が約0.46px になり、9pt の本文は約4px で読めない。スマホ幅の版（幅90mm＝255pt）なら 1pt が約1.53px になり、9pt の本文が約14px で読める。配布の閲覧ページ（第11章）はさらにスマホ向けの HTML で組む。

Excel は ExcelJS で罫線・結合セル・列幅・印刷範囲まで設定する。公開する無料テンプレートは同じ列定義から生成するので、書き出した表はそのまま取り込み直せる（F15-3）。

### 14.2 フォント

実行時に Google Fonts から読まない。すべて自前で同梱し、CSP の `font-src` は自ドメインだけにする。

| 用途 | フォント | 同梱の形 | 容量の上限 |
|---|---|---|---|
| UI・本文 | BIZ UDPGothic 400／700（OFL） | woff2 を `unicode-range` で分割（JIS 第1・第2水準、かな、記号、英数）。Service Worker で全分割を事前に保存 | 2ウェイトで合計5MB |
| 時刻・番号 | BIZ UDGothic 400（等幅） | 英数字と記号だけのサブセット | 100KB |
| 台本の表示 | BIZ UDPMincho 400 | UI と同じ分割 | 2.5MB |
| PDF | Noto Sans JP 400／700 の静的 TTF | 初回起動後、通信がある間に裏で取得して保存。@react-pdf が埋め込み時にサブセット化する | 2ウェイトで合計12MB |

PDF のフォントが未取得のまま圏外で PDF を出そうとしたときは、`E_PDF_FONT` を出して Excel を案内する。@react-pdf の日本語の折り返し（語の区切りが無い文の改行）と、香盤表300行の生成時間は、1週目の試作で実測して目標を決める（`03` 第8章）。

## 15. 外部連携

| 連携先 | 用途 | 呼び出し方 | 失敗時 |
|---|---|---|---|
| 国土地理院 住所検索 | ロケ地の住所→座標 | 端末から直接呼ぶ | 地図上で手で位置を指定 |
| 地理院タイル | 地図表示 | MapLibre で直接表示。出典を明記 | 地図を出さず住所だけ表示 |
| Resend（SMTP） | ログインの確認コード | Supabase Auth の独自 SMTP。送信ドメインに SPF・DKIM・DMARC を設定 | 「メールが届かない場合」の案内。送信元の切り替え先として Amazon SES を用意 |
| 気象庁（フェーズ2） | 日々スケの天気（F7-4） | Worker が府県予報区ごとに1時間キャッシュ | 欄を出さない |
| Stripe・RevenueCat（フェーズ2） | 課金 | 第25章 | — |
| FCM／APNs（フェーズ2） | 配布と更新の通知（F8-8） | Edge Function から送信 | メールで代替 |

## 16. 利用制限（フェーズ1）と課金（フェーズ2）

フェーズ1は無料のベータで、課金はしない。制限の仕組みはフェーズ1で入れる（F16-3）。制限の値は `koban.plan_limits` に持ち、コードに埋め込まない。

| プラン | 対象 | 進行中の作品 | 撮影日 |
|---|---|---|---|
| `free` | ログインしていない端末だけの作品 | 2本 | 1作品5日 |
| `beta` | フェーズ1でログインした利用者 | 10本（仮） | 無制限（仮） |

`beta` の値は、フェーズ1の KPI（撮影日6日以上の作品の数）を測れるよう撮影日を無制限にした仮の値で、未決事項とする。

| 制限 | 判定の場所 | 内容 |
|---|---|---|
| 進行中の作品の数 | 端末（作成・保管の解除のボタン）とサーバー（`create_project`、`set_project_active`、作品の復元） | 超える作品は保管（閲覧と書き出しのみ）として作る・戻す。消さない |
| 撮影日の数 | 端末（撮影日の追加のボタン）とサーバー（`sync_push` の撮影日の行） | 端末では追加を止めて案内する。2台のオフライン編集で超えた分は、サーバーがゴミ箱に入れた状態で保存して `limited` を返す |
| 書き出しのサービス名 | 端末 | 無料（`free`・`beta`）はフッターにサービス名を入れる |
| 写真の容量 | サーバー（送信前の照会） | 1作品500MB |

端末だけの作品の制限は端末の中の判定なので、開発者ツールで書き換えれば外せる。抜け穴をゼロにはできないが、クラウド同期・配布・別の端末での利用には登録が要り、そこではサーバーが判定する。

課金（フェーズ2）の方針は第25章に置く。先行予約は、価格を示した支払いを伴わない申込みとして、ランディングページのフォームで受け付ける（Worker と D1。台帳とは別）。

## 17. セキュリティとプライバシー

| 項目 | 設計 |
|---|---|
| 通信 | すべて HTTPS。アプリの CSP は `default-src 'self'`、`connect-src` は自ドメイン・Supabase・配布 Worker・国土地理院だけ、`font-src 'self'`、`script-src 'self'`（インラインのスクリプトを使わない）、`frame-ancestors 'none'` |
| 認証 | Supabase Auth のメールの確認コード（6桁、10分有効）。Web のセッションは Supabase 標準の localStorage に置き、厳格な CSP で守る（メモリだけでは再読み込みのたびにログインが要り、オフライン起動ができない） |
| 権限 | 7.6。Edge Function・Worker も同じ `member_role` で判定 |
| 台本の本文 | 第9章。端末で暗号化、運営者は鍵を持たない。解析の改善・統計・AI の学習・第三者提供に使わず、利用規約とアプリ内に明記する（F10-1）。精度の改善は手直しの件数と、許諾を得たサンプルだけで行う（F10-6） |
| 連絡先 | 別テーブル＋閲覧者不可。配布では電話番号を伏せるのが既定 |
| 配布 | 第11章 |
| 共有の端末 | 端末の作品には、最後に結び付いたアカウント（`local_owner`）を持たせる。別のアカウントでログインしたときは、その作品を一覧に出さず、自分のアカウントへ上げる候補にもしない。候補にするのは、誰のアカウントにも結び付いていない作品だけ |
| 保存データ | Supabase の保存時暗号化に加え、本文は第9章の暗号化。写真は非公開バケット |
| ログ | Sentry には台本の本文・人物名・ロケ地名・連絡先・写真を送らない。送信前のフィルタで該当の欄を消し、エラーの種類と画面名だけを送る |
| 個人情報保護法 | 利用目的の公表、安全管理措置、第三者提供なし、海外リージョン（Supabase・Cloudflare）の利用の情報提供、開示・削除請求の窓口、退会時の削除 |
| 外部送信規律 | 電気通信事業法の外部送信規律に該当するかを公開前に確認し、送信先（Sentry など）を公表するページを置く |
| 特定商取引法 | フェーズ2の課金開始までに整える。フェーズ1の先行予約は支払いを伴わないことを明記し、扱いを公開前に確認する |

## 18. エラー処理と縮退動作

| 状況 | 振る舞い |
|---|---|
| 圏外・オフライン | 全機能が動く（配布の新規作成と確認の取得を除く）。同期待ちの件数を上部に出し、回復時に自動で送る |
| Supabase 停止 | オフラインと同じ扱い。配布の閲覧は Cloudflare 側なので影響なし |
| 同期の衝突 | 8.3・8.4。上書きされた項目を通知し、上書きの確認と復元の画面から戻せる |
| 1行だけ同期できない | その行だけを止め、他の行は送る。5回失敗したら「同期できない項目」に移す |
| 本文の鍵が無い | 構造のデータは使える。本文の欄だけ理由を出す |
| 台本解析の失敗 | 取り込み自体は成功させ、全文を1シーンとして置く。確認画面で分割を促す |
| 画像だけの PDF | 取り込みを止め、貼り付けか Excel を案内する |
| PDF 生成の失敗 | 原因（フォント未取得・容量不足など）を出し、Excel 出力を代わりに出す |
| 端末の容量不足 | 写真とスナップショットの保存を止めて通知する。データ本体の保存は止めない |
| 別のタブで開いている | 読み取り専用の案内と「こちらで開く」 |
| 外部 API（地図）の失敗 | 該当欄を出さないだけで、画面は壊さない |

## 19. 非機能要件の実現方法

| 要件 | 実現方法 |
|---|---|
| 香盤表（シーン300・列150・撮影日60）を2秒以内 | 縦横2軸の仮想化で、描画するセルを画面内の千個程度に限る。導出は `scene_elements` を一度だけ走査して行ごとの集合にし、変更通知でメモ化する |
| 編集の反映200ms以内 | ローカルDBへの書き込み後すぐに画面へ通知し、同期は後ろで走らせる |
| PDF の生成時間 | 1週目の試作で実測し、目標を決める（`03` 第8章）。帳票ごとにページを分けて生成する |
| オフライン | ローカルDBが正。Service Worker でアプリ本体とフォントを保存する |
| 端末対応 | Chrome・Safari・Edge の最新2版（OPFS 必須）。フェーズ2で iOS 16以上・Android 10以上 |
| 多言語 | 文言は ja と en の同じ形の辞書で持ち、型で欠けを検出する。縦書きは日本語台本のみ |
| アクセシビリティ | コントラスト比4.5:1以上、部品の境界3:1以上、rem による文字サイズ追従、香盤表の grid の作法、タッチ対象44px以上 |

## 20. 運用と監視

障害の検知は Sentry（アプリと Worker）と、Supabase・Cloudflare の標準ダッシュボードで行う。指標は個人を特定しない件数だけを `daily_counts` に入れる（`05` 第13章）。本文は計測に一切使わない。

日次ジョブは pg_cron で、ゴミ箱の30日経過分の物理削除と墓標の作成、退会の30日経過分の削除（Edge Function を呼ぶ）、失効した端末の承認要求の削除を行う。上書き履歴は作品が存続する間は消さない。配布の期限切れは Worker の cron で R2 から消す。

## 21. テスト方針

| 対象 | 方法 | 合格基準 |
|---|---|---|
| 台本解析 | `fixtures/scripts` の実在書式のサンプル（20本以上、許諾済み）でゴールデンテスト。加えて、レビューで見つかった反例をすべて単体テストにする | 柱の検出率98%以上、話者の検出率95%以上、反例はすべて正しい判定 |
| 改訂差分 | 実際の改訂稿の組（準備稿→決定稿）で対応の正解を用意 | 対応の正解率95%以上、印と割り当ての消失0件 |
| 同期 | fast-check で端末3台の任意の編集・削除・復元・同期の順序と、通信の失敗・応答の消失・時計のずれを生成 | 全端末とサーバーの一致、どの版も現行か履歴か `conflicts` に残る、決定的な ID の行が重複しない、送信中の新しい編集が巻き戻らない |
| SQL と権限 | pgTAP。管理者・編集者・閲覧者・非メンバー・`anon` の5種類の JWT で各 RPC と直接のテーブル操作を試す。実行権限の監査クエリを CI で回す | 7.6 の表どおり。許可一覧に無い関数を `anon`・`authenticated` が実行できたら失敗 |
| 暗号 | 封筒の往復、AAD の不一致で復号に失敗する、復旧コードの流れ、端末間の受け渡し（確認番号の不一致で止まる） | 全件 |
| 香盤導出・検査・日々スケ | Vitest の単体テスト | 境界値（日付またぎ、24時超、見積なし、ちょうど撤収時刻） |
| 配布 | `@cloudflare/vitest-pool-workers` で Worker の API、Playwright で閲覧ページの復号・名前の選択・確認。LINE のアプリ内ブラウザで実機確認 | 復号・確認・取り消し・期限が動く |
| 帳票 | 固定データから PDF を生成し、ページ数と抽出テキストをスナップショット比較 | 差分なし |
| 画面 | Playwright（Chrome・WebKit）で主要フロー、複数タブの引き継ぎ、オフライン | 毎回の CI で通過 |
| 性能 | 基準の PC（決めて固定）で香盤表300×150の表示と編集を計測 | 2秒以内・200ms以内 |

## 22. CI／CD とリリース

GitHub Actions で、プルリクエストごとに型検査・単体テスト・性質テスト・ローカルの Supabase に対する pgTAP（権限の監査を含む）・Worker のテスト・Web のビルド・Playwright を回し、Cloudflare Pages にプレビューを出す。main への統合で、Web の本番と Worker をデプロイする。データベースのマイグレーションは `supabase/migrations` の順番付きファイルで管理し、手動の承認を経て本番へ適用する。変更は後方互換の形（列の追加→アプリの更新→旧列の削除）だけで行い、**サーバーを先に**更新する。同期の RPC は知らない列を無視し、送られなかった列を残すので、古いアプリが新しいスキーマと同期しても壊れない。アプリのスキーマ版が最低版を下回ったら `E_SCHEMA_TOO_OLD` で更新を促す。フェーズ2で Capacitor のビルドを加える（iOS は macOS ランナーで TestFlight、Android は内部テストトラック）。

## 23. 固定費の見積

為替は US$1＝¥150 とする。

| 項目 | フェーズ1の月額 | 備考 |
|---|---|---|
| Supabase Pro | 約 ¥3,750（US$25） | 無料プランは使われないと休止するので本番は Pro |
| Cloudflare Workers Paid | 約 ¥750（US$5） | Pages・Workers・R2・D1・Durable Objects。無料枠でも動くが、上限の余裕を取る |
| Resend Pro | 約 ¥3,000（US$20、月5万通） | 無料枠は1日100通の上限があり、確認コードの本番運用に足りない。Amazon SES なら1,000通 US$0.10 で、月数百円に下げられる |
| Sentry | ¥0 | 開発者プラン |
| ドメイン | 約 ¥200 | — |
| 小計 | **約 ¥7,700** | — |
| PowerSync Pro（採った場合のみ） | 約 ¥7,350（US$49 から） | 合計は約 ¥15,050 |

フェーズ2で加わるもの：Apple Developer 約 ¥1,240（年 US$99 の月割）、Google Play 初回 US$25、RevenueCat（月の売上 US$2,500 までは無料、超えると売上の1%）、Stripe（決済額の3.6%）、ストアの手数料、LLM の処理事業者の利用料。合計は `03` 第14章の固定費（月約¥1万〜2万）に収まる。

## 24. フェーズ1の実装計画（20週）

各区切りの終わりに、Web 版を動く状態で残す。

| 区切り | 週 | 内容 | 終了条件 |
|---|---|---|---|
| S0 試作と判断 | 1 | 同期エンジン（PowerSync と自作）の判断（8.11）、LINE のアプリ内ブラウザでのフラグメント保持（11.8）、@react-pdf の日本語の折り返しと速度、Safari での OPFS と複数タブ | 判断を記録し、本書と `05` の該当箇所を確定する |
| M1 基盤 | 2〜4 | モノレポ、スキーマ生成、ローカルDB とタブの引き継ぎ、repository と変更通知、作品・話・ゴミ箱、JSON バックアップ、スナップショットと版の履歴の画面、フォントと PWA、端末側の制限 | 作品を作って消して戻せる。オフラインで再起動しても残る。昨日の版を新しい作品として開ける |
| M2 取り込み | 5〜8 | txt・PDF・docx の取り込みと日本式解析、取り込み確認、ロケ地の抽出、Excel・CSV の取り込み、空の表から始める、縦書き表示、改訂の対応づけと行の写像（core のみ） | ゴールデンテストとレビューの反例がすべて通る。Excel テンプレートが往復できる |
| M3 台帳と香盤 | 9〜11 | 素材（人物・ロケ地・カテゴリ・話）、根拠つきのブレイクダウン、高密度の香盤表（仮想化・grid・絞り込み）、香盤表・衣裳表・小道具表・出番表の PDF と Excel | 300×150で表示2秒以内 |
| M4 スケジュール | 12〜14 | 撮影日と割り当て、検査、日照、日々スケの導出と上書き、日々スケ（A4横・スマホ幅）と総スケの PDF・Excel、撮影日一覧 | 短編1本の総スケと日々スケを Excel なしで作れる |
| M5 同期と秘匿 | 15〜17 | ログイン（独自 SMTP）、同期の RPC と権限、送信待ち、墓標、作品の登録と制限、暗号化・復旧コード・端末の承認、上書きの確認と復元、退会 | 性質テストと権限の監査が通る。2端末で同じ作品を編集できる。運営者の DB に本文の平文が無い |
| M6 追従と配布 | 18〜19 | 改訂の差分と影響の画面と確定、配布 Worker、閲覧ページ、確認、差分つきの再配布、LINE の文面 | 改訂を2回またいで、配布と確認を集められる（`03` 第13章の合格条件） |
| M7 公開 | 20 | 規約・プライバシー・外部送信の公表、計測、ランディングページと先行予約、ベータ公開 | 公開 |

ランディングページ・無料テンプレート・集客記事は開発と並行して M1 から進める（開発の週には含めない）。

## 25. フェーズ2の方式

フェーズ2の詳細設計は、フェーズ1の実測（解析の精度、同期の規模、配布の利用）を見てから行う。方式だけを記す。

| 機能 | 方式 |
|---|---|
| メンバーと権限（F1-5、F1-6） | 招待はメールのリンク（トークンのハッシュを保存、期限つき）。役割は 7.6 の表。役割の変更は 8.9。鍵の受け渡しは 9.7 |
| 課金（F16-4〜F16-6） | 作品プラン（¥9,800／作品、6か月編集）と会社プラン（¥29,800／月、請求書払い・適格請求書）。Web は Stripe（請求書払いは Stripe Invoicing の銀行振込）、ストアは RevenueCat。権利の情報を返すビューは `security_invoker` で動かし、RLS で本人の行だけを見せる（v0.1 のビューは全員の課金状態を漏らしていた）。Webhook は署名を検証し、事象 ID で重複を無視し、事象の発生時刻より古い事象では権利を戻さない（単調性）。返金・プランの移行・支払い者の変更を扱う。降格しても作品は消さず、保管にする。特商法の表記、継続課金の最終確認画面を課金の開始前に置く |
| ストア版 | Capacitor。ローカルDBは @capacitor-community/sqlite。Apple の審査（Web を包んだだけと見なされないこと、アプリ内の退会）と、Google Play の個人アカウントのクローズドテスト（12人以上・14日間）を日程に入れる |
| ショットリスト（F12） | `shots`（番号・サイズ・アングル・動き・レンズ・内容・セリフ範囲・段取り・本番・備考）。カット番号の書式は「S1-1」「1-1」「1-①」から選ぶ。カットの見積があるシーンはその合計を撮影見積に使う |
| 配置図・写真・絵コンテ（F13-1、F13-3、F13-4） | v0.1 の方式（Konva、`blocking_diagrams`、`media`、`storyboards`）を引き継ぐ |
| ビューファインダー（F13-2） | 再現したい画角 `θt = 2·atan(W / 2f)`（W はセンサーの、フレームの長辺方向の幅）。端末カメラの長辺方向の画角 `θL` と短辺方向の画角 `θS` をネイティブから取る。横持ちでは `k = tan(θL/2) / tan(θt/2)`、縦持ち（フレームの長辺が画面の短辺に沿う）では `k = tan(θS/2) / tan(θt/2)`。35mm 換算26mm の端末は長辺69.4°・短辺49.6°で、取り違えると約1.5倍ずれる（tan 34.7° ÷ tan 24.8° ≒ 1.50）。既定は横持ち固定 |
| 現場モード（F14） | 当日の日々スケとカットをオフラインで一画面に。消し込みはボタンで行い、スワイプは既定で切る。表示の切り替えは画面の下部。屋外用の高対比ライトと夜用のダークを切り替える |
| AI の下書き・接続口 | 第12章 |
| 通知（F8-8） | FCM／APNs とメール |
| 天気（F7-4） | 気象庁の予報 JSON を Worker で中継。非公式の形式なので、取れなければ欄を出さない |

## 26. 要件との対応

| 要件 | 主な設計箇所 | 画面 | フェーズ |
|---|---|---|---|
| F1 作品・話・メンバー | 6.2、7.3、7.4、7.6、8.7 | 作品一覧、新規作成、素材（話）、ゴミ箱 | 1（メンバー・複製は2） |
| F2 取り込み | 10.1、10.2 | 取り込み、取り込み確認 | 1（Fountain・fdx は2） |
| F3 台本の表示と改訂 | 9.4、10.3 | 台本、改訂の差分と影響 | 1（注釈は2） |
| F4 ブレイクダウンと根拠 | 6.3〜6.6、10.4 | 香盤表、素材 | 1（本文の語の選択は2） |
| F5 香盤表 | 10.4、13.4、14.1 | 香盤表 | 1 |
| F6 総スケと検査 | 6.7、10.5 | 総スケ | 1（ロケ地の時間・拘束日一覧は2） |
| F7 日々スケ | 6.7、10.6 | 撮影日一覧、日々スケ | 1（天気は2、病院は3） |
| F8 配布と確認 | 第11章 | 配布と確認、配布閲覧 | 1（通知は2） |
| F9 版の履歴と復元 | 8.4、8.8、8.10 | 版の履歴、上書きの確認と復元 | 1（変更記録は2） |
| F10 台本の秘匿 | 第9章、17章 | 設定・アカウント、作品設定、規約 | 1（メンバーへの鍵は2） |
| F11 LLM | 第12章 | — | 2〜3 |
| F12〜F14 ショット・配置図・現場 | 第25章 | — | 2 |
| F15 書き出し | 第14章 | 各画面の書き出し | 1 |
| F16 アカウント・課金・法務 | 第16・17・25章、`05` 第8章 | ログイン、設定・アカウント | 1（課金・特商法・ストアは2） |
| 非機能：データ保全 | 第1章、7.4、第8章 | 保存状態の表示、上書きの確認と復元、版の履歴 | 1 |
| 非機能：同期・権限 | 7.2、7.6、第8章 | — | 1 |

## 27. 未決事項

- 正式名称と、アプリ用・配布用のドメイン
- 同期エンジンを自作するか PowerSync を使うか（1週目に判断）
- `beta` プランの制限値（進行中の作品10本・撮影日無制限は仮）
- 連絡先を暗号化の対象にするか（フェーズ2の通知でメールアドレスを使う場合との兼ね合い）
- LINE のアプリ内ブラウザでフラグメントが保たれない環境があるか（予備方式を作るかどうか）
- 日々スケの標準書式（3現場以上の実物から決める）と、部署の既定の一覧
- 台本解析のテスト用サンプルの収集と許諾
- LLM の接続口の許可の粒度と、AI 下書きの処理事業者
- 先行予約の扱い（支払いを伴わない申込みに特商法の表記が要るか）の法務確認
- 教育プランの申請と審査の流れ

## 付録A　敵対的レビュー（`08`）の反映

| 指摘 | 反映 |
|---|---|
| T1 関数を誰でも呼べる | 7.6（非公開スキーマ、実行権限の取り消し、許可した RPC だけ、`search_path=''`、CI の監査） |
| T2 送らなかった列が NULL | 8.3（現行の行を土台に更新、挿入は既定値、スキーマ版を渡す） |
| T3 1行の例外で全体が巻き戻る | 8.2、8.3（行ごとの捕捉と結果）、7.2（決定的な ID。日々スケの一意制約を廃止） |
| T4 作品の行を編集者が書き換えられる | 7.1、7.6（`apply_project`、管理者だけ、許可した列だけ） |
| T5 送信中の編集が巻き戻る | 8.4 |
| T6 同じ版の再送が偽の衝突 | 8.3（`duplicate`） |
| T7 未来の時計 | 8.6 |
| T8 物理削除と長期オフライン、削除時刻 | 7.4（サーバー時刻、墓標） |
| T9 役割の変更 | 8.9 |
| T10 引き込みの論証 | 8.5 |
| T11 テーブルへの直接の書き込み | 7.6 |
| T12 論理的に同じ行の重複 | 7.2 |
| T13 同じ並べ替えキー | `05` 3.2（同じキーの並びを振り直す） |
| T14 作品の登録が冪等でない | 8.7 |
| T15 無料で唯一の作品を戻せない | 8.7、第16章 |
| T16 複数タブ | 7.7 |
| T17 課金のビューと Webhook | 第25章（課金はフェーズ2。方針のみ） |
| T18 配布の鍵と IV | 11.2、11.8 |
| T19 pdf.js の縦書き | 10.1、`05` 3.4.8 |
| 軽微（4.3） | 独自 SMTP（2章、15章）、suncalc に正午（10.5）、@react-pdf の実測（14.2、24章）、履歴の膨らみ（8.8）、日々スケの欄ごとの行（7.3、10.6）、共有の端末（17章） |
| 4.4 台本解析 | 10.1、`05` 3.4 |
| C1 上書き履歴の90日削除 | 8.8、20章 |
| C2 改名した列名 | 6.7（`_min` に統一）、`05` 全体 |
| C3 時刻の正本が2か所 | 6.7 |
| C4 フェーズの食い違い | 10.5、第25章（天気はフェーズ2、型からも外した） |
| C5 必須要件の欠落 | 撮影見積の列（10.4）、部署別の集合（10.6）、出演者数（10.5）。セリフ範囲はフェーズ2（第25章） |
| C6 衣裳表・小道具表 | 14.1（フェーズ1）、`05` 10.6 |
| C7 ロケ地を作らない | 6.5 |
| C8 尺と撮影見積、撮影難度 | 6.6、第2章 |
| C9 所有者欄と端末の制限 | 7.7、第16章 |
| C10 復元の画面が無い | 13.1（上書きの確認と復元） |
| C11 マイグレーション前のスナップショット | 8.10 |
| C12 スタッフが列になる、NG日が検査されない | 6.4、10.5 |
| C13 課金に要る画面 | 課金はフェーズ2（第25章）。退会・プライバシーポリシー・規約はフェーズ1（13.1） |
| C14 用紙の選択、総スケの PDF | 14.1、`05` 第10章（ショットリストはフェーズ2） |
| C15 曜日・参照・カット番号・人物列の並び・撮影日一覧・未定義の型 | 曜日を訂正（13.4）、カット番号は第25章、人物列は第2章、撮影日一覧は 13.1、型は `05` で定義 |
