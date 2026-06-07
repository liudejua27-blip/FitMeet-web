import * as fs from 'fs';
import * as path from 'path';
import {
  buildProductionEnvReport,
  parseEnvFile,
} from '../src/config/production-env-readiness';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const fromProcess = args.includes('--from-process');
const explicitPath = args.find((arg) => arg !== '--from-process');

const envSource = fromProcess ? readProcessEnv() : readEnvFile(explicitPath);
const report = buildProductionEnvReport(envSource.env);

console.log(`Checked production env: ${envSource.description}`);
if (report.errors.length > 0) {
  console.error(`Errors (${report.errors.length}):`);
  for (const issue of report.errors) {
    console.error(`- ${issue.key}: ${issue.message}`);
  }
}
if (report.warnings.length > 0) {
  console.warn(`Warnings (${report.warnings.length}):`);
  for (const issue of report.warnings) {
    console.warn(`- ${issue.key}: ${issue.message}`);
  }
}
if (!report.ok) process.exit(1);
console.log('Production env readiness passed.');

function readProcessEnv(): { description: string; env: Record<string, string> } {
  return {
    description: 'process.env',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
  };
}

function readEnvFile(
  explicitPath?: string,
): { description: string; env: Record<string, string> } {
  const candidates = explicitPath
    ? [explicitPath]
    : ['../.env.production', '.env.production'];
  const envPath = candidates
    .map((candidate) => path.resolve(process.cwd(), candidate))
    .find((candidate) => fs.existsSync(candidate));

  if (!envPath) {
    console.error(
      `Production env file not found. Pass a path, for example: pnpm check:prod-env -- ../.env.production, or check platform variables with: pnpm check:prod-env -- --from-process`,
    );
    process.exit(1);
  }

  return {
    description: envPath,
    env: parseEnvFile(fs.readFileSync(envPath, 'utf8')),
  };
}
