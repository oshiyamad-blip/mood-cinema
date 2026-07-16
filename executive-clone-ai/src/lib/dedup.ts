import type { RawLog } from "@/types";

/**
 * 重複ログのマージ。
 * 同一発生時刻（±5 分）・同一ソース・内容類似度 80% 超のログを 1 件に統合する。
 */
export function deduplicateLogs(logs: RawLog[]): RawLog[] {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  const merged: RawLog[] = [];
  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const base = sorted[i];
    const group = [base];

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const candidate = sorted[j];

      const timeDiff = Math.abs(
        new Date(base.occurredAt).getTime() -
          new Date(candidate.occurredAt).getTime()
      );
      const withinWindow = timeDiff <= 5 * 60 * 1000; // 5 分

      if (
        withinWindow &&
        base.source === candidate.source &&
        similarity(base.content, candidate.content) >= 0.8
      ) {
        group.push(candidate);
        used.add(j);
      }
    }

    if (group.length === 1) {
      merged.push(base);
    } else {
      // 最も長いコンテンツを代表として採用
      const representative = group.sort(
        (a, b) => b.content.length - a.content.length
      )[0];
      merged.push({
        ...representative,
        metadata: {
          ...representative.metadata,
          mergedFrom: group.map((g) => g.id),
        },
      });
    }

    used.add(i);
  }

  return merged;
}

/** Jaccard 類似度（単語レベル）*/
function similarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  const intersection = new Set([...setA].filter((t) => setB.has(t)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}
