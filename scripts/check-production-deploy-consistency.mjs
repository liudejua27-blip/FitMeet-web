#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, out);
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function hasExplicitColumnType(decorator) {
  return /@Column\(\s*['"`]/.test(decorator) || /\btype\s*:/.test(decorator);
}

function checkTypeormColumnTypes() {
  const entityFiles = walk(
    path.join(rootDir, 'backend/src'),
    (file) => file.endsWith('.entity.ts'),
  );
  const failures = [];

  for (const file of entityFiles) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (!lines[i].includes('@Column')) continue;
      let decorator = lines[i];
      let depth =
        (lines[i].match(/\(/g) || []).length -
        (lines[i].match(/\)/g) || []).length;
      let cursor = i;
      while (depth > 0 && cursor + 1 < lines.length) {
        cursor += 1;
        decorator += `\n${lines[cursor]}`;
        depth +=
          (lines[cursor].match(/\(/g) || []).length -
          (lines[cursor].match(/\)/g) || []).length;
      }

      let propertyLine = cursor + 1;
      while (
        propertyLine < lines.length &&
        (/^\s*$/.test(lines[propertyLine]) ||
          /^\s*\/\//.test(lines[propertyLine]) ||
          /^\s*\/\*/.test(lines[propertyLine]) ||
          /^\s*\*/.test(lines[propertyLine]))
      ) {
        propertyLine += 1;
      }

      const property = lines[propertyLine]?.match(
        /^\s*([A-Za-z_$][\w$]*)[!?]?:\s*([^;]+);/,
      );
      if (!property) continue;

      const [, propertyName, rawType] = property;
      const propertyType = rawType.trim();
      const explicitType = hasExplicitColumnType(decorator);
      const nullableString =
        /string\s*\|\s*null|null\s*\|\s*string/.test(propertyType);
      const objectOrArray =
        /\[\]|Array<|Record<|\{|\bunknown\b|\bany\b|\bobject\b/.test(
          propertyType,
        );

      if (!explicitType && (nullableString || objectOrArray)) {
        failures.push(
          `${path.relative(rootDir, file)}:${i + 1} ${propertyName}: ${propertyType} must declare an explicit TypeORM column type.`,
        );
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) fail(failure);
    return;
  }
  ok(`TypeORM entity column types are explicit for nullable strings/objects/arrays (${entityFiles.length} files)`);
}

function parseComposeServices(composeText) {
  const services = new Set();
  const dependencies = new Map();
  let inServices = false;
  let currentService = null;
  let inDependsOn = false;

  for (const line of composeText.split(/\r?\n/)) {
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line) && !/^services:\s*$/.test(line)) {
      inServices = false;
      currentService = null;
      inDependsOn = false;
    }
    if (!inServices) continue;

    const serviceMatch = line.match(/^  ([A-Za-z0-9_.-]+):\s*(?:#.*)?$/);
    if (serviceMatch) {
      currentService = serviceMatch[1];
      services.add(currentService);
      if (!dependencies.has(currentService)) dependencies.set(currentService, []);
      inDependsOn = false;
      continue;
    }

    if (!currentService) continue;
    if (/^    depends_on:\s*$/.test(line)) {
      inDependsOn = true;
      continue;
    }
    if (inDependsOn && /^    \S/.test(line)) {
      inDependsOn = false;
    }
    if (!inDependsOn) continue;

    const mapDependency = line.match(/^      ([A-Za-z0-9_.-]+):/);
    const listDependency = line.match(/^      -\s*([A-Za-z0-9_.-]+)/);
    const dependency = mapDependency?.[1] ?? listDependency?.[1] ?? null;
    if (dependency) dependencies.get(currentService).push(dependency);
  }

  return { services, dependencies };
}

function checkComposeDependencies() {
  const composePath = path.join(rootDir, 'docker-compose.prod.yml');
  const composeText = fs.readFileSync(composePath, 'utf8');
  const { services, dependencies } = parseComposeServices(composeText);
  const failures = [];

  for (const [service, refs] of dependencies.entries()) {
    for (const ref of refs) {
      if (!services.has(ref)) {
        failures.push(`${service} depends_on undefined service ${ref}`);
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) fail(failure);
    return;
  }
  ok(`docker-compose.prod.yml has no undefined depends_on references (${services.size} services)`);
}

function checkDeployScripts() {
  const deployPath = path.join(rootDir, 'scripts/deploy-production.sh');
  const installPath = path.join(rootDir, 'scripts/ecs-install-release.sh');
  const deployText = fs.readFileSync(deployPath, 'utf8');
  const installText = fs.readFileSync(installPath, 'utf8');

  try {
    execFileSync('bash', ['-n', deployPath], { stdio: 'pipe' });
    execFileSync('bash', ['-n', installPath], { stdio: 'pipe' });
  } catch (error) {
    fail(`shell syntax check failed: ${error.message}`);
    return;
  }

  if (/up\s+-d\s+postgres\s+redis\s+mongo\s+zookeeper\s+kafka/.test(deployText)) {
    fail('deploy-production.sh must not hard-code zookeeper/kafka startup when they are absent from docker-compose.prod.yml.');
  }
  if (
    /FITMEET_RELEASE_(COMMIT|SOURCE|BUILT_AT)=["']?\$\{FITMEET_RELEASE_(COMMIT|SOURCE|BUILT_AT):-/.test(
      deployText,
    )
  ) {
    fail('deploy-production.sh must not prefer stale FITMEET_RELEASE_* environment values over release.json.');
  }
  if (!deployText.includes('read_release_field commit unknown')) {
    fail('deploy-production.sh must read FITMEET_RELEASE_COMMIT from release.json.');
  }
  if (!deployText.includes('config --services')) {
    fail('deploy-production.sh must inspect actual docker compose services before starting dependencies.');
  }
  if (!installText.includes('sync_release_env_metadata')) {
    fail('ecs-install-release.sh must refresh .env.production release metadata after installing release.json.');
  }

  if (!process.exitCode) {
    ok('production deploy scripts pass release metadata and service-start consistency checks');
  }
}

function checkStagingValidationScripts() {
  const deployPath = path.join(rootDir, 'scripts/deploy-staging-safe-ecs.sh');
  const faultPath = path.join(rootDir, 'scripts/staging-fault-injection.sh');
  const rollbackPath = path.join(rootDir, 'scripts/rollback-staging-ecs.sh');
  const e2ePath = path.join(rootDir, 'frontend/scripts/qa-agent-public-loop-staging.mjs');
  const composePath = path.join(rootDir, 'docker-compose.prod.yml');
  const stagingNginxPath = path.join(rootDir, 'nginx/nginx.staging.conf');
  const files = [deployPath, faultPath, rollbackPath];
  const failures = [];

  for (const file of files) {
    try {
      execFileSync('bash', ['-n', file], { stdio: 'pipe' });
    } catch (error) {
      failures.push(`shell syntax check failed for ${path.relative(rootDir, file)}: ${error.message}`);
    }
  }

  const deployText = fs.readFileSync(deployPath, 'utf8');
  const faultText = fs.readFileSync(faultPath, 'utf8');
  const rollbackText = fs.readFileSync(rollbackPath, 'utf8');
  const e2eText = fs.readFileSync(e2ePath, 'utf8');
  const composeText = fs.readFileSync(composePath, 'utf8');
  const stagingNginxText = fs.existsSync(stagingNginxPath)
    ? fs.readFileSync(stagingNginxPath, 'utf8')
    : '';

  if (deployText.includes('docker-compose.resolved.yml')) {
    failures.push('deploy-staging-safe-ecs.sh must not write full docker compose resolved config evidence.');
  }
  if (!deployText.includes('docker-compose.summary.json')) {
    failures.push('deploy-staging-safe-ecs.sh must write a sanitized docker compose summary.');
  }
  if (!deployText.includes("test: service.healthcheck.test ? '[redacted]' : null")) {
    failures.push('deploy-staging-safe-ecs.sh must redact healthcheck test commands because they can contain secrets.');
  }
  if (!deployText.includes('environment, env_file, labels, volumes and secrets are intentionally omitted')) {
    failures.push('deploy-staging-safe-ecs.sh must document that full compose environment values are omitted.');
  }
  for (const [label, text] of [
    ['deploy-staging-safe-ecs.sh', deployText],
    ['verify-staging.sh', fs.readFileSync(path.join(rootDir, 'scripts/verify-staging.sh'), 'utf8')],
    ['staging-fault-injection.sh', faultText],
    ['rollback-staging-ecs.sh', rollbackText],
  ]) {
    if (!text.includes('https://staging.ourfitmeet.cn')) {
      failures.push(`${label} must default or document the canonical staging domain.`);
    }
  }
  if (!deployText.includes('NGINX_CONF_FILE="${NGINX_CONF_FILE:-./nginx/nginx.staging.conf}"')) {
    failures.push('deploy-staging-safe-ecs.sh must default to nginx/nginx.staging.conf.');
  }
  if (!composeText.includes('${NGINX_CONF_FILE:-./nginx/nginx.conf}:/etc/nginx/nginx.conf:ro')) {
    failures.push('docker-compose.prod.yml must allow staging to select nginx/nginx.staging.conf without changing production defaults.');
  }
  if (!stagingNginxText.includes('server_name staging.ourfitmeet.cn;')) {
    failures.push('nginx/nginx.staging.conf must serve staging.ourfitmeet.cn.');
  }
  if (stagingNginxText.includes('server_name www.ourfitmeet.cn') || stagingNginxText.includes('https://www.ourfitmeet.cn')) {
    failures.push('nginx/nginx.staging.conf must not route staging traffic to the production www domain.');
  }

  if (!faultText.includes('trap cleanup EXIT ERR INT TERM')) {
    failures.push('staging-fault-injection.sh must install cleanup trap for EXIT/ERR/INT/TERM.');
  }
  for (const required of [
    'unpause redis',
    'unpause mongo',
    'docker rm -f "$worker_peer_name"',
    'create_matching_job_seed',
    'matching-job-seed.ids',
    'wait_for_matching_job_status "$job_id" \'^running$\'',
    'assert_matching_job_completed_once',
    'duplicateCandidateRows',
  ]) {
    if (!faultText.includes(required)) {
      failures.push(`staging-fault-injection.sh missing safety check: ${required}`);
    }
  }

  if (rollbackText.includes('find "$BACKUP_ROOT"')) {
    failures.push('rollback-staging-ecs.sh must not auto-select the latest backup.');
  }
  for (const required of [
    'ROLLBACK_SOURCE',
    'ROLLBACK_DB_BACKUP_REF',
    'ROLLBACK_MIGRATION_COMPATIBILITY_ACK',
    'This script restores code files only',
  ]) {
    if (!rollbackText.includes(required)) {
      failures.push(`rollback-staging-ecs.sh missing explicit rollback guard: ${required}`);
    }
  }

  if (!e2eText.includes('STAGING_E2E_STOP_AFTER_PUBLISH')) {
    failures.push('qa-agent-public-loop-staging.mjs must support stop-after-publish seed mode for fault injection.');
  }

  if (failures.length > 0) {
    for (const failure of failures) fail(failure);
    return;
  }
  ok('staging validation scripts enforce sanitized evidence, cleanup, active matching-job lease recovery, and explicit rollback source');
}

checkTypeormColumnTypes();
checkComposeDependencies();
checkDeployScripts();
checkStagingValidationScripts();

if (process.exitCode) process.exit(process.exitCode);
