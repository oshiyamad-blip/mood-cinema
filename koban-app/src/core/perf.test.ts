// 要件 9章「性能」：シーン300・人物100の作品で、取り込みと日々スケの生成がそれぞれ5秒以内
import { describe, expect, it } from 'vitest';
import { buildCallSheet } from './callsheet';
import { createDay, createProject } from './project';
import { checkProject, moveSceneToDay } from './schedule';
import { applyImport, buildDraft, diffImport, guessMapping, parseDelimited } from './tabular';

function bigCsv(): string {
  const cast = Array.from({ length: 100 }, (_, i) => `人物${i + 1}`);
  const head = ['S#', '柱', '時間帯', '内外', 'ページ', 'ロケ地', '小道具', ...cast].join(',');
  const rows = Array.from({ length: 300 }, (_, i) => {
    const marks = cast.map((_, j) => ((i + j) % 17 === 0 ? '○' : ''));
    return [i + 1, `場所${i % 40}`, i % 2 ? '昼' : '夜', i % 3 ? '内' : '外', (i % 4) + 0.5, `ロケ${i % 25}`, `小道具${i % 30}、小道具${(i + 7) % 30}`, ...marks].join(',');
  });
  return [head, ...rows].join('\n');
}

describe('性能', () => {
  it('シーン300・人物100', () => {
    const t0 = performance.now();
    const grid = parseDelimited(bigCsv());
    const m = guessMapping(grid, null);
    const draft = buildDraft(grid, m);
    let p = applyImport(createProject('大きい作品', 'drama'), draft, m);
    const t1 = performance.now();
    expect(p.scenes).toHaveLength(300);
    expect(p.persons).toHaveLength(100);
    // 取り込み直しの差分も同じ規模で
    diffImport(p, draft);
    const t2 = performance.now();

    const days = Array.from({ length: 30 }, (_, i) => createDay(`2026-11-${String(i + 1).padStart(2, '0')}`));
    p = { ...p, days };
    p.scenes.forEach((s, i) => {
      p = moveSceneToDay(p, s.id, days[i % 30].id);
    });
    const t3 = performance.now();
    checkProject(p);
    for (const d of p.days) buildCallSheet(p, d);
    const t4 = performance.now();
    console.log(`取り込み ${(t1 - t0).toFixed(0)}ms・差分 ${(t2 - t1).toFixed(0)}ms・割り当て ${(t3 - t2).toFixed(0)}ms・検査と日々スケ30日分 ${(t4 - t3).toFixed(0)}ms`);
    expect(t1 - t0).toBeLessThan(5000);
    expect(t4 - t3).toBeLessThan(5000);
  });
});
