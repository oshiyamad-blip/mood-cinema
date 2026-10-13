# 詳細設計書：撮影準備の台帳アプリ（仮称 KOBAN）フェーズ1

| 項目 | 内容 |
|---|---|
| 文書バージョン | 0.2（全面改訂） |
| 作成日 | 2026-10-12 |
| 改訂日 | 2026-10-12 |
| 入力 | `03-requirements.md` v0.2、`04-basic-design.md` v0.2、`08-adversarial-review.md` |
| 対象範囲 | **フェーズ1（20週の Web ベータ）の実装対象のみ**。課金・メンバーと権限の画面・ストア版・ショットリスト・配置図・ビューファインダー・絵コンテ・現場モード・AI 下書き・接続口は第15章に名前だけ挙げ、フェーズ2の詳細設計で扱う |
| 読み手 | 実装者。本書だけで関数・テーブル・SQL・画面・帳票を実装できることを目標にする |
| 前提 | 同期は自作の場合で書く。1週目に PowerSync を採った場合に変わる箇所は 5.12 に挙げる |

## 1. 基本設計からの修正

`04` v0.2 と食い違う箇所は無い。v0.1 で本表に挙げた11点の修正は、すべて `04` v0.2 に取り込んだ。

| v0.1 の修正 | `04` v0.2 での扱い |
|---|---|
| 1 時刻を0時からの分に | 6.7（列名はすべて `_min`） |
| 2 `elements.sort_key` | 7.3 |
| 3 並べ替えキーに `fractional-indexing` | 第4章。同じキーの扱いは本書 3.2 |
| 4 勧告ロック | 8.5（引き込みの条件も明文化） |
| 5 `create_project` | 8.7（冪等にした） |
| 6 Web のセッションを localStorage に | 17章 |
| 7 課金の保存先 | フェーズ2（`04` 第25章） |
| 8 Web Locks | 7.7（引き継ぎの手順を追加） |
| 9 suncalc | 10.5（正午を渡す） |
| 10 `rev` を `collate "C"` に | 7.1 |
| 11 `projects.created_at` | 7.1（サーバーだけが決める列） |

## 2. 共通仕様

### 2.1 識別子・時刻・日付

| 対象 | 形式 |
|---|---|
| 行の ID | UUIDv7 文字列（小文字、ハイフンあり）。`uuid` パッケージの `v7()` |
| 決定的な ID | UUIDv5。名前空間 `KOBAN_NS = '6f0d6c1e-3b8a-5c2e-9a41-7d2f0b9e4c13'`、名前は `04` 7.2 の文字列（例 `{project_id}/scene_elements/{scene_id}/{element_id}`）。`uuid` パッケージの `v5()` |
| 端末 ID | 8文字の英小文字と数字（`[0-9a-z]{8}`）。初回起動時に生成し `meta.deviceId` に保存 |
| HLC | `<物理時刻ミリ秒の16進13桁>-<カウンタ16進4桁>-<端末ID>`。例 `0019a3f2c4b10-0000-k3x9q2ma`。文字列比較（バイト順）で大小が決まる。サーバーの形式検査は `^[0-9a-f]{13}-[0-9a-f]{4}-[0-9a-z]{8}$` |
| 日付 | `YYYY-MM-DD`（作品のタイムゾーンの暦日） |
| 撮影日内の時刻 | 0時からの分（整数、0〜2159＝35:59）。表示は `H:MM`。24時以降も `25:30` と表示 |
| 尺 | 秒（整数、0〜5999）。表示は `m:ss` |
| タイムゾーン | 作品設定 `tz`。既定 `Asia/Tokyo` |
| 実時刻（作成日時など） | ISO 8601（UTC） |
| 曜日の表記 | `10月21日(水)`。例の日付は2026年の暦に合わせる（2026-10-20 は火曜、10-21 は水曜） |

### 2.2 作品設定 `projects.settings`

```ts
interface ProjectSettings {
  tz: string;                          // 既定 'Asia/Tokyo'
  minPerPage: number;                  // 撮影見積の係数 分/ペラ。既定 60
  prepMin: number;                     // 集合から最初のシーン開始まで。既定 60
  moveMin: number;                     // ロケ地が変わるときの移動。既定 60
  makeupMin: number;                   // 出演者の入りから初出番まで。既定 60
  wrapBufferMin: number;               // 最後のシーン終了から撤収まで。既定 30
  defaultLunch: { label: string; atMin: number; durationMin: number } | null; // 既定 {'昼食', 720, 60}
  departments: string[];               // 既定 ['演出部','制作部','撮影部','照明部','録音部','美術部','装飾部','衣裳部','メイク部','車両部']
  callSheetContacts: { personId: string; label: string }[];  // 日々スケの既定の連絡先
  hidePhoneOnCallSheet: boolean;       // 既定 true（F8-7）
  showProjectTitleInShare: boolean;    // 配布の中身に作品名を入れる。既定 true（OGP には常に出さない）
  kobanColumns: {
    categoryIds: string[];             // 表示するカテゴリと順序
    personOrder: 'appearance' | 'name' | 'manual';  // 既定 'appearance'（出番の多い順）
    showDuration: boolean;             // 尺の列。既定 false
  };
  kobanPaper: 'A3' | 'A4';             // 既定 'A3'
  callSheetPaper: 'A4' | 'phone';      // 既定 'A4'
}
```

値の範囲外や欠けは、読み込み時に既定値で補う（`normalizeSettings()`）。保存時は全項目を書き戻す。作品の行は管理者だけが書ける（`04` 7.6）。

### 2.3 エラーの扱い

core の関数は例外を投げず、`Result<T, E>` を返す。UI 層と通信層だけが例外を扱い、第12章のエラーコードに変換して表示する。

```ts
type Result<T, E extends AppError = AppError> = { ok: true; value: T } | { ok: false; error: E };
interface AppError { code: ErrorCode; detail?: Record<string, unknown> }
type ErrorCode = 'E_NETWORK' | 'E_AUTH' | 'E_FORBIDDEN' | /* …第12章の全コード… */ 'E_DECRYPT';
```

### 2.4 文言

UI 文言は `apps/app/src/i18n/ja.ts` を正とし、`en.ts` は `typeof ja` と同じ形にする（型で欠けを検出）。キーは `画面.要素.状態` の形（例 `koban.empty.title`）。入力を求める文言は「〜を入力してください」に統一する（「入れてください」は使わない）。

## 3. core モジュール

すべて `packages/core` の純粋関数で、DOM・DB・ネットワークに依存しない。ドメインの型（`Episode`・`Scene`・`Element`・`SceneElement`・`Category`・`Person`・`PersonContact`・`Location`・`ShootDay`・`ShootDayScene`・`TimeOfDay`・`IntExt`・`EvidenceKind`）は `04` 6.8 のものを使う。`TextItem`・`TextStyle` は pdf.js の型である。

### 3.1 hlc

```ts
interface HlcState { ms: number; counter: number; deviceId: string }
function hlcNow(state: HlcState, wallMs: number): { hlc: string; state: HlcState };
function hlcReceive(state: HlcState, remote: string, wallMs: number): Result<HlcState>;
function hlcReset(state: HlcState, wallMs: number): HlcState;      // skew を受けたとき
function hlcParse(s: string): { ms: number; counter: number; deviceId: string } | null;
function correctedWall(nowMs: number, offsetMs: number): number;   // nowMs + offsetMs
```

| 関数 | 規則 |
|---|---|
| `hlcNow` | `wallMs > state.ms` なら `(wallMs, 0)`、そうでなければ `(state.ms, counter+1)`。カウンタが 0xffff を超えたら `(ms+1, 0)` に繰り上げる |
| `hlcReceive` | 相手の物理時刻が `wallMs + 600000`（10分）より先なら `E_CLOCK_SKEW` を返し、時計は進めない（行は取り込む）。そうでなければ `ms = max(wallMs, state.ms, remote.ms)` として標準の HLC 規則でカウンタを進める |
| `hlcReset` | `(max(wallMs, 最後にサーバーに受理された rev の ms), 0)` に戻す。単調性を一度だけ破るが、未来の版はサーバーに受理されていないので矛盾しない（`04` 8.6） |
| 壁時計 | `wallMs = correctedWall(Date.now(), meta.clockOffsetMs)`。`clockOffsetMs` は応答の `server_now_ms` から `server_now_ms − (送信時刻＋受信時刻)/2` で測り、絶対値が60,000を超えたときだけ採用する（超えなければ0） |

状態は書き込みのたびに、同じトランザクションで `meta.hlc` に保存する。

### 3.2 order

```ts
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
interface Ordered { id: string; sortKey: string }
function compareOrdered(a: Ordered, b: Ordered): number;        // (sortKey, id) の昇順。sortKey は C 照合と同じバイト順で比べる
function placeAt(list: Ordered[], index: number): { key: string; rekeys: { id: string; sortKey: string }[] };
function keysFor(n: number): string[];                           // generateNKeysBetween(null, null, n)
```

`placeAt` は、並べ替え済みの `list` の `index` の位置（`list[index-1]` と `list[index]` の間）に入れる新しいキーを返す。`fractional-indexing` は前後のキーが等しいと例外を投げるので、次のように扱う（T13）。

1. 前後のキーが異なれば `generateKeyBetween(前, 後)` を返し、`rekeys` は空。
2. 前後のキーが等しい（2台が同じ位置に同時に挿入した結果）なら、その等しいキーの連なり `list[i0..i1]` を探し、連なりの直前の異なるキー `lo` と直後の異なるキー `hi` の間に `generateNKeysBetween(lo, hi, 連なりの数＋1)` で新しいキーを作る。連なりの行と新しい行に、現在の順序を保ったまま割り当て、連なりの行を `rekeys` として返す（その行も書き込む）。
3. どこかに形式が不正なキーがあれば、`keysFor(list.length + 1)` で一覧全体を振り直す。

大量のシーンを一度に作る取り込みは `keysFor(n)` を使う。

### 3.3 ids

```ts
const KOBAN_NS = '6f0d6c1e-3b8a-5c2e-9a41-7d2f0b9e4c13';
function newId(): string;                                           // v7()
function detId(projectId: string, table: string, ...parts: string[]): string; // v5(`${projectId}/${table}/${parts.join('/')}`, KOBAN_NS)
const ids = {
  sceneElement: (p, sceneId, elementId) => detId(p, 'scene_elements', sceneId, elementId),
  assignment:   (p, dayId, sceneId, part) => detId(p, 'shoot_day_scenes', dayId, sceneId, part),
  callSheet:    (p, dayId) => detId(p, 'call_sheets', dayId),
  callSheetItem:(p, dayId, kind, key) => detId(p, 'call_sheet_items', dayId, kind, key),
  share:        (p, dayId) => detId(p, 'shares', dayId),
  publication:  (p, shareId, version) => detId(p, 'share_publications', shareId, String(version)),
  versionScene: (p, versionId, sceneId) => detId(p, 'script_version_scenes', versionId, sceneId),
  category:     (p, key) => detId(p, 'categories', key),
  personElement:(p, personId) => detId(p, 'elements', 'person', personId),
  contact:      (p, personId) => detId(p, 'person_contacts', personId),
};
```

`part` は空文字を含めてそのまま名前に入れる（`.../{scene_id}/` で終わる名前になる）。

### 3.4 script（台本解析）

#### 3.4.1 入出力

```ts
type SourceKind = 'txt' | 'pdf' | 'docx' | 'paste';
interface RawLine { text: string; page?: number; indent?: number }   // indent は PDF の字下げ（字数）
type LineKind = 'hashira' | 'togaki' | 'serifu';
type ParseFlag = 'single_speaker' | 'speaker_unsure' | 'hashira_like' | 'number_ambiguous' | 'unclosed_quote' | 'intext_unknown' | 'tod_unknown';
interface ParsedLine {
  index: number;                // 改訂稿の全文での行番号（0始まり）。根拠の行範囲はこれを使う
  kind: LineKind; sub?: 'caption' | 'sound';
  speaker?: string; modifier?: string; text: string; flags: ParseFlag[];
}
interface ParsedScene {
  number: string | null; heading: string; locationName: string | null; inheritsLocation: boolean;
  timeOfDay: TimeOfDay; intExt: IntExt;
  lineFrom: number; lineTo: number;   // 柱の行から次の柱の直前まで
  lines: ParsedLine[]; pages: number; speakers: string[]; flags: ParseFlag[];
}
interface ParseResult { lines: string[]; scenes: ParsedScene[]; speakerCounts: Record<string, number>; warnings: ParseWarning[] }
interface ParseWarning { code: 'no_hashira' | 'image_pdf' | 'encoding_guess'; detail?: Record<string, unknown> }
function extractLines(kind: SourceKind, input: ArrayBuffer | string): Promise<Result<RawLine[]>>;  // pdf/docx は apps 側のアダプタ経由
function parseJapaneseScript(lines: RawLine[], known?: { personNames: string[] }): ParseResult;
```

`lines` は改訂稿の全文を行に分けたもの（`script_versions.raw_text` を `\n` で分けた位置と一致させる）。シーンの本文はここから `lineFrom..lineTo` を切り出して得る。

#### 3.4.2 正規化

判定用の文字列だけを NFKC で正規化し、前後の空白を除く。表示用の `text` は原文のまま残す。NFKC で全角数字・英字・括弧（`（）`→`()`）・全角空白（→半角空白）・縦書き用の約物（`︒`→`。` など）が揃う。`○`（U+25CB）・`◯`（U+25EF）・`〇`（U+3007）・`「」『』`・`・` は変わらない。空行は捨てるが、行番号は全文の位置のまま数える。

字間を空けた名前を拾うため、行頭から「1字＋空白」が1〜5回続いて1字で終わり、その直後が `(`・`「`・`『`・行末のときは、その範囲の空白を詰める（`花　子「…」` → `花子「…」`）。

#### 3.4.3 柱の判定

以下の正規表現は判定用の文字列に対して使う。`NUM` と `SEP` は部品である。

```js
const NUM = String.raw`\d{1,4}(?:の\d{1,3}|-\d{1,3})?[A-Za-z]?`;   // 12、12A、12-2、12の2
const SEP = String.raw`[\s.、:]`;
const H_NUM_FIRST  = new RegExp(String.raw`^(${NUM})\s*[○◯](?![○◯〇])\s*(.+)$`, 'u');                                // 12 ○公園
const H_MARK       = new RegExp(String.raw`^[○◯](?![○◯〇])\s*(?:(${NUM})(?=${SEP}|$)${SEP}*)?(.+)$`, 'u');          // ○12 公園／○ 公園
const H_KANJI_ZERO = new RegExp(String.raw`^〇(?=\s)\s*(?:(${NUM})(?=${SEP}|$)${SEP}*)?(.+)$`, 'u');                 // 〇 公園（直後が空白のときだけ）
const H_LABEL      = new RegExp(String.raw`^(?:S#?|#|シーン)\s*(${NUM})(?=${SEP}|$)${SEP}*(.*)$`, 'u');              // S#12 駅前／#3A 屋上／シーン5 車内
const NOT_HEADING  = /[「」『』。]/u;
const COUNTER      = /^\d+(?:丁目|号室|号|番地|番|階|条|区|町|年|月|日|時|分|人|歳|才|F)/u;
```

| 規則 | 内容 |
|---|---|
| 順序 | `H_NUM_FIRST`、`H_MARK`、`H_KANJI_ZERO`、`H_LABEL` の順に試し、最初に一致したものを使う |
| 番号 | 番号は、直後に空白・`.`・`、`・`:`・行末が来るときだけ取る（先読み `(?=${SEP}|$)`）。「○ 3丁目の路地」「○ 101号室」は番号なしで、数字は見出しに残る |
| 見出しでない | 残りの部分に `「」『』。` を含む行は柱にしない（「○ 太郎、走る。」はト書き） |
| 伏せ字 | `○○家の前で`・`〇〇家の前で` のように記号が2つ続く行は柱にしない（`(?![○◯〇])`） |
| 漢数字のゼロ | `〇` は直後が空白のときだけ柱の記号とみなす。「〇田が入ってくる」はト書き |
| 番号の曖昧さ | 番号なしで見出しが数字から始まり、その数字に `COUNTER` の語が続かないとき（「○12公園」）は `number_ambiguous` を付ける |
| 長さ | 見出しが40字を超えたら `hashira_like` を付ける（柱らしいが疑わしい） |
| 番号なし | 番号が取れなかった柱には、直前の柱の番号の数字部分＋1を振る（最初は1）。振った番号は確認画面で直せる |

#### 3.4.4 時間帯

```js
const TOD = String.raw`(?:翌|同日?の?|その日の|前日の?)?(早朝|明け方|夜明け|朝|午前|昼|日中|午後|夕方|夕刻|夕|夜|深夜|真夜中)`;
const TOD_TAIL = new RegExp(String.raw`(?:\(\s*${TOD}\s*\)|(?:^|[・\s])${TOD})\s*$`, 'u');
```

時間帯は、見出しの末尾が「括弧に入った時間帯の語」か、「`・` か空白で区切られた最後の部分の全体が時間帯の語」のときだけ取る。取ったあとの末尾の `・` と空白を見出しから除く。取ると見出しが空になる場合は取らない。対応は 早朝・明け方・夜明け→`dawn`、朝・午前→`morning`、昼・日中・午後→`day`、夕方・夕刻・夕→`evening`、夜→`night`、深夜・真夜中→`midnight`。取れなければ `unknown` で `tod_unknown` を付ける。

| 見出し | 結果 |
|---|---|
| 太郎の家・翌朝 | 見出し「太郎の家」、`morning` |
| 居酒屋・十六夜 | 見出し「居酒屋・十六夜」、`unknown`（「夜」は区切られた部分の全体ではない） |
| 公園（夜） | 見出し「公園」、`night` |
| 駅前 夕 | 見出し「駅前」、`evening` |

#### 3.4.5 屋内外

見出しを `・` と空白で区切り、最後の部分から先頭へ向かって、最初に判定できた部分で決める。

1. 部分そのものが外の印（外、表、屋外、野外）なら `ext`、内の印（内、中、屋内、室内）なら `int`。
2. そうでなければ、部分の**末尾**に一致する語を外と内の語彙から探し、最も長く一致した方にする。長さが同じなら `unknown`。
3. どの部分でも決まらなければ `unknown` で `intext_unknown` を付ける。

外の語彙：公園、河原、河川敷、海岸、浜辺、海、山道、山中、森、林、路上、道、路地、通り、駅前、校庭、庭、屋上、ベランダ、駐車場、橋、畑、田んぼ、広場、ホーム、境内、墓地、空き地。内の語彙：部屋、居間、台所、キッチン、寝室、教室、職員室、店内、車内、廊下、事務所、会議室、病室、玄関、浴室、トイレ、楽屋、スタジオ、家、室、邸、館内、社内、屋内、号室、ロビー、バー、カフェ、居酒屋、店。末尾との一致にしたので、「山田の部屋」は「部屋」で内、「森田」「山田」は判定しない（v0.1 は「山」「森」の部分一致で外にしていた）。語彙は `packages/core/script/lexicon.ts` に定数で置く。

#### 3.4.6 ロケ地の候補

見出しの最初の部分（`・` の前）をロケ地名の候補にする（「太郎の家・居間」→「太郎の家」）。見出しが「同」だけか「同・」で始まるときは `inheritsLocation=true` とし、直前のシーンのロケ地を使う（見出しも「太郎の家・夜」のように直前のロケ地名で補って表示する）。取り込み確認で同じ名前を1件のロケ地にまとめ、表記揺れの統合と「ロケ地にしない」ができる。

#### 3.4.7 セリフ

```js
const NAME = String.raw`[^\s「」『』()。、]{1,12}`;
const SAME_LINE = new RegExp(String.raw`^(${NAME}?)\s*(?:\(([^()「」『』]{1,20})\))?\s*([「『].*)$`, 'u');
const NAME_ONLY = new RegExp(String.raw`^(${NAME})\s*(?:\(([^()「」『』]{1,20})\))?$`, 'u');
const NON_PERSON  = /^(?:テロップ|字幕|スーパー|タイトル|サブタイトル|文字|看板|貼り紙|張り紙|手紙|メール|LINE|画面|テレビ|TV|ラジオ|音|SE|効果音|アナウンス|放送|声|N|ナレーション)$/u;
const SOUND_PLACE = /^(?:遠く|奥|外|背後|後ろ|隣|向こう|上|下|廊下|ドアの向こう|部屋の外|画面外|どこか)(?:から|で)$/u;
const PARTICLE_END   = /(?:は|が|を|に|と|も|の|で|へ)$/u;
const INNER_PARTICLE = /^(.{1,8}?)(?:が|は)(.+)$/u;
```

1周目（行ごと）：

1. 柱なら柱。
2. `SAME_LINE` に一致すれば、括弧の部分（3番目の捕捉）から後続の行をつないで、括弧が閉じるまでを1つのセリフの候補にする。括弧は `「」` と `『』` を積み上げで照合し、積み上げが空になった位置で閉じたとみなす（入れ子の `「花子が『行く』って」` を正しく閉じる）。つなぐのは最大20行で、**柱の行に当たったらそこで止める**（閉じない括弧が後続の柱を飲み込まない）。閉じないまま止まったら `unclosed_quote` を付ける。
3. 閉じ括弧のあとに、空白と `。`・`、` 以外の文字が続くなら、その行はト書きにする（「遠くで「おーい」と声がする」「太郎は「行こう」と言った」）。
4. 直前の行が `NAME_ONLY` に一致し、現在の行が `「` か `『` で始まるなら、直前の行の名前を話者とするセリフの候補にする（直前の行は話者の行としてセリフに含める）。
5. それ以外はト書き。

2周目（台本全体での出現回数で確定。回数は話者名ごとに、1周目のセリフ候補の数を数える）：

| 条件（上から順に評価） | 判定 |
|---|---|
| 話者が `NON_PERSON` に一致 | ト書き。テロップ・字幕・スーパー・タイトル・文字は `sub='caption'`、それ以外は `sub='sound'` |
| 話者が `SOUND_PLACE` に一致 | ト書き（`sub='sound'`） |
| 話者が既存の人物名・役名（`known.personNames`）に一致 | その人のセリフ |
| 話者に `INNER_PARTICLE` が一致し、出現が1回 | 前の語（「花子」）が2回以上話者として出ていれば、前の語を話者、後ろ（「小声で」）を修飾とするセリフ。そうでなければト書き（`speaker_unsure`） |
| 話者が `PARTICLE_END` に一致し、出現が1回 | ト書き（「まこと」「しの」「かえで」のような名前は2回以上出れば話者になる） |
| 出現が1回 | セリフ（`single_speaker` を付けて確認画面に出す） |
| それ以外 | セリフ |

括弧の修飾（声、M、OFF、N、心の声、受話器に向かって など、20字まで）は `modifier` に入れ、話者名から外す。話者 `N` と `ナレーション` は人物の候補にしない。話者の数え方は、空白を除いた NFKC の名前で行う。

#### 3.4.8 ペラ

200字詰め（20字×10行）を1ペラとし、行ごとに使う行数を数える。柱は `ceil(長さ/20)`、ト書きは3字下げとして `ceil(長さ/17)`、セリフは話者名と括弧を含めて `ceil((話者名の長さ+1+本文の長さ)/20)` とする。シーンのペラは合計行数を10で割り、小数2桁に丸める。

#### 3.4.9 PDF からの行の復元

pdf.js の `getTextContent()` は、文字片（`str`、`transform`、`width`、`height`、`fontName`）と、フォントごとの `styles[fontName]`（`fontFamily`、`ascent`、`descent`、`vertical`）を返す。pdf.js は縦書きフォントの文字片について、`width` に字の大きさ、`height` に列の長さを入れる（横書きでは逆に、`height` が字の大きさ、`width` が行の長さ）。v0.1 は「高さが幅の2倍以上なら縦書き」としていたため、縦書きの文字片の向きと束ね方が逆になっていた（T19）。

```ts
function isVerticalItem(it: TextItem, styles: Record<string, TextStyle>): boolean {
  const [a, b, c, d] = it.transform;
  const rotated90 = Math.abs(a) < 1e-3 && Math.abs(d) < 1e-3 && Math.abs(b) > 1e-3; // 横書きフォントを90度回して縦に置いたもの
  return styles[it.fontName]?.vertical === true || rotated90;
}
function charSize(it: TextItem, styles): number {
  return styles[it.fontName]?.vertical ? it.width : it.height;   // 回転した横書きフォントは height が字の大きさ
}
```

1. **向きの判定。** ページごとに、縦書きの文字片の字数と横書きの文字片の字数を比べ、多い方をそのページの向きにする。少ない方の文字片（ページ番号・柱の番号の横組みなど）も、後の束ねでは同じ規則で扱う。
2. **字の大きさ。** そのページの向きの文字片について `charSize` の中央値を `s` とする。
3. **柱の外の文字を捨てる。** ページの上下（縦書きでは加えて左右）の5%の帯にあり、全ページの半数以上で同じ文字列（数字は `#` に置き換えて比べる）が出る文字片と、`^\d+$`・`^-\s*\d+\s*-$` のページ番号を捨てる。
4. **縦書きの束ね。** 文字片の x 座標 `transform[4]` で束ねて列にする。許容幅は `0.5 × s`。縦書きフォントの原点が字の中心か左端かはフォントで決まるが、同じフォントの文字片はすべて同じだけずれるので、束ねには影響しない（字の大きさの違うフォントが混じるときは、フォントごとに `charSize/2` を足して中心にそろえる）。列を x の降順（右から左）、列内を y の降順（PDF の座標は上が大きい）に並べてつなぐ。横書きのページは、y 座標 `transform[5]` で束ね、行を y の降順、行内を x の昇順にする。
5. **字下げ。** 縦書きの列では、ページの本文の上端（そのページの列の先頭の y の最大値）と列の先頭の y の差を `s` で割って丸めた値を `indent` に入れる。ト書きの3字下げの判定の補助に使う。
6. **段落の折り返し。** ある列の末尾がページの本文の下端（列の末尾の y の最小値）から `1 × s` 以内に達し、次の列の `indent` が前の列の `indent` 以上で、次の列が柱でもセリフの始まりでもないときは、同じ段落の折り返しとしてつなぐ。
7. **画像だけの PDF。** 全ページの文字数の合計がページ数×20字に満たなければ、`E_IMAGE_PDF` で取り込みを止める（F2-8）。

この復元は書式によって精度が落ちる。取り込み確認画面で印を一覧にし、手で直せるようにする（9.6）。手直しの件数を計測する（第13章）。

#### 3.4.10 txt・貼り付け・docx

txt は先頭の BOM を見て、無ければ `new TextDecoder('utf-8', { fatal: true })` で読み、失敗したら `new TextDecoder('shift_jis')` で読む（Shift_JIS と推定したら `encoding_guess` の警告）。改行は `\r\n`・`\r` を `\n` に揃える。docx は mammoth の `extractRawText` で段落を取り、段落を1行にする。

### 3.5 tabular（Excel・CSV の取り込み）

```ts
type ColumnRole =
  | { kind: 'episode' | 'number' | 'heading' | 'timeOfDay' | 'intExt' | 'pages' | 'durationSec' | 'estShootMin' | 'shootDay' | 'location' | 'note' | 'ignore' }
  | { kind: 'element'; categoryKey: string; name: string };   // 人物（cast）・エキストラ（extra）・衣裳など
interface TabularSource { fileName: string; sheet: string | null }   // CSV は sheet=null
interface TabularResult {
  episodes: { number: string; title: string }[];
  scenes: { episode: string | null; number: string | null; heading: string; timeOfDay: TimeOfDay; intExt: IntExt; pages?: number; durationSec?: number; estShootMin?: number; location?: string; note?: string; shootDay?: string; rowNumber: number }[];
  marks: { sceneRow: number; categoryKey: string; elementName: string; note?: string; evRef: string }[];
  warnings: { rowNumber: number; column: number; code: 'bad_time' | 'bad_number' | 'dup_number' }[];
}
function guessHeaderRow(rows: unknown[][]): number;           // 先頭20行で、空でないセルが3つ以上あり「番号」「柱」「シーン」「S#」のどれかを含む最初の行
function autoMapColumns(header: string[]): ColumnRole[];      // templates/columns.ts の見出しと照合。照合できない列は ignore
function parseMarkCell(v: unknown): { mark: boolean; note?: string };
function tabularToLedger(rows: unknown[][], headerRow: number, roles: ColumnRole[], src: TabularSource): TabularResult;
```

| 値 | 読み方 |
|---|---|
| 印のセル | 空なら印なし。`●`・`○`・`◯`・`1`・`✓`・`✔`・`x`・`X` は印だけ。それ以外の文字は印と備考 |
| 時間帯 | 柱の規則（3.4.4）の語のほか、`D`→`day`、`N`→`night`、`M`→`morning`、`E`→`evening` |
| 屋内外 | `内`・`I`・`INT`→`int`、`外`・`E`・`EXT`→`ext`（屋内外の列に限る） |
| 尺 | `m:ss`、`m分ss秒`、または秒の数 |
| 撮影見積 | 分の数、または `h:mm` |
| 撮影日 | 日付として読めれば撮影日の日付、読めなければラベルとして撮影日を作る |
| 柱 | 柱の列は台本と同じ規則で時間帯・屋内外・ロケ地を取り出す。時間帯・屋内外の列があればそちらを優先する |

根拠は `ev_kind='excel'`、`ev_ref` は `{ファイル名} {シート名}!{行番号}行`（CSV は `{ファイル名} {行番号}行`）。人物の列からは `kind='cast'`（エキストラの列は `extra`）の人物と要素を作る。

### 3.6 revision（改訂差分と引き継ぎ、影響）

```ts
interface RevisionInput {
  episodeId: string; settings: ProjectSettings;
  next: { lines: string[]; parsed: ParseResult };
  current: {
    versionId: string | null; lines: string[] | null;   // 現在の版の全文。鍵が無ければ null
    scenes: Scene[]; elements: Element[]; categories: Category[]; sceneElements: SceneElement[];
    persons: Person[]; locations: Location[];
    shootDays: ShootDay[]; assignments: ShootDayScene[]; callSheetInputs: Map<string, CallSheetContext>;  // 撮影日ID → 現在の日々スケの入力
    published: Map<string, SharePayloadV1>;              // 撮影日ID → 配布済みの最新版（あれば）
  };
}
type MatchKind = 'same' | 'changed' | 'added' | 'removed';
interface SceneMatch { kind: MatchKind; oldSceneId?: string; newIndex?: number; score?: number; lineMap?: Int32Array /* 旧行→新行、-1 は消えた行 */ }
type ProposalKind = 'mark_add' | 'mark_remove' | 'person_add' | 'location_change' | 'evidence_moved' | 'evidence_lost';
interface Proposal {
  id: string; kind: ProposalKind; match: number;       // matches の添字
  elementId?: string; name?: string; categoryKey?: string; locationName?: string;
  evidence?: { lineFrom: number; lineTo: number };     // 新しい版の行
  defaultAccepted: boolean;                             // 追加は true、外すのは false（自動では外さない）
}
interface Impact {
  shootDayId: string; label: string;
  changes: { kind: 'cast_add' | 'cast_remove' | 'scene_removed' | 'scene_changed' | 'time_shift' | 'new_issue'; text: string }[];
  republishNeeded: boolean;
}
interface RevisionPlan { matches: SceneMatch[]; proposals: Proposal[]; impacts: Impact[]; warnings: ('old_body_unavailable')[] }
function planRevision(input: RevisionInput): RevisionPlan;
function computeImpacts(input: RevisionInput, matches: SceneMatch[], accepted: Set<string>): Impact[];  // 利用者が採否を変えるたびに呼ぶ
function applyRevision(input: RevisionInput, plan: RevisionPlan, accepted: Set<string>, meta: { name: string; revisedOn?: string; sourceKind: SourceKind; text: string }, t: Writer): Promise<void>;
```

**対応づけ。**

1. 旧シーンの本文 = `current.lines[lineFrom..lineTo]`、新シーンの本文 = `next.lines[lineFrom..lineTo]`。比較用に、柱の行を除き、空白を詰めて NFKC にする。
2. 比較用の本文が一致するものを `same` に確定する（別の端末は `script_version_scenes.body_mac` で同じ判定ができる）。
3. 残りについて `score = 0.4 × sim(見出し) + 0.6 × sim(本文)`。`sim` は文字3-gram の Jaccard 係数。台本上の順位の差 `|旧順位 − 新順位| / max(旧数, 新数)` が0.3を超える組は0.1を引く。
4. 0.5以上の組を点数の降順に1対1で確定し（`changed`）、残りの旧を `removed`、新を `added` にする。
5. `same`・`changed` の組で、行の差分（Myers 法、行単位）から `lineMap` を作る。
6. `current.lines` が null のときは、1〜5を「番号が同じ、または見出しの類似度が0.8以上」だけで行い、`lineMap` は作らず、`old_body_unavailable` を警告に入れる。

**提案。**

| 種類 | 作り方 | 既定 |
|---|---|---|
| `evidence_moved` | 根拠が台本の行である印の範囲を `lineMap` で写す。写した先が1行以上残る | 採用 |
| `evidence_lost` | 写した先がすべて -1（`ev_lost_in_version_id` を付ける。印は外さない） | 採用 |
| `mark_add`（話者） | 新シーンの話者で、そのシーンにまだ印の無い人物 | 採用 |
| `person_add` | 新しい話者で人物マスタにいない名前（人物と要素を作り、印を付ける） | 採用 |
| `mark_add`（ト書き） | 既存の要素（人物以外）の名前が、新シーンの本文に現れ、旧シーンには無かった | 採用 |
| `mark_remove` | 旧シーンにいて新シーンにいない話者の印、旧本文にあって新本文から消えた要素の印 | 不採用（外すのは提案だけ） |
| `location_change` | 柱の見出しのロケ地の部分が変わった | 採用 |

**影響。** `accepted` を反映した台帳をメモリ上で作り、変わったシーン（`changed`・`removed`）と、印や見積が変わるシーンを含む撮影日ごとに、`buildTimeline` と `buildCallSheet` を前後で計算して比べる。出演者の増減（`cast_add`・`cast_remove`）、時間割から外れるシーン（`scene_removed`）、内容の変わったシーン（`scene_changed`）、開始時刻が15分以上ずれるシーン（`time_shift`）、新しく出る検査の結果（`new_issue`。NG日など）を文にする。配布済みの版があり、配布の中身が変わる撮影日は `republishNeeded=true`。

**確定（`applyRevision`）。** 1トランザクションで次を行う。直前に「改訂の取り込み前」のスナップショットを取る（4.7）。

1. `script_versions` を新しく作る（`based_on_version_id` に現在の版）。全文は平文の列に入れ、送るときに暗号化される。
2. `same`：番号・行範囲・`source_version_id` を更新。`changed`：加えて見出し・時間帯・屋内外・ペラを更新し、`changed_in_version_id` を新しい版、`change_reviewed=false` にする。`added`：シーンを作る（並べ替えキーは前後の対応から `placeAt` で決める）。`removed`：`status='orphaned'`。
3. 採用した提案を書き込む（印は決定的な ID で作るか復元する。根拠は `script`、新しい版と行範囲）。
4. 新しい版の `script_version_scenes` を作る（`body_mac` の形式は 6.2）。

### 3.7 koban（香盤表の導出）

```ts
interface KobanInput {
  episodes: Episode[]; scenes: Scene[]; elements: Element[]; sceneElements: SceneElement[];
  categories: Category[]; persons: Map<string, Person>; locations: Map<string, Location>;
  shootDays: ShootDay[]; assignments: ShootDayScene[]; settings: ProjectSettings;
}
type KobanSort = 'episode' | 'location' | 'shootDay';
interface KobanMark { kind: EvidenceKind; hasLine: boolean; lost: boolean; note?: string }
interface KobanColumn { elementId: string; label: string; categoryId: string; categoryKind: 'cast' | 'extra' | 'item'; count: number }
interface KobanRow {
  scene: Scene; episodeNumber: string; displayNumber: string;   // 話が複数なら「3-12」、1つなら「12」
  locationName: string | null; estShootMin: number; estSource: 'manual' | 'pages';
  shootDayLabels: string[]; marks: Map<string, KobanMark>;      // elementId → 印
}
interface KobanModel {
  showEpisode: boolean; columns: KobanColumn[]; rows: KobanRow[];
  totals: { scenes: number; pages: number; durationSec: number; estShootMin: number; unassigned: number; marksWithoutLine: number; marksLost: number };
}
function deriveKoban(input: KobanInput, sort: KobanSort, filter?: { episodeId?: string; categoryIds?: string[]; nameQuery?: string }): KobanModel;
```

| 項目 | 規則 |
|---|---|
| 行 | `status='active'` かつ削除されていないシーン |
| 並び | `episode`：話の並び→シーンの並び（既定）。`location`：ロケ地名（無しは末尾）→話→シーン。`shootDay`：最初の撮影日の日付→撮影日内の並び→未割当は末尾 |
| 列 | `settings.kobanColumns.categoryIds` の順にカテゴリを並べる。カテゴリ内は、キャスト・エキストラなら `personOrder` に従う（`appearance`：出演シーン数の降順、同数は名前順。`name`：名前順。`manual`：`elements.sort_key`）。他のカテゴリは名前順。スタッフは要素を持たないので列にならない |
| 印 | 削除されていない `scene_elements`。`hasLine` は `ev_kind='script'` で行範囲を持つか、`lost` は `ev_lost_in_version_id` があるか |
| 撮影見積 | 3.8 の `estimateScene` |
| 計算量 | `scene_elements` を一度だけ走査して行ごとの `Map` に入れる。シーン数×要素数の二重ループは作らない |
| 絞り込み | `nameQuery` は要素名・役名・人物名の部分一致で列を絞る |

### 3.8 schedule（見積・時間割・検査）

```ts
interface SceneEstimate { minutes: number; source: 'manual' | 'pages' }
interface MealSlot { key: string; label: string; atMin: number; durationMin: number; source: 'auto' | 'manual' }
type TimelineItem =
  | { kind: 'prep' | 'move'; startMin: number; endMin: number }
  | { kind: 'meal'; key: string; label: string; startMin: number; endMin: number }
  | { kind: 'scene'; assignmentId: string; sceneId: string; startMin: number; endMin: number; fixed: boolean };
interface DayTimeline { dayId: string; items: TimelineItem[]; estimatedWrapMin: number | null; totals: { estShootMin: number; pages: number; castCount: number } }
type IssueCode = 'NG_DATE' | 'STAFF_NG' | 'OVER_TIME' | 'DUP_SCENE' | 'DAYLIGHT' | 'FIXED_START_CONFLICT' | 'NUMBER_DUP';
interface Issue { code: IssueCode; level: 'error' | 'warn' | 'info'; dayId?: string; sceneId?: string; personId?: string; detail: Record<string, unknown> }
interface ValidateContext {
  day: ShootDay; timeline: DayTimeline; allDays: ShootDay[]; allAssignments: ShootDayScene[];
  scenes: Map<string, Scene>; persons: Map<string, Person>; elements: Element[]; sceneElements: SceneElement[];
  locations: Map<string, Location>; sun: SunTimes | null; settings: ProjectSettings;
}
function estimateScene(scene: Scene, s: ProjectSettings): SceneEstimate;
function estimateAssignment(a: ShootDayScene, scene: Scene, sameSceneAssignments: number, s: ProjectSettings): number;
function mealSlots(day: ShootDay, items: CallSheetItem[], s: ProjectSettings): MealSlot[];
function buildTimeline(day: ShootDay, ordered: ShootDayScene[], scenes: Map<string, Scene>, minutes: Map<string, number> /* 割り当てID → 分 */, meals: MealSlot[], s: ProjectSettings): DayTimeline;
function validateDay(ctx: ValidateContext): Issue[];
function validateProject(days: ShootDay[], assignments: ShootDayScene[], scenes: Scene[], episodes: Episode[]): { unassigned: string[]; issues: Issue[] };  // DUP_SCENE・NUMBER_DUP・未割当
```

**見積。** `estimateScene` は `scene.estShootMin` があればそれ（`manual`）、無ければ `round(scene.pages × s.minPerPage)`（`pages`）。`estimateAssignment` は、`part` が空なら `estimateScene` の値。`part` が空でなければ、割り当ての `est_shoot_min` があればそれ、無ければ `round(estimateScene / sameSceneAssignments)`。尺（`durationSec`）は使わない。

**食事。** `mealSlots` は、`call_sheet_items` の `kind='meal'` で `value` が null でなく `disabled` でない行を並べる。キー `auto-lunch` の行が無ければ `s.defaultLunch` を自動の昼食として加える（`auto-lunch` の行に `{disabled:true}` があれば加えない）。

**時間割（`buildTimeline`）。** 総スケと日々スケは必ずこの関数を同じ入力で呼ぶ（C3）。

```
day.callMin が null なら、全項目の時刻を出さず（estimatedWrapMin=null）、合計だけ返す
t = callMin + prepMin; items に prep [callMin, t]
prevLoc = null; 食事を atMin の昇順に並べる
各割り当て a（並び順）について：
  sc = scenes[a.sceneId]
  prevLoc と sc.locationId がどちらもあり、違えば items に move [t, t+moveMin]; t += moveMin
  まだ入れていない食事のうち atMin ≤ t のものを順に items へ [t, t+durationMin]; t += durationMin
  a.fixedStartMin があれば：fixedStartMin ≥ t なら t = fixedStartMin（fixed=true）
                            fixedStartMin < t なら t はそのまま（FIXED_START_CONFLICT の材料に記録）
  items に scene [t, t+minutes[a.id]]; t += minutes[a.id]; sc.locationId があれば prevLoc = sc.locationId
estimatedWrapMin = 割り当てが1つ以上なら t + wrapBufferMin、無ければ null
totals.castCount = その日のシーンに印のあるキャスト・エキストラの人物の数（重複なし）
```

食事は「食事の時刻を過ぎた最初のシーンの切れ目」に入る。最後のシーンのあとには入れない。

**検査（`validateDay`）。**

| コード | 条件 | 水準 |
|---|---|---|
| `NG_DATE` | その日のシーンに印のあるキャスト・エキストラ（`elements.person_id` の人物）の `ng_dates` に `day.date` がある | error |
| `STAFF_NG` | スタッフ（`kind='staff'`）の `ng_dates` に `day.date` がある（作品のすべての撮影日について調べる） | error |
| `OVER_TIME` | `day.wrapMin` と `estimatedWrapMin` があり、`estimatedWrapMin > wrapMin`（等しいときは出さない） | warn |
| `DAYLIGHT` | シーンが `ext`、ロケ地に座標があり、`sun` が求まる。`morning`・`day`・`evening` のシーンの区間が `sunriseMin` より前か `sunsetMin` より後にかかる、または `night`・`midnight` のシーンの区間が `sunsetMin` より前にかかる | info |
| `FIXED_START_CONFLICT` | 固定した開始時刻が、前のシーンの終了より前 | warn |

`validateProject` は作品全体で、`DUP_SCENE`（同じシーンが2つ以上の撮影日に入り、そのどれかの `part` が空。warn）、`NUMBER_DUP`（同じ話で番号が重なる。warn）、未割当のシーン一覧を返す。画面は、編集のあった撮影日と、その編集で結果が変わりうる撮影日（同じ人物・同じシーンを含む日）だけを再計算する。

### 3.9 sun

```ts
interface SunTimes { sunriseMin: number | null; sunsetMin: number | null; goldenAmEndMin: number | null; goldenPmStartMin: number | null }
function sunTimes(date: string, lat: number, lng: number, tz: string): SunTimes;
```

`suncalc.getTimes(noon, lat, lng)` に、作品のタイムゾーンでのその日の**正午**を表す `Date` を渡す（0時を渡すと、UTC との時差で前日の値になりうる）。`goldenHourEnd` と `goldenHour` を朝夕のゴールデンアワーの境とする。結果は作品のタイムゾーンでその日の0時からの分に直す（`Intl.DateTimeFormat` の `formatToParts` で時と分を取る）。求まらない値（白夜など、`Invalid Date`）は `null`。

### 3.10 callsheet（日々スケの導出）

```ts
interface CallSheetItem { id: string; shootDayId: string; kind: 'dept_call' | 'person_call' | 'meal' | 'note' | 'dept_note' | 'contact'; key: string; value: unknown | null; sortKey: string }
// value の形：dept_call {atMin}、person_call {atMin?, note?}、meal {label, atMin, durationMin, note?, disabled?}、
//             note {text}（key は general|transport|caution）、dept_note {text}（key は category_id）、contact {label, show}
interface CallSheetContext {
  project: { title: string; settings: ProjectSettings };
  day: ShootDay; callSheet: { meetingLocationId?: string; meetingNote?: string } | null; items: CallSheetItem[];
  ordered: ShootDayScene[]; timeline: DayTimeline;
  scenes: Map<string, Scene>; episodes: Map<string, Episode>; showEpisode: boolean;
  elements: Element[]; sceneElements: SceneElement[]; categories: Category[];
  persons: Map<string, Person>; contacts: Map<string, PersonContact> | null;   // 連絡先を読めなければ null
  locations: Map<string, Location>; sun: SunTimes | null;
}
type Source = 'auto' | 'manual';
interface CallSheetModel {
  header: { projectTitle: string; dayLabel: string; dateText: string; callMin: number | null; wrapMin: number | null; estimatedWrapMin: number | null;
            meeting: { name: string; address?: string; note?: string } | null; sun: SunTimes | null };
  schedule: ({ kind: 'scene'; startMin: number | null; endMin: number | null; displayNumber: string; part: string; heading: string; timeOfDay: TimeOfDay; intExt: IntExt; pages: number; estShootMin: number; cast: string[]; fixed: boolean }
           | { kind: 'meal' | 'move' | 'prep'; startMin: number | null; endMin: number | null; label: string })[];
  cast: { personId: string; name: string; roleName?: string; kind: 'cast' | 'extra'; entryMin: number | null; entrySource: Source; firstScene: string; scenes: string[]; note?: string }[];
  departments: { name: string; callMin: number | null; callSource: Source; staff: string[] }[];
  prep: { categoryId: string; categoryLabel: string; items: { name: string; forPerson?: string; scenes: string[] }[]; note?: string }[];
  meals: { key: string; label: string; startMin: number | null; durationMin: number; source: Source; note?: string }[];
  notes: { general?: string; transport?: string; caution?: string };
  contacts: { personId: string; label: string; name: string; tel?: string; email?: string }[];
}
function buildCallSheet(ctx: CallSheetContext, opt: { includePhone: boolean }): CallSheetModel;
```

| 欄 | 導出の規則 | 上書き |
|---|---|---|
| 集合時刻 | `day.callMin` | 日々スケで直すと `shoot_days.call_min` を書き換える（上書きの行は作らない） |
| 集合場所 | `call_sheets.meeting_location_id`、無ければ最初のシーンのロケ地 | `call_sheets` |
| 予定 | `ctx.timeline` の項目をそのまま並べる | シーンの開始を直すと `shoot_day_scenes.fixed_start_min` を書き換える |
| 出演者の入り | 初出番の開始 − `makeupMin`。並びは入りの早い順、同じなら役名順 | `person_call` |
| 部署別の集合 | 既定は `callMin`。各部署のスタッフ（`persons.dept`）を添える | `dept_call` |
| 準備物 | その日のシーンに印のある、人物以外の要素をカテゴリ別に名前順。`for_person_id` があれば持ち主を添える | `dept_note`（カテゴリごとのメモ） |
| 食事 | `ctx.timeline` の食事 | `meal`（時刻・長さ・名前の変更、`disabled` で外す、別の食事の追加） |
| 移動・注意事項 | 空 | `note`（`transport`・`caution`・`general`） |
| 連絡先 | `settings.callSheetContacts` に `contact` の行を重ねる（`show=false` で外す、新しい人を足す） | `contact` |

電話番号は、`opt.includePhone` が真で、かつ `ctx.contacts` が null でないときだけ入れる。`includePhone` の既定は `!settings.hidePhoneOnCallSheet`。手で上書きした値は `Source='manual'` で、画面と PDF に印を付ける。「自動の値に戻す」は、その上書きの行の `value` を null にする（行は消さない）。日付の表示は `10月21日(水)` の形。

### 3.11 share（配布の中身・差分・文面）

```ts
interface SharePayloadV1 {
  v: 1; version: number; publishedAt: string;
  projectTitle: string | null;                     // showProjectTitleInShare が偽なら null
  day: { label: string; date: string; dateText: string };
  call: { atMin: number | null; place: { name: string; address?: string; lat?: number; lng?: number } | null; note?: string };
  sun: { sunriseMin: number | null; sunsetMin: number | null } | null;
  schedule: { kind: 'scene' | 'meal' | 'move' | 'prep'; startMin: number | null; endMin: number | null; number?: string; heading?: string; timeOfDay?: TimeOfDay; intExt?: IntExt; castRefs?: string[]; label?: string }[];
  people: { ref: string; name: string; roleName?: string; group: 'cast' | 'extra' | 'staff'; dept?: string; callMin: number | null; scenes: string[]; note?: string }[];
  departments: { name: string; callMin: number | null }[];
  prep: { category: string; items: string[]; note?: string }[];
  meals: { label: string; startMin: number | null; durationMin: number }[];
  notes: { general?: string; transport?: string; caution?: string };
  contacts: { label: string; name: string; tel?: string }[];
  estimatedWrapMin: number | null;
  diff: ShareDiff | null;
}
interface ShareDiff {
  fromVersion: number;
  items: { kind: 'call' | 'place' | 'scene_add' | 'scene_remove' | 'scene_time' | 'person_add' | 'person_remove' | 'person_call' | 'meal' | 'note'; text: string; refs: string[] }[];
}
function buildSharePayload(model: CallSheetModel, refMap: Record<string, string>, staff: Person[], prev: SharePayloadV1 | null, meta: { version: number; publishedAt: string; projectTitle: string | null }): { payload: SharePayloadV1; refMap: Record<string, string> };
function diffShare(prev: SharePayloadV1, next: SharePayloadV1): ShareDiff;
function contentHash(p: SharePayloadV1): string;  // version・publishedAt・diff を除いた中身の SHA-256。再配布が必要かの判定に使う
function affectedRefs(diff: ShareDiff): string[];
function lineText(p: SharePayloadV1, link: string, opt: { mode: 'first' | 'update'; names?: string[] }): string;
function ackSummary(p: SharePayloadV1, acks: { ref: string; version: number }[]): { ref: string; name: string; state: 'current' | 'older' | 'none' }[];
```

| 項目 | 規則 |
|---|---|
| 人物 | その日の出演者（キャスト・エキストラ）と、その日の `ng_dates` に当たらないスタッフ全員。スタッフの `callMin` は `person_call`、無ければ部署の集合時刻 |
| 参照 ID | `refMap`（人物 ID → 8字の乱数）に無い人物だけ新しく振る。一度振った参照 ID は変えない（確認を版をまたいで突き合わせるため） |
| 電話番号 | 作品設定に従って伏せるのが既定（F8-7） |
| 差分の文 | 「集合 8:30→8:00」「場所 公園→太郎の家」「S5 を追加」「S7 を削除」「S2 の開始 9:00→9:30」「花子さんの入り 10:00→9:30」「父さんが出演に加わりました」「昼食 12:00→12:30」「注意事項が変わりました」 |
| 影響を受けた人 | `person_add`・`person_remove`・`person_call` の人と、`scene_add`・`scene_remove`・`scene_time` のシーンに出る人 |
| 文面 | `04` 11.6 の形。`mode='update'` は2行目に「版{n}に更新：」と差分の先頭2件。`names` があれば末尾に「未確認：太郎さん、父さん」 |

## 4. データ層

### 4.1 ローカル SQLite の構成

テーブル定義は `packages/schema` に TypeScript で書き、Postgres の DDL・SQLite の DDL・同期関数（5.4）を生成する。

| 論理型 | Postgres | SQLite |
|---|---|---|
| id | uuid | TEXT |
| 文字列 | text | TEXT |
| `rev`・`sort_key` | text collate "C" | TEXT（既定の BINARY 比較がバイト順なのでそのまま） |
| 整数・分・秒 | int | INTEGER |
| 小数 | numeric | REAL |
| 真偽 | boolean | INTEGER（0/1） |
| 日付 | date | TEXT（YYYY-MM-DD） |
| 実時刻 | timestamptz | TEXT（ISO 8601） |
| JSON | jsonb | TEXT（JSON 文字列） |

端末だけの列：`projects.owner_id` は空を許す。`projects.local_owner`（最後に結び付いたアカウントの ID）。暗号化する列は平文と暗号文の両方を持つ（`script_versions.raw_text` と `raw_text_enc`、`shares.link_key` と `link_key_enc`、`shares.ref_map` と `ref_map_enc`、`share_publications.payload` と `payload_enc`）。

端末だけのテーブル：

```sql
create table meta (key text primary key, value text not null);
  -- deviceId, hlc, schema_version, clockOffsetMs, lastAcceptedRevMs, limits（{plan, maxActiveProjects, maxShootDays, checkedAt}）
create table outbox (seq integer primary key autoincrement, table_name text not null, row_id text not null,
                     project_id text not null, rev text not null, attempts integer not null default 0, last_error text);
create index outbox_project on outbox(project_id, seq);
create table sync_state (project_id text primary key, last_seq integer not null default 0,
                         registered integer not null default 0, role text, overwrites_seen_id integer not null default 0,
                         last_pull_at text, last_push_at text, last_error text);
create table conflicts (id integer primary key autoincrement, project_id text not null, table_name text not null,
                        row_id text not null, reason text not null,          -- lost|error|purged|limited|forbidden
                        local_data text not null, remote_rev text, code text, at text not null, resolved integer not null default 0);
create table snapshots (id integer primary key autoincrement, project_id text not null,
                        kind text not null,                                  -- daily|pre_migration|pre_revision|pre_restore
                        day text not null, created_at text not null, path text not null, bytes integer not null,
                        scenes integer not null, persons integer not null, shoot_days integer not null);
create unique index snapshots_daily on snapshots(project_id, day) where kind = 'daily';
create table import_drafts (id text primary key, project_id text not null, kind text not null,  -- script|excel|revision
                            episode_id text, payload text not null, created_at text not null, updated_at text not null);
create table ui_prefs (key text primary key, value text not null);
```

### 4.2 マイグレーション

`meta.schema_version` に整数で版を持つ。`packages/schema/migrations` に版ごとの SQL を置き、起動時に未適用の版を順に1トランザクションずつ適用する。

1. 適用の前に、全作品の JSON スナップショットを `kind='pre_migration'` で取る。日次の行（`kind='daily'`）とは別の行なので、同じ日の自動保存で上書きされない（C11）。
2. スナップショットの保存に失敗したら（容量不足など）、マイグレーションを行わず、読み取り専用で起動して `E_STORAGE_FULL` を出す。
3. アプリより新しい版の DB を開いたら書き込みを止め、`E_SCHEMA_TOO_NEW` で更新を促す。

### 4.3 Web での DB の持ち方と複数タブ

SQLite WASM（3.50 以降）を専用 Worker で動かし、`opfs-sahpool` VFS を使う。メインスレッドとは `postMessage` で `{ id, op, args }` を送り `{ id, ok, value | error }` を受ける。トランザクションは Worker 内で直列に実行する。`opfs-sahpool` は同じ DB に同時に1接続しか持てず、2つ目のタブでの初期化は失敗する。そこで次の手順で、1タブだけが DB を持つ。

```
起動：navigator.locks.request('koban-db', { ifAvailable: true }, async (lock) => {
        if (!lock) { 「別のタブで開いています」を出す（E_DB_OTHER_TAB）; return; }
        await openDb();                       // installOpfsSAHPoolVfs → DB を開く。失敗したら再試行（下記）
        await holdUntilRelease();             // 手放すと決めるまで待つ Promise。これが解決するとロックが放される
      })
「こちらで開く」を押したタブ（B）：
  1. BroadcastChannel('koban-db') に { type: 'release-request' } を送る
  2. 3秒以内に { type: 'released' } が来たら、navigator.locks.request('koban-db', …) を通常の順番待ちで取る
  3. 来なければ navigator.locks.request('koban-db', { steal: true }, …) で奪い、{ type: 'stolen' } を送る
  4. openDb() が「ファイルを開けない」で失敗したら、100ms から倍々で最大2秒の間隔、合計30秒まで再試行する
持っているタブ（A）が release-request か stolen を受けたら：
  1. 新しい書き込みを受け付けず、E_DB_TAKEN_OVER で断る（入力中の欄は ui の下書きとして残す）
  2. 同期ワーカーを止める（送信中の呼び出しは中断してよい。送信待ちは応答を受けるまで消さないので失われず、再送は duplicate になる）
  3. 実行中のトランザクションの終わりを待ち、DB を閉じ、poolUtil.pauseVfs() で SAH を手放す
  4. holdUntilRelease を解決してロックを放し、{ type: 'released' } を送る
  5. 「別のタブで開きました」の読み取り専用の案内と「こちらで開く」に切り替える
```

`steal` で奪われた側のコードは止まらないので、A は `stolen` を受けたときと、`visibilitychange` で前面に戻ったときに `navigator.locks.query()` でロックを持っているかを確かめ、持っていなければ上の1〜5を行う。`pauseVfs()` は開いたファイルが残っていると例外を投げるので、必ず DB を閉じてから呼ぶ。

### 4.4 repository

```ts
type TableName = 'projects' | 'episodes' | 'script_versions' | 'script_version_scenes' | 'scenes' | 'categories'
  | 'elements' | 'scene_elements' | 'persons' | 'person_contacts' | 'locations' | 'media'
  | 'shoot_days' | 'shoot_day_scenes' | 'call_sheets' | 'call_sheet_items' | 'shares' | 'share_publications';
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
  put<K extends TableName>(table: K, row: Draft<K>): Promise<Row<K>>;  // rev を付け、updated_by に自分を入れ、outbox に積む
  softDelete(table: TableName, id: string): Promise<void>;
  restore(table: TableName, id: string): Promise<void>;
}
type Row<K extends TableName> = Tables[K];                    // packages/schema から生成した行の型
type Draft<K extends TableName> = Omit<Row<K>, 'rev' | 'updated_by' | 'server_seq'> & Partial<Pick<Row<K>, 'rev'>>;
```

`put` と `softDelete` は、同じトランザクションで行の書き込み、`outbox` への追加、`meta.hlc` の更新を行う。確定したら、変わったテーブル名と作品 ID を変更通知に流す。物理削除の API は置かない（端末だけの作品のゴミ箱を空にする処理と、墓標の取り込みだけが別の保守用の経路で消す）。保管中の作品・閲覧のみの作品への `write` は `E_READ_ONLY` で断る。端末だけの作品（未ログイン）で、撮影日を6日目まで増やす `put` は `E_LIMIT_SHOOT_DAYS` で断る（制限の値は `meta.limits`）。

### 4.5 変更通知と画面への反映

```ts
function useLive<T>(tables: TableName[], projectId: string | null, query: (q: Reader) => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean };
```

変更通知に、指定したテーブルと作品の組が含まれていたら `query` を再実行する。同じマイクロタスク内の複数の通知は1回にまとめる。香盤表のような重い導出は、`useLive` で取った生データを `useMemo` で `deriveKoban` に通す。

### 4.6 取り消し（Undo）

編集操作は `Command { label: string; apply(t: Writer): Promise<void>; revert(t: Writer): Promise<void> }` で表す。`apply` の直前に対象行の現在値を控え、`revert` はその値を新しい `rev` で書き戻す（決定的な ID の行も同じ）。取り消しも通常の書き込みなので同期に乗る。履歴は作品ごとに直近100件をメモリに持ち、作品を閉じるまで残す。

### 4.7 自動スナップショットと版の履歴

| 種別 | 作る時 | 残す数 | パス |
|---|---|---|---|
| `daily` | 起動時と、最後の書き込みから10分後。前回より後に書き込みがあれば、その日の行を置き換える | 直近30日分。それより古いものは週（月曜始まり）ごとに最後の1つを26週分 | `snapshots/{projectId}/daily-{day}.json.gz` |
| `pre_migration` | 4.2 | 最新3回分、かつ作成から90日は消さない | `snapshots/{projectId}/premig-{schema_version}-{created_at}.json.gz` |
| `pre_revision` | 改訂の確定の直前 | 最新10回分 | `…/prerev-{created_at}.json.gz` |
| `pre_restore` | 版の履歴・上書きの確認からの復元の直前 | 最新10回分 | `…/prerestore-{created_at}.json.gz` |

中身は作品の全行（本文の平文を含む）の JSON を `CompressionStream('gzip')` で圧縮したもの。保存先は OPFS。シーン数・人物数・撮影日数を `snapshots` の行に持ち、一覧で解凍せずに差分を出す。復元は常に新しい作品として作り、ID をすべて振り直す（決定的な ID も新しい親から計算し直す）。保存に失敗したら `E_STORAGE_FULL` を出し、データ本体の書き込みは続ける。

## 5. 同期

### 5.1 状態遷移

```
          ┌──────── 3秒デバウンス / 前面復帰 / 通信回復 / 30秒ごと ────────┐
          ▼                                                              │
 [idle] ──▶ [registering] ──▶ [keys] ──▶ [pushing] ──▶ [pulling] ──▶ [idle]
   │       (未登録の作品だけ)  (作品の鍵が未登録)   │ 失敗        │ 失敗
   │                                               ▼             ▼
   │                                   [backoff: 5s→15s→60s→5min、最大5分]
   └── 未ログイン・Supabase 未設定 → 同期しない（[disabled]）
```

同期は作品ごとに直列で行い、複数の作品は順番に処理する。`[keys]` は、作品の鍵が `project_keys` に無ければ作って登録する段階（6.3）。失敗しても端末のデータには触れず、`sync_state.last_error` に記録して保存状態の表示に出す。

### 5.2 送る形式と送信待ち

```json
{ "p_project": "0199…", "p_schema": 7,
  "p_rows": [ { "t": "scenes", "d": { "id": "…", "project_id": "…", "rev": "…", "number": "12", "heading": "公園", … } } ] }
```

1. `outbox` をその作品の `seq` 順に読み、行ごとに最大の `seq` を覚えて50行分の行 ID を集める（同じ行が何度積まれていても1回）。
2. 各行の**現在の**内容を読む（送信待ちに積んだ時点の内容ではない）。暗号化する列は、平文があれば暗号化し（6.6）、平文が無く暗号文があればそれを送り、どちらも無ければその列のキーを送らない。作品が `script_storage='device'` なら、`script_versions.raw_text_enc` のキーは常に送らない（配布の列は送る）。サーバーだけが決める列（`updated_by`、`server_seq`、作品の `owner_id` など）は送らない。
3. 送る行の `rev` を `sentRev[rowId]` に、最大の `seq` を `sentSeq[rowId]` に覚える。
4. `api.sync_push` を呼ぶ。応答の `results` を 5.3 で処理する。通信が失敗したら何も消さない（再送はサーバーで `duplicate` になる）。

### 5.3 行ごとの結果の処理

| `status` | 処理 |
|---|---|
| `applied`・`duplicate` | `delete from outbox where row_id=? and seq <= sentSeq` |
| `rejected` | 同上で送信待ちを消す。送った内容を `conflicts`（`reason='lost'`、`remote_rev` は応答の行の `rev`）に入れる。端末の行の現在の `rev` が `sentRev` と同じときだけ、応答の `row` で端末の行を上書きする（暗号文は復号して平文の列にも入れる）。違えば（送信中に新しい編集があった）何もしない |
| `limited` | 送信待ちを消す。撮影日ならゴミ箱に入った状態、作品なら保管の状態がサーバーで決まったので、端末の行にも同じ印を付ける（次の引き込みでサーバーの値が届く）。`conflicts`（`reason='limited'`）に入れて通知する |
| `skew` | `clockOffsetMs` を応答の `server_now_ms` で測り直し、`hlcReset` し、物理時刻が補正後の時刻＋5分より先の `rev` を持つ作品内の行をすべて新しい `rev` で書き直す（送信待ちに積み直す） |
| `purged` | 送信待ちを消し、端末の行を `conflicts`（`reason='purged'`）に移してから端末の行を消す。上書きの確認の画面から「新しい項目として戻す」（新しい ID で作る）ができる |
| `error` | `code` が `E_READ_ONLY` なら何もしない（保留）。それ以外は `attempts` を1増やし `last_error` に `code` を入れる。`attempts` が5になったら `conflicts`（`reason='error'`）に入れ、送信待ちを消す |

応答の `server_now_ms` で `clockOffsetMs` を更新する。`applied` の行の `rev` の物理時刻で `lastAcceptedRevMs` を更新する。

### 5.4 サーバー側の SQL

#### 5.4.1 スキーマと権限

```sql
create schema koban;
create schema api;
revoke all on schema koban from public, anon, authenticated;
grant usage on schema api to authenticated;

-- 関数の既定の実行権限を取り消す（Postgres は既定で PUBLIC に、Supabase は public スキーマで anon・authenticated に与える）
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema api   revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema koban revoke execute on functions from anon, authenticated;

-- テーブル：直接の読み書きをすべて禁じ、RLS も全拒否（ポリシーを置かない）
revoke all on all tables in schema koban from public, anon, authenticated;
alter table koban.scenes enable row level security;          -- 生成：全テーブル

create sequence koban.sync_seq;
create function koban.set_server_seq() returns trigger language plpgsql set search_path = '' as $$
begin new.server_seq := nextval('koban.sync_seq'); return new; end $$;
create trigger scenes_seq before insert or update on koban.scenes
  for each row execute function koban.set_server_seq();      -- 生成：全同期テーブル
```

Supabase の API 設定で、公開するスキーマを `api` だけにする（`public` を外す）。各関数を作るマイグレーションでは、作った直後に `revoke execute on function … from public, anon, authenticated;` を必ず書き、`api` の公開する関数だけに `grant execute on function … to authenticated;` を付ける。CI の監査（14.3）で漏れを検出する。

#### 5.4.2 内部の補助関数

```sql
create function koban.member_role(p_project uuid, p_uid uuid) returns text
language sql stable set search_path = '' as $$
  select m.role from koban.project_members m where m.project_id = p_project and m.user_id = p_uid
$$;

create function koban.project_writable(p_project uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from koban.projects p where p.id = p_project and p.deleted_at is null and p.archived_at is null)
$$;

create function koban.rev_ms(r text) returns bigint
language sql immutable set search_path = '' as $$
  select ('x' || lpad(split_part(r, '-', 1), 16, '0'))::bit(64)::bigint
$$;
create function koban.rev_device(r text) returns text
language sql immutable set search_path = '' as $$ select split_part(r, '-', 3) $$;

-- old_row の列のうち、new_row と値が違う列だけを old_row の値で返す（上書き履歴の data）
create function koban.changed_old_values(old_row jsonb, new_row jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(o.key, o.value), '{}'::jsonb)
  from jsonb_each(old_row) o
  where o.key not in ('server_seq', 'updated_by', 'rev')
    and (new_row -> o.key) is distinct from o.value
$$;

create function koban.can_activate(p_owner uuid, p_except uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((
    select l.max_active_projects is null
        or (select count(*) from koban.projects p
            where p.owner_id = p_owner and p.deleted_at is null and p.archived_at is null
              and p.id is distinct from p_except) < l.max_active_projects
    from koban.accounts a join koban.plan_limits l on l.plan = a.plan
    where a.user_id = p_owner), false)                       -- アカウントかプランの行が無ければ偽（保管にする）
$$;

create function koban.min_client_schema() returns int language sql immutable set search_path = '' as $$ select 7 $$;  -- 例

-- 制限の値（`04` 第16章）。beta の値は仮
insert into koban.plan_limits(plan, max_active_projects, max_shoot_days) values ('free', 2, 5), ('beta', 10, null);
```

これらは `api` の関数（`security definer`、所有者 postgres）の中からだけ呼ばれ、どれにも `anon`・`authenticated` の実行権限を与えない。

#### 5.4.3 生成する upsert（`scenes` の例）

```sql
create function koban.upsert_scenes(p_project uuid, d jsonb, p_uid uuid, p_now timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare
  cur koban.scenes;
  inc koban.scenes;
  v_id  uuid := (d->>'id')::uuid;
  v_rev text collate "C" := d->>'rev';
  v_server_only constant text[] := array['id','project_id','updated_by','server_seq','deleted_at'];
begin
  if v_id is null or v_rev is null or v_rev !~ '^[0-9a-f]{13}-[0-9a-f]{4}-[0-9a-z]{8}$' then
    raise exception 'E_ROW_INVALID';
  end if;
  if koban.rev_ms(v_rev) > (extract(epoch from p_now) * 1000)::bigint + 300000 then   -- サーバー時刻＋5分
    return jsonb_build_object('status', 'skew');
  end if;
  if exists (select 1 from koban.purged_rows g
             where g.project_id = p_project and g.table_name = 'scenes' and g.row_id = v_id) then
    return jsonb_build_object('status', 'purged');
  end if;

  select * into cur from koban.scenes where id = v_id for update;

  if not found then                                              -- 挿入
    if (d->>'project_id')::uuid is distinct from p_project then raise exception 'E_PROJECT_MISMATCH'; end if;
    inc := jsonb_populate_record(null::koban.scenes, d);
    -- 送られなかった列に列の既定値を補う（生成コード。packages/schema の既定値を写す）
    if not d ? 'time_of_day'     then inc.time_of_day := 'unknown'; end if;
    if not d ? 'int_ext'         then inc.int_ext := 'unknown'; end if;
    if not d ? 'pages'           then inc.pages := 0; end if;
    if not d ? 'status'          then inc.status := 'active'; end if;
    if not d ? 'change_reviewed' then inc.change_reviewed := false; end if;
    inc.updated_by := p_uid;
    inc.deleted_at := case when d->>'deleted_at' is null then null else p_now end;   -- 削除の時刻はサーバー時刻
    inc.server_seq := null;                                                          -- トリガーが振る
    insert into koban.scenes select inc.*;
    return jsonb_build_object('status', 'applied');
  end if;

  if cur.project_id <> p_project then raise exception 'E_PROJECT_MISMATCH'; end if;
  if v_rev = cur.rev then return jsonb_build_object('status', 'duplicate'); end if;   -- 同じ版の再送は受理済み

  if v_rev < cur.rev then                                        -- 負け：適用せず退避して現行を返す
    insert into koban.row_history(project_id, table_name, row_id, rev, replaced_by_rev, reason, data, actor)
    values (p_project, 'scenes', v_id, v_rev, cur.rev, 'rejected',
            koban.changed_old_values(d - v_server_only, to_jsonb(cur)), p_uid);
    return jsonb_build_object('status', 'rejected', 'row', to_jsonb(cur));
  end if;

  -- 勝ち：現行の行を土台に、送られた列だけを重ねる（送られなかった列は現行の値のまま）
  inc := jsonb_populate_record(cur, d - v_server_only);
  inc.updated_by := p_uid;
  inc.deleted_at := case
    when not d ? 'deleted_at'      then cur.deleted_at
    when d->>'deleted_at' is null  then null
    else coalesce(cur.deleted_at, p_now) end;

  -- 別の端末か別の人の版を上書きしたときだけ、変わった列の旧値を残す（同じ端末の連続した編集は残さない）
  if koban.rev_device(cur.rev) <> koban.rev_device(v_rev) or cur.updated_by is distinct from p_uid then
    insert into koban.row_history(project_id, table_name, row_id, rev, replaced_by_rev, reason, data, actor)
    values (p_project, 'scenes', v_id, cur.rev, v_rev, 'overwritten',
            koban.changed_old_values(to_jsonb(cur), to_jsonb(inc)), p_uid);
  end if;

  update koban.scenes set
    (episode_id, number, heading, location_id, time_of_day, int_ext, pages, duration_sec, est_shoot_min,
     status, source_version_id, line_from, line_to, changed_in_version_id, change_reviewed, note, sort_key,
     rev, updated_by, deleted_at)
  = (inc.episode_id, inc.number, inc.heading, inc.location_id, inc.time_of_day, inc.int_ext, inc.pages,
     inc.duration_sec, inc.est_shoot_min, inc.status, inc.source_version_id, inc.line_from, inc.line_to,
     inc.changed_in_version_id, inc.change_reviewed, inc.note, inc.sort_key,
     inc.rev, inc.updated_by, inc.deleted_at)
  where id = v_id;
  return jsonb_build_object('status', 'applied');
end $$;
revoke execute on function koban.upsert_scenes(uuid, jsonb, uuid, timestamptz) from public, anon, authenticated;
```

`jsonb_populate_record(cur, d)` は、`d` に無い列を土台の `cur` の値で埋める（Postgres の仕様）。v0.1 は土台を `null::scenes` にしていたため、送られなかった列が NULL で上書きされていた（T2）。`d` のキーが JSON の null なら、その列は NULL になる（明示的に空にしたとき）。`d` の値の型が合わなければ例外になり、5.4.5 の行ごとの捕捉で `E_ROW_INVALID` として返る。

テーブルごとの差分は生成器が入れる。

| テーブル | 生成器が足す処理 |
|---|---|
| `shoot_days` | 削除されていない行を新しく作る、または復元するとき、作品のプランの `max_shoot_days` に達していれば、`inc.deleted_at := p_now` として保存し `status='limited'` を返す |
| `script_versions` | `project.script_storage='device'` なら、送られてきた `raw_text_enc` を捨てる（`d - 'raw_text_enc'`） |
| `shares`・`share_publications`・`person_contacts` | 呼び出し元が閲覧者なら `E_FORBIDDEN`（フェーズ1では起きない） |

#### 5.4.4 作品の行（`apply_project`）

```sql
create function koban.apply_project(p_project uuid, d jsonb, p_uid uuid, p_role text, p_now timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare
  cur koban.projects; inc koban.projects;
  v_rev text collate "C" := d->>'rev'; v_status text := 'applied';
begin
  if p_role <> 'admin' then raise exception 'E_FORBIDDEN'; end if;
  if (d->>'id')::uuid is distinct from p_project then raise exception 'E_PROJECT_MISMATCH'; end if;
  if v_rev is null or v_rev !~ '^[0-9a-f]{13}-[0-9a-f]{4}-[0-9a-z]{8}$' then raise exception 'E_ROW_INVALID'; end if;
  if koban.rev_ms(v_rev) > (extract(epoch from p_now) * 1000)::bigint + 300000 then return jsonb_build_object('status','skew'); end if;
  select * into cur from koban.projects where id = p_project for update;
  if not found then raise exception 'E_NOT_REGISTERED'; end if;
  if v_rev = cur.rev then return jsonb_build_object('status','duplicate'); end if;
  if v_rev < cur.rev then
    insert into koban.row_history(project_id, table_name, row_id, rev, replaced_by_rev, reason, data, actor)
    values (p_project, 'projects', p_project, v_rev, cur.rev, 'rejected', koban.changed_old_values(d, to_jsonb(cur)), p_uid);
    return jsonb_build_object('status','rejected','row', to_jsonb(cur));
  end if;
  inc := cur;                                                  -- 許可した列だけを写す。他の列（owner_id・plan・created_at・archived_at）は端末の値を見ない
  if d ? 'title'          then inc.title          := d->>'title'; end if;
  if d ? 'kind'           then inc.kind           := d->>'kind'; end if;
  if d ? 'shoot_start'    then inc.shoot_start    := (d->>'shoot_start')::date; end if;
  if d ? 'shoot_end'      then inc.shoot_end      := (d->>'shoot_end')::date; end if;
  if d ? 'settings'       then inc.settings       := d->'settings'; end if;
  if d ? 'script_storage' then inc.script_storage := d->>'script_storage'; end if;
  if d ? 'deleted_at'     then inc.deleted_at := case when d->>'deleted_at' is null then null else coalesce(cur.deleted_at, p_now) end; end if;
  inc.rev := v_rev; inc.updated_by := p_uid;
  -- ゴミ箱からの復元は止めない。進行中の上限を超えるなら保管として戻す
  if cur.deleted_at is not null and inc.deleted_at is null and not koban.can_activate(cur.owner_id, p_project) then
    inc.archived_at := p_now; v_status := 'limited';
  end if;
  -- 本文を端末だけに置く設定に変えたら、サーバーの暗号文と、それを含む履歴の列を消す
  if cur.script_storage = 'cloud' and inc.script_storage = 'device' then
    update koban.script_versions set raw_text_enc = null where project_id = p_project and raw_text_enc is not null;
    update koban.row_history set data = data - 'raw_text_enc'
      where project_id = p_project and table_name = 'script_versions' and data ? 'raw_text_enc';
  end if;
  if koban.rev_device(cur.rev) <> koban.rev_device(v_rev) or cur.updated_by is distinct from p_uid then
    insert into koban.row_history(project_id, table_name, row_id, rev, replaced_by_rev, reason, data, actor)
    values (p_project, 'projects', p_project, cur.rev, v_rev, 'overwritten', koban.changed_old_values(to_jsonb(cur), to_jsonb(inc)), p_uid);
  end if;
  update koban.projects set (title, kind, shoot_start, shoot_end, settings, script_storage, deleted_at, archived_at, rev, updated_by)
    = (inc.title, inc.kind, inc.shoot_start, inc.shoot_end, inc.settings, inc.script_storage, inc.deleted_at, inc.archived_at, inc.rev, inc.updated_by)
  where id = p_project;
  return jsonb_build_object('status', v_status);
end $$;
```

#### 5.4.5 `api.sync_push`

```sql
create function api.sync_push(p_project uuid, p_schema int, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_now timestamptz := now(); v_role text; v_writable boolean;
  r jsonb; v_t text; v_res jsonb; v_results jsonb := '[]'::jsonb; v_msg text; v_state text;
begin
  if v_uid is null then raise exception 'E_AUTH'; end if;
  if p_schema < koban.min_client_schema() then raise exception 'E_SCHEMA_TOO_OLD'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'E_BATCH_TOO_LARGE'; end if;
  v_role := koban.member_role(p_project, v_uid);
  if v_role is null or v_role not in ('admin', 'editor') then raise exception 'E_FORBIDDEN'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project::text, 0));    -- 番号を振る前に必ず取る（5.6）
  v_writable := koban.project_writable(p_project);

  for r in select value from jsonb_array_elements(p_rows) loop
    v_t := r->>'t';
    begin                                                                  -- 行ごとのサブトランザクション
      if not v_writable and v_t <> 'projects' then raise exception 'E_READ_ONLY'; end if;
      v_res := case v_t
        when 'projects' then koban.apply_project(p_project, r->'d', v_uid, v_role, v_now)
        when 'scenes'   then koban.upsert_scenes(p_project, r->'d', v_uid, v_now)
        -- …生成された各同期テーブルの分岐…
        else null end;
      if v_res is null then raise exception 'E_BAD_TABLE'; end if;
    exception when others then                                             -- この行の変更だけが巻き戻る
      get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
      v_res := jsonb_build_object('status', 'error',
                 'code', case when v_msg ~ '^E_[A-Z_]+$' then v_msg else 'E_ROW_INVALID' end,
                 'sqlstate', v_state);
    end;
    v_results := v_results || jsonb_build_array(v_res || jsonb_build_object('t', v_t, 'id', r->'d'->>'id'));
  end loop;

  return jsonb_build_object('results', v_results,
                            'server_now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;
revoke execute on function api.sync_push(uuid, int, jsonb) from public, anon, authenticated;
grant  execute on function api.sync_push(uuid, int, jsonb) to authenticated;
```

`begin … exception … end` の区画は、入るたびにサブトランザクションを作る。例外が起きればその行の変更だけが巻き戻り、他の行は残る（T3）。1回の呼び出しを50行に限るのは、1トランザクションのサブトランザクションが64を超えると Postgres の性能が落ちるからである。入口の検査（`E_AUTH`・`E_SCHEMA_TOO_OLD`・`E_BATCH_TOO_LARGE`・`E_FORBIDDEN`）だけは呼び出し全体の失敗で、端末は送信待ちを消さない。

### 5.5 `api.sync_pull`

```sql
create function api.sync_pull(p_project uuid, p_since bigint, p_limit int default 1000, p_tables text[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := koban.member_role(p_project, auth.uid());
  v_lim  int  := least(greatest(coalesce(p_limit, 1000), 1), 1000);
  v jsonb;
begin
  if v_role is null then raise exception 'E_FORBIDDEN'; end if;
  -- 1文で読む：全テーブルと墓標を同じスナップショットで server_seq 順に
  select jsonb_build_object(
           'rows', coalesce(jsonb_agg(jsonb_build_object('t', x.t, 'd', x.d) order by x.seq), '[]'::jsonb),
           'next', coalesce(max(x.seq), p_since),
           'more', count(*) = v_lim,
           'role', v_role,
           'server_now_ms', (extract(epoch from clock_timestamp()) * 1000)::bigint)
    into v
  from (
    select u.t, u.seq, u.d from (
      select 'projects'::text as t, s.server_seq as seq, to_jsonb(s) as d
        from koban.projects s where s.id = p_project and s.server_seq > p_since
      union all
      select 'scenes', s.server_seq, to_jsonb(s)
        from koban.scenes s where s.project_id = p_project and s.server_seq > p_since
      -- …生成：全同期テーブル…
      union all
      select 'person_contacts', s.server_seq, to_jsonb(s)
        from koban.person_contacts s
       where s.project_id = p_project and s.server_seq > p_since and v_role in ('admin', 'editor')   -- 閲覧者に返さない
      -- shares・share_publications も同じ条件。row_history は返さない
      union all
      select '_tombstone', g.server_seq, jsonb_build_object('table', g.table_name, 'id', g.row_id)
        from koban.purged_rows g where g.project_id = p_project and g.server_seq > p_since
    ) u
    where p_tables is null or u.t = any(p_tables) or u.t = '_tombstone'
    order by u.seq
    limit v_lim
  ) x;
  return v;
end $$;
revoke execute on function api.sync_pull(uuid, bigint, int, text[]) from public, anon, authenticated;
grant  execute on function api.sync_pull(uuid, bigint, int, text[]) to authenticated;
```

本体の選択は1文なので、一つのスナップショットで読まれる（関数を `stable` にしたので、関数内の文はすべて呼び出しの開始時のスナップショットを使う）。`next` は返した最後の行の番号で、`more` が真なら端末は `p_since = next` で続けて呼ぶ。

端末の取り込み：

| 受け取ったもの | 処理 |
|---|---|
| 行（端末に無い） | 挿入。暗号文は復号できれば平文の列にも入れる |
| 行（`rev` が端末より新しい） | 端末に未送信の変更（送信待ち）があれば、端末の版を `conflicts`（`reason='lost'`）に入れてから上書き。送信待ちは消す（負けたので） |
| 行（`rev` が等しい） | サーバーだけが決める列（`deleted_at`、`updated_by`、`server_seq`、作品のサーバー列）だけを取り込む |
| 行（`rev` が端末より古い） | 何もしない（端末の新しい版は送信待ちにある） |
| `_tombstone` | 端末の行に送信待ちがあれば `conflicts`（`reason='purged'`）に移してから、端末の行を消す |
| `role` | `sync_state.role` と違えば `04` 8.9 の処理（フェーズ1では起きない）。取り直しは `p_tables` を指定し、`p_since=0` から `more` が偽になるまで別のカーソルで読む。`sync_state.last_seq` は動かさない |

`hlcReceive` を受け取った行の `rev` ごとに呼ぶ。最後に `sync_state.last_seq = next` を、取り込みと同じトランザクションで書く。

### 5.6 引き込み漏れが起きない条件

`04` 8.5 の論証が成り立つための実装上の約束である。レビュー（T10）の指摘どおり、引き込み側の実装に依存するので、ここに明記する。

1. 同期対象テーブルに書くすべての処理（`api.sync_push`、`api.create_project`、`api.set_project_active`、`api.request_account_deletion`、物理削除のプロシージャ）は、その作品への最初の書き込みより前に `pg_advisory_xact_lock(hashtextextended(作品ID::text, 0))` を取る。
2. `server_seq` はトリガーでだけ振る（行の挿入・更新の時点。つまりロックを持っている間）。墓標の番号も同じ順序で `nextval('koban.sync_seq')` から取る。
3. ロックはトランザクションの終わりまで放さない（`pg_advisory_xact_lock`）。
4. 引き込みは 5.5 の1文で、`next` は返した最後の番号。
5. 作品をまたぐ書き込み（例：退会の処理で複数の作品をゴミ箱へ入れる）は、作品ごとにロックを取ってから書く。同じトランザクションで複数のロックを取るときは、作品 ID の昇順に取る（デッドロックを避ける）。

### 5.7 作品の登録・制限・進行中の切り替え

```sql
create function api.create_project(d jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid := (d->>'id')::uuid; cur koban.projects; v_archived timestamptz;
begin
  if v_uid is null then raise exception 'E_AUTH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  select * into cur from koban.projects where id = v_id;
  if found then                                                  -- 冪等：同じ ID・同じ所有者なら成功
    if cur.owner_id = v_uid then
      return jsonb_build_object('ok', true, 'existing', true, 'archived', cur.archived_at is not null);
    end if;
    raise exception 'E_ID_CONFLICT';
  end if;
  if exists (select 1 from koban.purged_rows g where g.table_name = 'projects' and g.row_id = v_id) then
    raise exception 'E_ID_CONFLICT';
  end if;
  insert into koban.accounts(user_id) values (v_uid) on conflict (user_id) do nothing;   -- 既定のプランは beta
  v_archived := case when koban.can_activate(v_uid, null) then null else now() end;     -- 上限を超えたら保管で登録
  insert into koban.projects(id, owner_id, title, kind, shoot_start, shoot_end, settings, script_storage,
                             plan, archived_at, rev, updated_by)
  values (v_id, v_uid, d->>'title', coalesce(d->>'kind', 'film'), (d->>'shoot_start')::date, (d->>'shoot_end')::date,
          coalesce(d->'settings', '{}'::jsonb), coalesce(d->>'script_storage', 'cloud'),
          (select a.plan from koban.accounts a where a.user_id = v_uid), v_archived, d->>'rev', v_uid);
  insert into koban.project_members(project_id, user_id, role) values (v_id, v_uid, 'admin');
  return jsonb_build_object('ok', true, 'existing', false, 'archived', v_archived is not null);
end $$;
```

| RPC | 内容 |
|---|---|
| `api.my_projects()` | 自分がメンバーの作品の `{id, title, role, owner_id, archived, deleted_at, plan}` の配列 |
| `api.my_limits()` | `{plan, maxActiveProjects, maxShootDays, activeProjects}`。端末は `meta.limits` に保存し、圏外では最後の値を使う |
| `api.set_project_active(p_project, p_active)` | 管理者だけ。進行中にするときは `can_activate` を調べ、超えるなら `E_PLAN_LIMIT`。ロックを取り、`archived_at` を null か `now()` にする |

`create_project` の応答が `existing=true` でも、端末は通常どおり作品の全行を送る（前回の登録の直後に送れなかった行があるかもしれないため）。

### 5.8 物理削除と墓標

pg_cron で毎日3:20（日本時間。pg_cron の時刻は UTC なので `cron.schedule('purge-trash', '20 18 * * *', 'call koban.purge_trash()')`）に実行する。プロシージャにして、作品ごとに `commit` する（ロックを長く持たない）。Postgres では `SET` 句を付けたプロシージャは `COMMIT` できないので、このプロシージャだけは `search_path` を付けず、本文をすべて完全修飾で書く。実行は postgres の権限で、利用者には実行権限を与えない。

```sql
create table koban.storage_purge_queue (project_id uuid primary key, queued_at timestamptz not null default now());

create procedure koban.purge_trash() language plpgsql as $$   -- SET 句なし（COMMIT のため）
declare p uuid;
begin
  -- 1. ゴミ箱に30日あった作品をまるごと消し、作品の墓標だけを残す
  for p in select id from koban.projects where deleted_at < now() - interval '30 days' order by id loop
    perform pg_advisory_xact_lock(hashtextextended(p::text, 0));
    delete from koban.scenes where project_id = p;                -- 生成：全同期テーブル
    delete from koban.row_history where project_id = p;
    delete from koban.purged_rows where project_id = p;
    delete from koban.project_keys where project_id = p;
    delete from koban.project_members where project_id = p;
    delete from koban.projects where id = p;
    insert into koban.purged_rows(project_id, table_name, row_id, server_seq)
      values (p, 'projects', p, nextval('koban.sync_seq'));
    insert into koban.storage_purge_queue(project_id) values (p);  -- 写真は Edge Function が Storage から消す
    commit;
  end loop;
  -- 2. 存続する作品の中で、ゴミ箱に30日あった行を消し、墓標を作る
  for p in select distinct s.project_id from koban.scenes s           -- 生成：全同期テーブルの union
           where s.deleted_at < now() - interval '30 days' order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(p::text, 0));
    with gone as (
      delete from koban.scenes s where s.project_id = p and s.deleted_at < now() - interval '30 days'
      returning s.id)
    insert into koban.purged_rows(project_id, table_name, row_id, server_seq)
      select p, 'scenes', g.id, nextval('koban.sync_seq') from gone;  -- 生成：全同期テーブル
    commit;
  end loop;
end $$;
```

墓標は作品が存続する間は残す。物理削除した行の上書き履歴は残すが、上書きの確認の一覧（9.16）には出さない。

### 5.9 上書き履歴の取得

```sql
create function api.list_overwrites(p_project uuid, p_after bigint default 0, p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := koban.member_role(p_project, auth.uid());
begin
  if v_role is null or v_role not in ('admin', 'editor') then raise exception 'E_FORBIDDEN'; end if;   -- 閲覧者は不可
  return (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]'::jsonb) from (
            select h.* from koban.row_history h
             where h.project_id = p_project and h.id > p_after
               and not exists (select 1 from koban.purged_rows g where g.project_id = h.project_id
                                 and g.table_name = h.table_name and g.row_id = h.row_id)
             order by h.id limit least(p_limit, 500)) h);
end $$;
```

端末は `sync_state.overwrites_seen_id` より後の件数を通知の数にする。

### 5.10 初回ログイン時の作品の引き継ぎと共有の端末

ログイン前に作った作品は `owner_id` と `local_owner` が空のまま端末にある。

1. ログインの直後、`local_owner` が空の作品と、`local_owner` が自分の作品を一覧にし、「この端末の作品をアカウントに保存しますか」を出す。既定で全件を選ぶ。
2. `local_owner` が**別のアカウント**の作品は一覧に出さず、作品一覧でも隠す（その人が再びログインすると出る）。共有の端末で、前の人の作品を自分のアカウントへ上げられないようにするため。
3. 選ばれた作品の `local_owner` に自分を入れ、`api.create_project` を呼び、成功したものから通常の同期に乗せる。`archived=true` なら作品カードに「保管（閲覧のみ）」と理由を出す。
4. 登録しなかった作品は、端末だけの作品として残る（`free` の制限のまま）。

### 5.11 ログアウト

ログアウト時は「この端末のデータを残す」と「この端末から消す」を選ばせる。既定は「残す」。消す場合も、`outbox` が空で、全作品が登録済みのときだけ実行できる。未送信の変更があれば理由を出して消さない。残した作品は `local_owner` が自分のままなので、別の人がログインしても見えない（5.10）。鍵（IndexedDB のアカウントの鍵）は、消す場合だけ消す。

### 5.12 PowerSync を採った場合に変わる箇所

| 箇所 | 変化 |
|---|---|
| 4.3 Web の DB | PowerSync の Web SDK の DB（wa-sqlite）に置き換える。複数タブは SDK の共有 Worker に任せ、本書の引き継ぎの手順は使わない。Safari の複数タブは S0 で確かめる |
| 5.2 送信待ち | SDK の送信待ち（CRUD の待ち行列）を使う。`uploadData` で 5.2 の 2〜4 を行い、5.3 の結果の処理をそのまま行う |
| 5.5 引き込み | SDK の同期規則（作品ごとのバケット）に置き換える。閲覧者に `person_contacts`・`shares`・`share_publications` を返さない規則にする。墓標は SDK の削除の扱いに置き換え、長期オフラインでの復活が起きないことを性質テストで確かめる |
| 5.4 サーバーの書き込み | 変わらない（`api.sync_push` をそのまま使う） |

## 6. 暗号化

### 6.1 鍵と方式

| 名前 | 方式 | 用途 |
|---|---|---|
| PS（作品の秘密） | 32バイトの乱数（`crypto.getRandomValues`） | 作品ごと、版（`key_version`、1から）ごと |
| 列の鍵 | `HKDF-SHA-256(PS, salt=32バイトの0, info="koban/v1/field-enc")` → AES-256-GCM（取り出し不可） | 本文・配布の鍵・配布した中身の暗号化 |
| 本文の HMAC の鍵 | `HKDF-SHA-256(PS, salt=32バイトの0, info="koban/v1/body-mac")` → HMAC-SHA-256（取り出し不可） | `body_mac` |
| AMK（アカウントの鍵） | 32バイトの乱数を AES-256-GCM の鍵として取り込む（取り出し可。`04` 9.5） | PS と共有用の秘密鍵の暗号化 |
| 復旧の鍵 | `HKDF-SHA-256(復旧コードの15バイト, salt=16バイトの乱数, info="koban/v1/recovery|{user_id}")` → AES-256-GCM | AMK の暗号化 |
| 共有用の鍵の組（フェーズ2で使用） | ECDH P-256 | メンバーへの PS の受け渡し |
| 端末間の受け渡し | 一時的な ECDH P-256 の組を両端末で作り、共有の秘密から `HKDF-SHA-256(共有の秘密, salt=要求ID の16バイト, info="koban/v1/device-link")` → AES-256-GCM | AMK の受け渡し |

IV はすべて暗号化のたびに `crypto.getRandomValues` で作る96bit。タグは128bit。

### 6.2 封筒と暗号文の形式

| 対象 | 形式（各部は base64url、パディングなし） | AAD |
|---|---|---|
| 列の暗号文 | `kb1.{key_version}.{iv}.{ct}` | `koban/v1/field|{table}|{column}|{row_id}|{key_version}` |
| 本文の HMAC | `m1.{mac}`（判定用に正規化した本文の HMAC） | — |
| 作品の鍵の封筒（`project_keys.wrapped_key`） | `kbk1.{iv}.{ct}`（中身は PS の32バイト） | `koban/v1/project-key|{project_id}|{key_version}|{user_id}` |
| 復旧の封筒（`account_keys.recovery_envelope`） | `kbr1.{salt}.{iv}.{ct}`（中身は AMK の32バイト） | `koban/v1/recovery|{user_id}` |
| 共有用の秘密鍵（`account_keys.private_key_enc`） | `kbp1.{iv}.{ct}`（中身は PKCS#8） | `koban/v1/account-private|{user_id}` |
| 端末間の封筒（`device_links.envelope`） | `kbd1.{iv}.{ct}`（中身は AMK の32バイト） | `koban/v1/device-link|{link_id}|{user_id}` |
| 配布の暗号文（R2） | JSON `{ "v":1, "version":n, "keyId":"…", "iv":"…", "ct":"…" }` | `koban-share:v1:{code}:{version}` |

AAD が違えば復号は失敗するので、暗号文を別の行・別の列・別の版・別の配布に差し替えても読めない。

### 6.3 アカウントと作品の鍵の流れ

| 場面 | 手順 |
|---|---|
| 初回ログイン（`api.get_keys` の `account` が null） | 1. AMK と復旧コードを作る。2. 共有用の鍵の組を作る。3. `api.put_account_keys` で復旧の封筒・公開鍵・秘密鍵の封筒を登録（行が無いときだけ通る。2台が同時に登録しようとしたら、後の方は `E_ID_CONFLICT` を受けて、既存の鍵の受け渡し（6.5）へ進む）。4. 復旧コードの画面（9.19）。5. AMK を IndexedDB に保存 |
| 作品を初めて同期する（`[keys]`） | 1. `api.get_keys(p_project)` で作品の鍵を探す。2. 無ければ PS を作り、AMK で封筒にして `api.put_project_key`（行が無いときだけ通る。先に登録された封筒があれば、それを受け取って使う）。3. 暗号化する列は、この段階が済むまで送らない |
| 起動 | IndexedDB の AMK を読む。作品を開いたら `project_keys` の封筒を AMK で開き、列の鍵と HMAC の鍵をメモリに持つ |
| 鍵の無い端末 | AMK が無ければ、本文の欄に「この端末には本文の鍵がありません」と、復旧コードの入力（6.4）と端末の承認（6.5）への導線を出す。構造のデータは同期も編集もできる |

`api.put_account_keys` で既存の封筒を差し替える（復旧コードの再発行）ときは、JWT の `amr` に10分以内の確認コードによるログインがあることを求め、無ければ `E_REAUTH_REQUIRED` を返す（盗まれたセッションで封筒を壊されるのを防ぐ）。差し替える前の封筒は `account_keys` の別の列に1世代だけ残す。

### 6.4 復旧コード

| 項目 | 規則 |
|---|---|
| 中身 | 120bit の乱数（15バイト） |
| 表記 | Crockford Base32（`0123456789ABCDEFGHJKMNPQRSTVWXYZ`）で24字＋検査1字の25字を、5字ずつ5つに分けて `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` |
| 検査の字 | `(Σ (i+1)·v_i) mod 31`（i は0から23、v_i は各字の値）を同じ字母で1字にする。1字の誤りと隣り合う字の入れ替えを見つけられる |
| 入力 | 大文字に揃え、ハイフンと空白を除き、`I`・`L` を `1`、`O` を `0` に読み替える。検査の字が合わなければ `E_RECOVERY_INVALID`（「復旧コードが正しくありません。もう一度確かめてください」） |
| 発行時の確認 | 画面に表示し、印刷・コピー・ファイル保存の手段を出す。最後のまとまり（5字）を入力させてから閉じられる |
| 復旧 | `api.get_keys` の復旧の封筒を、入力したコードから導いた鍵で開く。開ければ AMK を IndexedDB に保存する。開けなければ `E_RECOVERY_INVALID` |
| 再発行 | 設定から。新しいコードで封筒を作り直して差し替える（6.3 の再認証が要る）。古いコードは使えなくなる |

### 6.5 端末間の受け渡し

新しい端末を B、鍵を持つ端末を A とする。公開鍵は先に約束（ハッシュ）だけを出し、相手の公開鍵を受け取ってから明かす。

```
B: 一時的な組 (b, B_pub) を作る
   api.create_device_link(p_label='Safari・iPhone', p_commit=SHA-256(B_pub)) → link_id（10分で失効）
A: api.list_device_links() で要求を見つけ、「新しい端末からの要求」を出す
   一時的な組 (a, A_pub) を作り、api.respond_device_link(link_id, A_pub)
B: api.get_device_link(link_id) で A_pub を受け取り、api.reveal_device_link(link_id, B_pub)
A: api.get_device_link(link_id) で B_pub を受け取り、SHA-256(B_pub) が約束と一致するか確かめる（違えば中止）
A と B: 確認番号 = SHA-256(A_pub ‖ B_pub) の先頭4バイトを整数にして mod 1,000,000、6桁で表示
A: 利用者が二つの画面の番号の一致を確かめて「承認する」を押す
   共有の秘密 = ECDH(a, B_pub) → 鍵 → AMK を暗号化して api.complete_device_link(link_id, envelope)
B: api.get_device_link(link_id) で封筒を受け取り、ECDH(b, A_pub) → 鍵 → AMK を取り出して保存
```

`reveal_device_link` は、`responder_pub` が入る前には受け付けない（B が A の公開鍵を見てから自分の公開鍵を選ぶことはできても、約束を変えられない）。運営者が公開鍵をすり替えるには、約束を出す前に相手の公開鍵を知る必要があり、確認番号を偶然そろえられる確率は100万分の1である。番号が一致しないときは「中止する」を押し、要求を消す。

### 6.6 列の暗号化の流れ（codec）

```ts
interface FieldCodec {
  encrypt(table: TableName, column: string, rowId: string, plain: string): Promise<string>;     // kb1.… を返す
  decrypt(table: TableName, column: string, rowId: string, enc: string): Promise<Result<string>>;
  bodyMac(normalizedBody: string): Promise<string>;                                              // m1.…
}
const ENCRYPTED_COLUMNS = {
  script_versions: [['raw_text', 'raw_text_enc']],
  shares: [['link_key', 'link_key_enc'], ['ref_map', 'ref_map_enc']],
  share_publications: [['payload', 'payload_enc']],
} as const;
```

送信（5.2）で平文の列を暗号化し、引き込み（5.5）と上書き履歴の取得（9.16）で復号する。暗号文の `key_version` に対応する PS が無ければ、平文の列を空にして暗号文の列を保つ。端末のローカルDBと JSON バックアップは平文を持つ。

### 6.7 本文を端末だけに置く

作品設定で「本文をクラウドに上げない」を選ぶと、`projects.script_storage='device'` を書く。その作品では 5.2 で暗号文の列を送らず、サーバー（5.4.4）は既存の暗号文と履歴の列を消す。ほかの端末は、引き込みで暗号文が null になったのを見て「本文はほかの端末だけに置く設定になりました。この端末の本文を消しますか」と尋ねる（既定は残す。自動では消さない）。

## 7. 配布 Worker（フェーズ1）

### 7.1 データ

```sql
-- D1
create table shares (
  code text primary key,                -- 128bit の乱数（base64url 22字）
  share_row_id text not null unique,    -- 台帳の shares.id（決定的な ID）。作成の冪等性に使う
  project_id text not null, shoot_day_id text not null, key_id text not null,   -- key_id は SHA-256(K) の先頭8バイト
  status text not null,                 -- active|revoked|expired
  version integer not null default 0, expires_at text not null, og_label text,
  access_mode text not null default 'fragment',   -- fragment|code（予備方式。7.6）
  created_by text not null, created_at text not null, updated_at text not null
);
create table acks (code text not null, version integer not null, ref text not null, at text not null,
                   primary key (code, version, ref));
-- R2：blobs/{code} に最新の版の暗号文だけを置く（前の版の中身は配布者の share_publications にある）
```

### 7.2 API

| メソッドとパス | 認証 | 内容 | 主な応答 |
|---|---|---|---|
| `POST /api/shares` | Supabase の JWT | `{shareRowId, projectId, shootDayId, keyId, expiresAt, ogLabel}`。同じ `shareRowId` があれば、その `code` を返す（冪等）。既存の `keyId` と違えば 409。取り消し済みなら 410（`reissue` を使う） | 200 `{code, version}`／409 `E_SHARE_KEY_MISMATCH`／410 `E_SHARE_REVOKED` |
| `POST /api/shares/{code}/reissue` | 同上 | `{keyId}`。新しい `code` で作り直し、古い `code` を取り消す（取り消したあとにもう一度配る場合と、鍵を失った端末から配る場合）。確認は新しい `code` で数え直す | 200 `{code}` |
| `PUT /api/shares/{code}/blob` | 同上 | `{version, keyId, iv, ct}`。`version` が現在の版＋1でなければ 409（別の端末が先に配った）。`keyId` が違えば 409。256KB まで | 200／409 `E_SHARE_VERSION`・`E_SHARE_KEY_MISMATCH` |
| `PATCH /api/shares/{code}` | 同上 | `{expiresAt?, ogLabel?}` | 200 |
| `POST /api/shares/{code}/revoke` | 同上 | R2 の暗号文を消し、`status='revoked'` | 200 |
| `GET /api/shares/{code}/acks?since=` | 同上 | `[{ref, version, at}]` | 200 |
| `GET /s/{code}` | なし | 閲覧ページ（同じ静的なページ。取り消し・期限切れでも同じページを返し、ページが案内を出す） | 200 |
| `GET /s/{code}/blob` | なし | 暗号文。`Cache-Control: no-store` | 200／410 `E_SHARE_REVOKED`・`E_SHARE_EXPIRED` |
| `POST /s/{code}/ack` | なし | `{ref, version}`。同じ組は1回だけ数える | 204／429 |
| `POST /internal/revoke-project` | Worker の秘密 | 退会の処理から、作品の全配布を取り消す | 200 |

JWT を要する API は、Worker が `Authorization` の JWT をそのまま付けて Supabase の `api.share_authorize(p_project)` を呼び、`{ok:true}` が返ったときだけ通す（Worker は JWT の署名を自分で検証しない。Supabase が検証する）。結果は（JWT のハッシュ、作品）ごとに60秒キャッシュする。`share_authorize` は、呼び出し元が作品の管理者・編集者で、作品が進行中のときに真を返す。`code` が `projectId` の配布であることを D1 で確かめる。

### 7.3 配布の手順（アプリ）

1. `buildCallSheet` → `buildSharePayload`（前の版は `share_publications` の最新を復号して渡す）。
2. 撮影日の `shares` 行（`ids.share`）が無いか取り消し済みなら、K（32バイト）を作り、取り消し済みなら `reissue`、無ければ`keyId = SHA-256(K)` の先頭8バイトで `POST /api/shares`。応答の `code` と K を `shares` 行に書き、`status='active'`、`published_version=0` にする（K は `link_key` の平文の列で、送るときに暗号化される）。409 `E_SHARE_KEY_MISMATCH` なら「別の端末で配布を作成中です。同期してからもう一度お試しください」を出し、引き込みのあとで既存の K を使う。
3. 中身を K と新しい IV で暗号化し、`version = published_version + 1` で `PUT`。409 `E_SHARE_VERSION` なら引き込んでから 1 に戻る。
4. 成功したら同じトランザクションで、`shares.published_version`・`published_at`・`ref_map`（平文の列。送るときに `ref_map_enc` に暗号化される）を更新し、`share_publications`（`ids.publication`）に中身を書く。
5. 配布と確認の画面で、LINE の文面とリンクを出す（コピー、Web Share API）。

`shares` 行の K が復号できない端末（鍵が無い）では、配布の操作を「新しいリンクを発行する」（`reissue`）だけにし、古いリンクが使えなくなることを確かめてから行う。

### 7.4 閲覧ページ

| 項目 | 仕様 |
|---|---|
| 配信 | Worker の静的アセット。`packages/share-viewer` を別にビルドし、アプリ本体のコードを含めない |
| ヘッダー | `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`、`Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow` |
| OGP | `og:title` は「日々スケ」、`og:description` は配布者が付けた `og_label`（既定「撮影日のお知らせ」）。作品名・人名・場所は出さない |
| 復号 | `location.hash` の `k` を読み、取得した暗号文を AES-GCM で復号する。URL の `#k=…` は消さない（消すとブックマークや再読み込みで読めなくなる）。復号できなければ「リンクが壊れています。送られてきたリンクをそのまま開いてください」（`E_DECRYPT`） |
| 名前の選択 | 初回に人物の一覧（キャスト→エキストラ→部署ごとのスタッフ）から選ぶ。選択は `localStorage` の `koban-share:{code}:ref` に置く（読めなければ毎回選ぶ）。「別の人を選ぶ」で変えられる |
| 先頭 | 選んだ人の入り時間（最大の字）、出番のシーン、集合場所。差分があれば「前に見た版から変わった点」を先頭に出す（`koban-share:{code}:seen` に最後に見た版を置く） |
| 確認 | 「確認しました」を押すと `POST /s/{code}/ack`。押したら「版3を確認済み」と出し、ボタンを消す |
| 文字 | 本文16px、集合時刻32px。rem で組み、端末の文字サイズに追従する |

### 7.5 濫用対策

`wrangler.toml` に Rate Limiting のバインディングを2つ置く。`RL_BLOB`（キー：IP と `code`、60秒に60回）を `GET /s/{code}/blob` と `GET /s/{code}` に、`RL_ACK`（キー：IP と `code`、60秒に10回）を `POST /s/{code}/ack` に掛け、超えたら 429。この制限は Cloudflare の拠点ごとの概算で、厳密な回数ではない。鍵は256bit でリンクの総当たりは成り立たないので、帯域とデータの濫用を抑える目的には足りる。D1 の `acks` の主キーで、同じ組の重複を無視する。

### 7.6 後片付けと予備方式

Worker の cron（毎日4:10、日本時間）で、`expires_at` を過ぎた配布の暗号文を R2 から消して `status='expired'` にする。D1 の行と確認は、期限から180日で消す。

予備方式（`access_mode='code'`）は、1週目の確認で LINE のアプリ内ブラウザがフラグメントを落とすと分かった場合にだけ作る（`04` 11.8）。作る場合の仕様：配布者が選ぶと、アプリは K を Worker の公開鍵（Worker の秘密で持つ ECDH の組）で暗号化して送り、8桁の数字のアクセスコードを表示する。閲覧者がコードを入れると `POST /s/{code}/unlock {accessCode}` で、配布ごとの Durable Object が試行を数え、正しければ K を返す。5回失敗で15分止め、累計20回で配布者が解除するまで止める。画面に「この配布は鍵を運営者のサーバーに預けます」と出す。

## 8. 認証とアカウント

### 8.1 ログイン

| 手順 | 実装 |
|---|---|
| 送信の設定 | Supabase Auth の独自 SMTP に Resend の SMTP（`smtp.resend.com`）を設定する。送信ドメインに SPF・DKIM・DMARC。確認コードの桁数 `otp_length=6`、有効期限 `otp_expiry=600`（秒。既定の3600から短くする）。メールの送信数の上限は1時間あたり200通に設定する |
| メールの文面 | テンプレートに `{{ .Token }}` を入れ、リンクではなく6桁のコードを送る。件名「KOBAN の確認コード」 |
| コード送信 | `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` |
| コード確認 | `supabase.auth.verifyOtp({ email, token, type: 'email' })`。Supabase は「違う」と「期限切れ」を同じ誤り（`otp_expired`）で返すので、表示も一つにする（`E_OTP_INVALID`） |
| 再送 | 60秒は再送のボタンを無効にする。Supabase のレート制限（429、`over_email_send_rate_limit` など）は `E_RATE_LIMIT` |
| セッション保存 | Supabase 標準の localStorage（厳格な CSP で守る）。アクセストークンの更新は supabase-js に任せる |
| オフライン起動 | 保存済みのセッションがあれば、更新トークンが使えなくてもログイン状態として画面を出し、同期だけ止める |
| ログイン後 | 6.3（鍵）→ 5.10（作品の引き継ぎ）→ `api.my_limits()` |

### 8.2 退会（F16-2）

```
設定 → アカウント → 退会する
 1. 案内：「自分が作った作品を書き出しましょう」と、作品ごとの JSON バックアップのボタン
 2. 再認証：確認コードをもう一度送り、入力させる（JWT の amr が10分以内になる）
 3. 確認：メールアドレスを入力させ、「30日後にすべてのデータを削除します。それまではログインすれば取り消せます」を示して「退会する」
 4. api.request_account_deletion() → サーバー：
      accounts.deletion_requested_at = now()
      自分が所有する削除されていない作品を、作品ごとにロックを取ってゴミ箱へ入れる（deleted_at = now()）。
      入れた作品の ID を accounts.deletion_trashed_projects に残す
 5. Edge Function account-deletion：Worker の /internal/revoke-project で全配布を取り消す
 6. アプリ：端末のデータを「残す（端末だけの作品として。local_owner を空にする）」か「消す」を選ばせ、signOut({ scope: 'global' })
30日後（pg_cron が毎日3:50、purge_trash のあとに Edge Function purge-accounts を呼ぶ）：
      作品は purge_trash で物理削除済み。account_keys・project_keys・device_links・accounts を消し、
      auth.admin.deleteUser(user_id) で認証のユーザーを消す
30日以内にログイン：
      「退会の手続き中です（11月11日に削除されます）」と「取り消す」→ api.cancel_account_deletion()
      → deletion_requested_at を null にし、deletion_trashed_projects の作品をゴミ箱から戻す（上限を超える分は保管）
```

## 9. 画面詳細

### 9.1 ルート

| パス | 画面 | 備考 |
|---|---|---|
| `/` | 作品一覧 | 起動時の画面 |
| `/new` | 新規作成 | |
| `/trash` | ゴミ箱 | |
| `/login` | ログイン | |
| `/settings` | 設定・アカウント（`?tab=account|keys|devices|display|backup`） | |
| `/settings/delete-account` | 退会 | |
| `/legal/terms`・`/legal/privacy`・`/legal/transmission` | 規約・プライバシーポリシー・外部送信の公表 | ログインなしで読める |
| `/p/:pid` | → `/p/:pid/koban` へ転送 | |
| `/p/:pid/import` | 取り込み（`?kind=script|excel|revision&ep=:episodeId`） | |
| `/p/:pid/import/:draftId/review` | 取り込み確認 | `import_drafts` の ID |
| `/p/:pid/script` | 台本（`?ep=&v=:versionId&mode=vertical|horizontal`） | |
| `/p/:pid/revisions/:draftId` | 改訂の差分と影響 | `import_drafts`（`kind='revision'`） |
| `/p/:pid/koban` | 香盤表（`?ep=`） | 作品を開いた既定の画面 |
| `/p/:pid/assets` | 素材（`?tab=persons|locations|categories|episodes`） | |
| `/p/:pid/schedule` | 総スケ | |
| `/p/:pid/days` | 撮影日一覧 | |
| `/p/:pid/days/:did` | 日々スケ | |
| `/p/:pid/days/:did/share` | 配布と確認 | ログインが要る |
| `/p/:pid/overwrites` | 上書きの確認と復元 | |
| `/p/:pid/history` | 版の履歴 | |
| `/p/:pid/settings` | 作品設定 | |
| `<配布ドメイン>/s/:code` | 配布閲覧（アプリ外） | 7.4 |

存在しない作品・削除済みの作品の ID でアクセスした場合は作品一覧へ戻し、削除済みならゴミ箱へ誘導するトーストを出す。`local_owner` が別のアカウントの作品も、存在しないものとして扱う。

### 9.2 共通の状態

| 状態 | 表示 | 操作 |
|---|---|---|
| 保管中の作品 | 上部の帯「この作品は保管中です（閲覧と書き出しのみ）」 | 「進行中にする」（上限の中なら）。編集の部品は無効 |
| 別のタブで開いている | 全面「このアプリは別のタブで開いています」 | 「こちらで開く」（4.3） |
| ほかのタブに引き継いだ | 全面「別のタブで開きました」 | 「こちらで開く」 |
| スキーマが新しすぎる | 帯「アプリを最新版に更新してください」（`E_SCHEMA_TOO_NEW`） | 「再読み込み」。書き込みは止める |
| サーバーが新しい版を求める | 帯「アプリを更新してください。更新するまで同期を止めています」（`E_SCHEMA_TOO_OLD`） | 「再読み込み」。端末での編集は続けられる |
| 本文の鍵が無い | 本文の欄に「この端末には本文の鍵がありません」 | 「復旧コードを入力する」「ほかの端末で承認する」 |
| オフライン | 保存状態「同期待ちN件（端末には保存済み）」 | — |
| 上書き・同期できない項目がある | 上部の通知「別の端末の変更で上書きされた項目が2件あります」「同期できない項目が1件あります」 | 押すと上書きの確認と復元へ |

### 9.3 作品一覧

| 項目 | 内容 |
|---|---|
| 作品カード | 題名、種別、撮影期間、話数・シーン数・撮影日数、最終更新、保存状態（端末のみ／同期済み／同期待ちN件／保管／クラウド未保存：理由） |
| 並び | 最終更新の降順。保管中の作品は下にまとめる |
| 操作（メニュー） | 開く、名前を変える、版の履歴、JSON に書き出す、進行中にする／保管する、ゴミ箱へ移す |
| 新規作成 | 主ボタン「新しい作品」→ `/new` |
| JSON から復元 | 常に新しい作品として作る |
| 制限 | 進行中の作品が上限のときは、新規作成で「進行中の作品は2本までです。ほかの作品を保管するか、ログインしてください」（未ログイン）を出す |
| 空状態 | 「台本・Excel・空の表のどれからでも始められます」と「新しい作品」 |

### 9.4 新規作成

| 欄 | 入力規則 |
|---|---|
| 題名 | 必須、1〜100字 |
| 種別 | 映画（既定）・ショートドラマ・連続ドラマ・CM・MV・その他 |
| 撮影期間 | 任意。開始 ≤ 終了 |
| 話 | 連続ドラマ・ショートドラマを選んだら「話の数」（1〜200、既定1）を出し、話を作る（番号は1から、題は空） |
| 始め方 | 「台本を取り込む」「Excel・CSV から取り込む」「空の香盤表から始める」の三択 |

作成すると、作品・話・既定のカテゴリ（決定的な ID）を1トランザクションで作り、選んだ始め方の画面へ移る。

### 9.5 取り込み

| 入口 | 内容 |
|---|---|
| 台本 | ファイル（txt・pdf・docx、20MB まで）か貼り付け。取り込み先の話（話が1つなら出さない）、版名（既定「準備稿」）、改訂日（任意） |
| Excel・CSV | ファイル（xlsx・csv、20MB まで）。xlsx はシートを選ぶ |
| 改訂（`kind=revision`） | 台本と同じ。取り込み先の話は必須で、その話の現在の版を表示する。版名の既定は「決定稿」 |

「取り込む」を押すと解析し、結果を `import_drafts` に保存してから確認画面へ移る（リロードしても手直しを失わない）。画像だけの PDF は `E_IMAGE_PDF` で止め、「文字を読み取れませんでした（画像の PDF の可能性があります）。テキストを貼り付けるか、Excel から取り込んでください」と、貼り付け欄と Excel の入口を出す。

### 9.6 取り込み確認

台本の場合は、左に原文（縦書き、スマホは切り替え）、右に解析結果のシーン一覧を並べる。

| 項目 | 内容 |
|---|---|
| 印の一覧 | 上部に「要確認 N件」と、印の種類ごとの件数ボタン（柱らしい行・番号があいまい・話者が1回だけ・話者が不確か・括弧が閉じていない・屋内外が不明・時間帯が不明）。押すと該当箇所へ移る |
| シーン一覧の各行 | 番号、見出し、時間帯、屋内外、ロケ地、ペラ、話者。各値はその場で直せる |
| シーン操作 | 直前と結合、この行で分割、この行を柱にする／ト書きにする、番号の振り直し（全体） |
| 話者の整理 | 話者ごとの出現回数の一覧。統合（「タロウ」→「太郎」）、人物にしない指定（「一同」）、区分（キャスト／エキストラ） |
| ロケ地の整理 | ロケ地の候補と出るシーン数。統合、名前の変更、ロケ地にしない |
| 確定 | 主ボタン「確定して香盤表を作る」。シーン・改訂稿・版ごとのシーン対応表・人物・要素・印（根拠つき）・ロケ地を1トランザクションで作り、香盤表へ移る。下書きは消す |
| 柱が見つからない | 全文を1シーンとして置き、「柱が見つかりませんでした。シーンの区切りで『この行で分割』を押してください」 |

Excel・CSV の場合は、上に見出し行の選択（自動で推測した行を選んだ状態）、その下に列ごとの割り当て（3.5 の役割を選ぶ）、下に読み取り結果の先頭20行のプレビューと警告（時刻が読めない・番号の重複）を出す。確定の内容は台本と同じで、印の根拠は `excel`。

手直しの操作（結合・分割・行の種別の変更・番号の振り直し・話者の統合・人物にしない・ロケ地の統合・屋内外や時間帯の修正・列の割り当ての変更）は、種類ごとの件数を確定時に計測する（第13章）。

### 9.7 台本

縦書き表示（`writing-mode: vertical-rl`）で、柱（太字）・ト書き（3字下げ）・セリフ（話者名と「」）の書式を再現する。横書きへの切り替え、版の切り替え（版名と改訂日の一覧）ができる。シーンの区切りに番号の付箋を出し、押すとそのシーンの詳細パネル（属性、印、香盤表への導線）を開く。印の根拠から開いたときは、該当行を強調してそこまでスクロールする。本文の編集はしない（取り込み専用）。上部に「改訂稿を取り込む」。

### 9.8 改訂の差分と影響

| 区画 | 内容 |
|---|---|
| 要約 | 「変更なし 38・変更 6・追加 2・削除候補 1」。旧版の本文が読めない場合は「旧版の本文を読めないため、見出しと番号だけで対応づけました」 |
| 対応の一覧 | 旧の番号と見出し → 新の番号と見出し、種類、点数。行を押すと左右に旧と新の本文の差分（行単位、追加は下線、削除は取り消し線）。「対応を付け替える」で別のシーンを選ぶか「対応なし」にする |
| 提案 | シーンごとに、印の追加・外す・根拠の移動・根拠を失う・人物の追加・ロケ地の変更を、チェックつきで並べる。外す提案の既定はチェックなし。「すべての追加を採用」「すべて外す」 |
| 影響 | 撮影日ごとに、変化の文と「配布済み（版2）・再配布が必要」。提案のチェックを変えるたびに計算し直す |
| 確定 | 主ボタン「この内容で反映する」。反映の前にスナップショットを取ることを示す |
| 未割当 | 削除候補のシーンに付いていた印と割り当ての一覧。「別のシーンへ付け替える」「ゴミ箱へ移す」（確定のあとも香盤表の下部から開ける） |

### 9.9 香盤表

| 項目 | 内容 |
|---|---|
| ツールバー | 話（すべて／話ごと）、並び（話→台本順／ロケ地順／撮影日順）、列（カテゴリの選択）、人物名の検索（列を絞り込み、Enter で該当の列へ移る）、根拠の強調（台本の行の裏づけがない印／根拠を失った印）、元に戻す、書き出し（PDF・Excel、用紙 A3横／A4横） |
| 固定列 | 話（話が2つ以上のとき）、番号、柱、時間帯、屋内外、ペラ、撮影見積、撮影日。尺は列設定で出せる |
| 要素列 | 見出しは縦書きで、上にカテゴリ、下に出演シーン数 |
| セル | 押すかスペースで印を切り替える（決定的な ID の作成・復元・削除）。手入力の印には小さな「手」、Excel は「表」、根拠を失った印には「!」。長押し・右クリックで備考と根拠の詳細（台本の行を開く） |
| 密度 | ポインタが細かい端末（`(pointer: fine)`）はセル28px、それ以外は44px |
| 行の詳細パネル | 既定で閉じる。シーンの属性（時間帯・屋内外・ロケ地・ペラ・尺・撮影見積・備考）、カテゴリ別の要素の追加・削除、改訂の「確認済みにする」 |
| 最下行 | 「シーンを足す」。番号と柱を打つと、柱の規則で時間帯・屋内外・ロケ地を取り出してシーンを作る（F2-7） |
| 下部の集計 | シーン数、ペラ合計、尺合計、撮影見積合計、未割当シーン数、台本の行の裏づけがない印の数、根拠を失った印の数 |
| 支援技術 | `role="grid"`、`aria-rowcount`・`aria-colcount`（仮想化しても総数を伝える）、行と列の見出しは `rowheader`・`columnheader`。タブ停止は表全体で1つ（ロービング tabindex）、矢印で移動、Home／End で行の端、Ctrl+Home で先頭。セルの名前は「シーン2 父 印あり 手入力」の形。切り替えたら `aria-live` で「印を付けました」 |
| 空状態 | シーンが無い：「台本を取り込むか、下の行にシーンを足してください」と「台本を取り込む」。要素が無い：「人物を追加する」 |

### 9.10 素材

| タブ | 項目と入力規則 |
|---|---|
| 人物 | 名前（必須、1〜40字）、役名（任意、40字）、区分（キャスト／エキストラ／スタッフ、必須）、部署（スタッフは作品設定の部署から選ぶか自由入力）、NG日（日付の複数選択とメモ）、連絡先（電話・メール・LINE ID・メモ）。一覧は区分ごとに分け、出演シーン数を出す |
| ロケ地 | 名称（必須、60字）、住所（任意。入力後に国土地理院の住所検索で座標を取り、地図で確認・修正）、利用可能時間（開始・終了、`H:MM`）、写真（10枚まで）、メモ。出るシーン数 |
| カテゴリ | 名前、色、並び、表示。既定のカテゴリ（人物、エキストラ、衣裳、小道具、美術、車両、特機、特殊効果、動物、メイク、音、備考）は名前の変更と非表示だけ。追加したカテゴリはゴミ箱へ移せる |
| 話 | 番号（必須、1〜10字）、題（任意、100字）、並び。シーンのある話はゴミ箱へ移すとき、シーンも一緒に移ることを確かめる |

キャスト・エキストラの人物を作ると、人物カテゴリかエキストラカテゴリの要素（決定的な ID）を同時に作る。区分をスタッフに変えると、その要素と印をゴミ箱へ移すことを確かめてから移す（戻せる）。人物をゴミ箱へ入れると、対応する要素と連絡先も一緒に入る（復元も一緒）。

### 9.11 総スケ

| 項目 | 内容 |
|---|---|
| レイアウト | 左に未割当のシーン片、右に撮影日の列。PC は横並び、スマホは撮影日の縦一覧と「未割当」タブ |
| 撮影日の作成 | 日付（必須）、ラベル（既定「撮影N日目」）、集合・予定撤収（`H:MM`、0:00〜35:59） |
| シーン片 | 予定開始、番号、柱、時間帯、屋内外、ペラ、撮影見積、主な出演者3名、部分（あれば） |
| 操作 | ドラッグで割り当て・並べ替え・撮影日間の移動。つまみ（44px）を押すと「移動先を選ぶ」シート（撮影日と位置）。キーボードでも同じ。「分けて撮る」で部分の名前と見積を付けた割り当てをもう一つ作る |
| 撮影日の見出し | 日付（曜日つき）、ロケ地、集合〜撤収見込み、予定撤収、撮影見積の合計、ペラの合計、出演者数、日の出・日の入り（屋外のロケ地に座標がある場合） |
| 検査 | 3.8 の結果を見出しとシーン片に記号と語で出す。押すと原因の説明と、関係する人物・シーンへの導線 |
| 組み替えの影響 | 割り当てを動かしたら、トーストに「2日目・3日目の日々スケが変わりました（配布済み：2日目）」と「確認する」（F6-9） |
| 書き出し | PDF・Excel（用紙 A4横／A3横） |
| 空状態 | 撮影日が無い：「撮影日を作って、シーンを割り当てましょう」と「撮影日を作る」 |

### 9.12 撮影日一覧

撮影日ごとに、日付（曜日）、ラベル、集合時刻、ロケ地、シーン数、出演者数、検査の結果の数、配布の状態（未配布／版N・確認 x/y／再配布が必要）を1行で並べる。押すと日々スケへ。空状態は総スケと同じ。

### 9.13 日々スケ

日々スケは 3.10 のモデルを、帳票と同じ並びで画面に出す。各欄は押すとその場で直せ、手で上書きした値には「手入力」の印を付け、「自動の値に戻す」を出す。

| 欄 | 直せる内容 | 書き込む先 |
|---|---|---|
| 集合 | 時刻、場所（ロケ地から選ぶ）、集合のメモ | `shoot_days.call_min`、`call_sheets` |
| 予定 | シーンごとの開始時刻（固定）、食事の時刻・長さ・名前、食事の追加と外す | `shoot_day_scenes.fixed_start_min`、`call_sheet_items`（`meal`） |
| 出演者の入り | 入り時刻、備考 | `call_sheet_items`（`person_call`） |
| 部署別の集合 | 部署ごとの集合時刻 | `call_sheet_items`（`dept_call`） |
| 準備物 | カテゴリごとのメモ | `call_sheet_items`（`dept_note`） |
| 移動・注意事項・その他 | 自由記述 | `call_sheet_items`（`note`） |
| 連絡先 | 人物を選んで肩書きを付ける、外す。電話番号を載せるかは作品設定に従い、出力のときに切り替えられる | `call_sheet_items`（`contact`） |

シーンの並び順の変更は総スケで行う。上部に「プレビュー」（A4横／スマホ幅）、「PDF」、「Excel」、「配布」。日々スケの内容が配布済みの最新版と違えば、「配布」の横に「再配布が必要」を出す。

### 9.14 配布と確認

| 区画 | 内容 |
|---|---|
| 状態 | 未配布／配布中（版N、配布日時、有効期限）／取り消し済み。ログインしていなければ「配布にはログインが必要です」と「ログイン」（`E_SHARE_NEEDS_LOGIN`） |
| 配布 | 未配布なら主ボタン「配布する」。配布中で内容が変わっていれば「版N+1として配り直す」と、差分の一覧（3.11）のプレビュー |
| リンクと文面 | LINE の文面（`lineText`）とリンク。「文面をコピー」「リンクをコピー」「共有」（Web Share API） |
| 確認 | 版ごとに、確認した人・前の版だけ確認した人・未確認の人の一覧と数（`GET /api/shares/{code}/acks` を画面を開いたときと30秒ごとに取得） |
| 再送 | 「未確認の人」「更新で影響を受けた人」を選び、名前を末尾に並べた文面を作る（F8-6） |
| 設定 | 有効期限（既定は撮影日の2日後）、リンクのプレビューの説明（`og_label`）、電話番号を載せるか |
| 取り消し | 「この配布を取り消す」（確かめてから。取り消したリンクは戻せないので、もう一度配るときは新しいリンクになる） |

### 9.15 配布閲覧（アプリ外）

7.4 の仕様。上から、選んだ人の入り時間と出番（未選択なら「あなたの名前を選んでください」）、変更点、集合時刻と場所（地図アプリで開くリンク）、日の出・日の入り、予定、出演者の入り、部署別の集合、食事、準備物、移動・注意事項、連絡先、「確認しました」。取り消し済み・期限切れは「この配布は取り消されました」「この配布の期限が切れました」と、配布者に問い合わせる案内だけを出す。

### 9.16 上書きの確認と復元

| 区画 | 内容 |
|---|---|
| 上書きされた項目 | `api.list_overwrites` の `overwritten` と、端末の `conflicts`（`reason='lost'`）を、日時の降順に並べる。各行：何の項目か（「シーン12 の見出し」「撮影2日目 の集合時刻」）、上書きした端末と人、日時、列ごとの「上書き前 → 今」 |
| 同期できない項目 | `conflicts`（`reason='error'`・`purged`・`limited`）。理由（「サーバーで完全に削除済み」「無料枠の上限で、ゴミ箱に入れて保存しました」「形式の誤り」） |
| 操作 | 「この値に戻す」（列ごと、または行ごと。今の行に旧値を新しい `rev` で書く。直前に `pre_restore` のスナップショット）、「そのままにする」（既読にする）、`purged` は「新しい項目として戻す」 |
| 本文 | 暗号文の列は復号して出す。鍵が無ければ「本文の鍵がないため表示できません」 |
| 空状態 | 「上書きされた項目はありません。別の端末や他の人の変更で上書きされると、ここに出ます」 |

### 9.17 版の履歴

`snapshots` を日付の降順に並べる。各行：日付（と種別：日次・マイグレーション前・改訂の取り込み前・復元前）、シーン数・人物数・撮影日数と、一つ前の版との差（「シーン +3、撮影日 −1」）。操作は「この版を新しい作品として開く」（新しい作品を作り、作品一覧に「傘を返す（10月14日の版）」として出す）と、「JSON に書き出す」。空状態は「まだ版がありません。編集した日ごとに、この端末に自動で残ります」。版の履歴はこの端末のものであることを、上部に一文で示す。

### 9.18 ゴミ箱

作品と項目（シーン・人物・撮影日など）を、ゴミ箱に入れた日時と「あと N日で完全に削除」とともに並べる。期限はクラウドの作品ではサーバーの時刻（`deleted_at`＋30日）。操作は「元に戻す」（作品の上限を超えるなら保管として戻ることを示す）。端末だけの作品は「30日を過ぎた項目を完全に削除する」ボタンを出し、押したときだけ消す。

### 9.19 設定・アカウント

| タブ | 内容 |
|---|---|
| アカウント | ログイン状態、メールアドレス、プラン（ベータ）と制限、ログアウト（5.11）、退会への導線 |
| 本文の鍵 | この端末に鍵があるか、復旧コードの再発行、復旧コードの入力、「ほかの端末で承認する」（6.5 の B の画面：確認番号を大きく表示） |
| 端末 | 承認の要求の一覧（6.5 の A の画面：要求の端末名と時刻、確認番号、「承認する」「中止する」） |
| 表示 | 文字の大きさ（OS に従う／大きく）、香盤表の密度（自動／高密度／タッチ用） |
| バックアップ | 全作品の JSON 書き出し、JSON から復元、端末の保存領域の使用量、`navigator.storage.persist()` の状態 |

復旧コードの画面（初回ログイン時と再発行時）は、コードを等幅の大きな字で出し、「印刷」「コピー」「ファイルに保存」、最後のまとまりの入力欄を出す。説明は「このコードと、ほかの端末のどちらも失うと、台本の本文は誰にも読めなくなります（シーン・人物・撮影日などは残ります）。運営者もこのコードを持っていません」。

### 9.20 作品設定

| 区画 | 内容 |
|---|---|
| 基本 | 題名、種別、撮影期間、タイムゾーン |
| 見積と時間 | 分/ペラ、準備、移動、メイク・衣裳、撤収までの時間、既定の昼食（時刻・長さ、または無し） |
| 日々スケ | 部署の一覧、既定の連絡先、電話番号を伏せる、配布に作品名を入れる |
| 帳票 | 香盤表の用紙（A3横／A4横）、日々スケの用紙（A4横／スマホ幅） |
| 本文 | 「本文をクラウドに上げず、この端末だけに置く」（6.7）。切り替えると何が起きるかを示して確かめる |
| 状態 | 進行中／保管、JSON に書き出す、ゴミ箱へ移す |

## 10. 帳票詳細

### 10.1 共通

PDF は @react-pdf/renderer で、Noto Sans JP の Regular と Bold（静的 TTF）を埋め込む。日本語の折り返しのため `Font.registerHyphenationCallback(word => Array.from(word))` で1字ずつ折り返せるようにし、行頭に来てはいけない約物（`、。」』）`）は前の字と一組にする。本文と表は9pt、表の見出し9pt Bold、表題14pt Bold（印刷の最小は9pt）。余白は上下左右10mm（スマホ幅は6mm）。フッターに「版・出力日時・ページ番号」を入れ、無料（`free`・`beta`）はサービス名を加える。手で上書きした値には「＊」を付け、フッターに「＊ 手入力」の凡例を出す。Excel は ExcelJS で、印刷設定（用紙・向き・幅に合わせる・見出し行の繰り返し）まで入れる。

### 10.2 香盤表

| 項目 | A3横（420×297mm） | A4横（297×210mm） |
|---|---|---|
| 本文の範囲 | 400×277mm | 277×190mm |
| 表題の帯 | 12mm（表題・作品名・版・出力日） | 10mm |
| 見出し行 | 25mm（カテゴリ5mm＋縦書きの名前20mm。9pt で6字まで） | 22mm（5mm＋17mm。5字まで） |
| フッター | 6mm | 6mm |
| 行の高さ・行数 | 6mm、277−12−25−6＝234mm で39行 | 5mm、190−10−22−6＝152mm で30行 |
| 固定列（mm） | 話8・番号10・柱46・時間帯8・屋内外8・ペラ10・撮影見積10・撮影日14＝114 | 話7・番号9・柱36・時間帯7・屋内外7・ペラ9・撮影見積9・撮影日12＝96 |
| 要素列 | 1列7mm、(400−114)÷7 で40列。話の列が無い作品は42列 | 1列6mm、(277−96)÷6 で30列。話の列が無い作品は31列 |

要素列が1ページに収まらないときは、固定列を繰り返した別ページに出す。ページは「行の方向に進めてから列の方向へ」並べ、フッターに「行1〜39・列1〜40」を入れる。名前が見出しの字数を超えるときは末尾を「…」にし、最終ページに列の名前の一覧を付ける。印は「●」、手入力は「●」の右上に小さな「手」、根拠を失った印は「●!」。

### 10.3 総スケ

A4横（既定）と A3横。撮影日ごとに見出し行（日付と曜日・ラベル・ロケ地・集合・撤収見込み・予定撤収・撮影見積の合計・ペラの合計・出演者数）を太字・塗りで入れ、その下にシーン行を出す。

| 列（mm） | 開始 | 話-番号 | 柱 | 時間帯 | 屋内外 | ペラ | 撮影見積 | 出演者 |
|---|---|---|---|---|---|---|---|---|
| A4横（本文277） | 12 | 14 | 70 | 10 | 10 | 12 | 14 | 135 |
| A3横（本文400） | 14 | 16 | 100 | 10 | 10 | 12 | 14 | 224 |

食事・移動は網掛けの1行で入れる。撮影日の区切りで改ページはしない（見出し行が下端に1行だけ残るときは次のページへ送る）。末尾に未割当のシーンの一覧。

### 10.4 日々スケ（A4横 297×210mm）

```
┌───────────────────────────────────────────────────────────────┐
│ 作品名 14pt         撮影2日目 10月21日(水) 16pt     集合 8:00 20pt │ 28mm
│                                                    太郎の家（住所）│
├───────────────────────────────────────────────────────────────┤
│ 日の出 5:58 日の入 16:48 │ 撤収見込み 20:30 │ 予定撤収 20:00     │ 12mm
├───────────────────────────────────────────────────────────────┤
│ 変更点（版3）：集合 8:30→8:00 / S5 を追加                        │ 版2以上のとき 8mm
├──────────────────────────────────────┬────────────────────────┤
│ 予定（幅62%＝171.7mm）                  │ 右（幅38%＝105.3mm）    │
│ 開始14│S#14│柱60          │時10│内外10│ペラ12│出演 51.7│ 出演者の入り            │
│ 9:00 │ 2  │太郎の家・居間 │朝 │内   │2.0 │太郎、父 │  役名30│氏名30│入り15│備考30.3│
│ 11:00│ 5  │太郎の家・玄関 │昼 │内   │1.0 │太郎     │ 部署別の集合            │
│ 12:00│ 昼食（60分）                     │ 準備物（カテゴリごと）  │
│ …                                      │ 食事・移動              │
│                                        │ 連絡先（電話は既定で伏せる）│
├──────────────────────────────────────┴────────────────────────┤
│ 注意事項                                                        │
│ 版3 · 出力 2026-10-20 21:14 · 1/1 · ＊手入力                     │ 6mm
└───────────────────────────────────────────────────────────────┘
```

数値は列幅（mm）。本文の幅277mm の62%は171.7mm で、予定の列は 14＋14＋60＋10＋10＋12＝120mm に出演51.7mm を足して171.7mm。右の38%は105.3mm で、出演者の入りの列は 30＋30＋15＋30.3＝105.3mm。予定表が1ページに収まらない場合は2ページ目に続け、上部の帯を1行の簡易版にして繰り返す。天気の欄は無い（フェーズ2）。

### 10.5 日々スケ（スマホ幅 90×160mm）

本文の幅78mm、1段組。上から、撮影日とラベル（14pt Bold）、集合時刻（20pt Bold）と場所、日の出・日の入り・撤収見込み（9pt）、変更点、予定（開始・番号・柱・出演の4列：12・10・30・26mm）、出演者の入り（役名・氏名・入り：28・30・20mm）、部署別の集合、食事、準備物、移動・注意事項、連絡先。区画の見出しは11pt Bold で、区画の途中で改ページするときは次のページの先頭に見出しを「（続き）」つきで繰り返す。幅390px のスマホで幅に合わせて開くと、9pt の本文は約14px になる（`04` 14.1）。

### 10.6 衣裳表・小道具表

| 帳票 | 用紙 | 列（mm、本文190） | まとめ方 |
|---|---|---|---|
| 衣裳表 | A4縦 | 持ち主30・衣裳50・シーン80・撮影日30 | 衣裳カテゴリの要素を `for_person_id` の人物ごと（無ければ「共通」）にまとめ、人物は出番の多い順 |
| 小道具表 | A4縦 | カテゴリ25・要素55・シーン80・撮影日30 | 衣裳・人物・エキストラ以外のカテゴリの要素を、カテゴリの並び→名前順 |

シーンの欄は「1-3, 1-5, 2-12」（話-番号）を並べ、撮影日の欄は「1日目 10/20, 3日目 10/22」を並べる。

### 10.7 人物別の出番表

A4縦。キャスト・エキストラの人物ごとに、見出し（役名・氏名・区分・出演シーン数・拘束日数）と、撮影日ごとの行（撮影日40・入り20・シーン130mm）を出す。人物の並びは香盤表の列と同じ（既定は出番の多い順）。

### 10.8 Excel の書式

| シート | 書式 |
|---|---|
| 香盤表 | 1行目に表題、2行目に作品名・版・出力日、4行目が見出し。要素列の見出しは縦書き（`alignment.textRotation = 'vertical'`）。固定列の数に合わせてウィンドウ枠を固定（話の列があれば I5、無ければ H5）。印刷は選んだ用紙の横・幅1ページ・4行目と固定列を繰り返し |
| 総スケ | 撮影日ごとに見出し行を太字・塗りつぶしで入れ、その下にシーン行。選んだ用紙の横 |
| 日々スケ | 1シートに帳票と同じ区画を縦に並べる。A4横 |
| 衣裳表・小道具表・出番表 | 帳票と同じ列。A4縦 |

列の定義（見出しの文言と順序）は `templates/columns.ts` に一元化し、取り込み（3.5）も同じ定義で照合する。

## 11. 入力規則

| 項目 | 規則 | 違反時の表示 |
|---|---|---|
| 作品の題名 | 1〜100字、前後の空白は除去 | 「題名を入力してください」 |
| 話の番号 | 1〜10字 | 「話の番号を入力してください」 |
| シーン番号 | 1〜10字、数字・英字・ハイフン・「の」 | 「番号に使えない文字があります」。同じ話で重なれば「同じ番号のシーンがあります」（注意。保存はできる） |
| 柱 | 1〜100字 | 「柱を入力してください」 |
| 時刻 | `H:MM` または `HH:MM`、0:00〜35:59。全角数字や全角のコロンも受け付けて正規化する | 「0:00〜35:59 の形で入力してください」 |
| 日付 | 暦日として正しいこと。撮影期間外でも保存できるが注意を出す | 「日付を正しく入力してください」／「撮影期間の外の日付です」（注意） |
| ペラ | 0〜99.99 | 「ペラは 0〜99.99 で入力してください」 |
| 尺 | `m:ss`、0:00〜99:59（0〜5999秒） | 「尺は 0:00〜99:59 の形で入力してください」 |
| 撮影見積 | 0〜1440 の整数（分） | 「撮影見積は 0〜1440 分で入力してください」 |
| 人物の名前 | 1〜40字 | 「名前を入力してください」 |
| 電話 | 数字・ハイフン・＋・空白、6〜20字 | 「電話番号の形式を確認してください」 |
| メール | `@` を含み、ドメインに `.` を含む | 「メールアドレスの形式を確認してください」 |
| 確認コード | 数字6桁（全角も受け付ける） | 「6桁の数字を入力してください」 |
| 復旧コード | 25字（ハイフン・空白は無視） | 「復旧コードが正しくありません。もう一度確かめてください」 |
| 台本・Excel のファイル | 20MB 以下、対応形式 | `E_FILE_TOO_LARGE`／`E_IMPORT_UNSUPPORTED` |

入力中は検査せず、欄を離れたときと保存時に検査する。不正な値は保存せず、欄の下に理由を出す（`aria-invalid` と `aria-describedby`）。

## 12. エラーコード

| コード | 発生箇所 | 利用者への表示（ja） | 処理 |
|---|---|---|---|
| `E_NETWORK` | 同期・ログイン・配布 | 「通信できません。端末には保存されています」 | 再試行の待ち時間を延ばす |
| `E_AUTH` | 同期 | 「もう一度ログインしてください」 | 同期を止め、ログインへの導線 |
| `E_FORBIDDEN` | 同期・配布 | 「この作品を編集する権限がありません」 | その作品の送信を止める |
| `E_READ_ONLY` | 同期・書き込み | 「この作品は保管中です（閲覧と書き出しのみ）」 | 送信待ちは保留。端末では書き込みを断る |
| `E_PLAN_LIMIT` | 進行中への切り替え | 「進行中にできる作品の数を超えています。ほかの作品を保管してください」 | — |
| `E_LIMIT_SHOOT_DAYS` | 撮影日の追加（端末だけの作品） | 「撮影日は1作品5日までです。ログインすると増やせます」 | 追加しない |
| `E_SCHEMA_TOO_OLD` | 同期 | 「アプリを更新してください。更新するまで同期を止めています」 | 同期を止める。編集は続けられる |
| `E_SCHEMA_TOO_NEW` | 起動 | 「アプリを最新版に更新してください」 | 書き込みを止める |
| `E_BATCH_TOO_LARGE`・`E_BAD_TABLE`・`E_ROW_INVALID`・`E_PROJECT_MISMATCH` | 同期 | 「同期できない項目があります（報告済み）」 | Sentry に送り（本文なし）、行ごとに 5.3 の処理 |
| `E_ID_CONFLICT` | 作品の登録・鍵の登録 | 「この作品はクラウドに保存できません（ID の重複）」 | 作品は端末だけの作品として残す。鍵は既存のものを使う |
| `E_NOT_REGISTERED` | 同期 | 表示しない | 登録（`create_project`）からやり直す |
| `E_CLOCK_SKEW` | 同期 | 表示しない | 時計を補正して打ち直す（3.1、5.3） |
| `E_DB_OTHER_TAB` | Web 起動 | 「このアプリは別のタブで開いています」 | 「こちらで開く」 |
| `E_DB_TAKEN_OVER` | Web | 「別のタブで開きました」 | 読み取り専用の案内 |
| `E_STORAGE_FULL` | 写真・スナップショット・マイグレーション | 「端末の空き容量が足りません」 | 写真とスナップショットの保存を止める。データ本体の書き込みは続ける。マイグレーションは行わない |
| `E_FILE_TOO_LARGE` | 取り込み | 「20MB 以下のファイルを選んでください」 | — |
| `E_IMPORT_UNSUPPORTED` | 取り込み | 「この形式は読み込めません。テキストを貼り付けてください」 | 貼り付け欄へ誘導 |
| `E_IMAGE_PDF` | 取り込み | 「文字を読み取れませんでした（画像の PDF の可能性があります）。テキストを貼り付けるか、Excel から取り込んでください」 | 貼り付け欄と Excel へ誘導 |
| `E_EXCEL_NO_HEADER` | Excel 取り込み | 「見出しの行が見つかりません。見出しの行を選んでください」 | 見出し行の選択を出す |
| `E_PDF_FONT` | PDF 出力 | 「PDF 用のフォントがまだ端末にありません。通信できる場所でもう一度お試しください」 | Excel 出力を案内 |
| `E_OTP_INVALID` | ログイン | 「コードが違うか、期限が切れています。確かめるか、再送してください」 | — |
| `E_RATE_LIMIT` | ログイン | 「しばらく待ってからお試しください」 | — |
| `E_REAUTH_REQUIRED` | 復旧コードの再発行・退会 | 「確認のため、もう一度コードを入力してください」 | 確認コードを送る |
| `E_KEY_MISSING` | 本文の表示 | 「この端末には本文の鍵がありません」 | 復旧コードと端末の承認への導線 |
| `E_RECOVERY_INVALID` | 復旧 | 「復旧コードが正しくありません。もう一度確かめてください」 | — |
| `E_DEVICE_LINK_EXPIRED` | 端末の承認 | 「承認の要求の期限が切れました。もう一度やり直してください」 | — |
| `E_DEVICE_LINK_MISMATCH` | 端末の承認 | 「確認できませんでした。安全のため中止しました」 | 要求を消す |
| `E_SHARE_NEEDS_LOGIN` | 配布 | 「配布にはログインが必要です」 | ログインへ |
| `E_SHARE_VERSION` | 配布 | 「別の端末で先に配布されました。最新の状態にしてから配り直します」 | 引き込んでやり直す |
| `E_SHARE_KEY_MISMATCH` | 配布 | 「別の端末で配布を作成中です。同期してからもう一度お試しください」 | — |
| `E_SHARE_REVOKED`・`E_SHARE_EXPIRED` | 閲覧 | 「この配布は取り消されました」「この配布の期限が切れました」 | 配布者に問い合わせる案内 |
| `E_DECRYPT` | 閲覧 | 「リンクが壊れています。送られてきたリンクをそのまま開いてください」 | — |

## 13. 計測

個人を特定しない件数だけを、RPC `api.track(p_events jsonb)` で日次の集計表 `daily_counts(date, name, dim, count)` に加算する。端末は事象を `meta` に貯め、同期のついでに1日分をまとめて送る。未ログインの端末は送らない。**台本の本文・人物名・ロケ地名・見出しは送らない**（F10-1、F10-6）。

| 事象 | 次元 |
|---|---|
| `project_created` | 種別、始め方（script／excel／empty） |
| `script_imported` | 形式（txt／pdf／docx／paste）、シーン数の区分（〜20、〜100、101〜）、印の件数の区分（0、1〜10、11〜） |
| `import_corrected` | 手直しの種類（merge／split／line_kind／renumber／speaker_merge／not_person／location_merge／intext_fix／tod_fix／column_map）、件数の区分（0、1〜5、6〜20、21〜）。確定時に1回 |
| `excel_imported` | 自動の割り当てのまま確定したか（auto／edited） |
| `revision_imported` | 対応の内訳の区分（変更の割合：〜10%、〜30%、31%〜）、付け替えた対応の件数の区分 |
| `share_published`・`share_republished` | — |
| `koban_exported`・`schedule_exported`・`callsheet_exported`・`costume_exported`・`props_exported`・`appearance_exported` | 形式（pdf／xlsx）、用紙 |
| `overwrite_restored` | — |

確認の件数（`ack`）は Worker の D1 から日次で数える。撮影日が6日以上ある作品の数（`03` 第14章の KPI）は、構造のデータ（暗号化していない `shoot_days`）から日次のジョブで数え、作品 ID を含まない件数だけを `daily_counts` に入れる。

## 14. テスト仕様

### 14.1 単体テスト（Vitest）

| 対象 | 主なケース |
|---|---|
| hlc | 時計が戻ってもカウンタで単調増加する／同じミリ秒で65,536回呼ぶと繰り上がる／10分より先の相手は `E_CLOCK_SKEW` で時計を進めない／`hlcReset` のあとの値が最後に受理された版より大きい／文字列比較と論理順序が一致する |
| order | 先頭・末尾・間への挿入／**同じキーの2行の間への挿入で例外を投げず、連なりを振り直す**／同じキーの3行の連なりの先頭・中・末尾への挿入／不正なキーがあると全体を振り直す |
| ids | 同じ入力で同じ ID、`part` が空と非空で別の ID、作品が違えば別の ID |
| 柱 | 14.2 の表 |
| セリフ | 14.2 の表 |
| ペラ | 200字のト書き1行が1.2ペラ（ceil(200/17)=12行、12÷10）／柱20字が0.1ペラ |
| PDF 復元 | 縦書きフォント（`vertical=true`、`width` が字の大きさ、`height` が列の長さ）の合成データ3列を右から正しい順でつなぐ／字の大きさの違う2フォントが混じる列／横書きフォントを90度回した縦書き／横書きのページ／ページ番号と柱の外の題名を捨てる／下端に達した列の折り返しをつなぐ／画像だけの PDF は `E_IMAGE_PDF` |
| Excel・CSV | テンプレートの見出しの自動割り当て／`●`・`1`・文字のセル／`D`・`N` の時間帯／`m:ss` の尺／Shift_JIS の CSV |
| 改訂 | 変更なし・変更・追加・削除候補の判定／行の写像で根拠が移る／根拠の行が消えた印に印が付き、印は残る／消えた話者の印を外す提案の既定が不採用／旧版の本文が無い場合の見出しと番号での対応／影響に「出演者に花子が加わります」が出る／確定で削除候補のシーンの印と割り当てが残る |
| 香盤導出 | 3つの並びの順序／話が1つなら話の列を出さない／削除済みの要素・シーンを除く／スタッフが列にならない／出番の多い順の列／根拠の種類ごとの集計 |
| 見積 | 撮影見積あり・ペラのみ／部分撮影の等分と個別の見積／尺は時間割に使わない |
| 時間割 | ロケ地の変更で移動を足す／食事が12:00を過ぎた最初の切れ目に入り、最後のシーンのあとには入らない／`fixed_start_min` で進める・前すぎるときは進めず矛盾を記録する／24時超の撤収（25:30）／集合が未設定なら時刻を出さない |
| 検査 | NG日（キャスト・エキストラ）／スタッフの NG日／撤収の超過（ちょうどは出さない）／重複（部分指定ありは出さない）／日照（夜のシーンが日の入り前、昼のシーンが日の入り後）／番号の重複 |
| sun | 東京の10月21日で、正午を渡した値が前日の値にならない／白夜で null |
| 日々スケ | 集合時刻の変更が `shoot_days.call_min` に書かれる（上書きの行を作らない）／入りの逆算と上書き／部署別の集合／食事の変更と外す／自動の値に戻すと `value` が null／電話番号の伏せ／総スケと日々スケの時間割が同じ |
| 配布 | 参照 ID が版をまたいで変わらない／差分の文／影響を受けた人／`contentHash` が版番号と日時に左右されない／LINE の文面に住所と電話番号が入らない |
| 暗号 | 封筒の往復／AAD（行・列・版）が違えば復号に失敗する／復旧コードの検査の字が1字の誤りと入れ替えを見つける／端末間の受け渡しで約束と違う公開鍵を明かすと中止する |

### 14.2 台本解析の反例（`08` 4.4 とその他）

| 入力（行） | 期待する判定 |
|---|---|
| `○ 3丁目の路地` | 柱。番号なし、見出し「3丁目の路地」 |
| `○ 101号室` | 柱。番号なし、見出し「101号室」、屋内 |
| `〇田が入ってくる` | ト書き |
| `○ 太郎の家・翌朝` | 柱。見出し「太郎の家」、朝、屋内 |
| `○ 居酒屋・十六夜` | 柱。見出し「居酒屋・十六夜」、時間帯不明 |
| `遠くで「おーい」と声がする` | ト書き |
| `遠くで「おーい」`（2回出る） | ト書き（音） |
| `花子が小声で「ばか」`（花子が別に2回以上話者として出る） | セリフ。話者「花子」、修飾「小声で」 |
| `花子が小声で「ばか」`（花子がほかに出ない） | ト書き（`speaker_unsure`） |
| `テロップ「三年後」` | ト書き（字幕） |
| `太郎（受話器に向かって）「もしもし」` | セリフ。話者「太郎」、修飾「受話器に向かって」 |
| `父「おい` のあとに `○2 駅前` | セリフは柱の手前で止まり `unclosed_quote`。`○2 駅前` は柱 |
| `太郎「花子が『行く』って` ＋ `言ってた」` | 2行で1つのセリフ（入れ子の括弧を照合） |
| `花　子「えっ」` | セリフ。話者「花子」 |
| `○ 山田` | 柱。屋内外は不明（「山」に反応しない） |
| `○ 森田家・外` | 柱。屋外 |
| `○ 山田の部屋` | 柱。屋内 |
| `○1 公園（夜）` | 柱。番号1、見出し「公園」、夜、屋外 |
| `◯ 太郎の家・居間・朝` | 柱。見出し「太郎の家・居間」、朝、屋内、ロケ地「太郎の家」 |
| `S#12 駅前 夕` | 柱。番号12、見出し「駅前」、夕、屋外 |
| `#3A 屋上` | 柱。番号3A、屋外 |
| `シーン5 車内` | 柱。番号5、屋内 |
| `12 ○公園・夜` | 柱。番号12、見出し「公園」、夜 |
| `○１２　公園` | 柱。番号12、見出し「公園」（全角の数字と空白） |
| `○12公園` | 柱。番号なし、見出し「12公園」、`number_ambiguous` |
| `〇〇家の前で` ・ `○○家の前で` | ト書き |
| `○ 太郎、走る。` | ト書き |
| `○ 同・夜` | 柱。直前のシーンのロケ地を引き継ぐ、夜 |
| `太郎は「行こう」と言った` | ト書き |
| `まこと「一」` ＋ `まこと「二」` | どちらもセリフ。話者「まこと」 |
| `店員「いらっしゃいませ」`（1回だけ） | セリフ。`single_speaker` |
| `太郎` ＋ `「じゃあね」` | セリフ（別行型）。話者「太郎」 |

これらの規則は、本書の作成時に Node で試作し、`○ 同・夜` 以外の全件が期待どおりに判定されることを確かめてある（`同` の引き継ぎは 3.4.6 の後処理で、試作には含めていない）。

### 14.3 同期の性質テストと SQL のテスト

**性質テスト（fast-check）。** 3台の仮想端末と1つの仮想サーバー（本番と同じ SQL を `supabase start` のローカルの Postgres で動かす版と、速度のための TypeScript の模型の2種類）を用意し、任意の編集・削除・復元・印の付け外し・並べ替え・同期の順序に加えて、応答の消失（送信は届いたが応答が返らない）、通信の途中の失敗、端末の時計の前後のずれ（最大で1日先）、30日を超える長期オフラインと物理削除を生成する。すべての端末が最後に同期したあと、次が常に成り立つことを確かめる。

1. 全端末と全サーバーの行が一致する。
2. どの端末で書かれたどの版も、現行の行か `row_history` か端末の `conflicts` のどれかに残っている。
3. 決定的な ID の行（同じシーンと要素の印など）が重複しない。
4. 送信中に行った新しい編集が、拒否の応答で巻き戻らない。
5. 同じ送信を2回届けても、`duplicate` 以外の結果と履歴が増えない。
6. 物理削除した行が、長期オフラインの端末から復活しない。
7. 並び順が全端末で一致する。

**SQL のテスト（pgTAP）。** ローカルの Supabase で、管理者・編集者・閲覧者・非メンバー・`anon` の5種類の JWT で各 RPC を呼ぶ。

| 確かめること | 期待 |
|---|---|
| 非メンバーが他人の作品へ `sync_push`（版番号 `ffff…` を含む） | `E_FORBIDDEN`。`ffff…` は形式の誤りか `skew` で、どの役割でも適用されない |
| `anon`・`authenticated` で `koban` の関数を直接呼ぶ／テーブルを直接読む・書く | 権限の誤り |
| 送らなかった列 | 現行の値のまま残る。挿入では列の既定値が入る |
| 1行だけ不正な一括送信 | その行だけ `error`、他の行は `applied` |
| 同じ版の再送 | `duplicate` |
| 編集者が `projects` の `owner_id`・`plan` を送る | 無視される。編集者の `projects` の行は `E_FORBIDDEN` |
| 2台で同じ撮影日の日々スケを作る | 同じ ID の行になり、同期が止まらない |
| 作品の登録の再送 | 2回目も成功（`existing=true`） |
| ゴミ箱からの復元で上限を超える | 保管として戻る（`limited`） |
| 閲覧者の `sync_pull` | `person_contacts`・`shares`・`share_publications` が返らない。`list_overwrites` は `E_FORBIDDEN` |
| 削除の時刻 | 端末が過去の時刻を送っても、サーバーの `now()` になる |
| 実行権限の監査 | `has_function_privilege('anon' / 'authenticated', 関数, 'execute')` が真の関数の一覧が、`api` の許可一覧と一致する。`has_table_privilege` が真のテーブルが無い |

### 14.4 結合テストと画面のテスト

| 対象 | 方法 |
|---|---|
| 配布 Worker | `@cloudflare/vitest-pool-workers` で、作成の冪等・版の競合（409）・鍵の不一致（409）・取り消し・期限・確認の重複・429 |
| 帳票 | 固定データから香盤表（A3・A4）・総スケ・日々スケ（A4横・スマホ幅）・衣裳表・小道具表・出番表の PDF を生成し、ページ数と抽出テキストをスナップショット比較 |
| 暗号の流れ | 2つのブラウザ文脈で、初回ログイン→作品の同期→2台目の承認→本文の表示。復旧コードでの復旧 |

Playwright（Chrome・WebKit、Web 版）：

1. 新規作品→台本テキストの貼り付け→取り込み確認で1か所分割→確定→香盤表に行が出る。
2. 香盤表でセルを切り替える→詳細パネルにも出る→再読み込み後も残る→キーボードだけで同じ操作ができる。
3. Excel のテンプレートを書き出す→新しい作品へ取り込む→同じ香盤表になる。
4. 撮影日を2日作り、シーンを割り当て→NG日の人物を入れるとエラーの印が出る→スタッフの NG日もエラーになる。
5. 日々スケで集合時刻を直す→総スケの時間割も変わる→PDF（A4横・スマホ幅）が出る。
6. 改訂稿を取り込む→差分と影響の画面で「出演者が変わります」が出る→確定→香盤表に改訂の印が出る。
7. 配布する→閲覧ページを別の文脈で開き、名前を選んで確認→配布と確認の画面に確認が出る→日々スケを直して配り直す→閲覧ページの先頭に変更点が出る。
8. オフライン（通信遮断）で編集→保存状態が「同期待ち」→通信を戻すと「同期済み」。
9. 2つのタブで開く→後のタブで「こちらで開く」→前のタブが読み取り専用の案内になり、後のタブで編集できる。
10. 版の履歴から昨日の版を新しい作品として開く。上書きの確認で旧値に戻す。

## 15. フェーズ2で詳細設計する対象

基本設計（`04` 第12章・第25章）の方式を前提に、フェーズ1の実測（解析の精度、同期の規模、配布の利用）を見てから着手する。

- 課金：作品プラン・会社プラン・請求書払い（Stripe）、ストア課金（RevenueCat）、権利のビュー（`security_invoker`＋RLS）、Webhook の単調性・返金・移行・冪等、特商法の表記、継続課金の最終確認画面、課金の案内（v0.1 第7章の個人プランの設計は廃止）
- メンバーと権限：招待、役割の画面、役割の変更時の取り直しと消去（`04` 8.9）、メンバーへの鍵の受け渡しと鍵の版の更新（`04` 9.7）、作品の変更記録（F9-3）
- ストア版（Capacitor、ネイティブの SQLite と鍵の保存、審査）
- ショットリスト（カット番号の書式 S1-1／1-1／1-①、セリフ範囲、カットの見積の合計）、配置図、写真の撮影と構図、ビューファインダー（向きに応じた画角の式）、絵コンテ
- 現場モード（消し込み、繰り越し、高対比ライトと夜のダーク）
- AI の下書き（許可制、中継、根拠の照合）と LLM の接続口（MCP、読み取り）
- 作品・話の複製、台本の注釈、本文の語の選択からの登録、Fountain・fdx の取り込み
- ロケ地の利用可能時間の検査、人物別の拘束日一覧、天気、配布と更新の通知
