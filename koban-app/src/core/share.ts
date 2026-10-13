// 配布と確認（D-1〜D-9）。版どうしの差分、人ごとの閲覧データ（伏せ字つき）、LINE の文面、確認の集計。

import type { CallSheetDoc, DocRow } from './callsheet';
import { personalSummary } from './callsheet';
import type { CallSheetVersion, ID, Person, Project, Share } from './model';
import { addDays, formatDate, formatDateLong, formatTime, jstMidnight } from './time';

// ---- 差分（D-5・D-6） ----

export interface DocChange {
  kind: 'call' | 'wrap' | 'location' | 'scene-added' | 'scene-removed' | 'scene-time' | 'order' | 'person-call' | 'text' | 'date';
  text: string;
  /** この変化で影響を受ける人。null なら全員 */
  personIds: ID[] | null;
}

function sceneRows(doc: CallSheetDoc): DocRow[] {
  return doc.rows.filter((r) => r.kind === 'scene');
}

export function diffDocs(prev: CallSheetDoc | null, next: CallSheetDoc): DocChange[] {
  if (!prev) return [];
  const out: DocChange[] = [];
  if (prev.date !== next.date) {
    out.push({ kind: 'date', text: `撮影日 ${formatDate(prev.date)} → ${formatDate(next.date)}`, personIds: null });
  }
  if (prev.generalCall !== next.generalCall) {
    out.push({ kind: 'call', text: `全体の集合 ${formatTime(prev.generalCall)} → ${formatTime(next.generalCall)}`, personIds: null });
  }
  if (prev.wrapPlan !== next.wrapPlan) {
    out.push({ kind: 'wrap', text: `撤収予定 ${formatTime(prev.wrapPlan) || '未定'} → ${formatTime(next.wrapPlan) || '未定'}`, personIds: null });
  }
  const locKey = (d: CallSheetDoc) => d.locations.map((l) => `${l.name}\u0000${l.address}\u0000${l.meetingPoint}`).join('\u0001');
  if (locKey(prev) !== locKey(next)) {
    const names = (d: CallSheetDoc) => d.locations.map((l) => l.name).join('・') || '未定';
    out.push({ kind: 'location', text: `場所・集合場所 ${names(prev)} → ${names(next)}`, personIds: null });
  }

  const pr = new Map(sceneRows(prev).map((r) => [r.sceneId, r]));
  const nr = new Map(sceneRows(next).map((r) => [r.sceneId, r]));
  for (const r of sceneRows(next)) {
    const o = pr.get(r.sceneId);
    if (!o) out.push({ kind: 'scene-added', text: `S#${r.sceneNo} を追加（${formatTime(r.start)}〜）`, personIds: r.castIds });
    else if (o.start !== r.start) {
      out.push({ kind: 'scene-time', text: `S#${r.sceneNo} ${formatTime(o.start)} → ${formatTime(r.start)}`, personIds: union(o.castIds, r.castIds) });
    } else if (o.castIds.join() !== r.castIds.join()) {
      out.push({ kind: 'scene-time', text: `S#${r.sceneNo} の出演者が変わりました`, personIds: union(o.castIds, r.castIds) });
    }
  }
  for (const r of sceneRows(prev)) {
    if (!nr.has(r.sceneId)) out.push({ kind: 'scene-removed', text: `S#${r.sceneNo} を外しました`, personIds: r.castIds });
  }
  const po = sceneRows(prev).map((r) => r.sceneId).filter((id) => nr.has(id));
  const no = sceneRows(next).map((r) => r.sceneId).filter((id) => pr.has(id));
  if (po.join() !== no.join()) {
    out.push({ kind: 'order', text: `撮影順を変更：${sceneRows(next).map((r) => r.sceneNo).join(' → ')}`, personIds: null });
  }

  // キャストは一人ずつ、スタッフは部署ごとに（全体の集合が動いたときに全員分を並べないため）
  const pc = new Map(prev.cast.map((x) => [x.personId, x]));
  for (const x of next.cast) {
    const o = pc.get(x.personId);
    if (o && o.call !== x.call) out.push({ kind: 'person-call', text: `${x.name} の入り ${formatTime(o.call)} → ${formatTime(x.call)}`, personIds: [x.personId] });
  }
  const pd = new Map(prev.deptCalls.map((d) => [d.dept, d.call]));
  for (const d of next.deptCalls) {
    const o = pd.get(d.dept);
    if (o != null && o !== d.call && !(o === prev.generalCall && d.call === next.generalCall)) {
      const ids = next.staff.filter((x) => x.dept === d.dept).map((x) => x.personId);
      out.push({ kind: 'person-call', text: `${d.dept}の集合 ${formatTime(o)} → ${formatTime(d.call)}`, personIds: ids });
    }
  }
  const ps = new Map(prev.staff.map((x) => [x.personId, x]));
  for (const x of next.staff) {
    const o = ps.get(x.personId);
    if (o && (o.callOverridden || x.callOverridden) && o.call !== x.call) {
      out.push({ kind: 'person-call', text: `${x.name} の入り ${formatTime(o.call)} → ${formatTime(x.call)}`, personIds: [x.personId] });
    }
  }

  const texts: [keyof CallSheetDoc, string][] = [
    ['notices', '注意事項'],
    ['meals', '食事'],
    ['moves', '移動'],
    ['weather', '天気'],
    ['note', 'メモ'],
  ];
  for (const [k, label] of texts) {
    if (prev[k] !== next[k]) out.push({ kind: 'text', text: `${label}を更新`, personIds: null });
  }
  const dn = (d: CallSheetDoc) => d.deptNotes.map((x) => `${x.dept}\u0000${x.text}`).join('\u0001');
  if (dn(prev) !== dn(next)) out.push({ kind: 'text', text: '各部のメモを更新', personIds: null });
  return out;
}

function union(a: ID[], b: ID[]): ID[] {
  return [...new Set([...a, ...b])];
}

/** その人の予定（入り・出番・時刻）が変わったか。全員に関わる変化があれば全員 */
export function affectedPersonIds(prev: CallSheetDoc | null, next: CallSheetDoc, changes: DocChange[]): Set<ID> {
  const everyone = [...next.cast, ...next.staff].map((x) => x.personId);
  if (!prev) return new Set(everyone);
  if (changes.some((c) => c.personIds === null && c.kind !== 'text' && c.kind !== 'order')) return new Set(everyone);
  const out = new Set<ID>();
  for (const c of changes) for (const id of c.personIds ?? []) out.add(id);
  const ids = new Set([...everyone, ...[...prev.cast, ...prev.staff].map((x) => x.personId)]);
  for (const id of ids) {
    const a = personalSummary(prev, id);
    const b = personalSummary(next, id);
    if (JSON.stringify(a && { c: a.call, s: a.scenes }) !== JSON.stringify(b && { c: b.call, s: b.scenes })) out.add(id);
  }
  return out;
}

// ---- 閲覧データ（D-3・D-8） ----

export interface ViewPayload {
  v: 1;
  projectTitle: string;
  date: string;
  versionN: number;
  publishedAt: number;
  expiresAt: number;
  /** 透かしに出す名前。グループ用リンクでは null */
  viewerName: string | null;
  me: {
    personId: ID;
    name: string;
    role: string;
    call: number | null;
    scenes: { no: string; start: number; heading: string }[];
  } | null;
  /** 前の版からの変化（この人に関わるものに mine を付ける） */
  changes: { text: string; mine: boolean }[];
  doc: CallSheetDoc;
}

/** 受け取る人に見せない情報を落とす。電話は showPhone の人だけ、詳しい住所は seesAddress の人だけ */
export function redactDoc(doc: CallSheetDoc, viewer: Person | null): CallSheetDoc {
  const seesAddress = viewer?.seesAddress ?? false;
  return {
    ...doc,
    locations: doc.locations.map((l) => ({ ...l, address: seesAddress ? l.address : '' })),
    contacts: doc.contacts.map((c) => ({ ...c, phone: c.showPhone ? c.phone : '', email: '' })),
  };
}

export function buildViewPayload(
  version: CallSheetVersion,
  prevDoc: CallSheetDoc | null,
  viewer: Person | null,
  expiresAt: number,
): ViewPayload {
  const changes = diffDocs(prevDoc, version.doc);
  const me = viewer ? personalSummary(version.doc, viewer.id) : null;
  return {
    v: 1,
    projectTitle: version.doc.projectTitle,
    date: version.doc.date,
    versionN: version.n,
    publishedAt: version.publishedAt,
    expiresAt,
    viewerName: viewer?.name ?? null,
    me: me && { personId: me.personId, name: me.name, role: me.role, call: me.call, scenes: me.scenes },
    changes: changes.map((c) => ({ text: c.text, mine: viewer != null && (c.personIds === null || c.personIds.includes(viewer.id)) })),
    doc: redactDoc(version.doc, viewer),
  };
}

/** 既定の有効期限：撮影日の2日後の終わり（日本時間）。日付未定なら配布から14日 */
export function defaultExpiry(date: string, now = Date.now()): number {
  if (!date) return now + 14 * 86400000;
  return jstMidnight(addDays(date, 3));
}

// ---- 文面（D-2・D-6） ----

export function viewUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/v/#${token}`;
}

function meetingLine(doc: CallSheetDoc): string {
  const l = doc.locations[0];
  if (!l) return '';
  return l.meetingPoint ? `${l.meetingPoint}（${l.name}）` : l.name;
}

export function lineText(doc: CallSheetDoc, versionN: number, url: string, person: Person | null, resend = false): string {
  const head = `${resend ? '【差し替え】' : ''}【${doc.projectTitle}】${formatDateLong(doc.date)} 日々スケ${versionN > 1 ? `（第${versionN}版）` : ''}`;
  const lines = [head];
  lines.push(`集合 ${formatTime(doc.generalCall)}${meetingLine(doc) ? ` ${meetingLine(doc)}` : ''}`);
  if (person) {
    const me = personalSummary(doc, person.id);
    if (me?.call != null) lines.push(`${person.name}さんの入り ${formatTime(me.call)}`);
  }
  lines.push(resend ? '内容が変わりました。開いて「確認しました」を押してください。' : '開いて「確認しました」を押してください。');
  lines.push(url);
  return lines.join('\n');
}

// ---- 確認の集計（D-4） ----

export interface Ack {
  shareId: ID;
  version: number;
  at: number;
}

export type AckState = 'acked' | 'stale' | 'none' | 'revoked' | 'expired';

export interface AckRow {
  share: Share;
  person: Person | null;
  state: AckState;
  ackedVersion: number | null;
  ackedAt: number | null;
}

export function ackRows(p: Project, dayId: ID, acks: Ack[], currentVersion: number, now = Date.now()): AckRow[] {
  const persons = new Map(p.persons.map((x) => [x.id, x]));
  const latest = new Map<ID, Ack>();
  for (const a of acks) {
    const cur = latest.get(a.shareId);
    if (!cur || a.version > cur.version || (a.version === cur.version && a.at > cur.at)) latest.set(a.shareId, a);
  }
  return p.shares
    .filter((s) => s.dayId === dayId)
    .map((share) => {
      const a = latest.get(share.id) ?? null;
      let state: AckState;
      if (share.revokedAt != null) state = 'revoked';
      else if (share.expiresAt < now) state = 'expired';
      else if (!a) state = 'none';
      else if (a.version >= currentVersion) state = 'acked';
      else state = 'stale';
      return { share, person: share.personId ? (persons.get(share.personId) ?? null) : null, state, ackedVersion: a?.version ?? null, ackedAt: a?.at ?? null };
    });
}

export const ACK_LABEL: Record<AckState, string> = {
  acked: '確認済み',
  stale: '前の版で止まっている',
  none: '未確認',
  revoked: '取り消し',
  expired: '期限切れ',
};

export function latestVersion(p: Project, dayId: ID): CallSheetVersion | null {
  let v: CallSheetVersion | null = null;
  for (const x of p.versions) if (x.dayId === dayId && (!v || x.n > v.n)) v = x;
  return v;
}

export function previousVersion(p: Project, dayId: ID, n: number): CallSheetVersion | null {
  let v: CallSheetVersion | null = null;
  for (const x of p.versions) if (x.dayId === dayId && x.n < n && (!v || x.n > v.n)) v = x;
  return v;
}
