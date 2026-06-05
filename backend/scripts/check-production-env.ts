import * as fs from 'fs';
import * as path from 'path';
import {
  buildProductionEnvReport,
  parseEnvFile,
} from '../src/config/production-env-readiness';

const explicitPath = process.argv.slice(2).find((arg) => arg !== '--');
const candidates = explicitPath
  ? [explicitPath]
  : ['../.env.production', '.env.production'];
const envPath = candidates
  .map((candidate) => path.resolve(process.cwd(), candidate))
  .find((candidate) => fs.existsSync(candidate));

if (!envPath) {
  console.error(
    `Production env file not found. Pass a path, for example: pnpm check:prod-env -- ../.env.production`,
  );
  process.exit(1);
}

const report = buildProductionEnvReport(
  parseEnvFile(fs.readFileSync(envPath, 'utf8')),
);

console.log(`Checked production env: ${envPath}`);
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
