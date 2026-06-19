import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function resolveUploadBaseDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);

  if (process.env.NODE_ENV === 'production') {
    return path.join(os.tmpdir(), 'fitmeet', 'uploads');
  }

  return path.resolve('public/uploads');
}

export function resolveUploadTempDir(): string {
  const configured = process.env.UPLOAD_TEMP_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(resolveUploadBaseDir(), 'temp');
}

export function ensureWritableDirectory(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });

  const probePath = path.join(
    dir,
    `.fitmeet-write-check-${process.pid}-${Date.now()}`,
  );
  fs.writeFileSync(probePath, 'ok');
  fs.unlinkSync(probePath);
  return dir;
}

export function ensureUploadBaseDir(): string {
  return ensureWritableDirectory(resolveUploadBaseDir());
}

export function ensureUploadTempDir(): string {
  return ensureWritableDirectory(resolveUploadTempDir());
}
