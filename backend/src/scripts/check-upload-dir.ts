import {
  ensureUploadBaseDir,
  ensureUploadTempDir,
} from '../uploads/upload-paths';

function main() {
  const baseDir = ensureUploadBaseDir();
  const tempDir = ensureUploadTempDir();
  console.log(
    JSON.stringify({
      status: 'ok',
      uploadDir: baseDir,
      uploadTempDir: tempDir,
    }),
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
}
