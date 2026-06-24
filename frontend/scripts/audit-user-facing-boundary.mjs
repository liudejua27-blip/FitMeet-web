import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['src/pages', 'src/components', 'src/lib'];
const forbiddenTerms = [
  'subagent',
  'Life Graph Agent',
  'Match Agent',
  'planner',
  'traceId',
  'handoff',
  'raw JSON',
  'rawJson',
  'rawJSON',
];

const allowedSourcePatterns = [
  /src\/pages\/AgentL5AdminPage\.tsx$/,
  /src\/api\/agentL5RuntimeApi\.ts$/,
  /src\/api\/fitmeetCoreContract\.ts$/,
  /src\/components\/assistant-ui\/public-process-text\.ts$/,
  /src\/components\/assistant-ui\/tool-process-model\.ts$/,
  /src\/components\/assistant-ui\/tool-ui-schema\.ts$/,
  /src\/components\/assistant-ui\/tool-safety-card\.tsx$/,
  /src\/components\/agent-workspace\/agentWorkspaceRuntime\.ts$/,
  /src\/components\/agent-workspace\/api\/realAgentAdapter\.ts$/,
  /src\/components\/agent-workspace\/useAgentFeedbackRuntime\.ts$/,
  /src\/components\/agent-workspace\/useAgentFinalResultRuntime\.ts$/,
  /src\/components\/agent-workspace\/agentAssistantMessageReducer\.ts$/,
  /src\/components\/agent-workspace\/FitMeetAssistantUI\.types\.ts$/,
  /src\/components\/RealtimeProvider\.tsx$/,
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
      if (content.includes(term)) {
        failures.push(`${relative} exposes internal term ${term}`);
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
    for (const term of ['Life Graph Agent', 'Match Agent', 'raw JSON']) {
      if (content.includes(term)) {
        failures.push(`dist/${relative} exposes internal term ${term}`);
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
