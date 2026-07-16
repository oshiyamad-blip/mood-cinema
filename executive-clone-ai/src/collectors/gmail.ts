import { google } from "googleapis";
import type { Collector } from "./base";
import type { RawLog } from "@/types";
import crypto from "crypto";

function getAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

export class GmailCollector implements Collector {
  async collect(since: Date): Promise<RawLog[]> {
    if (!process.env.GOOGLE_CLIENT_ID) return [];

    const auth = getAuthClient();
    const gmail = google.gmail({ version: "v1", auth });

    const sinceEpoch = Math.floor(since.getTime() / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `after:${sinceEpoch}`,
      maxResults: 100,
    });

    const messages = list.data.messages ?? [];
    const logs: RawLog[] = [];

    for (const { id } of messages) {
      if (!id) continue;
      try {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        });

        const headers = msg.data.payload?.headers ?? [];
        const subject =
          headers.find((h) => h.name === "Subject")?.value ?? "";
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const date = headers.find((h) => h.name === "Date")?.value ?? "";
        const snippet = msg.data.snippet ?? "";

        logs.push({
          id: crypto.randomUUID(),
          source: "gmail",
          collectedAt: new Date().toISOString(),
          occurredAt: date
            ? new Date(date).toISOString()
            : new Date().toISOString(),
          content: `件名: ${subject}\n差出人: ${from}\n\n${snippet}`,
          metadata: { gmailId: id, subject, from },
        });
      } catch {
        // 個別メッセージの取得失敗はスキップ
      }
    }

    return logs;
  }
}
