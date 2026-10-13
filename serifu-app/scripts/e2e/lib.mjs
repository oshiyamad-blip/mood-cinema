// 総合E2Eの共通部品：GitHub Pages と同じ /mood-cinema/ 配下で build/web を配信し、
// Flutter のセマンティクス（アクセシビリティ）ツリー経由でアプリを操作する。
// canvaskit・フォントは CDN ではなくビルド同梱物を返す（オフライン/制限環境でも動く）。
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
export const WEB = new URL('../../build/web', import.meta.url).pathname;
export const SHOTS = new URL('./shots/', import.meta.url).pathname;
const MIME = {'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.otf':'font/otf','.symbols':'text/plain'};
export async function startServer() {
  const s = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/mood-cinema/, '');
      if (p === '' || p === '/') p = '/index.html';
      const b = await readFile(join(WEB, p));
      res.setHeader('Content-Type', MIME[extname(p)] ?? 'application/octet-stream');
      res.end(b);
    } catch { res.statusCode = 404; res.end('nf'); }
  });
  await new Promise(r => s.listen(0, r));
  return {server: s, url: `http://localhost:${s.address().port}/mood-cinema/`};
}
export async function newPage(browser, opts = {}, init = []) {
  const ctx = await browser.newContext({locale: 'ja-JP', viewport: {width: 430, height: 932}, acceptDownloads: true, ...opts});
  for (const i of init) await ctx.addInitScript(i);
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push(String(e).split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error' && !/gstatic|Failed to load resource/.test(m.text())) page._errors.push('console: ' + m.text().slice(0, 200)); });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('/flutter-canvaskit/')) {
      const n = u.split('/').pop().split('?')[0];
      try { return route.fulfill({body: await readFile(join(WEB, 'canvaskit', n)), contentType: n.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'}); } catch {}
    }
    if (u.includes('gstatic.com') || u.includes('googleapis.com')) return route.abort();
    return route.continue();
  });
  return {ctx, page};
}
export async function boot(page, url) {
  await page.goto(url, {waitUntil: 'load'});
  await page.waitForFunction(() => document.querySelector('flt-glass-pane, flutter-view'), null, {timeout: 30000});
  await page.waitForTimeout(6000);
  await sem(page);
}
export async function sem(page) {
  // 有効化済みならプレースホルダは無い（待たずに素通り）。
  try { const h = await page.$('flt-semantics-placeholder'); if (h) await h.evaluate(el => el.click()); } catch {}
  await page.waitForTimeout(250);
}
/** セマンティクスノード一覧（role / label / 位置） */
export async function nodes(page) {
  return page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    const label = e.getAttribute('aria-label') || (e.textContent || '');
    return {role: e.getAttribute('role') || '', label: label.trim().slice(0, 300), area: Math.round(r.width * r.height), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), checked: e.getAttribute('aria-checked') ?? e.getAttribute('aria-selected') ?? '', disabled: e.getAttribute('aria-disabled') ?? ''};
  }).filter(n => n.label || n.role));
}
/** ラベル一致のノードを座標タップ（role問わず）。見つからなければ例外。 */
export async function tap(page, re, {nth = 0, wait = 1200} = {}) {
  const rx = re instanceof RegExp ? re : new RegExp(re);
  for (let i = 0; i < 20; i++) {
    const ns = (await nodes(page)).filter(n => rx.test(n.label) && n.w > 0 && n.h > 0);
    if (ns.length > nth) { ns.sort((a, b) => a.area - b.area); const n = ns[nth]; await page.mouse.click(n.x, n.y); await page.waitForTimeout(wait); await sem(page); return n; }
    await page.waitForTimeout(300);
  }
  throw new Error('tap: not found ' + rx);
}
export async function has(page, re) { const rx = re instanceof RegExp ? re : new RegExp(re); return (await nodes(page)).some(n => rx.test(n.label)); }
export async function shot(page, name) { await page.screenshot({path: SHOTS + name}); }
export async function launch() { return chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined}); }
