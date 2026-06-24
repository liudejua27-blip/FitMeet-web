import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['src/pages', 'src/components', 'src/lib', 'src/api'];
const forbiddenTerms = [
  { label: 'subagent', pattern: /\bsubagent\b/i },
  { label: 'Life Graph Agent', pattern: /Life\s+Graph\s+Agent/i },
  { label: 'Match Agent', pattern: /Match\s+Agent/i },
  { label: 'planner', pattern: /\bplanner\b/i },
  { label: 'traceId', pattern: /\btraceId\b/ },
  { label: 'handoff', pattern: /\bhandoff\b/i },
  { label: 'raw JSON', pattern: /\braw\s+JSON\b/i },
  { label: 'rawJson', pattern: /\brawJson\b/ },
  { label: 'rawJSON', pattern: /\brawJSON\b/ },
];

const allowedSourcePatterns = [
  /src\/pages\/AgentL5AdminPage\.tsx$/,
  /src\/api\/agentL5RuntimeApi\.ts$/,
  /src\/api\/fitmeetCoreContract\.ts$/,
];

const allowedDistChunkPatterns = [
  /^AgentL5AdminPage-.+\.js$/,
  /^agentL5RuntimeApi-.+\.js$/,
];

const failures = [];

for (const sourceRoot of sourceRoots) {
  const dir = path.join(root, sourceRoot);
  for (const file of await collectFiles(dir)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
    const relative = slash(path.relative(root, file));
    if (allowedSourcePatterns.some((pattern) => pattern.test(relative))) continue;
    const content = await readFile(file, 'utf8');
    for (const term of forbiddenTerms) {
      if (term.pattern.test(content)) {
        failures.push(`${relative} exposes internal term ${term.label}`);
      }
    }
  }
}

const distDir = path.join(root, 'dist');
if (process.env.FITMEET_AUDIT_DIST !== '0' && (await exists(distDir))) {
  for (const file of await collectFiles(distDir)) {
    const relative = slash(path.relative(distDir, file));
    if (!/\.(html|js|css)$/.test(file)) continue;
    if (allowedDistChunkPatterns.some((pattern) => pattern.test(path.basename(file)))) continue;
    const content = await readFile(file, 'utf8').catch(() => '');
    for (const term of forbiddenTerms) {
      if (term.pattern.test(content)) {
        failures.push(`dist/${relative} exposes internal term ${term.label}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('[user-facing-boundary] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[user-facing-boundary] OK: ordinary user-facing files and production assets do not expose internal Agent concepts.');

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(fullPath)));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

function slash(value) {
  return value.split(path.sep).join('/');
}
