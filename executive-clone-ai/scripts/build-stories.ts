/**
 * 週次ストーリー生成スクリプト。
 * シグナル DB から直近 30 日のシグナルを取得し、因果関係のあるストーリーを構築して保存する。
 * 使い方: npm run story
 */
import "dotenv/config";
import { listSignals, saveStory } from "../src/lib/notion";
import { buildStory } from "../src/lib/claude";
import crypto from "crypto";

const WINDOW_DAYS = 30;
const MIN_SIGNALS_PER_STORY = 3;

async function run() {
  console.log(`ストーリー生成開始（過去 ${WINDOW_DAYS} 日のシグナルを分析）`);

  const since = new Date(Date.now() - WINDOW_DAYS * 86400000);
  const signals = await listSignals({ limit: 200 });

  const recent = signals.filter((s) => new Date(s.occurredAt) >= since);
  console.log(`対象シグナル: ${recent.length} 件`);

  if (recent.length < MIN_SIGNALS_PER_STORY) {
    console.log("シグナルが不足しています。収集バッチを先に実行してください。");
    return;
  }

  // カテゴリ別にグループ化して関連シグナルをまとめる
  const groups: Record<string, typeof recent> = {};
  for (const s of recent) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }

  let generated = 0;
  for (const [cat, sigs] of Object.entries(groups)) {
    if (sigs.length < MIN_SIGNALS_PER_STORY) continue;
    console.log(`\n[${cat}] ${sigs.length} 件のシグナルからストーリーを生成中…`);

    const result = await buildStory(sigs);
    if (!result) {
      console.log("  → ストーリー構築なし（因果関係が不明確）");
      continue;
    }

    await saveStory({
      id: crypto.randomUUID(),
      ...result,
      events: sigs.map((s) => ({
        signalId: s.id,
        occurredAt: s.occurredAt,
        description: s.summary,
      })),
      generatedAt: new Date().toISOString(),
    });

    console.log(`  ✓ 保存: ${result.title}`);
    generated++;
  }

  console.log(`\n完了。${generated} 件のストーリーを生成しました。`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
