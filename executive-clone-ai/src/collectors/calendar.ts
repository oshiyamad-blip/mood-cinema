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

export class CalendarCollector implements Collector {
  async collect(since: Date): Promise<RawLog[]> {
    if (!process.env.GOOGLE_CLIENT_ID) return [];

    const auth = getAuthClient();
    const cal = google.calendar({ version: "v3", auth });

    const events = await cal.events.list({
      calendarId: "primary",
      timeMin: since.toISOString(),
      maxResults: 100,
      singleEvents: true,
      orderBy: "startTime",
    });

    const logs: RawLog[] = [];

    for (const event of events.data.items ?? []) {
      const startRaw =
        event.start?.dateTime ?? event.start?.date ?? new Date().toISOString();
      const title = event.summary ?? "（無題）";
      const desc = event.description ?? "";
      const attendees = (event.attendees ?? [])
        .map((a) => a.email ?? "")
        .filter(Boolean)
        .join(", ");

      logs.push({
        id: crypto.randomUUID(),
        source: "google_calendar",
        collectedAt: new Date().toISOString(),
        occurredAt: new Date(startRaw).toISOString(),
        content: [
          `予定: ${title}`,
          attendees ? `参加者: ${attendees}` : "",
          desc ? `詳細: ${desc}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          eventId: event.id,
          title,
          attendees,
          location: event.location,
        },
      });
    }

    return logs;
  }
}
