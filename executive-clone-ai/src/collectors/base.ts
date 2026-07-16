import type { CollectorResult, RawLog } from "@/types";

export interface Collector {
  collect(since: Date): Promise<RawLog[]>;
}

export async function runCollector(
  name: string,
  collector: Collector,
  since: Date
): Promise<CollectorResult> {
  try {
    const logs = await collector.collect(since);
    return {
      source: name as CollectorResult["source"],
      collected: logs.length,
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source: name as CollectorResult["source"],
      collected: 0,
      errors: [message],
    };
  }
}
