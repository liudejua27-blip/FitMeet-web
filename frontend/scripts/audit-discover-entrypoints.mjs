import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const forbiddenRoutes = [
  '/social-request/new',
  '/social-request/ai',
  '/social-request/',
  '/activity/',
  '/meet/',
  '/city',
  '/sports',
  '/guides',
  '/press',
];
const forbiddenPublicDirs = ['city', 'sports', 'guides', 'press'];
const checkedFiles = [
  'src/routes/AppRoutes.tsx',
  'src/pages/DiscoverPage.tsx',
  'src/pages/discoverMeetPresenter.ts',
  'src/components/assistant-ui/tool-card-actions.tsx',
  'src/components/agent-workspace/useAgentApprovalDispatchMessages.ts',
];

const failures = [];

for (const file of checkedFiles) {
  const absolute = path.join(root, file);
  const source = await readFile(absolute, 'utf8');
  for (const route of forbiddenRoutes) {
    if (source.includes(route)) {
      failures.push(`${file} still references ${route}`);
    }
  }
}

for (const dir of forbiddenPublicDirs) {
  const absolute = path.join(root, 'public', dir);
  try {
    await access(absolute);
    failures.push(`public/${dir} still exists`);
  } catch {
    // Expected after page-scope cleanup.
  }
}

const routeSource = await readFile(path.join(root, 'src/routes/AppRoutes.tsx'), 'utf8');
for (const route of ['/', '/discover', '/features', '/agent', '/safety', '/download', '/about', '/demo', '/login']) {
  const pattern = route === '/' ? 'path="/"' : `path="${route}"`;
  if (!routeSource.includes(pattern)) failures.push(`AppRoutes missing ${route}`);
}
for (const route of ['/messages', '/privacy', '/terms', '/forgot-password', '/admin/safety', '/admin/waitlist', '/admin/agent-l5']) {
  if (!routeSource.includes(`path="${route}"`)) failures.push(`AppRoutes missing hidden route ${route}`);
}
if (!routeSource.includes('path="/public-intent/:id"')) {
  failures.push('AppRoutes missing /public-intent/:id');
}
if (!routeSource.includes('path="/user/:id"')) {
  failures.push('AppRoutes missing /user/:id');
}

const pages = await readdir(path.join(root, 'src/pages'));
const allowedPageFiles = new Set([
  'AdminWaitlistPage.tsx',
  'AgentL5AdminPage.tsx',
  'AgentPersonalInfoPage.tsx',
  'AgentWorkspacePage.tsx',
  'DiscoverPage.tsx',
  'ForgotPasswordPage.tsx',
  'LegalPage.tsx',
  'LoginPage.tsx',
  'MessagesPage.tsx',
  'NotFoundPage.tsx',
  'PlatformPage.tsx',
  'PublicIntentDetailPage.tsx',
  'SafetyAdminPage.tsx',
  'UserProfilePage.tsx',
  'discoverMeetPresenter.ts',
]);
for (const page of pages) {
  if (!allowedPageFiles.has(page)) {
    failures.push(`unexpected page file remains: src/pages/${page}`);
  }
}

if (failures.length > 0) {
  console.error('[discover-entrypoints] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[discover-entrypoints] OK: retained routes are registered and old discover entrypoints/static pages are absent.');
