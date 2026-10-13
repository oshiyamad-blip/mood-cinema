/**
 * クラウド同期（Phase B-2）。オフラインファースト：localStorage が真実の源のまま、
 * ログイン中だけ Supabase の outlines テーブルと突き合わせる。
 *
 * 設計理念「絶対にユーザーのデータを消さない」：
 * - マージは作品単位の LWW（updated が新しい方）。ローカルだけの作品は決して消さず必ず送る。
 * - 削除は deleted_at をフィールドとして同期（ゴミ箱ごと同期）。行を消すのは完全削除のみ。
 * - ネットワーク／未ログイン／未設定のいずれでも、ローカルは無傷。
 */
import type { Outline, Box, StructureId, Workspace } from './hakogaki';
import { getSupabase } from './supabase';

const TABLE = 'outlines';
const VALID_STRUCTURES: StructureId[] = ['three-act', 'kishotenketsu', 'free'];

/** DB 行の形（jsonb boxes、bigint updated/deleted_at）。 */
interface Row {
  id: string;
  title: string | null;
  structure: string | null;
  boxes: Box[] | null;
  updated: number;
  deleted_at: number | null;
}

function toStructure(s: string | null | undefined): StructureId {
  return s && (VALID_STRUCTURES as string[]).includes(s) ? (s as StructureId) : 'three-act';
}

/** DB 行 → Outline（壊れた値でも UI が落ちないよう最低限を保証）。 */
export function outlineFromRow(r: Row): Outline {
  const o: Outline = {
    id: r.id,
    title: typeof r.title === 'string' ? r.title : '',
    structure: toStructure(r.structure),
    boxes: Array.isArray(r.boxes) ? r.boxes : [],
    updated: typeof r.updated === 'number' ? r.updated : 0,
  };
  if (typeof r.deleted_at === 'number') o.deletedAt = r.deleted_at;
  return o;
}

/** Outline → DB 行（user_id は呼び出し側で付与）。 */
export function rowFromOutline(o: Outline): Omit<Row, 'deleted_at'> & { deleted_at: number | null } {
  return {
    id: o.id,
    title: o.title,
    structure: o.structure,
    boxes: o.boxes,
    updated: o.updated,
    deleted_at: typeof o.deletedAt === 'number' ? o.deletedAt : null,
  };
}

export interface MergeResult {
  merged: Outline[];
  /** ローカルが新しい or ローカルだけにある＝サーバへ送るべき作品。 */
  toPush: Outline[];
  /** マージ結果がローカルと異なるか（＝state 更新が要るか）。 */
  changed: boolean;
}

/**
 * 作品単位の LWW マージ（純関数・テスト対象）。
 * - 両方にある：updated が新しい方を採用。ローカルが厳密に新しければ push 対象。
 * - ローカルだけ：採用し、必ず push（アップロード）。
 * - サーバだけ：採用（他端末で作られた作品を取り込む）。
 * ローカルの作品を落とすことは一切しない。
 */
export function mergeOutlines(local: Outline[], remote: Outline[]): MergeResult {
  const localById = new Map(local.map((o) => [o.id, o]));
  const remoteById = new Map(remote.map((o) => [o.id, o]));
  const ids = new Set<string>([...localById.keys(), ...remoteById.keys()]);

  const merged: Outline[] = [];
  const toPush: Outline[] = [];
  let changed = false;

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && r) {
      if (l.updated > r.updated) {
        merged.push(l);
        toPush.push(l);
      } else if (r.updated > l.updated) {
        merged.push(r);
        changed = true;
      } else {
        merged.push(l); // 同値：ローカルを保持、送受信不要
      }
    } else if (l && !r) {
      merged.push(l);
      toPush.push(l); // ローカルだけ → アップロード
    } else if (!l && r) {
      merged.push(r);
      changed = true; // サーバだけ → 取り込み
    }
  }
  return { merged, toPush, changed };
}

/** 自分の全作品をサーバから取得。未設定/未ログインなら null。 */
export async function pullRemote(): Promise<Outline[] | null> {
  const sp = getSupabase();
  if (!sp) return null;
  const client = await sp;
  const { data: u } = await client.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await client.from(TABLE).select('*');
  if (error) throw error;
  return (data as Row[]).map(outlineFromRow);
}

/** 作品群をサーバへ upsert。未設定/未ログイン/空なら何もしない。 */
export async function pushOutlines(list: Outline[]): Promise<void> {
  if (list.length === 0) return;
  const sp = getSupabase();
  if (!sp) return;
  const client = await sp;
  const { data: u } = await client.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  const rows = list.map((o) => ({ ...rowFromOutline(o), user_id: uid }));
  const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * サーバの行を完全削除する（ゴミ箱からの purge に対応）。未設定/未ログインなら何もしない。
 * これを呼ばないと、purge した作品が次回 pull で「サーバだけにある作品」として復活してしまう。
 */
export async function deleteRemote(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const sp = getSupabase();
  if (!sp) return;
  const client = await sp;
  const { data: u } = await client.auth.getUser();
  if (!u.user) return;
  const { error } = await client.from(TABLE).delete().in('id', ids);
  if (error) throw error;
}

export interface SyncOutcome {
  workspace: Workspace;
  changed: boolean;
}

/**
 * pull → LWW マージ → 差分 push を 1 回。未設定/未ログインなら null を返す。
 * currentId はできるだけ維持し、消えていれば生存作品の最新へ寄せる。
 */
export async function fullSync(ws: Workspace): Promise<SyncOutcome | null> {
  const remote = await pullRemote();
  if (remote === null) return null; // 未設定 or 未ログイン
  const { merged, toPush, changed } = mergeOutlines(ws.outlines, remote);
  await pushOutlines(toPush);

  const alive = merged.filter((o) => !o.deletedAt);
  const currentId =
    ws.currentId && merged.some((o) => o.id === ws.currentId && !o.deletedAt)
      ? ws.currentId
      : alive.slice().sort((a, b) => b.updated - a.updated)[0]?.id ?? null;

  return { workspace: { currentId, outlines: merged }, changed: changed || toPush.length > 0 };
}
