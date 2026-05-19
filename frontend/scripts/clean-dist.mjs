import { rm } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');

await rm(distDir, { recursive: true, force: true });
