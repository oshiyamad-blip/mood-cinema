import { NextResponse } from "next/server";
import { listStories } from "@/lib/notion";
import type { ApiResult, Story } from "@/types";

export async function GET(): Promise<NextResponse> {
  try {
    const stories = await listStories(20);
    return NextResponse.json<ApiResult<Story[]>>({ ok: true, data: stories });
  } catch (err) {
    const message = err instanceof Error ? err.message : "内部エラー";
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
