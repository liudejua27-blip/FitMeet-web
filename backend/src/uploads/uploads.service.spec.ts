import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  const uploadedFiles: string[] = [];

  afterEach(() => {
    for (const filePath of uploadedFiles.splice(0)) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it('rejects production local uploads and removes the temporary file', async () => {
    const tempFile = writeTempUpload('production-local.txt');
    const service = makeService({ NODE_ENV: 'production' });

    await expect(service.saveFile(fileFor(tempFile))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('uses configured BASE_URL for local development upload URLs', async () => {
    const tempFile = writeTempUpload('local-video.mp4');
    const service = makeService({
      NODE_ENV: 'development',
      BASE_URL: 'https://dev.fitmeet.test',
    });

    const url = await service.saveFile(fileFor(tempFile));
    const uploadedPath = path.join(
      'public/uploads',
      decodeURIComponent(url.split('/uploads/')[1] ?? ''),
    );
    uploadedFiles.push(uploadedPath);

    expect(url).toMatch(/^https:\/\/dev\.fitmeet\.test\/uploads\/.+\.mp4$/);
    expect(fs.existsSync(tempFile)).toBe(false);
    expect(fs.existsSync(uploadedPath)).toBe(true);
  });

  it('rejects non-image uploads and removes the temporary file', async () => {
    const tempFile = writeTempUpload('not-image.txt');
    const service = makeService({ NODE_ENV: 'development' });

    await expect(
      service.saveImage(fileFor(tempFile, 'text/plain')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('rejects non-video file uploads and removes the temporary file', async () => {
    const tempFile = writeTempUpload('not-video.txt');
    const service = makeService({ NODE_ENV: 'development' });

    await expect(
      service.saveFile(fileFor(tempFile, 'text/plain')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('removes the temporary file when Aliyun OSS file upload fails', async () => {
    const tempFile = writeTempUpload('aliyun-failure.mp4');
    const service = makeService({ NODE_ENV: 'production' });
    configureAliyunFailure(service);

    await expect(service.saveFile(fileFor(tempFile))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('removes the temporary file when S3 file upload fails', async () => {
    const tempFile = writeTempUpload('s3-failure.mp4');
    const service = makeService({ NODE_ENV: 'production' });
    configureS3Failure(service);

    await expect(service.saveFile(fileFor(tempFile))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('uses S3_PUBLIC_BASE_URL for S3-compatible upload responses', async () => {
    const tempFile = writeTempUpload('s3-public.mp4');
    const service = makeService({
      NODE_ENV: 'production',
      S3_PUBLIC_BASE_URL: 'https://media.socialworld.world/uploads/',
    });
    const send = jest.fn().mockResolvedValue({});
    Object.assign(service as unknown as Record<string, unknown>, {
      storageProvider: 's3',
      bucketName: 'fitmeet-test',
      s3Client: { send },
    });

    const url = await service.saveFile(fileFor(tempFile));

    expect(url).toMatch(
      /^https:\/\/media\.socialworld\.world\/uploads\/.+\.mp4$/,
    );
    expect(url).not.toContain('fitmeet-test');
    expect(send).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(tempFile)).toBe(false);
  });
});

function makeService(env: Record<string, string>) {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  };
  const moderationService = {
    isAliyunImageModerationEnabled: jest.fn(() => false),
    checkImage: jest.fn(),
    checkOssImage: jest.fn(),
  };
  const mediaRepo = {
    create: jest.fn((value) => value),
    save: jest.fn((value) => ({ id: 1, ...value })),
  };

  return new UploadsService(
    configService as never,
    moderationService as never,
    mediaRepo as never,
  );
}

function writeTempUpload(fileName: string) {
  const tempDir = path.join('public/uploads/temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, fileName);
  fs.writeFileSync(tempFile, 'fitmeet-upload-test');
  return tempFile;
}

function fileFor(
  filePath: string,
  mimetype = 'video/mp4',
): Express.Multer.File {
  return {
    path: filePath,
    originalname: path.basename(filePath),
    mimetype,
  } as Express.Multer.File;
}

function configureAliyunFailure(service: UploadsService) {
  Object.assign(service as unknown as Record<string, unknown>, {
    storageProvider: 'aliyun-oss',
    bucketName: 'fitmeet-test',
    ossClient: {
      put: jest.fn().mockRejectedValue(new Error('oss unavailable')),
    },
  });
}

function configureS3Failure(service: UploadsService) {
  Object.assign(service as unknown as Record<string, unknown>, {
    storageProvider: 's3',
    bucketName: 'fitmeet-test',
    s3Client: {
      send: jest.fn().mockRejectedValue(new Error('s3 unavailable')),
    },
  });
}
