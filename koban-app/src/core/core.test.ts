import { describe, expect, it } from 'vitest';
import { buildCallSheet, personalSummary } from './callsheet';
import type { Project } from './model';
import { createDay, createPerson, createProject } from './project';
import { checkProject, moveSceneToDay, timetable } from './schedule';
import { ackRows, affectedPersonIds, buildViewPayload, defaultExpiry, diffDocs, lineText } from './share';
import { applyImport, buildDraft, diffImport, guessMapping, parseDelimited, parseMinutes, parsePages, sceneKey } from './tabular';
import { formatDate, formatTime, parseTime } from './time';

const CSV = `作品名：テスト,,,,,
S#,柱,時間帯,内外,ページ,出演者,小道具
1,駅前,昼,外,1.5,田中、佐藤,傘
2,喫茶店,夜,内,2,田中,
"3",公園,朝,外,0.5,佐藤,"ベンチ、新聞"
`;

function imported(): Project {
  const grid = parseDelimited(CSV);
  const mapping = guessMapping(grid, null);
  const draft = buildDraft(grid, mapping);
  return applyImport(createProject('テスト', 'drama'), draft, mapping);
}

describe('time', () => {
  it('24時を超える時刻を読む', () => {
    expect(parseTime('25:30')).toBe(1530);
    expect(parseTime('８：３０')).toBe(510);
    expect(parseTime('8時半')).toBe(510);
    expect(parseTime('0830')).toBe(510);
    expect(parseTime('48:00')).toBeNull();
    expect(formatTime(1530)).toBe('25:30');
  });
  it('曜日', () => {
    expect(formatDate('2026-10-20')).toBe('10/20（火）');
  });
});

describe('取り込み', () => {
  it('見出し行と列を推定する', () => {
    const grid = parseDelimited(CSV);
    const m = guessMapping(grid, null);
    expect(m.headerRow).toBe(1);
    expect(m.byHeader['S#']).toEqual({ kind: 'field', field: 'no' });
    expect(m.byHeader['出演者']).toEqual({ kind: 'castList' });
    expect(m.byHeader['小道具']).toEqual({ kind: 'elemList', category: '小道具' });
  });
  it('人物と要素を名前で作る', () => {
    const p = imported();
    expect(p.scenes.map((s) => s.no)).toEqual(['1', '2', '3']);
    expect(p.persons.map((x) => x.name).sort()).toEqual(['佐藤', '田中']);
    expect(p.scenes[0].intExt).toBe('EXT');
    expect(p.scenes[2].elementIds).toHaveLength(2);
  });
  it('印の列（見出しが人物名）', () => {
    const grid = parseDelimited('番号\t柱\t田中\t佐藤\n1\t駅\t○\t\n2\t店\t○\t○\n');
    const m = guessMapping(grid, null);
    expect(m.byHeader['田中']).toEqual({ kind: 'castMark' });
    const d = buildDraft(grid, m);
    expect(d.scenes[1].cast).toEqual(['田中', '佐藤']);
  });
  it('シーン番号の照合キー', () => {
    expect(sceneKey('S#012')).toBe('12');
    expect(sceneKey('１２ａ')).toBe('12A');
    expect(sceneKey('シーン 3')).toBe('3');
  });
  it('ページと見積', () => {
    expect(parsePages('1 3/8')).toBeCloseTo(1.375);
    expect(parsePages('1/2')).toBe(0.5);
    expect(parseMinutes('1:30')).toBe(90);
    expect(parseMinutes('1時間30分')).toBe(90);
    expect(parseMinutes('45分')).toBe(45);
  });
  it('取り込み直しは変化を出し、消えたシーンの割り当てを外して残す', () => {
    let p = imported();
    const day = createDay('2026-10-20');
    p = { ...p, days: [day] };
    p = moveSceneToDay(p, p.scenes[2].id, day.id);
    const csv2 = `S#,柱,時間帯,内外,ページ,出演者,小道具\n1,駅前,夕,外,1.5,田中、佐藤,傘\n2,喫茶店,夜,内,2,田中,\n4,屋上,夜,外,1,鈴木,\n`;
    const grid = parseDelimited(csv2);
    const draft = buildDraft(grid, guessMapping(grid, p.importMapping));
    const diff = diffImport(p, draft);
    expect(diff.added.map((d) => d.no)).toEqual(['4']);
    expect(diff.removed.map((s) => s.no)).toEqual(['3']);
    expect(diff.changed.map((c) => [c.scene.no, c.fields])).toEqual([['1', ['timeOfDay']]]);
    expect(diff.unassignedByRemoval.map((s) => s.no)).toEqual(['3']);
    expect(diff.newPersons).toEqual(['鈴木']);
    const q = applyImport(p, draft, guessMapping(grid, p.importMapping));
    const s3 = q.scenes.find((s) => s.no === '3')!;
    expect(s3.archived).toBe(true);
    expect(q.days[0].items).toHaveLength(0);
    // 再び現れたら戻る
    const back = applyImport(q, buildDraft(parseDelimited(CSV), guessMapping(parseDelimited(CSV), null)), q.importMapping!);
    expect(back.scenes.find((s) => s.no === '3')!.archived).toBe(false);
  });
  it('番号のない行と重複を報告する', () => {
    const grid = parseDelimited('S#,柱\n1,駅\n,メモ行\n1,重複\n');
    const d = buildDraft(grid, guessMapping(grid, null));
    expect(d.scenes).toHaveLength(1);
    expect(d.skippedRows).toEqual([2]);
    expect(d.duplicateNos).toEqual(['1']);
  });
});

function scheduled(): Project {
  let p = imported();
  const d1 = { ...createDay('2026-10-20'), callTime: 7 * 60, wrapPlan: 12 * 60 };
  const d2 = { ...createDay('2026-10-21'), callTime: 6 * 60 };
  p = { ...p, days: [d1, d2] };
  for (const s of p.scenes) p = moveSceneToDay(p, s.id, d1.id);
  return p;
}

describe('時間割と検査', () => {
  it('集合＋準備から順に積む', () => {
    const p = scheduled();
    const tt = timetable(p, p.days[0]);
    // 1.5p×30=45, 2p=60, 0.5p=15
    expect(tt.rows.map((r) => [r.start, r.end])).toEqual([
      [480, 525],
      [525, 585],
      [585, 600],
    ]);
  });
  it('NG日・拘束・休息を警告する', () => {
    let p = scheduled();
    const tanaka = p.persons.find((x) => x.name === '田中')!;
    p = { ...p, persons: p.persons.map((x) => (x.id === tanaka.id ? { ...x, ngDates: ['2026-10-20'] } : x)) };
    p = { ...p, days: p.days.map((d, i) => (i === 0 ? { ...d, wrapPlan: 22 * 60 } : d)) };
    const issues = checkProject(p);
    expect(issues.filter((i) => i.code === 'ng')).toHaveLength(2);
    expect(issues.some((i) => i.code === 'span')).toBe(true); // 7:00〜22:00 = 15時間
    expect(issues.some((i) => i.code === 'rest')).toBe(true); // 22:00 → 翌6:00 = 8時間
  });
});

describe('日々スケと配布', () => {
  it('キャストの入りは最初の出番から逆算し、上書きを反映する', () => {
    let p = scheduled();
    const doc = buildCallSheet(p, p.days[0]);
    const sato = p.persons.find((x) => x.name === '佐藤')!;
    expect(doc.cast.find((c) => c.personId === sato.id)!.call).toBe(420); // max(7:00, 8:00-90分)
    p = { ...p, callSheets: { [p.days[0].id]: { ...emptyOv(), personCall: { [sato.id]: 450 } } } };
    const doc2 = buildCallSheet(p, p.days[0]);
    expect(doc2.cast.find((c) => c.personId === sato.id)).toMatchObject({ call: 450, callOverridden: true });
    expect(personalSummary(doc2, sato.id)!.scenes.map((s) => s.no)).toEqual(['1', '3']);
  });

  it('差分と影響を受ける人', () => {
    const p = scheduled();
    const before = buildCallSheet(p, p.days[0]);
    const moved = { ...p, days: p.days.map((d, i) => (i === 0 ? { ...d, items: [d.items[1], d.items[0], d.items[2]] } : d)) };
    const after = buildCallSheet(moved, moved.days[0]);
    const ch = diffDocs(before, after);
    expect(ch.some((c) => c.kind === 'order')).toBe(true);
    const tanaka = p.persons.find((x) => x.name === '田中')!;
    const sato = p.persons.find((x) => x.name === '佐藤')!;
    const aff = affectedPersonIds(before, after, ch);
    expect(aff.has(tanaka.id)).toBe(true);
    expect(aff.has(sato.id)).toBe(true); // S#1 の開始が動いた
    expect(ch.some((c) => c.kind === 'location')).toBe(false);
    // 何も変えなければ差分なし
    expect(diffDocs(before, buildCallSheet(p, p.days[0]))).toEqual([]);
  });

  it('閲覧データは電話と住所を伏せる', () => {
    let p = scheduled();
    const staff = { ...createPerson('山田', 'staff'), dept: '制作', contact: { phone: '090-0000-0000', email: 'a@b', showPhone: false, listed: true } };
    p = { ...p, persons: [...p.persons, staff], locations: p.locations };
    const doc = buildCallSheet(p, p.days[0]);
    const cast = p.persons.find((x) => x.name === '田中')!;
    const v = { id: 'v', dayId: p.days[0].id, n: 1, publishedAt: 0, doc };
    const payload = buildViewPayload(v, null, cast, defaultExpiry('2026-10-20'));
    expect(payload.doc.contacts[0].phone).toBe('');
    expect(payload.doc.contacts[0].email).toBe('');
    expect(payload.me!.scenes.map((s) => s.no)).toEqual(['1', '2']);
    expect(JSON.stringify(payload)).not.toContain('090-0000-0000');
  });

  it('LINE の文面', () => {
    const p = scheduled();
    const doc = buildCallSheet(p, p.days[0]);
    const tanaka = p.persons.find((x) => x.name === '田中')!;
    const t = lineText(doc, 2, 'https://x/v/#tok', tanaka, 'changed');
    expect(t).toContain('【差し替え】【テスト】2026年10月20日（火） 日々スケ（第2版）');
    expect(t).toContain('田中さんの入り 7:00');
    expect(t.endsWith('https://x/v/#tok')).toBe(true);
    expect(lineText(doc, 1, 'u', tanaka, 'remind')).toMatch(/^【確認のお願い】/);
    expect(lineText(doc, 1, 'u', null)).not.toContain('さんの入り');
  });

  it('確認の集計', () => {
    const p = scheduled();
    const dayId = p.days[0].id;
    const mk = (id: string, revoked = false) => ({ id, dayId, personId: null, token: id, createdAt: 0, expiresAt: Date.now() + 1e9, revokedAt: revoked ? 1 : null, version: 2 });
    const q = { ...p, shares: [mk('a'), mk('b'), mk('c'), mk('d', true)] };
    const rows = ackRows(q, dayId, [{ shareId: 'a', version: 2, at: 1 }, { shareId: 'b', version: 1, at: 1 }], 2);
    expect(rows.map((r) => r.state)).toEqual(['acked', 'stale', 'none', 'revoked']);
  });

  it('有効期限は撮影日の2日後の終わり', () => {
    expect(new Date(defaultExpiry('2026-10-20')).toISOString()).toBe('2026-10-22T15:00:00.000Z');
  });
});

function emptyOv() {
  return { personCall: {}, deptCall: {}, meals: '', moves: '', notices: '', deptNotes: {}, weather: '' };
}

describe('見本の香盤表', () => {
  it('取り込み、撮影順の入れ替えでは場所の変化を出さない', async () => {
    const fs = await import('node:fs');
    const text = fs.readFileSync(new URL('../../public/koban-template.csv', import.meta.url), 'utf8');
    const grid = parseDelimited(text);
    const m = guessMapping(grid, null);
    let p = applyImport(createProject('見本', 'drama'), buildDraft(grid, m), m);
    expect(p.scenes).toHaveLength(4);
    expect(p.locations.map((l) => l.name)).toEqual(['〇〇駅', '喫茶ひかり', 'スタジオA']);
    const day = createDay('2026-10-20');
    p = { ...p, days: [day] };
    for (const no of ['1', '2', '4']) p = moveSceneToDay(p, p.scenes.find((s) => s.no === no)!.id, day.id);
    const before = buildCallSheet(p, p.days[0]);
    const swapped = { ...p, days: [{ ...p.days[0], items: [p.days[0].items[1], p.days[0].items[0], p.days[0].items[2]] }] };
    const after = buildCallSheet(swapped, swapped.days[0]);
    expect(before.locations.map((l) => l.name)).toEqual(['〇〇駅', '喫茶ひかり']);
    expect(after.locations.map((l) => l.name)).toEqual(['喫茶ひかり', '〇〇駅']);
    const ch = diffDocs(before, after);
    expect(ch.some((c) => c.kind === 'location')).toBe(false);
    expect(ch.some((c) => c.kind === 'order')).toBe(true);
  });
});
