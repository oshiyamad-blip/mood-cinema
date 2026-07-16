import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, DecisionRule, Signal, Story } from "@/types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // 学習除外エンドポイント — Anthropic のデータポリシーに基づき API データは学習に使用されない
});

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

// ─── システムプロンプト構築 ────────────────────────────────────────

function buildSystemPrompt(
  rules: DecisionRule[],
  recentSignals: Signal[],
  relevantStories: Story[]
): string {
  const rulesText = rules
    .sort((a, b) => a.priority - b.priority)
    .map((r) => `[優先度${r.priority}] ${r.title}: ${r.description}`)
    .join("\n");

  const signalsText = recentSignals
    .slice(0, 20)
    .map((s) => `- [${s.category}] ${s.occurredAt.slice(0, 10)}: ${s.summary}`)
    .join("\n");

  const storiesText = relevantStories
    .slice(0, 5)
    .map((s) => `【${s.title}】\n${s.summary}\n結果: ${s.outcome}`)
    .join("\n\n");

  return `あなたは経営者の分身として機能する AI です。
以下の経営理念・意思決定ルール・過去のシグナル・ストーリーを完全に内面化し、
「経営者本人ならこの状況をどう判断するか」を一人称で回答してください。

## 経営者の意思決定ルール（優先度順）
${rulesText || "（未登録）"}

## 直近のシグナル（重要情報）
${signalsText || "（なし）"}

## 参考ストーリー（過去の意思決定パターン）
${storiesText || "（なし）"}

---
回答の最後に必ず「根拠」セクションを設け、参照したシグナル ID やストーリー ID を列挙してください。
推測や不確実な情報は明示的に「推測」と断ってください。`;
}

// ─── シグナル抽出プロンプト ───────────────────────────────────────

const SIGNAL_EXTRACTION_PROMPT = `あなたは経営情報アナリストです。
与えられたテキストから、経営・事業に影響を与える重要情報（シグナル）のみを抽出してください。

抽出基準:
- hypothesis: 新しい仮説・気づき・問い
- key_person: 重要人物との接触・紹介・評価
- idea: 新規または既存事業に関するアイデア
- policy: 経営方針・重要な意思決定・方針転換
- market: 業界トレンド・競合情報・市場変化

除外するもの: 挨拶、雑談、日程調整、個人的な私用、反復的な定例報告

JSON 配列で返してください。シグナルがない場合は空配列 [] を返してください。
各要素の形式:
{
  "category": "hypothesis|key_person|idea|policy|market",
  "summary": "1〜2 文の要約",
  "rawText": "抽出元の原文（最大 500 文字）",
  "extractionReason": "なぜシグナルと判断したか（1 文）"
}`;

// ─── ストーリー構築プロンプト ─────────────────────────────────────

const STORY_BUILDING_PROMPT = `あなたは経営分析の専門家です。
与えられたシグナル群を時系列で分析し、因果関係のあるストーリーを構築してください。

特に以下のパターンに注目してください:
- ある人物との出会い → その後の事業進捗への影響
- 外部情報の取得 → 方針転換 → 成果
- 初期仮説 → 検証 → 意思決定

JSON で返してください:
{
  "title": "ストーリーのタイトル（20 文字以内）",
  "summary": "因果関係を含む 3〜5 文のナラティブ",
  "outcome": "結果・業績・組織への影響（1〜2 文）",
  "pattern": "該当する行動パターン名（例: 人脈起点の事業展開）"
}
ストーリーが構築できない場合は null を返してください。`;

// ─── 公開 API ──────────────────────────────────────────────────────

export async function chat(
  messages: ChatMessage[],
  rules: DecisionRule[],
  recentSignals: Signal[],
  relevantStories: Story[]
): Promise<string> {
  const systemPrompt = buildSystemPrompt(rules, recentSignals, relevantStories);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

export async function extractSignals(
  text: string
): Promise<
  Array<{
    category: string;
    summary: string;
    rawText: string;
    extractionReason: string;
  }>
> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SIGNAL_EXTRACTION_PROMPT,
    messages: [{ role: "user", content: text }],
  });

  const block = response.content[0];
  if (block.type !== "text") return [];

  try {
    const parsed = JSON.parse(block.text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function buildStory(
  signals: Signal[]
): Promise<{
  title: string;
  summary: string;
  outcome: string;
  pattern?: string;
} | null> {
  const signalText = signals
    .map(
      (s) =>
        `[${s.occurredAt.slice(0, 10)}][${s.category}] ${s.summary}`
    )
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: STORY_BUILDING_PROMPT,
    messages: [{ role: "user", content: signalText }],
  });

  const block = response.content[0];
  if (block.type !== "text") return null;

  try {
    const parsed = JSON.parse(block.text);
    return parsed ?? null;
  } catch {
    return null;
  }
}
