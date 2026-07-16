import { NextRequest, NextResponse } from "next/server";
import { deduplicateLogs } from "@/lib/dedup";
import { extractSignals } from "@/lib/claude";
import { saveSignal } from "@/lib/notion";
import { SlackCollector } from "@/collectors/slack";
import { GmailCollector } from "@/collectors/gmail";
import { CalendarCollector } from "@/collectors/calendar";
import { VoiceLogCollector } from "@/collectors/voice";
import type { ApiResult, CollectorResult, Signal } from "@/types";
import crypto from "crypto";

/** バッチスクリプトまたは Cron Job から呼ばれる内部 API */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json<ApiResult<never>>(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = (await req.json()) as { since?: string };
  const since = body.since ? new Date(body.since) : new Date(Date.now() - 86400000);

  const collectors = [
    new SlackCollector(),
    new GmailCollector(),
    new CalendarCollector(),
    new VoiceLogCollector(),
  ];

  const collectorResults: CollectorResult[] = [];
  let allLogs = [];

  for (const collector of collectors) {
    try {
      const logs = await collector.collect(since);
      allLogs.push(...logs);
      const name =
        collector.constructor.name.replace("Collector", "").toLowerCase();
      collectorResults.push({
        source: name as CollectorResult["source"],
        collected: logs.length,
        errors: [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name =
        collector.constructor.name.replace("Collector", "").toLowerCase();
      collectorResults.push({
        source: name as CollectorResult["source"],
        collected: 0,
        errors: [message],
      });
    }
  }

  // 重複除去
  const deduped = deduplicateLogs(allLogs);

  // シグナル抽出 & Notion 保存
  let signalCount = 0;
  for (const log of deduped) {
    if (!log.content.trim()) continue;
    try {
      const extracted = await extractSignals(log.content);
      for (const e of extracted) {
        const signal: Signal = {
          id: crypto.randomUUID(),
          sourceLogIds: [log.id],
          source: log.source,
          occurredAt: log.occurredAt,
          category: e.category as Signal["category"],
          summary: e.summary,
          rawText: e.rawText,
          extractionReason: e.extractionReason,
        };
        const pageId = await saveSignal(signal);
        signal.notionPageId = pageId;
        signalCount++;
      }
    } catch {
      // シグナル抽出失敗は続行
    }
  }

  return NextResponse.json<
    ApiResult<{ collectors: CollectorResult[]; signals: number }>
  >({
    ok: true,
    data: {
      collectors: collectorResults,
      signals: signalCount,
    },
  });
}
