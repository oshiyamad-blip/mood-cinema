/**
 * Google Workspace MCP サーバー。
 * Claude Code から Google Drive / Docs へ安全にアクセスするためのブリッジ。
 *
 * 起動: npx ts-node mcp/google-workspace/index.ts
 *
 * CLAUDE.md の MCP 設定例:
 * {
 *   "mcpServers": {
 *     "google-workspace": {
 *       "command": "npx",
 *       "args": ["ts-node", "mcp/google-workspace/index.ts"],
 *       "env": {
 *         "GOOGLE_CLIENT_ID": "...",
 *         "GOOGLE_CLIENT_SECRET": "...",
 *         "GOOGLE_REFRESH_TOKEN": "..."
 *       }
 *     }
 *   }
 * }
 */

import { google } from "googleapis";

function getAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

// ─── MCP ツール定義 ────────────────────────────────────────────────

export const tools = [
  {
    name: "list_recent_drive_files",
    description: "Google Drive の直近更新ファイルを一覧取得する",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "取得件数（デフォルト: 20）",
        },
      },
    },
    async run(input: { limit?: number }) {
      const auth = getAuthClient();
      const drive = google.drive({ version: "v3", auth });
      const res = await drive.files.list({
        pageSize: input.limit ?? 20,
        orderBy: "modifiedTime desc",
        fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
      });
      return res.data.files ?? [];
    },
  },
  {
    name: "read_doc_content",
    description: "Google Document の本文テキストを取得する",
    inputSchema: {
      type: "object",
      properties: {
        fileId: {
          type: "string",
          description: "Drive ファイル ID",
        },
      },
      required: ["fileId"],
    },
    async run(input: { fileId: string }) {
      const auth = getAuthClient();
      const docs = google.docs({ version: "v1", auth });
      const res = await docs.documents.get({ documentId: input.fileId });
      const content = res.data.body?.content ?? [];
      const text = content
        .flatMap((el) =>
          (el.paragraph?.elements ?? []).map(
            (e) => e.textRun?.content ?? ""
          )
        )
        .join("");
      return { text };
    },
  },
];

// 簡易 stdio MCP ハンドラ（本番は @modelcontextprotocol/sdk を使用）
process.stdin.setEncoding("utf-8");
let buf = "";
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line) as {
        id: string;
        method: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };

      if (req.method === "tools/list") {
        const res = {
          id: req.id,
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        };
        process.stdout.write(JSON.stringify(res) + "\n");
      } else if (req.method === "tools/call") {
        const toolName = req.params?.name;
        const tool = tools.find((t) => t.name === toolName);
        if (!tool) {
          process.stdout.write(
            JSON.stringify({
              id: req.id,
              error: { code: -32601, message: "Tool not found" },
            }) + "\n"
          );
          continue;
        }
        const result = await (tool.run as (a: unknown) => Promise<unknown>)(
          req.params?.arguments ?? {}
        );
        process.stdout.write(
          JSON.stringify({ id: req.id, result }) + "\n"
        );
      }
    } catch (err) {
      process.stderr.write(String(err) + "\n");
    }
  }
});
