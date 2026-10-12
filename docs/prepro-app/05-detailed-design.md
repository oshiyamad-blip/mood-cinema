# 詳細設計書：日本語プリプロダクション統合アプリ（仮称 KOBAN）フェーズ1

| 項目 | 内容 |
|---|---|
| 文書バージョン | 0.1（初版ドラフト） |
| 作成日 | 2026-10-12 |
| 入力 | `03-requirements.md` v0.1、`04-basic-design.md` v0.1 |
| 対象範囲 | **フェーズ1（M1〜M6）の実装対象のみ**。改訂差分・配布・配置図・ビューファインダー・絵コンテ・現場モード・作品プランはフェーズ2の詳細設計で扱う |
| 読み手 | 実装者。本書だけで関数・テーブル・画面・帳票を実装できることを目標にする |

## 1. 基本設計からの修正

詳細化の過程で、基本設計の記述を次のとおり改める。基本設計書と食い違う場合は本書を正とし、基本設計書の冒頭にもその旨を記した。

| # | 箇所 | 基本設計 | 詳細設計での修正 | 理由 |
|---|---|---|---|---|
| 1 | 時刻の型 | `time` 型 | **撮影日0時からの分（整数）**。0〜2159（35:59）まで許す | 日本の現場は撤収を「25:30」のように24時超で書く。`time` 型では表せない |
| 2 | 要素の並び | 規定なし | `elements.sort_key` を追加 | 香盤表の人物列を手で並べ替えるため |
| 3 | 並べ替えキー | 自前の分数インデックス | npm の `fractional-indexing`（MIT）を使い、同じキーは `id` で順序を決める | 実績のある実装を使う。2端末が同じ位置に同時挿入しても順序が確定する |
| 4 | 同期の順序保証 | 規定なし | `sync_push` で作品ごとの勧告ロックを取る | 採番順と確定順のずれによる引き込み漏れを防ぐ（第5.4節） |
| 5 | 作品の新規登録 | 通常の同期で作成 | 専用の RPC `create_project` で作成 | 作成時はまだメンバー行がなく、権限判定ができないため |
| 6 | Web のセッション保存 | メモリ＋短い有効期限 | Supabase 標準の localStorage＋厳格な CSP | メモリだとリロードのたびに再ログインになり、オフライン起動もできない |
| 7 | 課金の保存先 | `entitlements` 1表 | 購入経路ごとの `entitlement_sources` と、最大値を取るビュー `entitlements` | iOS と Web の両方で買った場合などに、片方の失効で権利を誤って落とさない |
| 8 | Web の複数タブ | 規定なし | Web Locks で1タブだけがDBを持つ | OPFS の SQLite は複数タブからの同時書き込みに対応しない |
| 9 | 太陽計算 | NOAA 式を自前実装 | `suncalc`（BSD-2）を使う | 同じ式の実績ある実装がある |
| 10 | `rev` の型 | `text` | Postgres では `text collate "C"` | 既定の照合順序だとハイフンなどの比較が辞書順にならず、HLC の大小判定が狂う。C 照合ならバイト順で比較される |
| 11 | 作品の登録日時 | なし | `projects.created_at`（サーバーが `create_project` で設定） | 無料プランで編集できる1本を「最初に登録した作品」と決めるため |

## 2. 共通仕様

### 2.1 識別子・時刻・日付

| 対象 | 形式 |
|---|---|
| 行の ID | UUIDv7 文字列（小文字、ハイフンあり）。`uuid` パッケージの `v7()` |
| 端末 ID | 8文字の英小文字と数字。初回起動時に生成してローカルの `meta` に保存 |
| HLC | `<物理時刻ミリ秒の16進13桁>-<カウンタ16進4桁>-<端末ID>`。例 `0019a3f2c4b10-0000-k3x9q2ma`。文字列比較で大小が決まる |
| 日付 | `YYYY-MM-DD`（作品のタイムゾーンの暦日） |
| 撮影日内の時刻 | 0時からの分（整数）。表示は `H:MM`。24時以降も `25:30` と表示 |
| タイムゾーン | 作品設定 `tz`。既定 `Asia/Tokyo` |
| 実時刻（作成日時など） | ISO 8601（UTC） |

### 2.2 作品設定 `projects.settings`

```ts
interface ProjectSettings {
  tz: string;                       // 既定 'Asia/Tokyo'
  cutNumberStyle: 'dash' | 'circled'; // 'dash' = 12-3、'circled' = 12-③。既定 'dash'
  minPerPage: number;               // 見積の係数 分/ペラ。既定 60
  defaultShotMin: number;           // 見積の無いカットの分。既定 15
  prepMin: number;                  // 集合から最初のシーン開始まで。既定 60
  moveMin: number;                  // ロケ地が変わるときの移動。既定 60
  makeupMin: number;                // 出演者の入りから初出番まで。既定 60
  wrapBufferMin: number;            // 最後のシーン終了から撤収まで。既定 30
  hidePhoneOnCallSheet: boolean;    // 日々スケの電話番号を伏せる。既定 true
  kobanColumns: { categoryIds: string[]; personOrder: 'appearance' | 'manual' };
}
```

値の範囲外や欠けは、読み込み時に既定値で補う（`normalizeSettings()`）。保存時は全項目を書き戻す。

### 2.3 エラーの扱い

core の関数は例外を投げず、`Result<T, E>` を返す。UI 層と通信層だけが例外を扱い、第11章のエラーコードに変換して表示する。

```ts
type Result<T, E extends AppError = AppError> = { ok: true; value: T } | { ok: false; error: E };
interface AppError { code: ErrorCode; detail?: Record<string, unknown> }
```

### 2.4 文言

UI 文言は `apps/app/src/i18n/ja.ts` を正とし、`en.ts` は `typeof ja` と同じ形にする（型で欠けを検出）。キーは `画面.要素.状態` の形（例 `koban.empty.title`）。

## 3. core モジュール

すべて `packages/core` の純粋関数で、DOM・DB・ネットワークに依存しない。

### 3.1 hlc

```ts
interface HlcState { ms: number; counter: number; deviceId: string }
function hlcNow(state: HlcState, wallMs: number): { hlc: string; state: HlcState };
function hlcReceive(state: HlcState, remote: string, wallMs: number): Result<HlcState>;
function hlcParse(s: string): { ms: number; counter: number; deviceId: string } | null;
```

`hlcNow` は `wallMs > state.ms` なら `(wallMs, 0)`、そうでなければ `(state.ms, counter+1)` を返す。カウンタが 0xffff を超えたら `ms+1, 0` に繰り上げる。`hlcReceive` は引き込んだ行の `rev` を受け取るたびに呼び、`ms = max(wall, state.ms, remote.ms)` として標準の HLC 規則でカウンタを進める。相手の物理時刻が手元より24時間以上先なら `E_CLOCK_SKEW` を返し、その行は取り込むが時計は進めない（壊れた端末の時計に全体が引きずられないため）。状態は書き込みのたびに `meta.hlc` へ保存する。

### 3.2 order

```ts
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
function keyBetween(before: string | null, after: string | null): string;
function compareOrdered(a: { sortKey: string; id: string }, b: { sortKey: string; id: string }): number;
```

並べ替えは常に `(sortKey, id)` の昇順。取り込みで大量のシーンを一度に作るときは `generateNKeysBetween(null, null, n)` を使う。

### 3.3 script（台本解析）

#### 3.3.1 入出力

```ts
type SourceKind = 'txt' | 'pdf' | 'docx' | 'fountain' | 'fdx' | 'paste';
interface RawLine { text: string; page?: number }
interface ParsedScene {
  number: string; heading: string;
  timeOfDay: TimeOfDay; intExt: IntExt;
  lines: ParsedLine[];          // 柱を除く本文
  pages: number;                // ペラ換算（小数2桁）
  speakers: string[];           // 出現順・重複なし
}
interface ParsedLine { kind: 'togaki' | 'serifu'; speaker?: string; modifier?: string; text: string; flag?: ParseFlag }
type ParseFlag = 'single_speaker' | 'hashira_like' | 'unclosed_quote';
interface ParseResult { scenes: ParsedScene[]; speakerCounts: Record<string, number>; warnings: ParseWarning[] }
function extractLines(kind: SourceKind, input: ArrayBuffer | string): Promise<Result<RawLine[]>>; // pdf/docx は apps 側のアダプタ経由
function parseJapaneseScript(lines: RawLine[]): ParseResult;
function parseFountain(text: string): ParseResult;
function parseFdx(xml: string): ParseResult;
```

#### 3.3.2 正規化

判定用の文字列だけを NFKC で正規化し、表示用の `text` には原文を残す。NFKC で全角数字・英字は半角になる。`○`（U+25CB）・`◯`（U+25EF）・`〇`（U+3007）は変わらない。行頭と行末の空白（全角空白を含む）は判定用文字列から除く。空行は捨てるが、シーンの区切り判定には使わない。

#### 3.3.3 柱の判定

```
HASHIRA = /^(?:[○◯〇](?![○◯〇])\s*(\d+[A-Za-z]?)?|S#?\s*(\d+[A-Za-z]?)|#\s*(\d+[A-Za-z]?)|シーン\s*(\d+[A-Za-z]?))\s*[.．、:：]?\s*(.+)$/u
```

`〇〇家` のように伏せ字で始まるト書きを柱と誤認しないよう、記号が2つ続く場合は柱にしない。番号の捕捉がすべて空なら、直前の柱の番号＋1を振る（最初は1）。見出し部分から次の順で属性を取り出す。

| 属性 | 規則 |
|---|---|
| 時間帯 | 末尾の `/[・\s]?[（(]?(早朝|明け方|朝|昼|日中|夕方|夕|夜|深夜)[）)]?$/` を取り、早朝・明け方→`dawn`、朝→`morning`、昼・日中→`day`、夕・夕方→`evening`、夜→`night`、深夜→`midnight`。取ったあとの末尾の `・` と空白を見出しから除く |
| 屋内外 | 見出しに外の語（外、表、屋外、屋上、路上、道、公園、河原、海、山、森、駅前、校庭、庭）と内の語（内、室、部屋、居間、台所、教室、店内、車内、廊下、寝室、事務所、`〇〇家・`）がいくつ含まれるかを数え、多い方。同数なら `unknown` |

語の一覧は `packages/core/script/lexicon.ts` に定数で置き、後から足せるようにする。

#### 3.3.4 セリフの判定

```
SAME_LINE  = /^([^\s「」『』（）()。、]{1,12}?)\s*(?:[（(]([^）)]{1,6})[）)])?\s*[「『](.*)$/u
NAME_ONLY  = /^([^\s「」『』（）()。、]{1,12})\s*(?:[（(]([^）)]{1,6})[）)])?$/u
```

`SAME_LINE` に一致したらセリフとする。ただし話者の末尾が助詞（は・が・を・に・と・も・の）のときは、台本全体を一度走査したあとで判定する。その話者が `SAME_LINE` で2回以上、または `NAME_ONLY` の行で1回以上出ていれば人名とみなしてセリフにする（「まこと」「しの」のような名前を守るため）。そうでなければ「太郎は「行こう」と言った」のような地の文としてト書きにする。閉じ括弧 `」` か `』` が出るまで後続の行をつなぐ（最大20行。超えたら `unclosed_quote` を付けてそこで切る）。直前の行が `NAME_ONLY` に一致し、現在の行が `「` か `『` で始まる場合も、その名前を話者とするセリフにする。括弧内の修飾（声、M、OFF、N、心の声など）は `modifier` に入れ、話者名から外す。話者 `N` と `ナレーション` は人物候補から除く。

#### 3.3.5 ペラの算出

200字詰め（20字×10行）を1ペラとし、行ごとに使う行数を数える。柱は `ceil(長さ/20)`、ト書きは3字下げとして `ceil(長さ/17)`、セリフは話者名と括弧を含めて `ceil((話者名の長さ+1+本文の長さ)/20)` とする。シーンのペラは合計行数を10で割り、小数2桁に丸める。

#### 3.3.6 PDF からの行の復元

pdf.js の `getTextContent()` が返す文字片（文字列、変換行列、幅、高さ）から行を組み立てる。

1. 各ページで、文字片の過半数が「高さが幅の2倍以上」または変換行列が回転を示すとき、そのページを縦書きとみなす。
2. ページ上下の5%の帯にあり、全ページの半数以上で同じ文字列が出る文字片（ページ番号・題名）を捨てる。
3. 縦書きなら、文字片を x の中心で束ねて列にする（許容幅は文字の高さの中央値の0.5倍）。列を x の降順（右から左）、列内を y の降順（上から下）に並べてつなぐ。横書きなら x と y を入れ替えて同じ処理をする。
4. 1列が1行になる。ある列が下端まで文字で埋まり、次の列が柱でもセリフでもないときは、同じ段落の折り返しとしてつなぐ。

この復元は書式によって精度が落ちる。取り込み確認画面で `hashira_like` などの印を一覧にし、手で直せるようにする（第8.3節）。

#### 3.3.7 Fountain と fdx

fdx は `<Paragraph Type="...">` の種別を写す（Scene Heading→柱、Character→次のセリフの話者、Dialogue→セリフ、Parenthetical→修飾、Action→ト書き）。Fountain は仕様の基本規則（INT./EXT./EST. で始まる行、`.` 始まりの強制柱、全大文字の話者行）に加え、日本語の `○` 始まりも柱として扱う。

### 3.4 koban（香盤表の導出）

```ts
interface KobanInput {
  scenes: Scene[]; elements: Element[]; sceneElements: SceneElement[];
  categories: Category[]; shootDays: ShootDay[]; shootDayScenes: ShootDayScene[];
  settings: ProjectSettings;
}
type KobanSort = 'script' | 'location' | 'shootDay';
interface KobanColumn { elementId: string; label: string; categoryId: string; count: number }
interface KobanRow { scene: Scene; shootDayLabels: string[]; marks: Set<string> /* elementId */ }
interface KobanModel { columns: KobanColumn[]; rows: KobanRow[]; totals: { pages: number; scenes: number } }
function deriveKoban(input: KobanInput, sort: KobanSort): KobanModel;
```

行は `status='active'` かつ削除されていないシーン。並びは `script` なら台本順、`location` ならロケ地名→台本順、`shootDay` なら撮影日の日付→撮影日内の順で、未割当は末尾。列は `settings.kobanColumns.categoryIds` の順にカテゴリを並べ、カテゴリ内の要素は、人物カテゴリなら `personOrder` に従い（`appearance` は出演シーン数の降順、同数は名前順）、他のカテゴリは名前順にする。`marks` は削除されていない `scene_elements` から作る。計算量はシーン数×要素数に比例しないよう、`scene_elements` を一度だけ走査して行ごとの集合に入れる。

### 3.5 schedule（総スケの見積と検証）

```ts
interface SceneEstimate { sceneId: string; minutes: number; source: 'shots' | 'manual' | 'pages' }
interface DayTimeline { dayId: string; items: { sceneId: string; startMin: number; endMin: number }[]; endMin: number }
type IssueCode = 'NG_DATE' | 'OVER_TIME' | 'DUP_SCENE' | 'DAYLIGHT';
interface Issue { code: IssueCode; level: 'error' | 'warn' | 'info'; dayId: string; sceneId?: string; personId?: string; detail: Record<string, unknown> }
function estimateScene(scene: Scene, shots: Shot[], s: ProjectSettings): SceneEstimate;
function buildTimeline(day: ShootDay, ordered: ShootDayScene[], est: Map<string, SceneEstimate>, scenes: Map<string, Scene>, s: ProjectSettings): DayTimeline;
function validateDay(ctx: ValidateContext): Issue[];
```

見積は、そのシーンに削除されていないカットがあれば各カットの `est_setup_min + est_take_min` の合計（どちらも空なら `defaultShotMin`）。カットが無ければ `est_min`、それも無ければ `round(pages × minPerPage)`。部分撮影（`partial`）の割り当ては、指定されたカットだけで見積もる。

時間割は `call_time + prepMin` から始める。各シーンの直前のシーンとロケ地が違えば `moveMin` を足す。`planned_start` が設定されていて現在の時刻より後なら、そこまで進める。最後のシーンの終了に `wrapBufferMin` を足したものを撤収見込みとする。

| 検査 | 条件 | 水準 |
|---|---|---|
| `NG_DATE` | その日のシーンの出演者（人物カテゴリの要素に紐づく人物）の `ng_dates` に日付がある | error |
| `OVER_TIME` | `wrap_time` があり、撤収見込みがそれを超える | warn |
| `DUP_SCENE` | 同じシーンが、部分指定なしで2つ以上の撮影日に入っている | warn |
| `DAYLIGHT` | 屋外（`ext`）でロケ地の座標がある。朝・昼・夕のシーンが日の出前か日の入り後にかかる、または夜のシーンが日の入り前にかかる | info |

`validateDay` は撮影日1日分だけを計算する。画面は、編集のあった撮影日と、NG日や重複の判定に関わる撮影日だけを再計算する。

### 3.6 sun

```ts
interface SunTimes { sunriseMin: number | null; sunsetMin: number | null; goldenAmEndMin: number | null; goldenPmStartMin: number | null }
function sunTimes(date: string, lat: number, lng: number, tz: string): SunTimes;
```

`suncalc.getTimes()` を使い、`goldenHourEnd` と `goldenHour`（太陽高度6度）をそれぞれ朝夕のゴールデンアワーの境とする。結果は作品のタイムゾーンの撮影日0時からの分に直す。白夜などで求まらない値は `null`。

### 3.7 callsheet（日々スケの生成）

```ts
interface CallSheetOverrides {
  callMin?: number; baseLocationId?: string;
  rows?: Record<string /* sceneId */, { startMin?: number; note?: string }>;
  cast?: Record<string /* personId */, { entryMin?: number; note?: string }>;
  deptNotes?: Record<string /* categoryId */, string>;
  meals?: { label: string; atMin?: number; note?: string }[];
  transport?: string; notes?: string;
  contacts?: { personId: string; label: string }[];
}
interface CallSheetModel {
  header: { projectTitle: string; dayLabel: string; dateText: string; callMin: number; base?: { name: string; address?: string }; sun?: SunTimes; weather?: WeatherSummary };
  schedule: { startMin: number; sceneNumber: string; heading: string; timeOfDay: TimeOfDay; intExt: IntExt; pages: number; cast: string[]; note?: string }[];
  cast: { personId: string; name: string; roleName?: string; entryMin: number; firstSceneNumber: string; note?: string }[];
  departments: { categoryLabel: string; items: string[]; note?: string }[];
  meals: CallSheetOverrides['meals']; transport?: string; notes?: string;
  contacts: { label: string; name: string; tel?: string }[];
  estimatedWrapMin: number;
}
function buildCallSheet(ctx: CallSheetContext, ov: CallSheetOverrides, opt: { includePhone: boolean }): CallSheetModel;
```

時間割は第3.5節の `buildTimeline` と同じ計算で、`ov.callMin` と `ov.rows[].startMin` があれば上書きして積み直す。出演者の入りは、初出番の開始時刻から `makeupMin` を引いた値で、`ov.cast[].entryMin` があればそれを使う。各部の準備物は、その日のシーンに紐づく人物以外の要素をカテゴリ別に名前順で並べたもの。日付の表示は `10月21日(火)` の形にする。連絡先の電話番号は `opt.includePhone` が真で、かつ呼び出し側が連絡先を読める権限を持つときだけ入れる。

## 4. データ層

### 4.1 ローカル SQLite の構成

テーブル定義は `packages/schema` に TypeScript で書き、Postgres 用 DDL と SQLite 用 DDL を生成する。型の対応は次のとおり。

| 論理型 | Postgres | SQLite |
|---|---|---|
| id | uuid | TEXT |
| 文字列 | text | TEXT |
| 整数・分 | int | INTEGER |
| 小数 | numeric | REAL |
| 真偽 | boolean | INTEGER（0/1） |
| 日付 | date | TEXT（YYYY-MM-DD） |
| 実時刻 | timestamptz | TEXT（ISO 8601） |
| JSON | jsonb | TEXT（JSON 文字列） |

`rev` 列は Postgres で `text collate "C"` とする（第1章の修正10）。SQLite の既定の比較（BINARY）はバイト順なので、そのままでよい。第1章の修正1により、`shoot_days.call_min`、`shoot_days.wrap_min`、`shoot_day_scenes.planned_start_min`、`locations.available_from_min`、`locations.available_to_min` を整数の分で持つ（基本設計の `call_time` などは改名する）。`elements` に `sort_key text` を足す。

同期対象テーブルに加え、端末だけが持つテーブルを作る。

```sql
create table meta (key text primary key, value text not null);            -- deviceId, hlc, schema_version, entitlement
create table outbox (seq integer primary key autoincrement, table_name text not null,
                     row_id text not null, project_id text not null, rev text not null);
create index outbox_project on outbox(project_id, seq);
create table sync_state (project_id text primary key, last_seq integer not null default 0,
                         registered integer not null default 0,           -- create_project 済みか
                         last_pull_at text, last_push_at text, last_error text);
create table conflicts (id integer primary key autoincrement, table_name text not null, row_id text not null,
                        project_id text not null, local_data text not null, remote_rev text not null,
                        at text not null, resolved integer not null default 0);
create table snapshots (id integer primary key autoincrement, project_id text not null,
                        created_at text not null, path text not null, bytes integer not null);
```

### 4.2 マイグレーション

`meta.schema_version` に整数で版を持つ。`packages/schema/migrations` に版ごとの SQL を置き、起動時に未適用の版を順に1トランザクションずつ適用する。適用前に、全作品の JSON スナップショットを `snapshots` に取る。アプリより新しい版の DB を開いた場合（古いアプリで新しい DB を開いた場合）は書き込みを止め、`E_SCHEMA_TOO_NEW` で更新を促す。

### 4.3 Web での DB の持ち方

SQLite WASM は専用 Worker で動かし、`opfs-sahpool` VFS を使う。メインスレッドとは `postMessage` で `{ id, op, args }` を送り `{ id, ok, value | error }` を受ける。トランザクションは Worker 内で直列に実行する。

複数タブでは、`navigator.locks.request('koban-db', { ifAvailable: true })` で取れたタブだけが Worker を起動する。取れなかったタブは「このアプリは別のタブで開いています」と表示し、「こちらで開く」を押すと `steal: true` で取り直す。取られた側のタブは読み取り専用の案内に切り替わる。

### 4.4 repository

```ts
type TableName = 'projects' | 'script_versions' | 'scenes' | 'script_version_scenes' | 'categories'
  | 'elements' | 'scene_elements' | 'persons' | 'person_contacts' | 'locations'
  | 'shoot_days' | 'shoot_day_scenes' | 'call_sheets' | 'shots' | 'media';
interface Repo {
  read<T>(fn: (q: Reader) => Promise<T>): Promise<T>;
  write<T>(projectId: string, fn: (t: Writer) => Promise<T>): Promise<T>;  // 1トランザクション
}
interface Reader {
  get<K extends TableName>(table: K, id: string): Promise<Row<K> | null>;
  list<K extends TableName>(table: K, where: Partial<Row<K>>, opt?: { includeDeleted?: boolean }): Promise<Row<K>[]>;
  sql<T>(query: string, params: unknown[]): Promise<T[]>;   // 集計用。書き込み文は拒否
}
interface Writer extends Reader {
  put<K extends TableName>(table: K, row: Draft<K>): Promise<Row<K>>;  // rev・updated_by を付与し outbox に積む
  softDelete(table: TableName, id: string): Promise<void>;
  restore(table: TableName, id: string): Promise<void>;
}
```

`put` と `softDelete` は、同じトランザクションの中で行の書き込みと `outbox` への追加を行う。トランザクションが確定したら、変更のあったテーブル名と作品 ID を変更通知バスに流す。物理削除の API は repository に置かない（ゴミ箱の30日後の削除は保守処理だけが行う）。

### 4.5 変更通知と画面への反映

```ts
function useLive<T>(tables: TableName[], projectId: string | null, query: (q: Reader) => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean };
```

変更通知に、指定したテーブルと作品の組が含まれていたら `query` を再実行する。同じマイクロタスク内の複数の通知は1回にまとめる。香盤表のように重い導出は、`useLive` で取った生データを `useMemo` で `deriveKoban` に通す。

### 4.6 取り消し（Undo）

編集操作は `Command { label: string; apply(t: Writer): Promise<void>; revert(t: Writer): Promise<void> }` で表す。`apply` の直前に対象行の現在値を控え、`revert` はその値を新しい `rev` で書き戻す。取り消しも通常の書き込みなので同期に乗る。履歴は作品ごとに直近100件をメモリに持ち、画面を離れても作品を閉じるまでは残す。

### 4.7 自動スナップショット

アプリ起動時と、最後の書き込みから10分経ったときに、その作品の前回スナップショットより後に書き込みがあれば、作品の全行を JSON にして保存する。1日1世代（その日の最後のもので置き換え）とし、作品ごとに直近7世代を残す。保存先はネイティブがアプリの Documents 配下 `snapshots/{projectId}/{date}.json`、Web が OPFS の同じパス。復元は常に新しい作品として作り、ID はすべて振り直す。

## 5. 同期

### 5.1 状態遷移

```
          ┌──────── 3秒デバウンス / 前面復帰 / 通信回復 / 30秒ごと ────────┐
          ▼                                                              │
 [idle] ──▶ [registering] ──▶ [pushing] ──▶ [pulling] ──▶ [idle] ────────┘
   │          (未登録の作品だけ)    │ 失敗          │ 失敗
   │                                ▼               ▼
   │                          [backoff: 5s→15s→60s→5min、最大5分]
   └── 未ログイン・Supabase 未設定 → 同期しない（[disabled]）
```

同期は作品ごとに直列で行い、複数作品は順番に処理する。失敗しても端末のデータには触れず、`sync_state.last_error` に記録して画面の保存状態表示に出す。

### 5.2 送る形式

```json
{ "p_project": "0199…", "p_rows": [ { "t": "scenes", "d": { "id": "…", "project_id": "…", "rev": "…", "number": "12", … } } ] }
```

`outbox` を `seq` 順に最大200行読み、同じ行が複数回積まれていれば最新の内容1回分にまとめて送る。応答で受理された行と、拒否された行（`rejected`）の両方を `outbox` から消す。拒否された行は、サーバーの現行版で端末の行を上書きし、端末側の版を `conflicts` に入れる。

### 5.3 サーバー側の関数

`packages/schema` から、テーブルごとの upsert 関数を生成する。以下は `scenes` の生成例である。

```sql
create sequence sync_seq;

create function set_server_seq() returns trigger language plpgsql as $$
begin new.server_seq := nextval('sync_seq'); return new; end $$;
create trigger scenes_seq before insert or update on scenes
  for each row execute function set_server_seq();

create function member_role(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from project_members where project_id = p and user_id = auth.uid()
$$;

-- 生成コード：テーブルごとに1つ
create function sync_upsert_scenes(p_project uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur scenes; inc scenes;
begin
  inc := jsonb_populate_record(null::scenes, d);
  if inc.project_id is distinct from p_project then raise exception 'E_PROJECT_MISMATCH'; end if;
  inc.updated_by := auth.uid();
  select * into cur from scenes where id = inc.id for update;
  if not found then
    insert into scenes select inc.*;
    return null;                                  -- 受理
  elsif cur.project_id <> p_project then
    raise exception 'E_PROJECT_MISMATCH';
  elsif inc.rev > cur.rev then
    insert into row_history(table_name,row_id,project_id,rev,data,reason)
      values ('scenes', cur.id, p_project, cur.rev, to_jsonb(cur), 'overwritten');
    update scenes set
      number = inc.number, heading = inc.heading, location_id = inc.location_id,
      time_of_day = inc.time_of_day, int_ext = inc.int_ext, pages = inc.pages, est_min = inc.est_min,
      body = inc.body, status = inc.status, changed_in_version_id = inc.changed_in_version_id,
      sort_key = inc.sort_key, rev = inc.rev, updated_by = inc.updated_by, deleted_at = inc.deleted_at
    where id = inc.id;
    return null;                                  -- 受理
  else
    insert into row_history(table_name,row_id,project_id,rev,data,reason)
      values ('scenes', inc.id, p_project, inc.rev, d, 'rejected');
    return to_jsonb(cur);                         -- 拒否：現行版を返す
  end if;
end $$;

create function sync_push(p_project uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; cur jsonb; rejected jsonb := '[]'::jsonb;
begin
  if coalesce(member_role(p_project), 'none') not in ('admin','editor') then raise exception 'E_FORBIDDEN'; end if;
  if not project_writable(p_project) then raise exception 'E_READ_ONLY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project::text, 0));
  for r in select * from jsonb_array_elements(p_rows) loop
    case r->>'t'
      when 'scenes' then cur := sync_upsert_scenes(p_project, r->'d');
      -- …生成された各テーブルの分岐…
      else raise exception 'E_BAD_TABLE';
    end case;
    if cur is not null then rejected := rejected || jsonb_build_object('t', r->>'t', 'd', cur); end if;
  end loop;
  return jsonb_build_object('rejected', rejected);
end $$;
```

`sync_pull` も生成し、各テーブルの `project_id = p_project and server_seq > p_since` を `server_seq` 順に合わせて最大 `p_limit`（既定500）行返す。呼び出し元の役割が閲覧者なら `person_contacts` を含めない。戻り値は `{ rows: [{t, d}], next: 最大のserver_seq, more: 真偽 }`。

### 5.4 引き込み漏れを防ぐ仕組み

シーケンスの番号は採番した順に確定するとは限らない。番号10の更新が番号11より後に確定すると、11まで引き込んだ端末は10を取りこぼす。これを防ぐため、`sync_push` は作品ごとの勧告ロックを取り、同じ作品への書き込みを直列にする。引き込みは作品単位なので、作品内で採番順と確定順が一致すれば漏れない。同期以外で同期対象テーブルに書く処理（Edge Function、保守ジョブ）も、必ず同じロックを取る。

### 5.5 作品の登録と書き込み可否

```sql
create function create_project(d jsonb) returns jsonb   -- 戻り値 { ok, code? }
create function project_writable(p uuid) returns boolean
create function my_projects() returns setof jsonb        -- 自分がメンバーの作品と役割
```

`create_project` は作品行と、作成者を管理者とするメンバー行を同時に作る。作成者の権利が無料で、すでに書き込み可能な作品を1本持っていれば `E_PLAN_LIMIT` を返す。この場合、端末の作品は消さず「クラウド未保存」のまま残し、作品カードに理由を出す。

`project_writable` は、作品のオーナーの権利が有効な個人プランなら真、無料なら「オーナーの削除されていない作品のうち `created_at` が最も古い1本」だけ真とする。偽の作品は閲覧と書き出しだけができる（第8.7節は基本設計の規定どおり）。

### 5.6 初回ログイン時の作品の引き継ぎ

ログイン前に作った作品は `owner_id` が空のまま端末にある。初回ログインの直後に「この端末の作品をアカウントに保存しますか」を一覧で出し、既定で全件を選択しておく。選ばれた作品について `create_project` を呼び、成功したものから通常の同期に乗せる。上限で登録できなかった作品は端末に残る。

### 5.7 ログアウト

ログアウト時は「この端末のデータを残す（既定）」と「この端末から消す」を選ばせる。消す場合も、`outbox` が空で、全作品が登録済みのときだけ実行できる。未送信の変更があれば理由を表示して消さない。

## 6. 認証

| 手順 | 実装 |
|---|---|
| コード送信 | `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`。Supabase のメールテンプレートに `{{ .Token }}` を入れ、リンクではなく6桁のコードを送る |
| コード確認 | `supabase.auth.verifyOtp({ email, token, type: 'email' })`。6桁、有効10分 |
| 再送 | 60秒は再送ボタンを無効化。5回失敗で15分待たせる（Supabase のレート制限に合わせ、`E_RATE_LIMIT` を表示） |
| セッション保存 | ネイティブは Keychain／Keystore を使う保存アダプタを `auth.storage` に渡す。Web は既定の localStorage |
| オフライン起動 | 保存済みセッションがあれば、更新トークンの期限が切れていてもログイン状態として画面を出し、同期だけ止める |

## 7. 課金

### 7.1 商品と権利

| 経路 | 商品 ID | 価格 | 試用 |
|---|---|---|---|
| App Store／Google Play（RevenueCat） | `koban.personal.monthly` | ¥980/月 | 14日 |
| 同上 | `koban.personal.yearly` | ¥7,800/年 | 14日 |
| Web（Stripe） | `price_personal_monthly`、`price_personal_yearly` | 同上 | 14日 |

RevenueCat の権利 ID は `personal`、`app_user_id` は Supabase のユーザー ID にする。

### 7.2 テーブル

```sql
create table entitlement_sources (
  user_id uuid references auth.users, source text check (source in ('revenuecat','stripe')),
  plan text not null, expires_at timestamptz, updated_at timestamptz not null default now(),
  primary key (user_id, source)
);
create view entitlements as
  select user_id, case when max(expires_at) > now() then 'personal' else 'free' end as plan, max(expires_at) as expires_at
  from entitlement_sources group by user_id;
-- 行の無いユーザーは free として扱う（アプリ側で既定値にする）
create table webhook_events (id text primary key, source text not null, received_at timestamptz not null default now());
```

### 7.3 Webhook

| 関数 | 受ける事象 | 処理 |
|---|---|---|
| `revenuecat-webhook` | INITIAL_PURCHASE、RENEWAL、PRODUCT_CHANGE、UNCANCELLATION | `expires_at` を事象の失効日時で更新 |
| 同上 | CANCELLATION | 何もしない（失効日時までは有効） |
| 同上 | EXPIRATION | `expires_at` を事象の日時で更新 |
| 同上 | BILLING_ISSUE | 猶予期間の終わりを `expires_at` にする |
| `stripe-webhook` | checkout.session.completed、customer.subscription.updated | 購読の期間終了日時を `expires_at` に（API 2025-03 以降は `items.data[].current_period_end`） |
| 同上 | customer.subscription.deleted | `ended_at` を `expires_at` に |

どちらも署名を検証し、事象 ID を `webhook_events` に入れられた場合だけ処理する（重複配信を無視する）。

### 7.4 端末側の判定

起動時、購入完了時、6時間ごとに `entitlements` を取得し、`meta.entitlement` に `{ plan, expiresAt, checkedAt }` を保存する。有効な権利は「`expiresAt` が未来」または「最後の確認から7日以内で、そのとき `personal` だった」場合に `personal` とみなす。

## 8. 画面詳細

### 8.1 ルート

| パス | 画面 | 備考 |
|---|---|---|
| `/` | 作品一覧 | 起動時の画面 |
| `/trash` | ゴミ箱 | |
| `/settings` | 設定（アカウント・プラン・バックアップ・表示） | |
| `/login` | ログイン | |
| `/p/:pid/import` | 台本の取り込み | 新規作品の作成直後もここ |
| `/p/:pid/import/review` | 取り込み確認 | |
| `/p/:pid/script` | 台本 | |
| `/p/:pid/koban` | 香盤表 | 作品を開いた既定の画面 |
| `/p/:pid/assets` | 素材（`?tab=persons|locations|categories`） | |
| `/p/:pid/schedule` | 総スケ | |
| `/p/:pid/days/:did` | 日々スケ | |
| `/p/:pid/shots` | ショット（シーン一覧） | |
| `/p/:pid/shots/:sid` | ショットリスト（1シーン） | |
| `/p/:pid/settings` | 作品設定 | |

存在しない作品・削除済みの作品の ID でアクセスした場合は作品一覧へ戻し、削除済みならゴミ箱へ誘導するトーストを出す。

### 8.2 作品一覧

| 項目 | 内容 |
|---|---|
| 作品カード | 題名、種別、撮影期間、最終更新、保存状態（端末のみ／同期済み／同期待ちN件／クラウド未保存：理由） |
| 並び | 最終更新の降順 |
| 操作 | 開く、名前変更、複製（フェーズ2）、JSON 書き出し、ゴミ箱へ |
| 新規作成 | ダイアログ：題名（必須、1〜100字）、種別（既定 映画）、撮影期間（任意）。作成後に取り込み画面へ |
| 取り込み | JSON から作品を復元（常に新規作品として作る） |
| 空状態 | 「台本を取り込んで、最初の香盤表を作りましょう」と新規作成ボタン |

### 8.3 台本の取り込みと確認

取り込み画面は、ファイル選択（txt・pdf・docx・fountain・fdx、20MBまで）と、テキスト貼り付け欄の2つの入口を持つ。版名（既定「準備稿」）と改訂日を入力する。取り込みを押すと解析し、確認画面へ進む。

確認画面は左に原文、右に解析結果のシーン一覧を並べる（スマホは切り替え）。

| 項目 | 内容 |
|---|---|
| シーン一覧の各行 | 番号、見出し、時間帯、屋内外、ペラ、話者。各値はその場で修正可 |
| 印の一覧 | `hashira_like`、`single_speaker`、`unclosed_quote` の行を上部に件数つきで出し、押すと該当箇所へ移る |
| シーン操作 | 直前と結合、この行で分割、番号の振り直し（全体） |
| 話者の整理 | 話者ごとの出現回数を一覧にし、統合（「タロウ」→「太郎」）と、人物にしない指定（例：「一同」）ができる |
| 確定 | シーン行・人物・人物カテゴリの要素・`scene_elements` を1トランザクションで作り、香盤表へ移る |

解析が全く柱を見つけられなかった場合は、全文を1シーンとして置き、「柱が見つかりませんでした。シーンの区切りで『この行で分割』を押してください」と表示する。

### 8.4 台本

縦書き表示（`writing-mode: vertical-rl`）で、柱・ト書き（3字下げ）・セリフ（話者名と「」）の書式を再現する。横書きへの切り替えもできる。シーンの区切りに番号の付箋を出し、押すとそのシーンの詳細パネル（要素、ショットへの導線）を開く。フェーズ1では本文の編集はせず、表示と、取り込み確認と同じシーン境界の修正だけを行う。

### 8.5 香盤表

| 項目 | 内容 |
|---|---|
| ツールバー | 並び（台本順／ロケ地順／撮影日順）、列設定、書き出し（PDF・Excel） |
| 固定列 | 番号、柱、時間帯、屋内外、ペラ、撮影日 |
| 要素列 | 列設定で選んだカテゴリの要素。見出しは縦書き |
| セル | 押すと印を切替（`scene_elements` の作成・ゴミ箱）。長押し・右クリックで備考 |
| キーボード（PC） | 矢印で移動、スペースで印の切替、Enter で行の詳細 |
| 行の詳細パネル | シーンの属性（時間帯・屋内外・ロケ地・見積分・ペラ）と、カテゴリ別の要素の追加・削除 |
| 列設定 | 表示するカテゴリの選択と順序、人物の並び（出演の多い順／手動）。手動のときは列見出しのドラッグで並べ替え（`elements.sort_key`） |
| 下部の集計 | シーン数、ペラ合計、未割当シーン数 |
| 空状態 | シーンが無い：「台本を取り込む」。要素が無い：「人物を追加する」 |

### 8.6 素材（人物・ロケ地・カテゴリ）

| 画面 | 項目と入力規則 |
|---|---|
| 人物 | 名前（必須、1〜40字）、役名（任意、40字）、区分（キャスト／スタッフ／エキストラ）、部署（任意）、NG日（日付の複数選択とメモ）、連絡先（電話：数字とハイフン、メール：形式検査、LINE ID：任意） |
| ロケ地 | 名称（必須、60字）、住所（任意。入力後に国土地理院の住所検索で座標を取り、地図で確認・修正）、利用可能時間（開始・終了の分）、メモ |
| カテゴリ | 名前、色、並び。既定カテゴリ（人物、エキストラ、衣裳、小道具、美術、車両、特機、特殊効果、動物、メイク、音、備考）は名前の変更だけ可能で、削除は非表示にする扱い |

人物を作ると、人物カテゴリの要素を同時に作り、`elements.person_id` で結ぶ。人物をゴミ箱へ入れると、対応する要素も一緒にゴミ箱へ入る（復元も一緒）。

### 8.7 総スケ

| 項目 | 内容 |
|---|---|
| レイアウト | 左に未割当のシーン片、右に撮影日の列。PC は横並び、スマホは撮影日の縦一覧と「未割当」タブ |
| 撮影日の作成 | 日付（必須）、ラベル（既定「撮影N日目」）、集合・撤収時刻（`H:MM`、0:00〜35:59） |
| シーン片 | 番号、柱、時間帯、屋内外、ペラ、見積、主な出演者3名 |
| 操作 | ドラッグで割り当て・並べ替え・撮影日間の移動。スマホは長押しで「移動先を選ぶ」シート |
| 撮影日の見出し | 日付、ロケ地、集合〜撤収見込み、見積合計、ペラ合計、日の出・日の入り（屋外のロケ地に座標がある場合） |
| 警告 | 第3.5節の検査結果を撮影日の見出しとシーン片に記号で出す。押すと原因の説明と、関係する人物・シーンへの導線 |
| 書き出し | PDF・Excel |

### 8.8 日々スケ

日々スケは第3.7節のモデルを、帳票と同じ並びで画面に出す。各欄は押すとその場で上書きでき、上書きした値には印を付け、「自動の値に戻す」を出す。

| 欄 | 編集できる内容 |
|---|---|
| 集合 | 時刻、場所（ロケ地から選択） |
| 予定 | シーンごとの開始時刻、備考。並び順の変更は総スケで行う |
| 出演者 | 入り時刻、備考 |
| 各部 | 自動列挙された準備物に加え、カテゴリごとのメモ |
| 食事・移動・注意事項 | 自由記述 |
| 連絡先 | 人物から選んで肩書きを付ける。電話番号を載せるかは作品設定に従い、ここで一時的に切り替えられる |

書き出しは PDF。フェーズ1では配布リンクは出さず、PDF を共有シート（ネイティブ）またはダウンロード（Web）で渡す。

### 8.9 ショットリスト

シーン一覧（番号・柱・カット数・見積）から1シーンを開くと、カット表を出す。

| 列 | 入力規則 |
|---|---|
| カット番号 | 既定は作品設定の書式で自動採番（`12-1`、`12-①`）。手で変えた番号は以後の自動採番の対象外 |
| サイズ | 候補（LS、FS、KS、WS、MS、BS、CU、BCU、インサート）から選ぶか自由入力 |
| アングル・動き | 候補（アイレベル、ハイ、ロー、俯瞰／FIX、PAN、TILT、ドリー、手持ち、クレーン）から選ぶか自由入力 |
| レンズ | 焦点距離 1〜2000（mm） |
| 内容 | 自由記述（500字） |
| 段取り・本番 | 分、0〜1440 |
| 備考 | 自由記述 |

行の追加・複製・並べ替え（ドラッグ）・別シーンへの移動ができる。書き出しは PDF・Excel（作品全体または選択したシーン）。

## 9. 帳票詳細

### 9.1 共通

PDF は @react-pdf/renderer で、Noto Sans JP の Regular と Bold を埋め込む。本文9pt、表の見出し9pt Bold（印刷の最小字を9ptにそろえる。`06-ui-design.md` 第7章の提案を採用）、表題14pt Bold。余白は上下左右10mm。フッターに「版・出力日時・ページ番号」を入れ、無料プランはサービス名を加える。Excel は ExcelJS で、印刷設定（用紙・向き・幅に合わせる・見出し行の繰り返し）まで入れる。

### 9.2 日々スケ（PDF、A4横 297×210mm）

```
┌───────────────────────────────────────────────────────────────┐
│ 作品名 14pt         撮影2日目 10月21日(火) 16pt     集合 8:00 20pt │ 28mm
│                                                    太郎の家（住所）│
├───────────────────────────────────────────────────────────────┤
│ 天気 晴 18℃ │ 日の出 5:58 日の入 17:01 │ 撤収見込み 20:30          │ 12mm
├──────────────────────────────────────┬────────────────────────┤
│ 予定（幅62%）                          │ 出演者 入り（幅38%）    │
│ 開始14│S#12│柱60       │時10│内外10│ペラ12│出演 │ 役名│氏名│入り│備考 │
│ 9:00 │ 2  │太郎の家・居間│朝 │内   │2.0 │太郎、父│ ─ 準備物 ─            │
│ …                                      │ 衣裳：制服 / 小道具：傘 │
│                                        │ ─ 食事・移動 ─          │
│                                        │ ─ 連絡先 ─              │
├──────────────────────────────────────┴────────────────────────┤
│ 注意事項                                                        │
│ 版3 · 出力 2026-10-20 21:14 · 1/1                               │ 6mm
└───────────────────────────────────────────────────────────────┘
```

数値は列幅（mm）。予定表が1ページに収まらない場合は2ページ目に続け、上部の帯を1行の簡易版にして繰り返す。

### 9.3 香盤表（PDF、A3横 420×297mm）

固定列の幅は、番号10、柱50、時間帯10、屋内外8、ペラ10、撮影日14（mm）。要素列は1列7mmで、見出しは文字を1字ずつ縦に積んで描く。1ページの要素列は最大42列で、超えた分は固定列を繰り返した別ページに出す。行の高さは6mmで、表題と縦書きの見出し行（約25mm）を除いて1ページ約40行。改ページごとに見出し行を繰り返す。印は「●」を中央に置く。

### 9.4 Excel の書式

| シート | 書式 |
|---|---|
| 香盤表 | 1行目に表題、2行目に作品名・版・出力日、4行目が見出し。要素列の見出しは縦書き（`alignment.textRotation = 'vertical'`）。G5 でウィンドウ枠を固定。印刷は A3横・幅1ページ・4行目と A〜F 列を繰り返し |
| 総スケ | 撮影日ごとに見出し行（日付・ロケ地・集合・撤収見込み）を太字・塗りつぶしで入れ、その下にシーン行。A4横 |
| ショットリスト | シーンごとに見出し行、その下にカット行。A4横 |

列の定義（見出しの文言と順序）は `templates/columns.ts` に一元化する。フェーズ2のテンプレート取り込みは、この見出し文言で列を照合する。

## 10. 入力規則

| 項目 | 規則 | 違反時の表示 |
|---|---|---|
| 作品の題名 | 1〜100字、前後の空白は除去 | 「題名を入力してください」 |
| シーン番号 | 1〜10字、数字・英字・ハイフン・「の」 | 「番号に使えない文字があります」 |
| 時刻 | `H:MM` または `HH:MM`、0:00〜35:59。全角数字やコロンも受け付けて正規化する | 「0:00〜35:59 の形で入力してください」 |
| 日付 | 暦日として正しいこと。撮影期間外でも保存できるが注意を出す | 「撮影期間の外の日付です」（注意） |
| ペラ | 0〜99.99 | 「0〜99.99 で入力してください」 |
| 見積分 | 0〜1440 の整数 | 「0〜1440 分で入力してください」 |
| 焦点距離 | 1〜2000 | 「1〜2000mm で入力してください」 |
| 電話 | 数字・ハイフン・＋・空白、6〜20字 | 「電話番号の形式を確認してください」 |
| メール | `@` を含み、ドメインに `.` を含む | 「メールアドレスの形式を確認してください」 |
| 台本ファイル | 20MB 以下、対応形式 | `E_FILE_TOO_LARGE`／`E_IMPORT_UNSUPPORTED` |

入力中は検査せず、欄を離れたときと保存時に検査する。不正な値は保存せず、欄の下に理由を出す。

## 11. エラーコード

| コード | 発生箇所 | 利用者への表示（ja） | 処理 |
|---|---|---|---|
| `E_NETWORK` | 同期・ログイン | 「通信できません。端末には保存されています」 | 再試行の待ち時間を延ばす |
| `E_FORBIDDEN` | 同期 | 「この作品を編集する権限がありません」 | その作品の送信を止める |
| `E_READ_ONLY` | 同期 | 「無料プランでは1作品まで編集できます。この作品は閲覧のみです」 | 作品を閲覧のみ表示に |
| `E_PLAN_LIMIT` | 作品の登録 | 「無料プランでクラウドに保存できるのは1作品です」 | 端末のみの作品として残す |
| `E_PROJECT_MISMATCH`・`E_BAD_TABLE` | 同期 | 「同期でエラーが起きました（報告済み）」 | Sentry に送り、その行を `conflicts` に退避して送信を続ける |
| `E_CLOCK_SKEW` | 同期 | 表示しない | 記録のみ |
| `E_SCHEMA_TOO_NEW` | 起動 | 「アプリを最新版に更新してください」 | 書き込みを止める |
| `E_DB_OTHER_TAB` | Web 起動 | 「別のタブで開いています」 | 「こちらで開く」を出す |
| `E_STORAGE_FULL` | 写真・スナップショット | 「端末の空き容量が足りません」 | 写真とスナップショットの保存を止める。データ本体の書き込みは続ける |
| `E_FILE_TOO_LARGE` | 取り込み | 「20MB 以下のファイルを選んでください」 | — |
| `E_IMPORT_UNSUPPORTED` | 取り込み | 「この形式は読み込めません。テキストを貼り付けてください」 | 貼り付け欄へ誘導 |
| `E_PARSE_EMPTY` | 取り込み | 「文字を読み取れませんでした（画像の PDF の可能性があります）」 | 貼り付け欄へ誘導 |
| `E_PDF_FONT` | PDF 出力 | 「フォントを読み込めませんでした。通信できる場所でもう一度お試しください」 | Excel 出力を案内 |
| `E_OTP_INVALID`・`E_OTP_EXPIRED` | ログイン | 「コードが違います」「コードの期限が切れました。再送してください」 | — |
| `E_RATE_LIMIT` | ログイン | 「しばらく待ってからお試しください」 | — |

## 12. 計測

個人を特定しない件数だけを、Edge Function `track` 経由で日次の集計表 `daily_counts(date, name, dim, count)` に加算する。端末は事象を `meta` に貯め、同期のついでに1日分をまとめて送る。台本の本文、人物名、ロケ地名は送らない。

| 事象 | 次元 |
|---|---|
| `project_created` | 種別 |
| `script_imported` | 形式、シーン数の区分（〜20、〜100、101〜）、印の件数の区分 |
| `koban_exported`・`schedule_exported`・`callsheet_exported`・`shotlist_exported` | 形式（pdf／xlsx） |
| `shoot_day_created` | — |
| `paywall_viewed`・`purchase_completed` | 経路（ios／android／web）、期間 |

## 13. テスト仕様

### 13.1 単体テスト（Vitest）

| 対象 | 主なケース |
|---|---|
| hlc | 時計が戻ったときもカウンタで単調増加する／同じミリ秒で65,536回呼ぶと繰り上がる／24時間先の相手は `E_CLOCK_SKEW`／文字列比較と論理順序が一致する |
| order | 先頭・末尾・間への挿入で順序が保たれる／同じキーの2行は ID 順になる |
| 柱 | `○1 公園（夜）`、`◯ 太郎の家・居間・朝`、`S#12 駅前 夕`、`#3A 屋上`、`シーン5 車内` を正しく分解する／`〇〇家の前で` で始まるト書きを柱にしない／番号のない柱に連番を振る |
| セリフ | `太郎「行こう」`、`太郎（声）「行こう」`、話者だけの行＋「」行、3行にわたるセリフ、閉じない括弧（20行で打ち切り）、`太郎は「行こう」と言った`（1回だけ出現）をト書きにする／`まこと「…」` が3回出る台本では「まこと」を話者にする |
| ペラ | 200字のト書き1行が1.2ペラ（ceil(200/17)=12行、12÷10）になる等、規則どおりの値 |
| PDF 復元 | 縦書きの文字片の合成データ（3列）を右から正しい順でつなぐ／ページ番号を捨てる |
| 香盤導出 | 3つの並びの順序／削除済みの要素・シーンを除く／出演回数順の列 |
| 見積 | カットあり・手入力のみ・ペラのみの3経路／部分撮影 |
| 時間割 | ロケ地の変更で移動を足す／`planned_start` で進める／24時超の撤収 |
| 検査 | NG日・時間超過・重複・日照の各条件の境界（ちょうど撤収時刻は超過にしない） |
| 日々スケ | 上書きの優先／入り時刻の逆算／電話番号の伏せ |

### 13.2 同期の性質テスト（fast-check）

3台の仮想端末と1つの仮想サーバーを用意し、任意の編集・削除・復元・同期の順序を生成する。すべての端末が最後に同期したあと、次の3点が常に成り立つことを確かめる。全端末と全サーバーの行が一致すること。どの端末で書かれたどの版も、現行の行か `row_history` か `conflicts` のどれかに残っていること。並び順が全端末で一致すること。

### 13.3 結合テスト

| 対象 | 方法 |
|---|---|
| Supabase の関数と RLS | `supabase start` のローカル環境で、管理者・編集者・閲覧者・非メンバーの4人分の JWT から各 RPC を呼び、第7.3節（基本設計）の権限表どおりに通るか拒否されるかを確認 |
| 課金 Webhook | RevenueCat と Stripe の事象サンプルを署名付きで送り、`entitlements` の結果と重複配信の無視を確認 |
| 帳票 | 固定データから PDF を生成し、ページ数と抽出テキストをスナップショット比較 |

### 13.4 画面のテスト（Playwright、Web 版）

1. 新規作品→台本テキストの貼り付け→取り込み確認で1か所分割→確定→香盤表に行が出る。
2. 香盤表でセルを切り替える→ブレイクダウンの詳細にも反映→再読み込み後も残る。
3. 撮影日を2日作り、シーンを割り当て→NG日の人物を入れるとエラーの印が出る。
4. 日々スケで集合時刻を上書き→予定の時刻が積み直される→PDF が出力される。
5. オフライン（通信遮断）で編集→保存状態が「同期待ち」になる→通信を戻すと「同期済み」になる。

## 14. フェーズ2で詳細設計する対象

改訂差分の確認画面と引き継ぎ処理、日々スケの配布（Worker、暗号化、既読）、配置図、簡易ビューファインダーとネイティブプラグイン、写真の同期と容量管理、絵コンテ、現場モードと繰り越し、メンバー招待と作品プラン課金、テンプレートの取り込み、通知。基本設計の方式を前提に、フェーズ1の実装結果（特に台本解析の精度と同期の実測）を見てから着手する。
