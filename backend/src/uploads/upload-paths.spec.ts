import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ensureUploadTempDir,
  resolveUploadBaseDir,
  resolveUploadTempDir,
} from './upload-paths';

describe('upload paths', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses /tmp/fitmeet/uploads in production by default', () => {
    delete process.env.UPLOAD_DIR;
    delete process.env.UPLOAD_TEMP_DIR;
    process.env.NODE_ENV = 'production';

    expect(resolveUploadBaseDir()).toBe(
      path.join(os.tmpdir(), 'fitmeet', 'uploads'),
    );
    expect(resolveUploadTempDir()).toBe(
      path.join(os.tmpdir(), 'fitmeet', 'uploads', 'temp'),
    );
  });

  it('creates and verifies a writable upload temp directory', () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fitmeet-upload-test-'),
    );
    process.env.UPLOAD_TEMP_DIR = path.join(tempRoot, 'nested', 'temp');

    expect(ensureUploadTempDir()).toBe(process.env.UPLOAD_TEMP_DIR);
    expect(fs.existsSync(process.env.UPLOAD_TEMP_DIR)).toBe(true);
  });
});
