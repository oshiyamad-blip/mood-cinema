// 識別子。作品・シーンなどは推測されても困らないので UUID、配布リンクの秘密は 128 ビットの乱数。

export function newId(): string {
  return crypto.randomUUID();
}

/** 配布リンクの秘密（base64url、22文字） */
export function newToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 の16進。サーバーには秘密そのものでなくこれを置く */
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
