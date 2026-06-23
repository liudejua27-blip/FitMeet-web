import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');
const AGENT_WORKSPACE_CHUNK_BUDGET_BYTES = 500 * 1024;
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

try {
  const info = await stat(assetsDir);
  if (!info.isDirectory()) throw new Error('dist/assets is not a directory');
} catch {
  console.error('[check:prod-build] dist/assets directory is missing. Run pnpm build first.');
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

const assetEntries = await readdir(assetsDir, { withFileTypes: true });
const jsAssets = assetEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name);
const agentWorkspaceChunks = jsAssets.filter((name) => /^AgentWorkspacePage-.+\.js$/.test(name));
const assistantShellChunks = jsAssets.filter((name) => /^FitMeetAssistantUI-.+\.js$/.test(name));
const toolFallbackChunks = jsAssets.filter((name) => /^tool-fallback-.+\.js$/.test(name));
const requiredToolUiChunks = [
  {
    label: 'candidate Tool UI',
    pattern: /^tool-candidate-card-.+\.js$/,
  },
  {
    label: 'activity Tool UI',
    pattern: /^tool-activity-card-.+\.js$/,
  },
  {
    label: 'personal profile update Tool UI',
    pattern: /^tool-personal-profile-update-card-.+\.js$/,
  },
  {
    label: 'Meet Loop Tool UI',
    pattern: /^tool-meet-loop-card-.+\.js$/,
  },
  {
    label: 'safety approval Tool UI',
    pattern: /^tool-safety-card-.+\.js$/,
  },
];
const agentMockChunks = jsAssets.filter((name) => /^mockAgentAdapter-.+\.js$/.test(name));
const internalDemoChunks = jsAssets.filter((name) =>
  /^(DemoAgentSocialLoopPage|DemoInvestorPage)-.+\.js$/.test(name),
);

if (agentWorkspaceChunks.length === 0) {
  matches.push('missing AgentWorkspacePage production chunk');
}

if (toolFallbackChunks.length === 0) {
  matches.push('missing split tool-fallback production chunk for assistant-ui Tool UI');
}

for (const chunk of requiredToolUiChunks) {
  if (!jsAssets.some((name) => chunk.pattern.test(name))) {
    matches.push(`missing lazy production chunk for ${chunk.label}`);
  }
}

if (assistantShellChunks.length === 0) {
  matches.push('missing split FitMeetAssistantUI production chunk for assistant-ui shell');
}

if (agentMockChunks.length > 0) {
  matches.push(
    `production build contains mock Agent adapter chunks: ${agentMockChunks.join(', ')}`,
  );
}

if (internalDemoChunks.length > 0) {
  matches.push(
    `production build contains internal demo chunks: ${internalDemoChunks.join(', ')}`,
  );
}

for (const chunkName of agentWorkspaceChunks) {
  const info = await stat(path.join(assetsDir, chunkName));
  if (info.size >= AGENT_WORKSPACE_CHUNK_BUDGET_BYTES) {
    matches.push(
      `${chunkName} is ${info.size} bytes; expected < ${AGENT_WORKSPACE_CHUNK_BUDGET_BYTES} bytes. Keep assistant-ui Tool UI lazy-loaded.`,
    );
  }
}

const forbiddenAgentMockMarkers = [
  'VITE_AGENT_MOCK_FLOW',
  'mockAgentAdapter',
  'createMockAgentAdapter',
  'mock-candidate',
  'mock-opportunity',
  'mock-thread-checkpoint',
  'DemoAgentSocialLoopPage',
  'DemoInvestorPage',
];

for (const file of await collectFiles(distDir)) {
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const marker of forbiddenAgentMockMarkers) {
    if (content.includes(marker)) {
      matches.push(
        `${path.relative(distDir, file)} contains production-forbidden Agent mock marker ${marker}`,
      );
    }
  }
}

if (matches.length > 0) {
  console.error('[check:prod-build] Production build checks failed:');
  for (const match of matches) console.error(`- ${match}`);
  process.exit(1);
}

console.log(
  '[check:prod-build] OK: no forbidden production API origins, Agent mock chunks, or internal demo chunks found; Agent workspace chunk budget is respected, and assistant-ui shell / Tool UI are split into lazy product chunks.',
);
