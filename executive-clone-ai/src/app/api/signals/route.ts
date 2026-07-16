import { NextRequest, NextResponse } from "next/server";
import { listSignals } from "@/lib/notion";
import type { ApiResult, Signal, SignalCategory } from "@/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as SignalCategory | null;
  const limit = Number(searchParams.get("limit") ?? "50");

  try {
    const signals = await listSignals({
      category: category ?? undefined,
      limit,
    });
    return NextResponse.json<ApiResult<Signal[]>>({ ok: true, data: signals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "内部エラー";
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
