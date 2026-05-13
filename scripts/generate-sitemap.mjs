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

// 記事スラッグ一覧（articles.ts と同期）
const ARTICLE_SLUGS = [
  'tearjerker-movies',
  'short-runtime-classics',
  'family-night',
  'date-night',
  'horror-night',
  'rainy-day-movies',
  'stress-relief-movies',
  'solo-night-movies',
  'weekend-movies',
  'why-use-quiz',
];

// 主要診断パターン
const RESULT_PATTERNS = [
  'mood=cry',
  'mood=laugh',
  'mood=excited',
  'mood=heal',
  'mood=think',
  'mood=scared',
  'mood=cry&with=solo&runtime=short',
  'mood=heal&with=family',
  'mood=think&with=solo',
  'mood=scared&with=friends',
];

function url(loc, { changefreq = 'monthly', priority = '0.7', lastmod } = {}) {
  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  return `  <url><loc>${loc}</loc>${lastmodTag}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

const entries = [
  url(`${SITE_URL}/`, { changefreq: 'weekly', priority: '1.0' }),
  url(`${SITE_URL}/quiz`, { changefreq: 'monthly', priority: '0.9' }),
  url(`${SITE_URL}/articles`, { changefreq: 'weekly', priority: '0.8' }),
  url(`${SITE_URL}/about`, { changefreq: 'yearly', priority: '0.3' }),
  url(`${SITE_URL}/privacy`, { changefreq: 'yearly', priority: '0.2' }),
  url(`${SITE_URL}/contact`, { changefreq: 'yearly', priority: '0.2' }),
  ...ARTICLE_SLUGS.map(slug =>
    url(`${SITE_URL}/article/${slug}`, { lastmod: TODAY, priority: '0.8' }),
  ),
  ...RESULT_PATTERNS.map(q =>
    url(`${SITE_URL}/result?${q.replace(/&/g, '&amp;')}`, { changefreq: 'weekly', priority: '0.6' }),
  ),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

const outPath = path.resolve(__dirname, '../dist/sitemap.xml');
fs.writeFileSync(outPath, xml);
console.log(`✓ sitemap.xml generated → ${SITE_URL} (${entries.length} URLs)`);
