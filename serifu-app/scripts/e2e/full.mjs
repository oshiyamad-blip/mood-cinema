// 総合E2E：本番（GitHub Pages）と同じ /mood-cinema/ 配下のリリースビルドを実ブラウザで操作する。
// 使い方は README.md。結果は PASS/FAIL で出力し、主要画面のスクショを shots/ に残す。
import {startServer, launch, newPage, boot, nodes, tap, has, shot, sem} from './lib.mjs';
import {readFileSync, mkdirSync} from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const FX = HERE + 'fixtures/';
const hook = {path: HERE + 'speechhook.js'};
const SP = HERE; // 書き出しの保存先（downloads/）
const results = [];
const check = (name, ok, detail = '') => { results.push({name, ok, detail}); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
let __pg = null;
async function step(name, fn) { try { await fn(); } catch (e) { check(name, false, 'exception: ' + e.message.split('\n')[0]);
  if (__pg) { try { await shot(__pg, 'fail-' + name.replace(/[^\w぀-ヿ一-鿿]/g, '_').slice(0, 30) + '.png'); console.log('   screen:', JSON.stringify((await nodes(__pg)).filter(n => n.role === 'button').map(n => n.label.slice(0, 25)))); } catch {} } } }
const scripts = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('honyomi:scripts.json') || '[]'));
const dlg = (s) => s.lines.filter(l => l.type === 'dialogue');
async function importFile(page, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), tap(page, /^台本を取り込む/)]);
  await fc.setFiles(file);
  await page.waitForTimeout(3500); await sem(page);
}
async function backHome(page) { for (let i = 0; i < 4 && !(await has(page, /^台本を取り込む/)); i++) { try { await tap(page, /^戻る$|^Back$/); } catch { break; } } }

const {server, url} = await startServer();
const br = await launch();
mkdirSync(SP + 'downloads', {recursive: true});

// ---------- A. 起動（変則ロケール含む） ----------
for (const [label, langs] of [['C.UTF-8', ['C.UTF-8']], ['空', ['']], ['en_US.UTF-8@posix', ['en_US.UTF-8@posix']]]) {
  await step('起動: navigator.languages=' + label, async () => {
    const fake = `Object.defineProperty(navigator,'languages',{get:()=>${JSON.stringify(langs)},configurable:true});Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(langs[0])},configurable:true});`;
    const {ctx, page} = await newPage(br, {}, [fake]);
    await boot(page, url);
    check('起動: navigator.languages=' + label, await has(page, /^練習する/), page._errors.join(' | '));
    await ctx.close();
  });
}
await step('起動: PC幅（1280×800）', async () => {
  const {ctx, page} = await newPage(br, {viewport: {width: 1280, height: 800}});
  await boot(page, url); await shot(page, 'full-desktop-home.png');
  check('起動: PC幅（1280×800）', await has(page, /^台本を取り込む/), page._errors.join(' | '));
  await ctx.close();
});

// ---------- 以降は1つのブラウザセッションで通しで使う ----------
const {ctx, page} = await newPage(br, {}, [hook]); __pg = page;
await page.addInitScript(() => { window.__ttsMs = 400; window.__ttsPerChar = 30; });
await boot(page, url);

// ---------- B. サンプルで練習（速度・一時停止/再開・結果・記録） ----------
await step('練習: サンプル', async () => {
  await page.evaluate(() => { window.__ttsMs = 1500; window.__ttsPerChar = 40; });
  await tap(page, /^練習する/);
  await tap(page, /^ミナ$/);
  await tap(page, /^練習開始$/, {wait: 400});
  // 冒頭のト書き（読み上げ中）で一時停止→すぐ再生
  await tap(page, /^一時停止$/, {wait: 300});
  const pausedOk = await has(page, /^再生$/);
  await tap(page, /^再生$/, {wait: 300});
  check('練習: 読み上げ中に一時停止→再生できる', pausedOk);
  await page.evaluate(() => { window.__ttsMs = 300; window.__ttsPerChar = 15; });
  check('戻るボタンが日本語', await has(page, /^戻る$/));
  const t0 = Date.now(); let presses = 0; let maskChecked = false;
  while (Date.now() - t0 < 120000 && !(await has(page, /もう一度練習する/))) {
    const nx = (await nodes(page)).find(n => /^言えた・次へ$/.test(n.label) && n.disabled !== 'true');
    if (nx) {
      if (!maskChecked) { // 自分の番で伏せ字表示を確認
        await tap(page, /^伏せ字$/); maskChecked = true;
        check('表示: 伏せ字で自分のセリフが●になる', (await nodes(page)).some(n => /●{3,}/.test(n.label)));
        await shot(page, 'full-mask.png'); await tap(page, /^台本$/);
        continue;
      }
      await page.mouse.click(nx.x, nx.y); presses++;
    }
    await page.waitForTimeout(300);
  }
  check('練習: 最後まで進みリザルトに到達', await has(page, /もう一度練習する/), `言えた×${presses}`);
  const tts = await page.evaluate(() => window.__tts.map(u => ({text: u.text, rate: u.rate, pitch: u.pitch})));
  const overlap = await page.evaluate(() => window.__overlap);
  const rates = [...new Set(tts.map(u => Math.round(u.rate * 100) / 100))];
  check('Web読み上げ速度が設定どおり（1.7倍）', rates.length > 0 && rates.every(r => r === 1.7), 'rates=' + rates.join(','));
  check('男女で同じ声しか無い環境は声の高さで演じ分け', tts.every(u => Math.abs(u.pitch - 1) > 0.01), 'pitches=' + [...new Set(tts.map(u => u.pitch.toFixed(2)))].join(','));
  check('一時停止→再生で発話が重ならない（二重ループなし）', overlap.length === 0, overlap.join(' / '));
  const partner = ['いや、今来たとこ', '変わらないね', '褒めてるよ', 'えっ。', 'そっか'];
  const order = partner.map(p => tts.findIndex(u => u.text.startsWith(p)));
  check('相手のセリフを飛ばさず順番どおりに読む', order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), 'idx=' + order.join(','));
  const counts = {}; tts.forEach(u => counts[u.text] = (counts[u.text] || 0) + 1);
  check('同じ行を3回以上読まない', Object.values(counts).every(c => c <= 2), JSON.stringify(Object.entries(counts).filter(([, c]) => c > 1)));
  await shot(page, 'full-result.png');
  await tap(page, /^台本に戻る$/, {wait: 1200});
  check('台本詳細の「練習の記録」が練習直後に更新', await has(page, /練習の記録/));
  await backHome(page);
});

// ---------- C. 取り込み（TXT / Shift_JIS / Word / PDF / 画像PDF） ----------
for (const [label, file, title] of [['TXT(UTF-8)', 'ame.txt', 'ame'], ['TXT(Shift_JIS)', 'yudachi_sjis.txt', 'yudachi_sjis'], ['Word(.docx)', 'ame.docx', 'ame'], ['PDF(テキスト)', 'ame.pdf', 'ame']]) {
  await step('取り込み: ' + label, async () => {
    const before = (await scripts(page)).length;
    await importFile(page, FX + file);
    const onEdit = await has(page, /解析結果の確認・修正|確認完了/);
    await shot(page, `full-import-${file}.png`);
    if (onEdit) await tap(page, /確認完了/, {wait: 1500});
    const all = await scripts(page);
    const s = all[0];
    const d = s ? dlg(s) : [];
    const joined = d.find(l => l.text.startsWith('数えてたの'));
    check('取り込み: ' + label, all.length === before + 1 && s.characters.includes('ハルカ') && s.characters.includes('ケンタ') && d.length === 8 && !!joined,
      `件数${before}→${all.length} 役=${s?.characters} セリフ=${d.length} 折返し=${joined?.text}` + (label.includes('Shift') ? ` 先頭=${s?.lines?.[0]?.text}` : ''));
    await backHome(page);
  });
}
await step('取り込み: 画像PDF（Webは不可の案内）', async () => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), tap(page, /^台本を取り込む/, {wait: 200})]);
  await fc.setFiles(FX + 'image_only.pdf');
  let shown = false; for (let i = 0; i < 12 && !shown; i++) { await page.waitForTimeout(400); await sem(page); shown = await has(page, /Web版では取り込めません/); }
  check('取り込み: 画像PDF（Webは不可の案内）', shown);
  await page.waitForTimeout(4500);
});

// ---------- D. 永続化（再読み込み） ----------
await step('保存: 再読み込み後も台本が残る', async () => {
  const n = (await scripts(page)).length;
  await boot(page, url);
  check('保存: 再読み込み後も台本が残る', (await scripts(page)).length === n && await has(page, /件の台本/), `${n}件`);
});

// ---------- E. 書き出し → 取り込み（Webバックアップ） ----------
await step('バックアップ: 書き出し→取り込み', async () => {
  const n = (await scripts(page)).length;
  await tap(page, /^ame/, {wait: 1500});
  const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 10000}), tap(page, /台本を書き出す/)]);
  const name = dl.suggestedFilename(); const saved = SP + 'downloads/' + name; await dl.saveAs(saved);
  const json = JSON.parse(readFileSync(saved, 'utf8'));
  check('バックアップ: Webで書き出せる（.honyomi.json）', name.endsWith('.honyomi.json') && json.format === 'honyomi-script', name);
  await backHome(page);
  await importFile(page, saved);
  await backHome(page);
  check('バックアップ後にホームへ戻れる', await has(page, /^台本を取り込む/));
  check('バックアップ: 書き出したファイルを取り込める', (await scripts(page)).length === n + 1);
});

// ---------- F. 削除（確認つき） ----------
await step('削除: 確認ダイアログ', async () => {
  const n = (await scripts(page)).length;
  // 一覧の一番上のカードの削除ボタン（通知が消えてから押す）
  await page.waitForTimeout(4500); await sem(page);
  const del = async () => { const b = (await nodes(page)).filter(x => x.label === '台本を削除').sort((a, c) => a.y - c.y)[0]; await page.mouse.click(b.x, b.y); await page.waitForTimeout(1200); await sem(page); };
  await del();
  check('削除: 確認ダイアログが出る', await has(page, /台本を削除しますか/));
  await tap(page, /^キャンセル$/);
  check('削除: キャンセルで残る', (await scripts(page)).length === n);
  await del(); await tap(page, /^削除する$/);
  check('削除: 確認後に消える', (await scripts(page)).length === n - 1);
});

// ---------- G. 設定・ヘルプ・ライセンス ----------
await step('設定画面', async () => {
  await tap(page, /^設定$/);
  await shot(page, 'full-settings.png');
  const labels = (await nodes(page)).map(n => n.label).join('\n');
  check('設定: Webで効かない項目を出さない', !/自分の番を自動で録音する|高精度認識を使う/.test(labels));
  await page.mouse.wheel(0, 3000); await page.waitForTimeout(600); await sem(page);
  await tap(page, /ヘルプ・お問い合わせ/);
  check('ヘルプ画面が開く', await has(page, /よくある質問/));
  await tap(page, /^戻る$/);
  await page.mouse.wheel(0, 3000); await page.waitForTimeout(600); await sem(page);
  await tap(page, /オープンソースライセンス/, {wait: 3000});
  let lic = false; for (let i = 0; i < 4 && !lic; i++) { lic = await has(page, /charset/); if (!lic) { await page.mouse.wheel(0, 800); await page.waitForTimeout(600); await sem(page); } }
  check('OSSライセンス（日本語表示）に charset が載る', lic && await has(page, /ライセンス: \d+ 件/));
  await backHome(page);
});

// ---------- H. ハンズフリー（Web・マイク無し環境） ----------
await step('ハンズフリー（マイク不可環境）', async () => {
  await tap(page, /^練習(する|をつづける)/);
  if (!(await has(page, /^練習開始$/))) await tap(page, /^(ミナ|ハルカ)$/);
  await tap(page, /^練習開始$/, {wait: 2500});
  await tap(page, /ハンズフリー: OFF/);
  if (await has(page, /同意して使う/)) await tap(page, /同意して使う/);
  // 理由の通知（マイクがブロック／音声認識に非対応）が出るまで待つ。通知は数秒で消えるので逐次確認する。
  let msg = '';
  for (let i = 0; i < 40 && !msg; i++) { await page.waitForTimeout(500); await sem(page);
    const m = (await nodes(page)).map(n => n.label).join('\n').match(/(マイクがブロック[^\n]{0,40}|このブラウザは音声認識[^\n]{0,40})/); if (m) msg = m[1]; }
  await shot(page, 'full-handsfree.png');
  const labels = (await nodes(page)).map(n => n.label).join('\n');
  check('ハンズフリー: マイク不可なら理由を表示', !!msg, msg);
  check('ハンズフリー: 手動進行に戻る（OFF表示）', /ハンズフリー: OFF/.test(labels));
});

check('全体: 実行時エラーなし', page._errors.length === 0, page._errors.slice(0, 5).join(' | '));
const fails = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - fails.length}/${results.length} PASS ====`);
await br.close(); server.close();
process.exitCode = fails.length ? 1 : 0;
