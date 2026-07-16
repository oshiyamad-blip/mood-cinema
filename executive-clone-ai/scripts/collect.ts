/**
 * 日次バッチ収集スクリプト。
 * 使い方: npm run collect [--since 2024-01-01]
 */
import "dotenv/config";

const SINCE_ARG = process.argv.find((a) => a.startsWith("--since="));
const since = SINCE_ARG
  ? new Date(SINCE_ARG.replace("--since=", ""))
  : new Date(Date.now() - 86400000); // デフォルト: 過去 24 時間

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SECRET = process.env.INTERNAL_API_SECRET ?? "";

async function run() {
  console.log(`収集開始: ${since.toISOString()} 以降のデータ`);

  const res = await fetch(`${BASE_URL}/api/collect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SECRET,
    },
    body: JSON.stringify({ since: since.toISOString() }),
  });

  const data = (await res.json()) as
    | {
        ok: true;
        data: {
          collectors: Array<{
            source: string;
            collected: number;
            errors: string[];
          }>;
          signals: number;
        };
      }
    | { ok: false; error: string };

  if (!data.ok) {
    console.error("収集失敗:", data.error);
    process.exit(1);
  }

  console.log("\n── コレクター結果 ──");
  for (const c of data.data.collectors) {
    const status = c.errors.length > 0 ? "⚠" : "✓";
    console.log(`${status} ${c.source}: ${c.collected} 件`);
    for (const e of c.errors) console.log(`  エラー: ${e}`);
  }

  console.log(`\n✓ シグナル抽出: ${data.data.signals} 件`);
  console.log("完了");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
