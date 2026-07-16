import { Client } from "@notionhq/client";
import type {
  DecisionRule,
  Signal,
  SignalCategory,
  Story,
} from "@/types";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB = {
  signal: process.env.NOTION_SIGNAL_DB_ID ?? "",
  story: process.env.NOTION_STORY_DB_ID ?? "",
  rule: process.env.NOTION_DECISION_RULE_DB_ID ?? "",
};

// ─── シグナル DB ──────────────────────────────────────────────────

export async function saveSignal(signal: Signal): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB.signal },
    properties: {
      ID: { title: [{ text: { content: signal.id } }] },
      カテゴリ: { select: { name: signal.category } },
      要約: { rich_text: [{ text: { content: signal.summary } }] },
      発生日時: { date: { start: signal.occurredAt } },
      ソース: { select: { name: signal.source } },
      抽出理由: {
        rich_text: [{ text: { content: signal.extractionReason } }],
      },
      原文: { rich_text: [{ text: { content: signal.rawText.slice(0, 2000) } }] },
    },
  });
  return page.id;
}

export async function listSignals(options?: {
  category?: SignalCategory;
  limit?: number;
}): Promise<Signal[]> {
  const filter =
    options?.category !== undefined
      ? {
          property: "カテゴリ",
          select: { equals: options.category },
        }
      : undefined;

  const response = await notion.databases.query({
    database_id: DB.signal,
    filter,
    sorts: [{ property: "発生日時", direction: "descending" }],
    page_size: options?.limit ?? 50,
  });

  return response.results.flatMap((page) => {
    if (page.object !== "page" || !("properties" in page)) return [];
    const p = page.properties;
    return [
      {
        id: extractTitle(p["ID"]),
        sourceLogIds: [],
        source: (extractSelect(p["ソース"]) ?? "slack") as Signal["source"],
        occurredAt: extractDate(p["発生日時"]) ?? "",
        category: (extractSelect(p["カテゴリ"]) ??
          "other") as SignalCategory,
        summary: extractRichText(p["要約"]),
        rawText: extractRichText(p["原文"]),
        extractionReason: extractRichText(p["抽出理由"]),
        notionPageId: page.id,
      },
    ];
  });
}

// ─── ストーリー DB ────────────────────────────────────────────────

export async function saveStory(story: Story): Promise<string> {
  const page = await notion.pages.create({
    parent: { database_id: DB.story },
    properties: {
      タイトル: { title: [{ text: { content: story.title } }] },
      要約: { rich_text: [{ text: { content: story.summary } }] },
      結果: { rich_text: [{ text: { content: story.outcome } }] },
      パターン: story.pattern
        ? { select: { name: story.pattern } }
        : { select: null },
      生成日時: { date: { start: story.generatedAt } },
    },
  });
  return page.id;
}

export async function listStories(limit = 20): Promise<Story[]> {
  const response = await notion.databases.query({
    database_id: DB.story,
    sorts: [{ property: "生成日時", direction: "descending" }],
    page_size: limit,
  });

  return response.results.flatMap((page) => {
    if (page.object !== "page" || !("properties" in page)) return [];
    const p = page.properties;
    return [
      {
        id: page.id,
        title: extractTitle(p["タイトル"]),
        summary: extractRichText(p["要約"]),
        outcome: extractRichText(p["結果"]),
        pattern: extractSelect(p["パターン"]) ?? undefined,
        events: [],
        generatedAt: extractDate(p["生成日時"]) ?? "",
        notionPageId: page.id,
      },
    ];
  });
}

// ─── 意思決定ルール DB ─────────────────────────────────────────────

export async function listDecisionRules(): Promise<DecisionRule[]> {
  const response = await notion.databases.query({
    database_id: DB.rule,
    sorts: [{ property: "優先度", direction: "ascending" }],
    page_size: 20,
  });

  return response.results.flatMap((page) => {
    if (page.object !== "page" || !("properties" in page)) return [];
    const p = page.properties;
    return [
      {
        id: page.id,
        title: extractTitle(p["タイトル"]),
        description: extractRichText(p["内容"]),
        priority: extractNumber(p["優先度"]) ?? 5,
        examples: [],
      },
    ];
  });
}

// ─── Notion プロパティ抽出ユーティリティ ────────────────────────────

function extractTitle(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  if (p["type"] !== "title" || !Array.isArray(p["title"])) return "";
  return (p["title"] as Array<{ plain_text?: string }>)
    .map((t) => t.plain_text ?? "")
    .join("");
}

function extractRichText(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as Record<string, unknown>;
  if (p["type"] !== "rich_text" || !Array.isArray(p["rich_text"])) return "";
  return (p["rich_text"] as Array<{ plain_text?: string }>)
    .map((t) => t.plain_text ?? "")
    .join("");
}

function extractSelect(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as Record<string, unknown>;
  if (p["type"] !== "select") return null;
  const sel = p["select"] as Record<string, unknown> | null;
  return sel ? (sel["name"] as string) : null;
}

function extractDate(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as Record<string, unknown>;
  if (p["type"] !== "date") return null;
  const date = p["date"] as Record<string, unknown> | null;
  return date ? (date["start"] as string) : null;
}

function extractNumber(prop: unknown): number | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as Record<string, unknown>;
  if (p["type"] !== "number") return null;
  return typeof p["number"] === "number" ? p["number"] : null;
}
