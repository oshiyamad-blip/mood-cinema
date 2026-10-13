// 配布の受け口。クラウド（Supabase）が設定されていればそれを、無ければこの端末の中だけで動くデモを使う。

import type { Ack, ViewPayload } from '../core/share';

export interface PublishItem {
  shareId: string;
  tokenHash: string;
  personId: string | null;
  version: number;
  expiresAt: number;
  payload: ViewPayload;
}

export interface Backend {
  /** local はこの端末の中だけのデモ */
  mode: 'local' | 'cloud';
  publish(projectId: string, dayId: string, items: PublishItem[]): Promise<void>;
  setRevoked(shareIds: string[], revoked: boolean): Promise<void>;
  fetchAcks(projectId: string, dayId: string): Promise<Ack[]>;
}

export type ViewResult =
  | { ok: true; payload: ViewPayload; ackedVersion: number | null }
  | { ok: false; reason: 'not-found' | 'expired' | 'revoked' | 'network' };

export interface ViewerBackend {
  view(token: string): Promise<ViewResult>;
  ack(token: string, version: number): Promise<boolean>;
}

/** 有料プランの上限に当たったなど、利用者に説明すべき失敗 */
export class PublishError extends Error {
  constructor(
    message: string,
    readonly code: 'limit-recipients' | 'limit-projects' | 'auth' | 'network' | 'other',
  ) {
    super(message);
  }
}
