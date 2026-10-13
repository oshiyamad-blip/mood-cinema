// KOBAN のデータモデル（段階1）。要件定義書 v0.3 第10章に対応する。
// 作品（Project）を一つの JSON として持ち、端末の localStorage とクラウドの両方に同じ形で置く。
// 台本の本文は持たない（原則3）。

export type ID = string;

/** 分（0:00 からの経過）。24時を超える表記（25:30 → 1530）を許す。 */
export type Minutes = number;

export const PROJECT_KINDS = ['drama', 'short', 'cm', 'mv', 'film', 'other'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PERSON_KINDS = ['cast', 'extra', 'staff'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export type IntExt = 'INT' | 'EXT' | 'INT/EXT' | '';

export interface Scene {
  id: ID;
  /** シーン番号。「12」「12A」「S#12」などを正規化前のまま持つ */
  no: string;
  /** 柱（場所の見出し） */
  heading: string;
  /** 時間帯（昼・夜・朝・夕 など） */
  timeOfDay: string;
  intExt: IntExt;
  /** ページ（ペラ）。小数を許す */
  pages: number | null;
  /** 撮影見積（分）。null なら作品設定の換算を使う */
  estMin: number | null;
  /** 内容（短い要約） */
  synopsis: string;
  locationId: ID | null;
  /** 出演する人物 */
  castIds: ID[];
  /** 衣裳・小道具などの印 */
  elementIds: ID[];
  note: string;
  /** 取り込み直しで消えたシーン。データは残し、香盤からは隠す（A-5） */
  archived: boolean;
}

export interface Element {
  id: ID;
  /** 部署・分類（衣裳・小道具・美術・車両 など） */
  category: string;
  name: string;
}

export interface Contact {
  phone: string;
  email: string;
  /** 閲覧ページに電話番号を出す（既定は伏せる、D-8） */
  showPhone: boolean;
  /** 日々スケの「連絡先」欄に載せる */
  listed: boolean;
}

export interface Person {
  id: ID;
  name: string;
  /** 役名（キャスト）または役職（スタッフ） */
  role: string;
  kind: PersonKind;
  /** 部署（スタッフ）。キャストは「出演」 */
  dept: string;
  /** 所属事務所・マネージャー */
  agency: string;
  /** NG日（YYYY-MM-DD） */
  ngDates: string[];
  contact: Contact;
  /** 詳しい住所を閲覧ページに出す（D-8）。既定はスタッフのみ */
  seesAddress: boolean;
}

export interface Location {
  id: ID;
  name: string;
  address: string;
  /** 集合場所（住所を出さない人にも見せる、駅の出口など） */
  meetingPoint: string;
  note: string;
}

export type DayItem =
  | { kind: 'scene'; id: ID; sceneId: ID; fixedStart: Minutes | null; durMin: number | null }
  | { kind: 'break'; id: ID; label: string; fixedStart: Minutes | null; durMin: number };

export interface ShootDay {
  id: ID;
  /** YYYY-MM-DD。未定なら '' */
  date: string;
  /** 全体の集合 */
  callTime: Minutes;
  /** 撤収予定 */
  wrapPlan: Minutes | null;
  /** 主なロケ地 */
  locationIds: ID[];
  items: DayItem[];
  note: string;
}

/** 日々スケの手入力の上書き（C-2）。自動の値は都度計算し、ここには上書きだけを置く */
export interface CallSheetOverrides {
  /** 人物ごとの入り時間の上書き */
  personCall: Record<ID, Minutes>;
  /** 部署ごとの集合の上書き */
  deptCall: Record<string, Minutes>;
  meals: string;
  moves: string;
  notices: string;
  /** 部署ごとのメモ */
  deptNotes: Record<string, string>;
  /** 天気・日の出など、自由記入 */
  weather: string;
}

export interface ProjectSettings {
  /** 1ページあたりの撮影見積（分） */
  minPerPage: number;
  /** ページも見積もないシーンの見積（分） */
  defaultSceneMin: number;
  /** 集合から最初のシーンまでの準備（分） */
  setupMin: number;
  /** キャストの入り＝最初の出番の何分前か */
  castLeadMin: number;
  /** 拘束時間の上限（分）。JAC 指針は12時間 */
  maxSpanMin: number;
  /** 撤収から次の集合までの最低（分）。JAC 指針は10時間 */
  minRestMin: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  minPerPage: 30,
  defaultSceneMin: 30,
  setupMin: 60,
  castLeadMin: 90,
  maxSpanMin: 12 * 60,
  minRestMin: 10 * 60,
};

export type FieldKey =
  | 'no'
  | 'heading'
  | 'timeOfDay'
  | 'intExt'
  | 'pages'
  | 'estMin'
  | 'location'
  | 'synopsis'
  | 'note';

/** 列の割り当て（A-2）。作品ごとに覚えて使い回す */
export type ColumnRole =
  | { kind: 'ignore' }
  | { kind: 'field'; field: FieldKey }
  /** セルに人物名を列挙（「、」「・」「,」区切り） */
  | { kind: 'castList' }
  /** 見出しが人物名で、印（○ など）があれば出演 */
  | { kind: 'castMark' }
  /** セルに要素を列挙 */
  | { kind: 'elemList'; category: string }
  /** 見出しが要素名で、印があれば使う */
  | { kind: 'elemMark'; category: string };

export interface ImportMapping {
  headerRow: number;
  /** 見出しの文字列 → 役割。列の位置が変わっても見出しで引き当てる */
  byHeader: Record<string, ColumnRole>;
}

/** 配布した日々スケの版（D-5）。中身は解決済みの文書をそのまま持つ */
export interface CallSheetVersion {
  id: ID;
  dayId: ID;
  n: number;
  publishedAt: number;
  doc: import('./callsheet').CallSheetDoc;
}

/** 配布リンク（D-1）。personId が null ならグループ用の共通リンク */
export interface Share {
  id: ID;
  dayId: ID;
  personId: ID | null;
  /** リンクに入る秘密。サーバーにはハッシュだけを置く */
  token: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  /** 最後に中身を載せた版 */
  version: number;
}

export interface Project {
  id: ID;
  title: string;
  kind: ProjectKind;
  periodStart: string;
  periodEnd: string;
  createdAt: number;
  updatedAt: number;
  /** ゴミ箱に入れた時刻（A-1） */
  deletedAt: number | null;
  settings: ProjectSettings;
  scenes: Scene[];
  elements: Element[];
  persons: Person[];
  locations: Location[];
  days: ShootDay[];
  callSheets: Record<ID, CallSheetOverrides>;
  versions: CallSheetVersion[];
  shares: Share[];
  importMapping: ImportMapping | null;
  /** 改訂の数。保存のたびに増やす（クラウドの LWW 用） */
  rev: number;
}

export const ELEMENT_CATEGORIES = ['衣裳', '小道具', '持ち道具', '美術', 'メイク', '車両', '特機', '動物', '特効', 'その他'];

export const STAFF_DEPTS = ['演出', '制作', '撮影', '照明', '録音', '美術', '装飾', '衣裳', 'メイク', '車両', 'その他'];

export const KIND_LABEL: Record<ProjectKind, string> = {
  drama: '配信・テレビドラマ',
  short: '縦型ショートドラマ',
  cm: 'CM',
  mv: 'MV',
  film: '映画・自主映画',
  other: 'その他',
};

export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  cast: 'キャスト',
  extra: 'エキストラ',
  staff: 'スタッフ',
};
