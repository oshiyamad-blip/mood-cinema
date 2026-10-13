// 配布の手順（D-1・D-5・D-9）。
// 1. 今の日々スケを解決済みの文書にし、前の版と違えば新しい版にする
// 2. 宛先ごとのリンク（無ければ作る）に、その人向けに伏せ字をした中身を載せる
// 3. クラウドに送れたら、版とリンクを作品に記録する（送れなければ何も変えない）

import { buildCallSheet, type CallSheetDoc } from '../core/callsheet';
import { newId, newToken, sha256Hex } from '../core/ids';
import type { CallSheetVersion, ID, Person, Project, Share } from '../core/model';
import { buildViewPayload, defaultExpiry, latestVersion, previousVersion } from '../core/share';
import { backend } from '../backend';
import type { PublishItem } from '../backend/types';
import { projectStore } from './projects';

export interface PublishOptions {
  /** 配る人。既に配ったことのある人は、指定しなくても同じリンクの中身を新しい版にする */
  personIds: ID[];
  /** グループに貼る共通リンクを作る・更新する */
  group: boolean;
  /** 有効期限（ミリ秒）。未指定なら撮影日の2日後の終わり */
  expiresAt?: number;
}

export interface PublishResult {
  version: CallSheetVersion;
  isNewVersion: boolean;
  shares: Share[];
}

function sameDoc(a: CallSheetDoc, b: CallSheetDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function publishDay(projectId: ID, dayId: ID, opts: PublishOptions): Promise<PublishResult> {
  const p = projectStore.get(projectId);
  if (!p) throw new Error('作品が見つかりません。');
  const day = p.days.find((d) => d.id === dayId);
  if (!day) throw new Error('撮影日が見つかりません。');

  const doc = buildCallSheet(p, day);
  const latest = latestVersion(p, dayId);
  const isNewVersion = !latest || !sameDoc(latest.doc, doc);
  const version: CallSheetVersion = isNewVersion
    ? { id: newId(), dayId, n: (latest?.n ?? 0) + 1, publishedAt: Date.now(), doc }
    : latest!;
  const prevDoc = isNewVersion ? (latest?.doc ?? null) : (previousVersion(p, dayId, version.n)?.doc ?? null);
  const expiresAt = opts.expiresAt ?? defaultExpiry(day.date);

  const persons = new Map(p.persons.map((x) => [x.id, x]));
  const existing = p.shares.filter((s) => s.dayId === dayId && s.revokedAt == null);
  const wanted = new Set(opts.personIds);
  for (const s of existing) if (s.personId) wanted.add(s.personId);

  const shares: Share[] = [];
  for (const pid of wanted) {
    if (!persons.has(pid)) continue;
    const s = existing.find((x) => x.personId === pid);
    shares.push(s ? { ...s, version: version.n, expiresAt } : newShare(dayId, pid, version.n, expiresAt));
  }
  const groupShare = existing.find((x) => x.personId == null);
  if (opts.group || groupShare) {
    shares.push(groupShare ? { ...groupShare, version: version.n, expiresAt } : newShare(dayId, null, version.n, expiresAt));
  }
  if (shares.length === 0) throw new Error('配る相手を選んでください。');

  const items: PublishItem[] = await Promise.all(
    shares.map(async (s) => ({
      shareId: s.id,
      tokenHash: await sha256Hex(s.token),
      personId: s.personId,
      version: version.n,
      expiresAt,
      payload: buildViewPayload(version, prevDoc, s.personId ? (persons.get(s.personId) as Person) : null, expiresAt),
    })),
  );

  await backend.publish(projectId, dayId, items);

  projectStore.update(projectId, (cur) => recordPublish(cur, version, isNewVersion, shares));
  return { version, isNewVersion, shares };
}

function newShare(dayId: ID, personId: ID | null, version: number, expiresAt: number): Share {
  return { id: newId(), dayId, personId, token: newToken(), createdAt: Date.now(), expiresAt, revokedAt: null, version };
}

function recordPublish(p: Project, version: CallSheetVersion, isNew: boolean, shares: Share[]): Project {
  const byId = new Map(shares.map((s) => [s.id, s]));
  const kept = p.shares.map((s) => byId.get(s.id) ?? s);
  const added = shares.filter((s) => !p.shares.some((x) => x.id === s.id));
  return {
    ...p,
    versions: isNew ? [...p.versions, version] : p.versions,
    shares: [...kept, ...added],
  };
}

export async function revokeShares(projectId: ID, shareIds: ID[], revoked: boolean): Promise<void> {
  await backend.setRevoked(shareIds, revoked);
  const ids = new Set(shareIds);
  projectStore.update(projectId, (p) => ({
    ...p,
    shares: p.shares.map((s) => (ids.has(s.id) ? { ...s, revokedAt: revoked ? Date.now() : null } : s)),
  }));
}
