/**
 * ビルド後に dist/sitemap.xml を生成する。
 * VITE_SITE_URL 環境変数（または .env.local）からドメインを読む。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local を手動パース（dotenv を増やさないため）
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  return Object.fromEntries(
    lines
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.split('=').map(s => s.trim()))
      .filter(([k]) => k),
  );
}

const env = { ...loadEnv(), ...process.env };
const SITE_URL = (env.VITE_SITE_URL ?? 'https://mood-cinema.example.com').replace(/\/$/, '');

const TODAY = new Date().toISOString().slice(0, 10);

const CORE_PATHS = ['/', '/hako', '/gyaku', '/about', '/privacy', '/contact'];

const urls = [];
for (const p of CORE_PATHS) {
  urls.push({ loc: `${SITE_URL}${p}`, priority: p === '/' ? '1.0' : '0.8' });
  urls.push({ loc: `${SITE_URL}/en${p === '/' ? '/' : p}`, priority: '0.6' });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

const out = path.resolve(__dirname, '../dist/sitemap.xml');
fs.writeFileSync(out, xml);
console.log(`✓ sitemap.xml generated → ${SITE_URL} (${urls.length} URLs)`);
