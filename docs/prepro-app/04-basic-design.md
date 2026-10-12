# 基本設計書：日本語プリプロダクション統合アプリ（仮称 KOBAN）

| 項目 | 内容 |
|---|---|
| 文書バージョン | 0.1（初版ドラフト） |
| 作成日 | 2026-10-12 |
| 入力 | `03-requirements.md`（要件定義書 v0.1） |
| 対象範囲 | フェーズ1〜2の全機能。フェーズ3（AI補助・日報・病院付与）は方式のみ |
| 位置づけ | 既存プロダクトとは独立した新規リポジトリで実装する前提の設計 |

## 1. 設計方針

設計判断で迷ったときは、次の5原則の上から順に優先する。

1. **利用者のデータを失わない。** 物理削除はゴミ箱の30日経過後のみ。同期・改訂取り込み・課金の降格のどれも、本文を黙って消さない。上書きされた版は必ず履歴に残す。
2. **端末だけで全部動く。** 端末内のデータベースが真実の源で、クラウドは複製。電波のないロケ地で、閲覧・編集・PDF出力・消し込みが完結する。
3. **一つのデータ、複数の見え方。** 香盤表・総スケ・日々スケは保存せず、シーン・要素・撮影日から毎回導出する。転記を設計上なくす。
4. **個人情報は必要な人にだけ。** 連絡先は別テーブルに分けて権限で守る。配布リンクの中身はサーバーが読めない形で置く。
5. **固定費を小さく。** マネージドサービスの無料枠と低額プランの範囲で回る構成にする。

## 2. 要件からの確定事項と変更点

要件定義の未決事項のうち、設計で確定したもの、および要件の記述を設計で改めたものを先に示す。

| 区分 | 要件での記述 | 基本設計での決定 | 理由 |
|---|---|---|---|
| 確定 | クライアント技術は React Native か Flutter か | **React＋TypeScript＋Capacitor**（Web は PWA） | 縦書き台本表示を CSS `writing-mode` で素直に実装でき、巨大な香盤表もDOMで描ける。RN・Flutter はどちらも縦書きの標準サポートが弱い |
| 変更 | 同期は作品単位の最終更新優先 | **行単位の最終更新優先＋上書き履歴** | 作品メンバーの同時編集で、作品単位だと他人の変更を丸ごと消す。行単位なら別々の行の編集は自然に両立し、同じ行の衝突も負けた版を履歴に残せる |
| 変更 | 並び順は配列で保持（暗黙） | 並び順は**行ごとの並べ替えキー**で持つ | 配列の同時編集は衝突しやすい。分数インデックスなら並べ替えが1行の更新で済む |
| 確定 | 配布リンクは本体と分離した静的配信 | **Cloudflare Worker＋R2**。中身は端末で暗号化し、鍵はURLのフラグメントに置く | 本体（Supabase）停止時も閲覧でき、サーバー側は連絡先を平文で持たない |
| 確定 | 天気・日照 | 日の出入り・太陽位置は**端末で計算**。天気は**気象庁の予報JSON**を Worker 経由でキャッシュ | 無料かつ日本の利用に合う。外部API停止時は表示しないだけで機能は壊れない |
| 確定 | 地図・住所検索 | **国土地理院**の住所検索APIと地理院タイル（MapLibre） | 無料で商用利用でき、日本の住所に強い |
| 確定 | PDF出力 | **端末内で生成**（@react-pdf/renderer、Noto Sans JP を同梱） | 個人情報をサーバーへ送らない。全プラットフォームで同じ出力になる |
| 確定 | 個人プランの課金時期 | 個人プランはフェーズ1の最後に入れ、作品プランはフェーズ2 | 公開時点で収益化の検証を始める |
| 確定 | ログイン方式 | フェーズ1はメールOTPのみ。フェーズ2で Apple と Google を同時に追加 | 他社ログインを入れる時点で Apple ログインも求められるため、同時に入れる |

## 3. システム構成

```
┌──────────────────────── 利用者の端末 ───────────────────────┐
│  KOBAN アプリ（React + TypeScript）                          │
│   ├─ UI 層（画面・帳票テンプレート）                          │
│   ├─ core（純粋関数：台本解析・差分・香盤導出・検証・生成）   │
│   ├─ repository（ローカルDBの読み書き＋変更通知）            │
│   ├─ sync（送信待ち行列・HLC・押し込み/引き込み）             │
│   └─ ローカルDB：SQLite                                      │
│        Web=SQLite WASM(OPFS) / iOS・Android=Capacitor SQLite │
│  配布形態：Web(PWA) / iOS / Android（Capacitor）             │
└───────┬─────────────────────────────┬────────────────────────┘
        │ HTTPS（JWT）                │ HTTPS
        ▼                             ▼
┌──────── Supabase ────────┐   ┌──── Cloudflare ─────────────────┐
│ Auth（メールOTP）         │   │ Pages：Webアプリ配信            │
│ Postgres（行同期・RLS）   │   │ Worker：配布リンク /s/{id}      │
│ Storage（写真）           │   │   R2：暗号化した日々スケ        │
│ Edge Functions            │   │   D1：配布メタ・既読            │
│  （招待・課金Webhook・    │   │ Worker：天気プロキシ（1h cache）│
│   容量チェック）          │   └─────────────────────────────────┘
└──────────────────────────┘
        ▲ Webhook
┌───────┴──────────┐   外部API：気象庁 予報JSON／国土地理院 住所検索・地図タイル
│ RevenueCat(IAP)  │   メール送信：Resend　　プッシュ：FCM／APNs（フェーズ2）
│ Stripe(Web決済)  │   監視：Sentry（個人情報・台本本文を送らない設定）
└──────────────────┘
```

閲覧者（キャスト・スタッフ）はアプリもアカウントも要らない。LINEに貼られたリンクを開くと Worker が配信する閲覧ページが動き、端末内で復号して日々スケを表示する。

## 4. 技術選定

| 領域 | 採用 | 主な代替案と不採用の理由 |
|---|---|---|
| 言語・UI | TypeScript 5、React 19、Vite | — |
| ネイティブ化 | Capacitor 7 | React Native：縦書き・大表の描画が弱い。Flutter：縦書き非対応、Web出力の表現力が劣る |
| ルーティング | React Router 7 | — |
| 状態管理 | 画面状態は Zustand、データはローカルDB＋変更通知フック | サーバーキャッシュ系ライブラリは真実の源がサーバーにある前提で、オフラインファーストに合わない |
| ローカルDB | SQLite（Web：公式 SQLite WASM の opfs-sahpool VFS、ネイティブ：@capacitor-community/sqlite） | IndexedDB：iOS の WebView で退避の懸念があり、SQL の集計も書けない |
| 表の仮想化 | TanStack Virtual（縦横の2軸） | — |
| ドラッグ | dnd-kit | — |
| 配置図キャンバス | Konva（react-konva） | SVG直書き：多数オブジェクトのドラッグとPNG書き出しで不利 |
| 地図 | MapLibre GL＋地理院タイル | Google Maps：課金と規約が重い |
| PDF | @react-pdf/renderer＋Noto Sans JP（OFL） | ブラウザ印刷：ネイティブで挙動がばらつく |
| Excel | ExcelJS | SheetJS 無償版：罫線・結合セルなど書式の出力が弱い |
| 台本取り込み | pdf.js（PDF）、mammoth（docx）、自前パーサ（txt・Fountain・fdx） | — |
| カメラ | @capacitor-community/camera-preview＋自前の小さなネイティブプラグイン（画角取得） | — |
| 認証・同期・保存 | Supabase（Auth、Postgres、Storage、Edge Functions） | Firebase：行単位の権限制御と SQL 集計で不利 |
| 配布・天気 | Cloudflare Workers、R2、D1、Pages | — |
| 課金 | RevenueCat（iOS/Android）、Stripe（Web） | — |
| テスト | Vitest、fast-check（同期の性質テスト）、Playwright | — |
| 監視 | Sentry | — |

## 5. リポジトリとモジュール構成

新規リポジトリをモノレポ（pnpm workspaces）で作る。業務ロジックは `packages/core` に純粋関数として集め、UI・DB・ネットワークに依存させない。テストの大半をここに置く。

```
koban/
├─ apps/
│  └─ app/                 React アプリ本体（Web / Capacitor 共通）
│     ├─ src/screens/      画面（第11章）
│     ├─ src/print/        帳票テンプレート（PDF・Excel、第12章）
│     ├─ src/data/         repository、ローカルDBアダプタ（Web / native）
│     ├─ src/sync/         同期エンジン（第8章）
│     ├─ src/platform/     カメラ・ファイル・共有・通知の抽象化
│     ├─ ios/  android/    Capacitor ネイティブプロジェクト
│     └─ plugins/camera-fov/  画角取得のネイティブプラグイン（Swift / Kotlin）
├─ packages/
│  ├─ core/                ドメイン型と純粋関数
│  │   ├─ script/          台本解析（txt・pdfテキスト・docx・fountain・fdx）
│  │   ├─ revision/        改訂差分と引き継ぎ
│  │   ├─ koban/           香盤導出
│  │   ├─ schedule/        総スケ検証・時間見積・繰り越し
│  │   ├─ callsheet/       日々スケ生成
│  │   ├─ sun/             日の出入り・太陽位置
│  │   ├─ optics/          画角計算
│  │   ├─ order/           分数インデックス
│  │   └─ hlc/             ハイブリッド論理時計
│  ├─ schema/              テーブル定義（Postgres と SQLite の両方を生成する元）
│  └─ share-viewer/        配布閲覧ページ（Worker が配信する軽量バンドル）
├─ workers/
│  ├─ share/               配布リンク API と閲覧ページ配信
│  └─ weather/             気象庁予報のプロキシ
├─ supabase/
│  ├─ migrations/          DDL・RLS・同期関数
│  └─ functions/           招待、課金Webhook、容量チェック
├─ templates/              公開用の無料 Excel テンプレート
└─ fixtures/scripts/       台本解析のゴールデンテスト用サンプル（許諾済みのみ）
```

## 6. ドメイン設計

### 6.1 保存するもの、導出するもの

保存するのは「事実」だけにする。シーン、要素、人物、ロケ地、撮影日とその並び、カット、配置図、写真、日々スケの手入力分である。香盤表・総スケ・日々スケ・Day out of Days・衣裳表・小道具表・絵コンテの下書きは、すべて保存データから導出する。手で直した値（日々スケの集合時刻など）だけを上書き分として保存し、導出値に重ねる。

```
      台本(改訂稿) ──解析──▶ シーン ◀──紐づけ── 要素（人物・衣裳・小道具…）
                              │  ▲                   │
                              │  └── カット ── 配置図・写真
                              ▼
      撮影日 ── 並び(shoot_day_scenes) ──▶ 総スケ（導出）
         │
         └── 日々スケ = 導出（その日のシーン・出演者・時刻案） ＋ 上書き分
      香盤表 = シーン × 要素 の射影（導出）
```

### 6.2 主要な型（core）

```ts
type Id = string;            // UUIDv7（端末で採番、時刻順に並ぶ）
type Hlc = string;           // "000017f3a2b4c-0003-<deviceId>" 辞書順で比較できる
type SortKey = string;       // 分数インデックス（例 "a0", "a0V", "a1"）

interface Scene {
  id: Id; projectId: Id;
  number: string;            // 表示番号。改訂で変わっても id は不変
  heading: string;           // 柱の本文（例「公園」）
  locationId?: Id;
  timeOfDay: 'morning'|'day'|'evening'|'night'|'dawn'|'midnight'|'unknown';
  intExt: 'int'|'ext'|'unknown';
  pages: number;             // ペラ換算（200字=1）
  estMin?: number;           // 手入力の見積分
  body: string;              // シーン本文（台本の該当範囲）
  status: 'active'|'orphaned';  // 改訂で消えたシーンは orphaned に退避
  changedInVersionId?: Id;   // 直近の改訂で変わった場合
  sortKey: SortKey;          // 台本上の順序
}

interface Element { id: Id; projectId: Id; categoryId: Id; name: string; personId?: Id; locationId?: Id }
interface SceneElement { id: Id; sceneId: Id; elementId: Id; note?: string }

interface ShootDay { id: Id; projectId: Id; date: string; label: string; callTime?: string; wrapTime?: string }
interface ShootDayScene { id: Id; shootDayId: Id; sceneId: Id; sortKey: SortKey; partial?: { shotIds: Id[] } }

interface Shot {
  id: Id; sceneId: Id; numberLabel: string; sortKey: SortKey;
  size?: string; angle?: string; movement?: string;
  focalLengthMm?: number; sensor?: SensorKey; aspect?: string;
  description: string; estSetupMin?: number; estTakeMin?: number;
  status: 'todo'|'done'|'hold';
}
```

## 7. データ設計

### 7.1 共通カラムと削除・時刻の扱い

同期対象のすべてのテーブルに、次の共通カラムを持たせる。

| カラム | 型 | 意味 |
|---|---|---|
| `id` | uuid | 端末で採番する UUIDv7。オフラインで作っても衝突しない |
| `project_id` | uuid | 所属作品。権限判定と同期の単位 |
| `rev` | text | 最終更新の HLC。衝突時の勝敗をこれで決める |
| `updated_by` | uuid | 最終更新者 |
| `deleted_at` | timestamptz null | ソフト削除。null 以外はゴミ箱 |
| `server_seq` | bigint | サーバーが更新のたびに振る通し番号。差分の引き込みに使う（端末側は null 可） |

物理削除は、ゴミ箱に入って30日を過ぎた行を日次ジョブで消すときだけ行う。作品を削除した場合も、作品の行に `deleted_at` を付けるだけで配下の行には触れず、30日後にまとめて消す。

### 7.2 テーブル定義（Postgres）

SQLite 側は同じ列構成を `packages/schema` から生成する（`jsonb` は TEXT、`timestamptz` は ISO 文字列）。

```sql
-- 作品とメンバー
create table projects (
  id uuid primary key, owner_id uuid not null references auth.users,
  title text not null, kind text not null default 'film',  -- film|short_drama|cm|mv|other
  shoot_start date, shoot_end date,
  settings jsonb not null default '{}',   -- カット番号書式、見積係数、移動時間の既定など
  plan text not null default 'personal',  -- personal|project（作品プラン）
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table project_members (
  project_id uuid references projects, user_id uuid references auth.users,
  role text not null check (role in ('admin','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create table invitations (
  id uuid primary key, project_id uuid references projects, email text not null,
  role text not null, token_hash text not null, expires_at timestamptz not null,
  accepted_at timestamptz
);

-- 台本と改訂
create table script_versions (
  id uuid primary key, project_id uuid not null, name text not null,      -- 例「準備稿」「決定稿」「青」
  revised_at date, source_kind text not null,  -- txt|pdf|docx|fountain|fdx|paste
  raw_text text not null,                      -- 取り込んだ全文（解析前）
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table scenes (
  id uuid primary key, project_id uuid not null,
  number text not null, heading text not null, location_id uuid,
  time_of_day text not null default 'unknown', int_ext text not null default 'unknown',
  pages numeric(6,2) not null default 0, est_min int, body text not null default '',
  status text not null default 'active', changed_in_version_id uuid, sort_key text not null,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table script_version_scenes (    -- 版ごとのシーン対応表（差分と履歴参照用）
  id uuid primary key, project_id uuid not null, version_id uuid not null, scene_id uuid not null,
  number text not null, heading text not null, body_hash text not null,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);

-- ブレイクダウン
create table categories (
  id uuid primary key, project_id uuid not null, key text not null, label text not null,
  color text, builtin boolean not null default false, sort_key text not null,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table elements (
  id uuid primary key, project_id uuid not null, category_id uuid not null, name text not null,
  person_id uuid, location_id uuid,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table scene_elements (
  id uuid primary key, project_id uuid not null, scene_id uuid not null, element_id uuid not null,
  note text,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);

-- 人物とロケ地（連絡先は別テーブル）
create table persons (
  id uuid primary key, project_id uuid not null, name text not null, role_name text,
  kind text not null default 'cast',  -- cast|staff|extra
  dept text, ng_dates jsonb not null default '[]',   -- [{date, note}]
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table person_contacts (
  id uuid primary key, project_id uuid not null, person_id uuid not null,
  tel text, email text, line_id text, note text,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table locations (
  id uuid primary key, project_id uuid not null, name text not null, address text,
  lat double precision, lng double precision, available_from time, available_to time, note text,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);

-- スケジュール
create table shoot_days (
  id uuid primary key, project_id uuid not null, date date not null, label text not null,
  call_time time, wrap_time time, note text,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table shoot_day_scenes (
  id uuid primary key, project_id uuid not null, shoot_day_id uuid not null, scene_id uuid not null,
  sort_key text not null, partial jsonb,        -- {shotIds:[...]} 分割撮影のとき
  planned_start time,                            -- 手で固定した開始時刻（任意）
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table call_sheets (
  id uuid primary key, project_id uuid not null, shoot_day_id uuid not null unique,
  overrides jsonb not null default '{}',   -- 集合時刻・部署別集合・食事・移動・注意事項・各部メモ
  published_version int not null default 0, share_id text,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);

-- ショット・配置図・写真・絵コンテ
create table shots (
  id uuid primary key, project_id uuid not null, scene_id uuid not null,
  number_label text not null, sort_key text not null,
  size text, angle text, movement text, focal_length_mm numeric(6,1), sensor text, aspect text,
  description text not null default '', dialogue_range text,
  est_setup_min int, est_take_min int, status text not null default 'todo', note text,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table blocking_diagrams (
  id uuid primary key, project_id uuid not null, scene_id uuid not null,
  background_media_id uuid, width int not null default 1000, height int not null default 1000,
  items jsonb not null default '[]',  -- [{id,type,x,y,rot,label,shotId?,path?:[[x,y]...]}]
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table media (
  id uuid primary key, project_id uuid not null, kind text not null,  -- frame|location|background|board
  storage_path text, thumb_path text, width int, height int, bytes int,
  focal_length_mm numeric(6,1), sensor text, aspect text, heading_deg numeric(5,1),
  lat double precision, lng double precision, taken_at timestamptz, source text not null default 'app',
  scene_id uuid, shot_id uuid, location_id uuid,
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);
create table storyboards (
  id uuid primary key, project_id uuid not null, scene_id uuid not null,
  layout text not null default 'a4-5', frames jsonb not null default '[]',
  rev text not null, updated_by uuid, deleted_at timestamptz, server_seq bigint
);

-- 上書き履歴（データを失わないための退避先）
create table row_history (
  id bigserial primary key, table_name text not null, row_id uuid not null, project_id uuid not null,
  rev text not null, data jsonb not null,
  reason text not null check (reason in ('overwritten','rejected')),
  recorded_at timestamptz not null default now()
);

-- 課金
create table entitlements (
  user_id uuid primary key references auth.users, plan text not null default 'free',  -- free|personal
  source text, expires_at timestamptz, updated_at timestamptz not null default now()
);
create table project_plans (
  project_id uuid primary key references projects, payer_user_id uuid not null,
  active_until timestamptz not null, source text not null
);
```

主要な索引は `(project_id, server_seq)` を全同期テーブルに張る。加えて `scene_elements(scene_id)`、`scene_elements(element_id)`、`shoot_day_scenes(shoot_day_id, sort_key)`、`shots(scene_id, sort_key)` を張る。

### 7.3 権限

行レベルセキュリティ（RLS）で、作品メンバーかどうかと役割を判定する。判定は `security definer` の関数 `member_role(project_id)` に一本化する。

| 対象 | 管理者 | 編集者 | 閲覧者 | 非メンバー |
|---|---|---|---|---|
| 作品の設定・削除・メンバー招待 | 読み書き | 読み | 読み | 不可 |
| シーン・要素・撮影日・カット・配置図・写真・絵コンテ | 読み書き | 読み書き | 読み | 不可 |
| 人物（名前・役名・NG日） | 読み書き | 読み書き | 読み | 不可 |
| 人物の連絡先 `person_contacts` | 読み書き | 読み書き | **不可** | 不可 |
| 日々スケの配布・取り消し | 可 | 可 | 不可 | 不可 |
| 上書き履歴の閲覧・復元 | 可 | 可 | 不可 | 不可 |

連絡先を別テーブルに分けたのは、RLS が行単位で効く仕組みだからである。同じ行に置くと列単位で隠せない。

### 7.4 ローカルDB

端末側は同じテーブル群に加えて、同期用の管理テーブルを持つ。

| テーブル | 内容 |
|---|---|
| `outbox` | 未送信の変更（table、row_id、rev）。送信成功で消す |
| `sync_state` | 作品ごとの最終引き込み `server_seq` |
| `local_snapshots` | 自動バックアップの記録（第8.6節） |
| `ui_prefs` | 列の表示設定、最後に開いた画面など |

Web では起動時に `navigator.storage.persist()` を要求し、ブラウザの容量整理で消されないようにする。OPFS が使えないブラウザでは起動時に警告を出し、JSON バックアップを促す。

### 7.5 写真の保存

写真は端末で長辺2,048pxに縮小し、400pxのサムネイルを作ってから保存する。端末内では Capacitor の Filesystem（Web では OPFS）に置き、`media` 行にはパスとメタデータを入れる。クラウドには Supabase Storage の非公開バケット `media/{project_id}/{media_id}.jpg` へ送る。Storage の権限も作品メンバー判定で守る。容量の上限は Edge Function が送信前に検査し、超えた場合は端末内には残したまま送信だけ止める。

## 8. 同期設計

### 8.1 方式

行単位の最終更新優先（LWW）とする。勝敗は HLC（ハイブリッド論理時計）で決める。端末の時計がずれていても因果順序が崩れないためである。負けた版は捨てずに `row_history` に退避する。

### 8.2 書き込みの流れ

```
編集操作
  └─ repository.write(table, row)
       ├─ rev = hlc.now()  を付与
       ├─ ローカルDBへ upsert（即座に画面へ反映）
       ├─ outbox に (table, id, rev) を追加
       └─ 変更通知 → 購読中の画面が再計算
同期ワーカー（3秒デバウンス／前面復帰時／通信回復時／30秒ごと）
  ├─ push：outbox の行を最大200行ずつ RPC sync_push へ
  └─ pull：RPC sync_pull(project_id, since_seq) を最大500行ずつ
```

### 8.3 サーバー側の判定（sync_push）

```
各行について：
  既存なし            → 挿入し server_seq を採番
  incoming.rev > 既存.rev → 既存を row_history('overwritten') に退避してから更新
  incoming.rev ≤ 既存.rev → incoming を row_history('rejected') に退避し、既存行を返す
権限：member_role が editor 以上でなければ拒否（閲覧者の端末は送信しない）
```

`sync_pull` は `server_seq > since_seq` の行を作品単位で返す。端末は受け取った行の `rev` が手元より新しい場合だけ上書きする。手元の未送信の変更が負けた場合は、手元の版を端末側の履歴にも残し、画面右上の通知「別の端末の変更で上書きされた項目が1件あります」から復元できるようにする。

### 8.4 並び順

シーンの台本順、撮影日内のシーン順、シーン内のカット順は、配列ではなく各行の `sort_key`（分数インデックス）で持つ。2行の間へ移すときは、前後のキーの中間値を新しいキーにするので、更新は動かした1行だけで済む。二人が同時に別の行を動かしても衝突しない。

### 8.5 作品の初回取得と大きな作品

作品を初めて開く端末は `since_seq = 0` で引き込む。シーン300・カット2,000規模で約5,000行、JSON で数MBなので、分割取得で数秒に収まる。写真は行のメタデータだけを先に取り、サムネイルは表示時、原寸は開いたときに取る。

### 8.6 端末内の自動バックアップ

同期とは別に、作品ごとのJSONスナップショットを端末内へ1日1回、編集があった日だけ保存し、直近7世代を残す。ネイティブではアプリのドキュメント領域、Web では OPFS に置く。設定画面から任意の世代を新しい作品として復元できる。復元は既存の作品を上書きしない。

### 8.7 降格・退会時の扱い

有料から無料へ降格しても、作品は消さない。2本目以降の作品は「閲覧のみ」になり、書き出しはできる。作品プランの期限が切れた作品は、メンバー全員が閲覧のみになる。退会時は本人がオーナーの作品をJSONで書き出せるよう案内したうえで、30日の猶予後に削除する。

## 9. 主要アルゴリズム

### 9.1 台本解析

すべての入力形式を「行の列」に正規化してから、日本式の規則で行種別を判定する。

| 入力 | 正規化の方法 |
|---|---|
| txt・貼り付け | 文字コードを判定（UTF-8／Shift_JIS）し、改行で分割 |
| docx | mammoth で段落テキストを抽出 |
| PDF | pdf.js で文字片と座標を取得。文字片の向き（変換行列）と並びから縦書きか横書きかを判定し、縦書きなら x 座標で列を組んで右から読む |
| fdx | XML の段落種別（Scene Heading／Character／Dialogue／Action）をそのまま行種別に写す |
| Fountain | 標準規則（INT./EXT.、大文字の話者行）で判定 |

日本式テキストの判定規則は次のとおり。全角と半角の揺れは判定用に NFKC で揃えるが、表示用の本文は原文のまま残す。

| 行種別 | 判定規則（上から順に評価） |
|---|---|
| 柱 | 行頭が `○ ◯ 〇` のいずれか、または `S#12`・`#12`・`シーン12` の形。続く数字をシーン番号、残りを見出しとする |
| 時間帯 | 柱の末尾の `（夜）`・`・夜`・`夜` などから、朝／昼／夕／夜／早朝／深夜／日中／夕方／明け方を抽出 |
| 屋内外 | 柱に `外`・`表`・`屋上`・`路上` などの語があれば外、`内`・`室`・`家・〇〇` などで内。判定できなければ不明 |
| セリフ | `話者「…」` の形。話者は12字以内で空白・括弧を含まない語。`（声）`・`（Ｍ）`・`（ＯＦＦ）`・`Ｎ` は話者の修飾として外す |
| セリフ（別行型） | 話者だけの行の直後に `「…」` の行が続く形 |
| ト書き | 上記以外 |

シーン番号が無い台本は出現順に振る。同じ話者名が2回以上出たら人物マスタの候補にする。「太郎」と「タロウ」のような表記揺れは、取り込み確認画面で利用者がまとめる。判定に自信のない行（話者候補が一度しか出ない、柱らしいが記号がない等）には印を付け、確認画面で一覧にして手修正を促す。

### 9.2 改訂差分と引き継ぎ

新しい改訂稿を解析したシーン列と、現在のシーン列を対応づける。

1. 本文のハッシュが一致するものを「変更なし」として確定する。
2. 残りについて、見出しの類似度と本文の類似度（文字3-gramのJaccard係数）を `0.4×見出し＋0.6×本文` で採点する。
3. 0.5以上の候補を点数の高い順に確定する。ただし台本上の順序が大きく入れ替わる対応には減点をかける。
4. 確定しなかった旧シーンは「削除候補」、新シーンは「追加」とする。

確認画面で、利用者は対応を手で付け替えられる。確定すると次のように反映する。

| 結果 | 反映内容 |
|---|---|
| 変更なし | 番号の変化だけ更新 |
| 変更あり | 本文・見出し・番号を更新し、`changed_in_version_id` を付ける。紐づく要素・カット・配置図・写真・撮影日の割り当てはすべてそのまま |
| 追加 | 新しいシーン行を作る。話者は要素の候補として提示 |
| 削除候補 | 行は消さず `status='orphaned'` にする。紐づく成果物は「未割当」一覧に残り、別シーンへ付け替えるか、利用者が明示的にゴミ箱へ入れる |
| 話者の増減 | 追加された話者は要素への追加を提案する。消えた話者を要素から外すのも提案に留め、自動では外さない |

変更の強調表示は、改訂取り込みから14日間、または利用者が「確認済み」にするまで続ける。

### 9.3 香盤表の導出

香盤表は次の結合結果を画面と帳票で描くだけで、専用の保存データを持たない。

```
行 = scenes（status='active'、deleted_at is null）を並び順で
列 = 固定列（番号・柱・時間帯・屋内外・ページ・見積）
   ＋ 表示設定で選んだカテゴリの elements（人物は役名順、他は名前順）
セル = scene_elements に (scene, element) があれば印
撮影日列 = shoot_day_scenes から引いた撮影日ラベル
```

セルの印を切り替えると `scene_elements` の行を作るか、`deleted_at` を付ける。香盤表とブレイクダウンは同じ行を見ているので、どちらで編集しても両方に反映される。

### 9.4 総スケの検証

撮影日ごとに次の検査を、編集のたびに差分で再計算する。結果は警告として表示し、割り当て自体は止めない。判断するのは助監督だからである。

| 検査 | 内容 | 重さ |
|---|---|---|
| NG日 | 割り当てシーンの出演者の `ng_dates` に撮影日が含まれる | エラー |
| ロケ地の時間 | 屋外の見積時間帯がロケ地の利用可能時間の外 | 警告 |
| 拘束時間 | 見積の合計が `wrap_time − call_time` を超える | 警告 |
| 日照 | 屋外の昼シーンの見積時間帯が日の入り後、または夜シーンが日没前 | 注意 |
| 重複 | 同じシーンが複数の撮影日に部分指定なしで入っている | 警告 |

時間の見積は、カットがあればカットの段取りと本番の合計を使う。カットが無ければシーンの手入力見積、それも無ければページ数に作品設定の係数（既定は1ページ＝60分）を掛ける。ロケ地が前のシーンと変わるときは、作品設定の移動時間（既定60分）を足す。

日の出・日の入り・ゴールデンアワーと太陽の方位・高度は、NOAA の太陽位置計算式で端末内で求める。外部APIに頼らず、オフラインでも出る。

### 9.5 日々スケの生成

撮影日を開くと、次の手順で日々スケの下書きを作る。

1. 集合時刻 `call_time` から、準備時間（作品設定、既定60分）を置いて最初のシーンを始める。
2. 各シーンの見積時間を順に積み、シーンごとの予定開始時刻を出す。`planned_start` が手で固定されていれば、それを優先して以降を積み直す。
3. 出演者を集計し、人物ごとに初登場シーンの開始時刻から入り時間を逆算する（作品設定の「メイク・衣裳の準備時間」を差し引く）。
4. ロケ地、天気（取得できた場合）、日の出入りを付ける。
5. 各部のメモは、その日のシーンに紐づく要素をカテゴリ別に並べて「準備物」として自動で列挙する。

`call_sheets.overrides` に保存した手入力値は導出値より常に優先する。配布済みの版と現在の内容の差分（時刻の変更、シーンの追加と削除、出演者の増減）を計算し、再配布時に冒頭へ表示する。

### 9.6 撮り残しの繰り越し

撮影日を「撮了」にしたとき、その日のシーンで `status='todo'` のカットが残っていれば、繰り越し案を出す。繰り越し先は、同じロケ地を使う次の撮影日を優先し、無ければ直後の撮影日にする。カットの一部だけ残った場合は、残りのカットだけを `partial` 指定した割り当て行を作る案になる。案を適用すると `shoot_day_scenes` に行が追加され、すぐに総スケの検証が走る。

### 9.7 絵コンテの下書き

シーンのカットを並び順に1コマずつ並べ、画の枠にはそのカットの構図写真（無ければ空枠）を入れる。内容欄にはカットの説明、セリフ欄には `dialogue_range` に当たるセリフ、秒数欄には本番の見積を入れる。下書きは `storyboards.frames` に保存し、以後の手直しはそちらに積む。カットが増えた場合は末尾に追加の提案を出し、勝手には並べ替えない。

### 9.8 ビューファインダーの画角計算

指定したセンサーの横幅を `W`、焦点距離を `f` とすると、再現したい水平画角は `θt = 2·atan(W / 2f)` になる。端末カメラの水平画角 `θd` は、ネイティブプラグインから取得する（iOS は撮影形式の視野角、Android はセンサーの物理サイズと焦点距離から計算）。表示の拡大率は次の式で決まる。

```
k = tan(θd / 2) / tan(θt / 2)
k ≥ 1 → 端末の映像を k 倍に拡大して再現できる
k < 1 → 端末より広角なので再現できない。超広角レンズがあれば切り替えて再計算し、
        それでも足りなければ「この端末では再現できない広さです」と表示する
```

アスペクト比のフレームラインは、拡大後の映像に重ねる。撮影時には、拡大と切り抜きを適用した画像と、焦点距離・センサー・アスペクト・方位・GPS・時刻を `media` 行に保存する。センサーは代表的な規格（フルサイズ、S35、APS-C、MFT、1インチ、2/3インチ）を内蔵の一覧で持ち、個別のカメラ機種は持たない。

## 10. 日々スケ配布の設計

### 10.1 流れ

```
[配布者のアプリ]
  1. 日々スケを閲覧用 JSON に固める（閲覧者向けの範囲に絞る。連絡先は設定に従って伏せる）
  2. 128bit の鍵 K を生成し、AES-GCM で暗号化
  3. Worker に POST /api/shares（Supabase の JWT 付き）→ shareId（10文字）を受け取る
  4. 暗号文を PUT /api/shares/{shareId}/blob
  5. リンク https://<配布ドメイン>/s/{shareId}#k=<K> を作り、LINE 等へ共有
[閲覧者]
  6. リンクを開く → Worker が閲覧ページ（OGP はタイトルと日付だけ）を返す
  7. ページが暗号文を取得し、URL の # 以降の鍵で端末内で復号して表示
  8. 自分の名前を一度選ぶと「確認しました」ボタンが出る → POST /s/{shareId}/ack
```

URL のフラグメント（`#` 以降）はブラウザからサーバーへ送られないため、Worker と R2 は日々スケの中身を読めない。漏えい時の被害範囲を、リンクそのものを知る人に限る設計である。

### 10.2 Worker の API

| メソッドとパス | 認証 | 内容 |
|---|---|---|
| `POST /api/shares` | Supabase JWT（Worker が JWKS で検証し、作品の編集者以上かを Supabase に照会） | 配布の作成。作品・撮影日・有効期限・OGP 文言を登録し shareId を返す |
| `PUT /api/shares/{id}/blob` | 同上 | 暗号文の登録・更新。版番号を1つ上げる |
| `DELETE /api/shares/{id}` | 同上 | 取り消し。R2 の暗号文を消し、以後は「この配布は取り消されました」を返す |
| `GET /api/shares/{id}/acks` | 同上 | 版ごとの既読一覧 |
| `GET /s/{id}` | なし | 閲覧ページ（期限切れ・取り消し済みなら案内ページ） |
| `GET /s/{id}/blob` | なし | 暗号文 |
| `POST /s/{id}/ack` | なし（1端末1分1回の制限） | 既読の登録（人物の参照ID、版番号） |

D1 には配布のメタデータ（作品ID、撮影日ID、版、有効期限、取り消し日時、OGP 文言）と既読（配布ID、人物参照、版、日時）だけを置く。有効期限の既定は撮影日の2日後で、期限を過ぎた暗号文は日次の後片付けで R2 から消す。

### 10.3 既読の考え方

LINE のグループに1本のリンクを貼る運用を前提に、リンクは1撮影日1本にする。閲覧者は初回に名前の一覧から自分を選び、その選択は閲覧者の端末に記憶する。厳密な本人確認はしない。現場の「見たかどうか」の確認が目的で、なりすましの利益が小さいからである。名前の一覧は人物IDそのものではなく、配布ごとに振り直した参照IDで渡す。

### 10.4 確認が必要な点

LINE のアプリ内ブラウザで URL のフラグメントが保持されることを、iOS と Android の実機で確認する。保持されない場合に備え、配布時に「4桁の閲覧コード」方式へ切り替えられるようにしておく（コードから鍵を導出し、総当たり対策として Worker 側で試行回数を制限する）。

## 11. 画面設計

### 11.1 画面遷移

```
起動
 └─ 作品一覧 ─┬─ 新規作品 → 台本の取り込み → 取り込み確認 → 香盤表
             ├─ ゴミ箱
             ├─ 設定・アカウント・プラン
             └─ 作品を開く
                 └─ 作品ワークスペース（タブ）
                     ├─ 台本（縦書き表示・改訂取り込み・差分確認）
                     ├─ 香盤（香盤表 ⇄ ブレイクダウン）
                     ├─ スケジュール（総スケ／人物別拘束）
                     ├─ 日々スケ（撮影日一覧 → 日々スケ編集 → 配布）
                     ├─ ショット（シーン選択 → カット表 → 配置図／写真／絵コンテ）
                     ├─ 素材（人物・ロケ地・写真ギャラリー）
                     └─ 現場モード（撮影日を選んで全画面）
配布リンク（閲覧者）→ 日々スケ閲覧ページ（アプリ外）
```

### 11.2 レイアウトの基本

| 画面幅 | 構成 |
|---|---|
| 1,024px以上（PC・横向きタブレット） | 左にタブの縦レール、中央に本体、右に選択中の項目の詳細パネル（開閉可） |
| 768〜1,023px（縦向きタブレット） | 左レールをアイコンのみにし、詳細パネルは下から出るシート |
| 767px以下（スマホ） | 下部タブ5つ（香盤・スケジュール・日々スケ・ショット・その他）、詳細は全画面シート |

画面上部の右端には常に保存状態を出す。「端末に保存済み」「同期済み」「同期待ち3件（端末には保存済み）」の3状態で、どの状態でも書いたものが端末にあることを伝える。

### 11.3 主要画面

香盤表（PC）

```
┌ 香盤 ─────────────────────────────── [列設定][並び:シーン順▾][書き出し▾] ┐
│ #  │ 柱             │時間│内外│ペラ│撮影日│ 太郎 │ 花子 │ 父 │ 衣:制服 │ 小:傘 │
│ 1  │ 公園           │ 夜 │ 外 │ 1.5│ 1日目│  ●   │  ●   │    │   ●     │  ●    │
│ 2  │ 太郎の家・居間 │ 朝 │ 内 │ 2.0│ 2日目│  ●   │      │ ●  │         │       │
│ 3* │ 駅前           │ 夕 │ 外 │ 0.5│  ─   │      │  ●   │    │         │       │
│ …（縦横とも仮想スクロール。柱までの列と見出し行は固定）                       │
└ * は直近の改訂で変わったシーン。セルを押すと●を切替。行を押すと右に詳細 ────┘
```

総スケ（PC）

```
┌ スケジュール ───────────────────────────────── [＋撮影日][書き出し▾] ┐
│ 未割当(4)        │ 1日目 10/20(月) 公園 │ 2日目 10/21(火) 太郎の家      │
│ ┌──────────┐     │ 集合 6:30 撤収 19:00 │ 集合 8:00 撤収 20:00          │
│ │S3 駅前 夕│     │ ┌S1 公園 夜 1.5p┐    │ ┌S2 居間 朝 2.0p┐            │
│ └──────────┘     │ └───────────────┘    │ └───────────────┘            │
│ ┌──────────┐     │ ⚠ 見積 13.5h > 12.5h │ ⛔ 父：NG日                   │
│ │S7 …      │     │ ☀ 日の入 17:02       │                               │
└ シーン片をドラッグで割り当て・並べ替え。警告を押すと原因のシーンに飛ぶ ──────┘
```

日々スケ（スマホ）

```
┌ 2日目 10/21(火) ─────────── [配布] ┐
│ 集合 8:00  太郎の家（地図）          │
│ 天気 晴 18℃ / 日の出 5:58 日の入 17:01 │
│ ─ 予定 ─                             │
│ 9:00  S2 居間・朝   太郎・父          │
│ 11:30 S5 玄関・昼   太郎             │
│ ─ 出演者 入り時間 ─                   │
│ 太郎 7:30（メイク）  父 8:30          │
│ ─ 準備物 ─ 衣裳：制服 / 小道具：傘    │
│ 既読 5/8  [確認状況]                  │
└──────────────────────────────────────┘
```

現場モード（スマホ）

```
┌ 現場 2日目 ── 進捗 7/18 カット（予定比 −20分）┐
│ [日々スケ] [カット] [配置図] [VF]            │
│ S2 居間・朝                                  │
│  ✓ 2-1 FS 居間全景   35mm                     │
│  ✓ 2-2 MS 太郎       50mm                     │
│  ○ 2-3 CU 父         85mm   ← 親指で右スワイプで撮了 │
│  ○ 2-4 インサート 湯呑                         │
│ S5 玄関・昼  …                                │
│                          [撮了して繰り越し案を見る] │
└──────────────────────────────────────────────┘
```

ビューファインダー（スマホ）

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │
│ │      （カメラ映像）       │ │  2.39:1 のフレームラインを重ねる
│ │                          │ │
│ └──────────────────────────┘ │
│ S35 ▾   35mm ◀━━●━━▶   2.39:1 ▾│
│ S2 / 2-3 に保存        [ ◯ 撮影 ] │
└──────────────────────────────┘
```

### 11.4 共通の振る舞い

| 振る舞い | 設計 |
|---|---|
| 取り消し | 画面内の直近の操作を Ctrl/⌘+Z と画面上のボタンで戻せる。対象は作品内の編集操作に限る |
| 削除 | どの項目も「ゴミ箱へ移す」で、トーストに「元に戻す」を5秒出す |
| 警告 | エラー（赤）・警告（橙）・注意（青）の3段階。色だけに頼らず記号を併記する |
| 空状態 | 各画面で「次にやること」を一文と一つのボタンで示す（例：香盤表が空なら「台本を取り込む」） |
| 現場向け | ダークモード、文字サイズ追従、主要ボタンは下半分に配置 |

## 12. 帳票設計

帳票は画面と同じ導出データを、帳票テンプレートに流して出す。PDF はすべて端末内で生成する。

| 帳票 | 形式 | 用紙 | 構成 |
|---|---|---|---|
| 香盤表 | PDF・Excel | A3横（A4横も可） | 表題・作品名・版・出力日。行＝シーン、列＝固定列＋選択カテゴリ。改ページ時に見出し行と左列を繰り返す |
| 総スケ | PDF・Excel | A4横 | 撮影日ごとの区切りに日付・ロケ地・集合撤収。行＝シーン（番号・柱・時間帯・ペラ・出演者） |
| 日々スケ | PDF | A4横 | 上段：作品名・撮影日・集合時刻と場所・天気・日の出入り・連絡先（伏せ設定に従う）。中段：時刻つきシーン表。下段：出演者の入り時間表、各部の準備物、注意事項 |
| ショットリスト | PDF・Excel | A4横 | シーンごとにカット表（番号・サイズ・アングル・動き・レンズ・内容・見積） |
| 衣裳表・小道具表 | PDF・Excel | A4縦 | 要素ごとに出現シーンと撮影日 |
| 絵コンテ | PDF | A4縦 | 1ページ5コマ（3コマ・6コマも選択可）。コマ番号・画・内容・セリフ・秒数 |
| 配置図 | PNG・PDF | A4横 | 配置図と凡例、紐づくカット番号 |

Excel は ExcelJS で罫線・結合セル・列幅・印刷範囲まで設定して出す。公開する無料テンプレートは同じ列定義から生成するので、テンプレートで作った表はそのまま取り込める（取り込みは見出し行の列名で照合する）。

フォントは Noto Sans JP の Regular と Bold をアプリに同梱する。Web 版では初回の PDF 出力時に読み込み、Service Worker でキャッシュする。

## 13. 外部連携

| 連携先 | 用途 | 呼び出し方 | 失敗時 |
|---|---|---|---|
| 気象庁 予報JSON | 日々スケの天気 | Worker が府県予報区ごとに1時間キャッシュ。ロケ地の座標→市区町村コード→予報区の対応表は Worker に持つ | 天気欄を出さない |
| 国土地理院 住所検索 | ロケ地の住所→座標 | 端末から直接呼ぶ | 地図上で手で位置を指定 |
| 地理院タイル | 地図表示 | MapLibre で直接表示。出典を明記 | 地図を出さず住所だけ表示 |
| RevenueCat | iOS・Android の課金 | SDK で購入、Webhook で Supabase の `entitlements`／`project_plans` を更新 | 端末側は最後に確認した権利を7日間有効とみなす |
| Stripe | Web の課金 | Checkout と Customer Portal。Webhook で同上 | 同上 |
| Resend | 招待メール、配布の通知メール | Edge Function から送信 | 画面に招待リンクを表示してコピーできるようにする |
| FCM／APNs | 配布・更新の通知（フェーズ2） | Edge Function から送信 | メールで代替 |

## 14. 課金と利用制限の実装

| 制限 | 判定の場所 | 内容 |
|---|---|---|
| 無料は作品1本 | 端末（作成ボタン）とサーバー（`projects` 挿入時のトリガー） | 2本目の作成時にプラン案内。既存作品は消さない |
| 書き出しのサービス名表記 | 端末 | 無料はフッターにサービス名を入れる |
| 配布リンク | Worker（作成時に権利を照会） | 個人プラン以上、または作品プランの作品 |
| 容量 | Edge Function（写真の送信前） | 無料1GB、有料10GB。超過分は端末内に残し送信だけ止める |
| メンバー招待 | サーバー（`invitations` 挿入時） | 作品プランの作品のみ。個人プランは本人の複数端末だけ |

権利の情報は `entitlements` と `project_plans` を正とし、端末は起動時と購入時に取得して保存する。電波がない場合は最後に確認した権利を使う。期限切れ後に降格するときの扱いは第8.7節に従う。

## 15. セキュリティとプライバシー

| 項目 | 設計 |
|---|---|
| 通信 | すべて HTTPS。アプリの CSP は自ドメイン・Supabase・配布 Worker・地理院のみ許可 |
| 認証 | Supabase Auth のメール OTP（6桁、10分有効）。セッションの更新トークンは端末の安全な保存領域（iOS Keychain、Android Keystore、Web は HttpOnly にできないためメモリ＋短い有効期限） |
| 権限 | 第7.3節の RLS。Edge Function・Worker もすべて同じ `member_role` で判定 |
| 連絡先 | 別テーブル＋閲覧者不可。配布時は「電話番号を伏せる」が既定 |
| 配布 | 第10章。中身は端末で暗号化、鍵はフラグメント、期限と取り消し、既読APIは回数制限 |
| 保存データ | Supabase の保存時暗号化。写真は非公開バケット。端末内は OS の保護領域 |
| ログ | Sentry には台本本文・人物名・連絡先・写真を送らない。送信前のフィルタで該当フィールドを消し、エラーの種類と画面名だけを送る |
| AI（フェーズ3） | 既定で無効。有効化時に「台本を外部の処理事業者へ送ること」「学習に使わないこと」を表示して同意を取り、作品単位で切り替える |
| 個人情報保護法 | 利用目的の公表、安全管理措置、第三者提供なし、海外リージョン（Supabase・Cloudflare）の利用を規約とプライバシーポリシーに明記、開示・削除請求の窓口 |
| 特定商取引法 | Web 決済のページに事業者情報・価格・解約条件、継続課金の最終確認画面 |

## 16. エラー処理と縮退動作

| 状況 | 振る舞い |
|---|---|
| 圏外・オフライン | 全機能が動く。同期待ちの件数を上部に出し、回復時に自動で送る |
| Supabase 停止 | オフラインと同じ扱い。配布リンクの閲覧は Cloudflare 側なので影響なし |
| 同期の衝突 | 第8.3節。上書きされた項目を通知し、履歴から復元できる |
| 台本解析の失敗 | 取り込み自体は成功させ、全文を1シーンとして置く。確認画面で分割を促す |
| PDF 生成の失敗 | 原因（フォント未取得・容量不足など）を表示し、Excel 出力を代替として出す |
| 端末の容量不足 | 写真の保存を止めて通知する。データ本体の保存は止めない |
| 外部API（天気・地図）の失敗 | 該当欄を出さないだけで、画面は壊さない |
| 権利の確認ができない | 最後に確認した権利で7日間動かす |

## 17. 非機能要件の実現方法

| 要件 | 実現方法 |
|---|---|
| 香盤表 300×100 を2秒以内 | 縦横2軸の仮想化で、描画するセルを画面内の数百個に限る。導出結果は変更通知でメモ化し、セル単位で差分更新 |
| 編集反映200ms以内 | ローカルDBへの書き込み後すぐに画面へ通知する。同期は後ろで走らせる |
| PDF 10秒以内 | 帳票ごとにページを分割して生成し、香盤表は1,000行まで実測で確認する |
| オフライン | ローカルDBが真実の源。Web は Service Worker でアプリ本体とフォントをキャッシュ |
| 端末対応 | Web：Chrome・Safari・Edge の最新2版（OPFS 必須）。iOS 16以上、Android 10以上（要件定義どおり。Capacitor 7 の最低要件より上に置く） |
| 多言語 | 文言は ja と en の同じ形の辞書で持ち、型で欠けを検出する。縦書きは日本語台本のみ |
| アクセシビリティ | コントラスト比4.5:1以上、文字サイズ追従、キーボード操作（PC の香盤表は矢印キーとスペースでセル切替） |

## 18. 運用と監視

障害の検知は Sentry（クライアントと Worker）と、Supabase・Cloudflare の標準ダッシュボードで行う。指標は個人を特定しない件数だけを Supabase の集計テーブルに入れる（作品作成数、PDF 出力数、配布数、有料転換）。日次ジョブは Supabase の cron で、ゴミ箱の30日経過分の物理削除、`row_history` の90日経過分の削除、期限切れ招待の失効を行う。配布の期限切れは Worker の cron で片付ける。

## 19. テスト方針

| 対象 | 方法 | 合格基準 |
|---|---|---|
| 台本解析 | `fixtures/scripts` の実在書式サンプル（20本以上、許諾済み）でゴールデンテスト | 柱の検出率98%以上、話者の検出率95%以上 |
| 改訂差分 | 実際の改訂稿の組（準備稿→決定稿）で対応付けの正解を用意 | 対応の正解率95%以上、成果物の消失0件 |
| 同期 | fast-check で「複数端末の任意の編集・同期順序」を生成し、最終状態の一致と、どの版も履歴か現行のどちらかに残ることを検証 | 失われる版0件 |
| 香盤導出・検証・日々スケ生成 | Vitest の単体テスト | 境界値（日付またぎ、撤収が翌日、見積なし）を網羅 |
| 帳票 | 生成した PDF のページ数・テキスト抽出結果をスナップショット比較 | 差分なし |
| 画面 | Playwright で Web 版の主要フロー（取り込み→香盤→総スケ→日々スケPDF） | 毎回の CI で通過 |
| 配布 | Worker のテスト（miniflare）と、LINE アプリ内ブラウザでの実機確認 | 復号・既読・取り消しが動く |
| 実機 | iOS・Android の手動チェックリスト（カメラ、オフライン、PDF 共有、課金） | リリース前に全項目 |

## 20. CI／CD とリリース

GitHub Actions で、プルリクエストごとに型検査・単体テスト・Web ビルド・Playwright を回し、Cloudflare Pages にプレビューを出す。main への統合で Web の本番と Worker をデプロイする。ネイティブは Capacitor でビルドし、iOS は macOS ランナーで TestFlight へ、Android は内部テストトラックへ自動で上げる。データベースの変更は `supabase/migrations` の順番付きファイルで管理し、後方互換を保つ形（列の追加→アプリ更新→旧列の削除）でしか変えない。古いアプリが新しいスキーマと同期しても壊れないよう、同期 RPC は知らない列を無視する。

## 21. 固定費の見積

公開から有料ユーザー数百人までの想定。

| 項目 | 月額の目安 |
|---|---|
| Supabase Pro（無料枠は休止があるため本番は Pro） | 約 ¥4,000（US$25） |
| Cloudflare（Pages・Workers・R2・D1） | ¥0（無料枠内。超過時は Workers Paid US$5） |
| RevenueCat | ¥0（月の売上 US$2,500 まで無料） |
| Resend | ¥0（月3,000通まで） |
| Sentry | ¥0（開発者プラン） |
| Apple Developer | 約 ¥1,300（年 US$99 の月割） |
| Google Play | 初回 US$25 のみ |
| ドメイン | 約 ¥200 |
| 合計 | 約 ¥5,500／月 |

決済手数料は別に、ストアが売上の15%（小規模事業者プログラム）、Stripe が3.6%かかる。

## 22. フェーズ1の実装範囲と順序

フェーズ1は16週を目安に、6つの区切りで進める。各区切りの終わりに Web 版を動く状態で残す。

| 区切り | 週 | 内容 | 終了条件 |
|---|---|---|---|
| M1 基盤 | 1〜3 | モノレポ、core の型、ローカルDB（Web・ネイティブ）、repository と変更通知、作品一覧、ゴミ箱、JSON バックアップ、自動スナップショット | 作品を作って消して戻せる。オフラインで再起動しても残る |
| M2 台本 | 4〜6 | txt・PDF・docx の取り込み、日本式解析、取り込み確認、縦書き表示、シーンの結合・分割 | サンプル台本20本でゴールデンテストが基準を満たす |
| M3 香盤 | 7〜9 | 人物・ロケ地・カテゴリ、ブレイクダウン、香盤表（仮想化）、香盤表の PDF・Excel | シーン300×人物100で表示2秒以内 |
| M4 スケジュール | 10〜12 | 撮影日、ストリップボード、NG日・拘束時間の検証、日の出入り、日々スケ生成と PDF | 短編1本の総スケと日々スケを Excel なしで作れる |
| M5 ショットと同期 | 13〜14 | ショットリストと PDF・Excel、メール OTP ログイン、行単位同期、上書き履歴 | 同期の性質テストが通り、2端末で同じ作品を編集できる |
| M6 公開準備 | 15〜16 | 個人プラン課金、ストア申請、ランディングページ、無料 Excel テンプレートと書き方記事5本 | 要件定義の MVP 合格条件を満たし、ストア審査を通る |

## 23. 要件との対応

| 要件 | 主な設計箇所 | 画面 | フェーズ |
|---|---|---|---|
| F1 作品・メンバー | 7.2、7.3、8.7、14 | 作品一覧、設定 | 1（メンバーは2） |
| F2 台本・改訂 | 9.1、9.2 | 台本、取り込み確認 | 1（改訂は2） |
| F3 ブレイクダウン | 6.1、7.2、9.3 | 香盤（ブレイクダウン） | 1 |
| F4 香盤表 | 9.3、12 | 香盤 | 1 |
| F5 総スケ | 9.4、12 | スケジュール | 1（ロケ時間・日照・DOODは2） |
| F6 日々スケ・配布 | 9.5、10、12 | 日々スケ、配布閲覧ページ | 1（配布・既読は2） |
| F7 ショットリスト | 6.2、7.2、12 | ショット | 1 |
| F8 配置図 | 7.2（blocking_diagrams） | ショット→配置図 | 2 |
| F9 ビューファインダー・写真 | 7.5、9.8 | ビューファインダー、素材 | 2 |
| F10 絵コンテ | 9.7、12 | ショット→絵コンテ | 2 |
| F11 現場モード | 9.6、11.3 | 現場モード | 2（日報は3） |
| F12 書き出し・取り込み | 12 | 各画面の書き出し | 1（テンプレート取り込みは2） |
| F13 通知 | 13 | 設定 | 2 |
| F14 AI補助 | 15 | 設定 | 3 |
| 非機能：データ保全 | 1、7.1、8、16 | 全画面の保存状態表示 | 1 |
| 非機能：オフライン | 3、7.4、8、17 | — | 1 |

## 24. 未決事項

- 正式名称と、アプリ用・配布用のドメイン
- 台本解析のゴールデンテスト用サンプルの収集と許諾（現役の助監督・脚本家への依頼）
- 日々スケの標準書式（3現場以上から実物を集めて決める）
- LINE アプリ内ブラウザでのフラグメント保持の実機確認（第10.4節）
- 気象庁データの利用規約に沿った出典表記の文言
- 作品プランにおける連続ドラマの「作品」の数え方（要件の未決を継続）
- 教育プランの申請と審査の流れ
