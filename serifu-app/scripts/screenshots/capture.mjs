// ストア用スクリーンショットの自動生成。
//
// Web版（build/web）を起動し、主要画面をスマホ寸法で撮影する。
// 実機/エミュレータを用意せずに、現行UIの高解像度キャプチャを再現可能に得る。
// 撮った画像は design ツールでキャッチコピーを載せて仕上げる（docs/10 参照）。
//
// 使い方（serifu-app/ で）:
//   flutter build web --release
//   node scripts/screenshots/capture.mjs
//   → scripts/screenshots/out/*.png
//
// 前提: Playwright と Chromium が使える環境（本リポジトリのCI/開発環境に同梱）。
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '../../build/web');
const outDir = join(__dirname, 'out');
const PORT = 8788;

// App Store 6.7"/6.9"（1290×2796）に合う論理寸法×3。Playは同画像を縮小可。
const VIEWPORT = {width: 430, height: 932};
const SCALE = 3;

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.symbols': 'text/plain',
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(req.url.split('?')[0]);
      if (path === '/') path = '/index.html';
      const file = join(webRoot, path);
      const body = await readFile(file);
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      // canvaskit(wasm)の実行に必要なクロスオリジン分離ヘッダ。
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/** Flutterのセマンティクスを有効化（キャンバスUIをrole/nameで操作できるようにする）。 */
async function enableSemantics(page) {
  try {
    await page.locator('flt-semantics-placeholder').evaluate((el) => el.click());
    await page.waitForTimeout(500);
  } catch {
    /* すでに有効・要素なしでも続行 */
  }
}

async function shot(page, name) {
  await page.waitForTimeout(1200); // アニメーション落ち着き待ち
  await page.screenshot({path: join(outDir, name)});
  console.log('captured', name);
}

/** 見えているボタンを名前で best-effort タップ（無ければ false）。 */
async function tap(page, name) {
  try {
    const btn = page.getByRole('button', {name}).first();
    await btn.waitFor({state: 'visible', timeout: 4000});
    await btn.click();
    await page.waitForTimeout(1500);
    return true;
  } catch {
    console.warn('  (skip) ボタンが見つかりません:', name);
    return false;
  }
}

/** ボタン以外（チップ等）をテキストで best-effort タップ。 */
async function tapText(page, text) {
  try {
    const el = page.getByText(text, {exact: true}).first();
    await el.waitFor({state: 'visible', timeout: 4000});
    await el.click();
    await page.waitForTimeout(1500);
    return true;
  } catch {
    console.warn('  (skip) テキストが見つかりません:', text);
    return false;
  }
}

async function main() {
  if (!existsSync(join(webRoot, 'index.html'))) {
    console.error('build/web が見つかりません。先に `flutter build web --release` を実行してください。');
    process.exit(2);
  }
  await mkdir(outDir, {recursive: true});
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
  });

  // Flutter web は canvaskit を gstatic CDN から取得しようとする。オフライン/
  // 制限環境では失敗して真っ白になるため、ビルドに同梱された canvaskit を返す。
  // フォントはアプリが NotoSansJP を同梱しているため、CDNのフォントは使わない。
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/flutter-canvaskit/')) {
      const name = url.split('/').pop().split('?')[0]; // canvaskit.js / canvaskit.wasm
      const local = join(webRoot, 'canvaskit', name);
      if (existsSync(local)) {
        const body = await readFile(local);
        return route.fulfill({
          body,
          contentType: name.endsWith('.wasm')
              ? 'application/wasm'
              : 'text/javascript',
        });
      }
    }
    if (url.includes('fonts.gstatic.com') || url.includes('fonts.googleapis.com')) {
      return route.abort(); // 同梱フォントを使うため不要
    }
    return route.continue();
  });

  try {
    const boot = async () => {
      // Flutter web の初回ブートを待ち、セマンティクスを有効化する。
      await page.waitForTimeout(12000);
      await enableSemantics(page);
    };

    await page.goto(`http://localhost:${PORT}/`, {waitUntil: 'load'});
    await boot();

    // 1) ホーム（2択の入口）。
    await shot(page, '01-home.png');

    // 2) 設定（声・テンポ・データの取り扱い）。
    if (await tap(page, '設定')) {
      await enableSemantics(page);
      await shot(page, '02-settings.png');
    }

    // ホームへ戻す（戻るボタン名に依存せず再読込）。
    await page.goto(`http://localhost:${PORT}/`, {waitUntil: 'load'});
    await boot();

    // 3) サンプル台本の準備画面（役選択・声設定）。
    if (await tap(page, '練習する')) {
      await enableSemantics(page);
      await shot(page, '03-setup.png');

      // 4) 役を選んで練習画面へ（現在行ハイライト＝主役機能）。
      //    役チップはボタンroleで出ないことがあるためテキストでもタップを試みる。
      if (!(await tap(page, 'ミナ'))) await tapText(page, 'ミナ');
      await enableSemantics(page);
      if (await tap(page, '練習開始')) {
        await enableSemantics(page);
        await shot(page, '04-rehearsal.png');
      }
    }

    console.log('done. 出力:', outDir);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
