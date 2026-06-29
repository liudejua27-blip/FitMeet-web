#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const rootMarkdownAllowlist = new Set(['README.md', 'AGENTS.md']);
const allowedStatuses = new Set([
  'canonical',
  'runbook',
  'checklist',
  'design',
  'archive',
  'deprecated',
]);
const expectedPnpm = 'pnpm@10.30.3';

const failures = [];

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
  if (!rootMarkdownAllowlist.has(entry.name)) {
    failures.push(
      `root markdown ${entry.name} is not allowed; move it under docs/ or delete it`,
    );
  }
}

const docsIndexPath = join(root, 'docs', 'INDEX.md');
if (!existsSync(docsIndexPath)) {
  failures.push('docs/INDEX.md is required');
} else {
  const index = readFileSync(docsIndexPath, 'utf8');
  for (const status of ['canonical', 'runbook', 'checklist', 'design', 'archive', 'deprecated']) {
    if (!allowedStatuses.has(status)) {
      failures.push(`unknown docs status ${status}`);
    }
  }
  for (const required of [
    'architecture/core.md',
    'architecture/data-model.md',
    'architecture/deprecation-register.md',
    'deployment/index.md',
    'agent/runtime.md',
    'agent/release-gates.md',
    'operations/performance-readiness.md',
  ]) {
    if (!index.includes(required)) {
      failures.push(`docs/INDEX.md must include ${required}`);
    }
  }
}

for (const packagePath of ['backend/package.json', 'frontend/package.json']) {
  const fullPath = join(root, packagePath);
  if (!existsSync(fullPath)) {
    failures.push(`${packagePath} is missing`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(fullPath, 'utf8'));
  if (pkg.packageManager !== expectedPnpm) {
    failures.push(
      `${packagePath} packageManager must be ${expectedPnpm}; found ${pkg.packageManager ?? 'unset'}`,
    );
  }
}

const workflowFiles = [
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-package.yml',
];
for (const workflow of workflowFiles) {
  const fullPath = join(root, workflow);
  if (!existsSync(fullPath)) continue;
  const text = readFileSync(fullPath, 'utf8');
  if (text.includes('version: 10.23.0')) {
    failures.push(`${workflow} still pins pnpm 10.23.0; use 10.30.3`);
  }
}

for (const removed of [
  'QUICK_START.md',
  'SECURITY_CHECKLIST.md',
  'artillery-test.yml',
  'frontend/FRONTEND_ACCEPTANCE_CHECKLIST.md',
]) {
  if (existsSync(join(root, removed))) {
    failures.push(`${removed} should not exist in the production docs baseline`);
  }
}

if (failures.length > 0) {
  console.error('Docs governance check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Docs governance check passed.');
