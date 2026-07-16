// ─── データソース ─────────────────────────────────────────────────

export type DataSource =
  | "slack"
  | "gmail"
  | "google_calendar"
  | "google_meet"
  | "google_docs"
  | "line"
  | "voice_log";

export interface RawLog {
  id: string;
  source: DataSource;
  collectedAt: string; // ISO 8601
  occurredAt: string; // ISO 8601（実際の発言・送信日時）
  content: string;
  metadata: Record<string, unknown>;
}

// ─── シグナル ─────────────────────────────────────────────────────

export type SignalCategory =
  | "hypothesis"      // 新しい仮説・気づき
  | "key_person"      // 重要人物との接触
  | "idea"            // 新規・既存事業へのアイデア
  | "policy"          // 経営方針・重要意思決定
  | "market"          // 業界トレンド・競合情報
  | "other";

export interface Signal {
  id: string;
  sourceLogIds: string[];         // 元になった RawLog の ID（複数可）
  source: DataSource;
  occurredAt: string;
  category: SignalCategory;
  summary: string;                // 1〜2 文の要約
  rawText: string;                // 抽出元テキスト
  extractionReason: string;       // なぜシグナルと判断したか
  notionPageId?: string;          // Notion DB の対応ページ ID
}

// ─── ストーリー ────────────────────────────────────────────────────

export interface StoryEvent {
  signalId: string;
  occurredAt: string;
  description: string;
}

export interface Story {
  id: string;
  title: string;
  summary: string;                // 因果関係を含む 3〜5 文のナラティブ
  events: StoryEvent[];           // 時系列イベント
  outcome: string;                // 結果・業績への影響
  pattern?: string;               // 紐づく経営者の行動パターン名
  generatedAt: string;
  notionPageId?: string;
}

// ─── 意思決定ルール ────────────────────────────────────────────────

export interface DecisionRule {
  id: string;
  title: string;
  description: string;            // 具体的なルール内容
  priority: number;               // 1（最高）〜 5（最低）
  examples: string[];             // 適用例
}

// ─── 対話 ──────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  references?: {
    signals: string[];   // 参照した Signal ID
    stories: string[];   // 参照した Story ID
    rules: string[];     // 参照した DecisionRule ID
  };
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ─── API レスポンス ───────────────────────────────────────────────

export interface ApiResponse<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  detail?: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── 収集設定 ─────────────────────────────────────────────────────

export interface CollectorResult {
  source: DataSource;
  collected: number;
  errors: string[];
}
