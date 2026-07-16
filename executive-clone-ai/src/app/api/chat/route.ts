import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/claude";
import { listDecisionRules, listSignals, listStories } from "@/lib/notion";
import type { ApiResult, ChatMessage } from "@/types";

function isAllowed(req: NextRequest): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (allowed.length === 0) return true; // 未設定なら制限なし（開発用）

  // Next-Auth 等のセッションクッキーから取得するケースを想定。
  // ここでは簡易実装として Authorization ヘッダーのメールを使用。
  const email = req.headers.get("x-user-email") ?? "";
  return allowed.includes(email);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAllowed(req)) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  let messages: ChatMessage[];
  try {
    const body = (await req.json()) as { messages?: unknown };
    if (!Array.isArray(body.messages)) throw new Error("invalid");
    messages = body.messages as ChatMessage[];
  } catch {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: "リクエスト形式が不正です" },
      { status: 400 }
    );
  }

  try {
    const [rules, recentSignals, relevantStories] = await Promise.all([
      listDecisionRules(),
      listSignals({ limit: 30 }),
      listStories(10),
    ]);

    const reply = await chat(messages, rules, recentSignals, relevantStories);

    return NextResponse.json<ApiResult<{ reply: string }>>({
      ok: true,
      data: { reply },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "内部エラー";
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
