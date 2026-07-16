import type { Collector, Collector as CollectorInterface } from "./base";
import type { RawLog } from "@/types";
import crypto from "crypto";

interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  channel?: string;
}

export class SlackCollector implements Collector {
  private readonly token: string;
  private readonly channelIds: string[];

  constructor() {
    this.token = process.env.SLACK_BOT_TOKEN ?? "";
    this.channelIds = (process.env.SLACK_CHANNEL_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async collect(since: Date): Promise<RawLog[]> {
    if (!this.token || this.channelIds.length === 0) return [];

    const logs: RawLog[] = [];
    const oldest = String(since.getTime() / 1000);

    for (const channelId of this.channelIds) {
      const messages = await this.fetchHistory(channelId, oldest);
      for (const msg of messages) {
        if (!msg.text?.trim()) continue;
        logs.push({
          id: crypto.randomUUID(),
          source: "slack",
          collectedAt: new Date().toISOString(),
          occurredAt: new Date(Number(msg.ts) * 1000).toISOString(),
          content: msg.text,
          metadata: { channelId, userId: msg.user, ts: msg.ts },
        });
      }
    }

    return logs;
  }

  private async fetchHistory(
    channelId: string,
    oldest: string
  ): Promise<SlackMessage[]> {
    const params = new URLSearchParams({
      channel: channelId,
      oldest,
      limit: "200",
    });

    const res = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    const data = (await res.json()) as {
      ok: boolean;
      messages?: SlackMessage[];
    };

    if (!data.ok) throw new Error(`Slack API error for channel ${channelId}`);
    return data.messages ?? [];
  }
}

// CollectorInterface を明示的に満たすことを TypeScript に証明
const _check: CollectorInterface = new SlackCollector();
void _check;
