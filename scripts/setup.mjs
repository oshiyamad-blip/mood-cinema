/**
 * npm run setup — .env.local を初期化する
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../.env.local.example');
const dest = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(dest)) {
  console.log('✓ .env.local はすでに存在します。上書きしません。');
} else {
  fs.copyFileSync(src, dest);
  console.log('✓ .env.local を作成しました。');
}

console.log('\n次のステップ:');
console.log('  1. .env.local を開く');
console.log('  2. VITE_TMDB_TOKEN= の後に TMDB API トークンを貼り付ける');
console.log('  3. npm run dev で動作確認');
console.log('\nTMDB トークン取得先: https://www.themoviedb.org/settings/api');
