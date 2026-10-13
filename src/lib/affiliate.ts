const AMAZON_TAG = (import.meta.env.VITE_AMAZON_TAG as string | undefined) ?? '';
const UNEXT_REDIRECT_PREFIX =
  (import.meta.env.VITE_UNEXT_REDIRECT_PREFIX as string | undefined) ?? '';

/**
 * U-NEXT 検索 deep link をアフィリエイト経由に包む。
 *
 * A8.net で U-NEXT 提携承認後、媒体管理から取得できる
 * `https://px.a8.net/svt/ejp?a8mat=...&a8ejpredirect=` のテンプレに、
 * URL エンコード済みの U-NEXT 検索 URL を連結する。
 *
 * 未設定 (開発時) は素の U-NEXT URL を返す。
 */
export function unextSearchUrl(title: string): string {
  const target = `https://video.unext.jp/freeword?query=${encodeURIComponent(title)}`;
  if (!UNEXT_REDIRECT_PREFIX) return target;
  return UNEXT_REDIRECT_PREFIX + encodeURIComponent(target);
}

/**
 * Amazon サイト内検索 URL + アソシエイトタグ。
 * 年付きで検索精度を上げる。
 */
export function amazonSearchUrl(title: string, year?: string | number): string {
  const q = year ? `${title} ${year}` : title;
  const url = new URL('https://www.amazon.co.jp/s');
  url.searchParams.set('k', q);
  url.searchParams.set('i', 'instant-video');
  if (AMAZON_TAG) url.searchParams.set('tag', AMAZON_TAG);
  return url.toString();
}

export const HAS_AFFILIATE = {
  amazon: Boolean(AMAZON_TAG),
  unext: Boolean(UNEXT_REDIRECT_PREFIX),
};

/**
 * 配信サービス名から、その作品を開くリンクを組み立てる。
 * 各社とも「この作品の再生ページ」への公開 deep link は無いので、サービス内検索へ送る。
 * U-NEXT / Amazon は既存のアフィリエイト経路に載せる。
 * 未知のサービスは TMDB(JustWatch) の配信案内ページへ逃がす。
 */
export function providerUrl(
  providerName: string,
  title: string,
  year: string | undefined,
  fallbackLink: string | null,
): string | null {
  const n = providerName.toLowerCase();
  if (n.includes('u-next') || n.includes('unext')) return unextSearchUrl(title);
  if (n.includes('amazon')) return amazonSearchUrl(title, year);
  if (n.includes('netflix')) return `https://www.netflix.com/search?q=${encodeURIComponent(title)}`;
  if (n.includes('disney')) return `https://www.disneyplus.com/ja-jp/search?q=${encodeURIComponent(title)}`;
  if (n.includes('hulu')) return `https://www.hulu.jp/search?q=${encodeURIComponent(title)}`;
  return fallbackLink;
}
