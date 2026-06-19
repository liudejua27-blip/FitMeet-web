import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const SCRIPTS_ROOT = path.join(REPO_ROOT, 'scripts');
const PUBLIC_ROOT = path.join(REPO_ROOT, 'public');
const VERBOSE = process.env.FITMEET_DISCOVER_AUDIT_VERBOSE === '1';

const TARGET_ROUTES = [
  '/discover',
  '/human',
  '/nearby',
  '/meet',
  '/hall',
  '/social-hall',
  '/agent-connect/social-hall',
  '/app',
  '/download-app',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const ROUTE_TO_DISCOVER_ALIAS = '/discover';

const toRelativeLine = (text, index) => text.slice(0, index).split('\n').length;

const isIgnoredFile = (filePath) =>
  filePath.includes('.test.') ||
  filePath.includes('.spec.') ||
  filePath.includes('__tests__') ||
  filePath.includes('.d.ts');

const isSourceFile = (filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath));

const collectSourceFiles = async (dir, files = []) => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(fullPath, files);
      continue;
    }

    if (entry.isFile() && isSourceFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
};

const normalizeRoute = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return null;
  }

  const [pathOnly] = value.split(/[?#]/);
  if (!pathOnly) {
    return null;
  }

  return pathOnly.endsWith('/') && pathOnly.length > 1 ? pathOnly.slice(0, -1) : pathOnly;
};

const isDiscoverEntryTarget = (value) => {
  const normalized = normalizeRoute(value);
  if (!normalized) return false;

  return TARGET_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`),
  );
};

const collectRawLinkMatches = (source, pattern) => {
  const regex = new RegExp(pattern, 'g');
  const matches = [];
  let match;
  while ((match = regex.exec(source)) !== null) {
    const route = match.groups?.value || match[1] || '';
    if (!isDiscoverEntryTarget(route)) {
      continue;
    }
    matches.push({
      line: toRelativeLine(source, match.index),
      route,
      snippet: match[0],
    });
  }
  return matches;
};

const RE_RAW_ANCHOR_DISCOVER = /<a\b(?:(?!>).|\n){0,260}\bhref\s*=\s*(["'`])(?<value>[^"'`]+)\1/gi;
const RE_RAW_ROUTER_LINK_DISCOVER = /<Link\b(?:(?!>).|\n){0,260}\bto\s*=\s*(["'`])(?<value>[^"'`]+)\1/gi;
const RE_RAW_ROUTER_TEMPLATE_DISCOVER = /<Link\b(?:(?!>).|\n){0,260}\bto\s*=\s*\{`(?<value>[^`]+)`\}/gi;
const RE_DIRECT_WINDOW_NAV = /\b(window\.(?:location\.(?:href|assign|replace)|location)|document\.location)\b/;

const checkSourceFile = async (filePath, report) => {
  if (isIgnoredFile(filePath)) {
    return;
  }

  const content = await readFile(filePath, 'utf8');
  const rel = path.relative(REPO_ROOT, filePath);

  for (const match of collectRawLinkMatches(content, RE_RAW_ANCHOR_DISCOVER.source)) {
    if (match.snippet.includes('data-spa-route=')) {
      continue;
    }

    report.warnings.push({
      file: rel,
      line: match.line,
      route: match.route,
      kind: 'raw-anchor-discover-entry',
      message: 'Use SiteLink/DiscoverLink for discover routes so alias + scroll behavior stay converged.',
    });
  }

  for (const match of [
    ...collectRawLinkMatches(content, RE_RAW_ROUTER_LINK_DISCOVER.source),
    ...collectRawLinkMatches(content, RE_RAW_ROUTER_TEMPLATE_DISCOVER.source),
  ]) {
    report.warnings.push({
      file: rel,
      line: match.line,
      route: match.route,
      kind: 'raw-router-link-discover-entry',
      message: 'Use SiteLink/DiscoverLink instead of raw react-router Link for discover routes.',
    });
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hasWindowNav = RE_DIRECT_WINDOW_NAV.test(line);
    RE_DIRECT_WINDOW_NAV.lastIndex = 0;
    if (!hasWindowNav) {
      continue;
    }

    if (TARGET_ROUTES.some((route) => line.includes(`'${route}`) || line.includes(`"${route}`))) {
      report.warnings.push({
        file: rel,
        line: i + 1,
        route: TARGET_ROUTES.find((route) => line.includes(`'${route}`) || line.includes(`"${route}`)) || '/',
        kind: 'window-navigation',
        message:
          'Avoid direct window/document location navigation for discover entries; use navigateToRouteWithScrollReset/resolveNavigationAlias.',
      });
    }
  }
};

const checkAliasConvergence = async (report) => {
  const scrollContent = await readFile(path.join(SRC_ROOT, 'lib', 'scrollNavigation.ts'), 'utf8');
  const routeContent = await readFile(path.join(SRC_ROOT, 'routes', 'AppRoutes.tsx'), 'utf8');
  const routeBoundaryContent = await readFile(
    path.join(SRC_ROOT, 'routes', 'routeBoundaries.ts'),
    'utf8',
  );

  const aliasRoutes = [
    '/human',
    '/nearby',
    '/meet',
    '/hall',
    '/social-hall',
    '/agent-connect/social-hall',
  ];

  for (const alias of aliasRoutes) {
    const hasLiteralAliasMap =
      scrollContent.includes(`'${alias}': '${ROUTE_TO_DISCOVER_ALIAS}'`) ||
      scrollContent.includes(`"${alias}": "${ROUTE_TO_DISCOVER_ALIAS}"`);
    const hasGeneratedAliasMap =
      scrollContent.includes(`'${alias}'`) &&
      scrollContent.includes('DISCOVER_ALIAS_ROUTES.map') &&
      scrollContent.includes('[path, DISCOVER_PATH]');

    if (!hasLiteralAliasMap && !hasGeneratedAliasMap) {
      report.errors.push({
        file: 'lib/scrollNavigation.ts',
        line: 1,
        route: alias,
        kind: 'alias-map-missing',
        message: `Missing entry alias mapping for ${alias} -> ${ROUTE_TO_DISCOVER_ALIAS}.`,
      });
    }

    const routePattern = new RegExp(
      `<Route\\s+path="${alias}"\\s+element={<DiscoverAliasRoute\\s*/>}`,
      'i',
    );
    if (!routePattern.test(routeContent)) {
      report.errors.push({
        file: 'routes/AppRoutes.tsx',
        line: 1,
        route: alias,
        kind: 'alias-route-missing',
        message: `Alias route missing or not DiscoverAliasRoute: ${alias}`,
      });
    }
  }

  ['/app', '/download-app'].forEach((alias) => {
    if (!scrollContent.includes(`'${alias}': '/download'`) && !scrollContent.includes(`"${alias}": "/download"`)) {
      report.errors.push({
        file: 'lib/scrollNavigation.ts',
        line: 1,
        route: alias,
        kind: 'alias-map-missing',
        message: `${alias} should map to /download in ENTRY_ALIAS_ROUTES.`,
      });
    }

    if (!routeContent.includes(`<Route path="${alias}"`) || !routeContent.includes('/download')) {
      report.warnings.push({
        file: 'routes/AppRoutes.tsx',
        line: 1,
        route: alias,
        kind: 'alias-route-missing',
        message: `${alias} should keep redirect-to /download behavior.`,
      });
    }
  });

  const hasDiscoverBoundary =
    routeBoundaryContent.includes('"/discover"') || routeBoundaryContent.includes("'/discover'");
  const hasAppBoundary = routeBoundaryContent.includes('"/app"') || routeBoundaryContent.includes("'/app'");
  if (!hasDiscoverBoundary || !hasAppBoundary) {
    report.errors.push({
      file: 'routes/routeBoundaries.ts',
      line: 1,
      route: ROUTE_TO_DISCOVER_ALIAS,
      kind: 'boundary-missing',
      message: 'routeBoundaries missing expected discover/app entries.',
    });
  }
};

const checkPublicHtml = async (report) => {
  const collectHtmlFiles = async (dir, files = []) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }
        await collectHtmlFiles(fullPath, files);
      } else if (entry.isFile() && fullPath.endsWith('.html')) {
        files.push(fullPath);
      }
    }
    return files;
  };

  const htmlFiles = [
    path.join(REPO_ROOT, 'index.html'),
    ...(await collectHtmlFiles(PUBLIC_ROOT)),
  ];
  for (const filePath of htmlFiles) {
    const content = await readFile(filePath, 'utf8');
    if (!content.includes('/discover') && !content.includes('/meet')) {
      continue;
    }

    const rel = path.relative(REPO_ROOT, filePath);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes('href="/discover') && !line.includes("href='/discover")) {
        continue;
      }
      if (line.includes('data-spa-route="/discover"') || line.includes("data-spa-route='/discover'")) {
        continue;
      }

      report.publicWarnings.push({
        file: rel,
        line: i + 1,
        route: '/discover',
        kind: 'public-raw-anchor',
        message: 'Static HTML contains native anchor for /discover; keep if intentional for SEO/static pages.',
      });
    }
  }
};

const collectDiscoverEntryReport = async () => {
  const report = {
    errors: [],
    warnings: [],
    publicWarnings: [],
  };

  const sourceFiles = await collectSourceFiles(SRC_ROOT);
  const scriptFiles = await collectSourceFiles(SCRIPTS_ROOT);
  await Promise.all([...sourceFiles, ...scriptFiles].map((filePath) => checkSourceFile(filePath, report)));

  await checkAliasConvergence(report);
  await checkPublicHtml(report);

  return report;
};

const formatIssues = (issues) =>
  issues
    .map((item) => `[${item.kind}] ${item.file}:${item.line} ${item.route} -> ${item.message}`)
    .join('\n');

const report = await collectDiscoverEntryReport();

if (report.errors.length > 0) {
  console.error('[discover-audit] ERROR: discover entrypoint risk points detected');
  console.error(formatIssues(report.errors));
}

if (report.warnings.length > 0) {
  console.warn('[discover-audit] WARN: discover entrypoint hardening suggestions');
  console.warn(formatIssues(report.warnings));
}

if (report.publicWarnings.length > 0) {
  console.info('[discover-audit] INFO: static public anchors for discover paths');
  if (VERBOSE) {
    console.info(formatIssues(report.publicWarnings));
  } else {
    console.info(
      `[discover-audit] ${report.publicWarnings.length} static SEO anchors found. Set FITMEET_DISCOVER_AUDIT_VERBOSE=1 to list them.`,
    );
  }
}

console.log('\n[discover-audit] Summary:');
console.log(`  - errors: ${report.errors.length}`);
console.log(`  - warnings: ${report.warnings.length}`);
console.log(`  - public-warnings: ${report.publicWarnings.length}`);

if (report.errors.length > 0 || report.warnings.length > 0) {
  process.exit(1);
}

console.log('[discover-audit] PASS: no discover-entry violations found.');
