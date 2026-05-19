import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const forbidden = [
  'https://ourfitmeet.cn/api',
  'https://www.ourfitmeet.cn/api',
  'localhost:3000/api',
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

try {
  const info = await stat(distDir);
  if (!info.isDirectory()) throw new Error('dist is not a directory');
} catch {
  console.error('[check:prod-build] dist directory is missing. Run pnpm build first.');
  process.exit(1);
}

const matches = [];
for (const file of await collectFiles(distDir)) {
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const value of forbidden) {
    if (content.includes(value)) {
      matches.push(`${path.relative(distDir, file)} contains ${value}`);
    }
  }
}

if (matches.length > 0) {
  console.error('[check:prod-build] Forbidden production API origins found:');
  for (const match of matches) console.error(`- ${match}`);
  process.exit(1);
}

console.log('[check:prod-build] OK: no forbidden production API origins found in dist.');
