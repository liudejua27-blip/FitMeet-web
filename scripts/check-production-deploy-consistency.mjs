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

checkTypeormColumnTypes();
checkComposeDependencies();
checkDeployScripts();

if (process.exitCode) process.exit(process.exitCode);
