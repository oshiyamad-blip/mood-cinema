// 通しの動作確認：取り込み → 人物 → 総スケ → 日々スケ → 配布 → 閲覧ページで確認 → 差し替えて再配布。
// デモの状態（Supabase 未設定）で動かす。
//   npm run build && npx vite preview --port 4173 &
//   PW=playwright CHROMIUM=/path/to/chromium node e2e/flow.mjs /tmp/koban-shots
import fs from 'node:fs';
const { chromium } = await import(process.env.PW ?? 'playwright');
const BASE = process.env.BASE ?? 'http://localhost:4173';
const SHOTS = process.argv[2] ?? '/tmp/koban-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const csv = fs.readFileSync(new URL('../public/koban-template.csv', import.meta.url), 'utf8').replace(/^﻿/, '');
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const step = (s) => console.log('STEP', s);

await page.goto(BASE);
step('home');
await page.getByRole('button', { name: '最初の作品を作る' }).click();
await page.getByLabel('題名').fill('テスト作品 第1話');
await page.getByRole('button', { name: /香盤表（Excel/ }).click();
step('import');
await page.getByLabel('香盤表の貼り付け').fill(csv);
await page.getByRole('button', { name: '貼り付けた表を読む' }).click();
await page.getByText('取り込みの確認').waitFor();
await shot('01-import');
await page.getByRole('button', { name: '反映する' }).click();
step('koban');
await page.waitForURL(/\/koban$/);
await shot('02-koban');

step('assets: staff');
await page.getByRole('link', { name: '人物・ロケ地' }).click();
await page.getByRole('button', { name: 'スタッフを足す' }).click();
const nameInputs = page.getByRole('textbox', { name: '名前', exact: true });
await nameInputs.last().fill('山田 制作');
await nameInputs.last().press('Enter');
await page.getByLabel('山田 制作 の部署').fill('制作');
await page.getByLabel('山田 制作 の部署').blur();
await page.getByLabel('山田 制作 の電話', { exact: true }).fill('090-1111-2222');
await page.getByLabel('山田 制作 の電話', { exact: true }).press('Enter');
await page.getByLabel('山田 制作 を連絡先に載せる').check();
await page.getByLabel('田中 の NG 日を足す').fill('2026-10-21');
await shot('03-assets');

step('schedule');
await page.getByRole('link', { name: /総スケ/ }).click();
await page.getByRole('button', { name: '最初の撮影日を作る' }).click();
const dateInput = page.locator('input[type=date]').first();
await dateInput.fill('2026-10-20');
for (const no of ['1', '2', '4']) await page.getByLabel(`S#${no} を選ぶ`).check();
await page.getByLabel('入れる撮影日').selectOption({ index: 1 });
await page.getByRole('button', { name: /選んだ3件を入れる/ }).click();
await page.getByRole('button', { name: '撮影日を足す' }).click();
await page.getByRole('button', { name: '＋昼食' }).first().click();
await shot('04-schedule');

step('day');
await page.getByRole('link', { name: '日々スケ', exact: true }).first().click();
await page.getByLabel('食事').fill('昼 12:30 ロケ弁');
await page.getByLabel('食事').blur();
await shot('05-day');

step('share');
await page.getByRole('link', { name: '配布へ' }).click();
await page.getByRole('button', { name: '配る', exact: true }).click();
await page.getByText('確認の状況（第1版）').waitFor();
await shot('06-share');
const tanakaRow = page.locator('tr', { hasText: '田中' }).first();
const href = await tanakaRow.getByRole('link', { name: '開く' }).getAttribute('href');
console.log('VIEW URL', href);

step('viewer');
const v = await ctx.newPage();
v.on('pageerror', (e) => errors.push('viewer: ' + e));
await v.setViewportSize({ width: 390, height: 844 });
await v.goto(href);
await v.getByText('田中さん', { exact: true }).waitFor();
await v.screenshot({ path: `${SHOTS}/07-viewer.png`, fullPage: true });
const body = await v.textContent('body');
if (body.includes('090-1111-2222')) errors.push('電話番号が閲覧ページに出ている');
await v.getByRole('button', { name: '確認しました' }).click();
await v.getByText('第1版を確認しました').waitFor();

step('ack visible');
await page.getByRole('button', { name: '更新' }).click();
await page.locator('tr', { hasText: '田中' }).getByText('確認済み').waitFor();

step('change and republish');
await page.getByRole('link', { name: /総スケ/ }).click();
await page.getByRole('button', { name: '下へ' }).first().click();
await page.getByRole('link', { name: '配布と確認' }).click();
await page.getByText(/第2版として配り直す/).waitFor();
await shot('08-redistribute');
await page.getByRole('button', { name: '新しい版を配る' }).click();
await page.getByText('確認の状況（第2版）').waitFor();
await page.locator('tr', { hasText: '田中' }).getByText('前の版で止まっている').waitFor();
await shot('09-resend');

step('viewer v2');
await v.reload();
await v.getByText('前の版から変わったこと').waitFor();
await v.screenshot({ path: `${SHOTS}/10-viewer-v2.png`, fullPage: true });

step('reload persistence');
await page.reload();
await page.getByText('確認の状況（第2版）').waitFor();

await browser.close();
if (errors.length > 0) {
  console.error('ERRORS', JSON.stringify(errors));
  process.exit(1);
}
console.log('ok');
