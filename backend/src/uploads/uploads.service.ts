import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import OSS from 'ali-oss';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ModerationService } from '../moderation/moderation.service';
import { ensureUploadBaseDir, ensureUploadTempDir } from './upload-paths';
import { MediaAsset, MediaModerationStatus } from '../users/media-asset.entity';

const PLACEHOLDER_PATTERN =
  /^(|change_me.*|your-.*|replace-.*|.*_here|secret_key|password)$/i;
const IMAGE_MIME_PATTERN = /^image\/(jpg|jpeg|png|gif|webp)$/;
const VIDEO_MIME_PATTERN = /^video\/(mp4|quicktime|webm|x-m4v)$/;

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir = ensureUploadBaseDir();
  private ossClient?: OSS;
  private s3Client?: S3Client;
  private bucketName = '';
  private storageProvider: 'aliyun-oss' | 's3' | 'local' = 'local';

  constructor(
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
  ) {
    this.ensureUploadDir();
    ensureUploadTempDir();
  }

  private get isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private hasConfiguredValue(value?: string | null): value is string {
    return !!value?.trim() && !PLACEHOLDER_PATTERN.test(value.trim());
  }

  private isEnabled(value?: string | null): boolean {
    return /^(1|true|yes|on)$/i.test(value?.trim() ?? '');
  }

  onModuleInit() {
    if (this.initAliyunOss()) {
      return;
    }

    this.initS3();
  }

  private initAliyunOss(): boolean {
    const accessKeyId = this.configService.get<string>('ALIYUN_ACCESS_KEY_ID');
    const accessKeySecret = this.configService.get<string>(
      'ALIYUN_ACCESS_KEY_SECRET',
    );
    const bucket = this.configService.get<string>('ALIYUN_OSS_BUCKET');
    const region = this.configService.get<string>('ALIYUN_OSS_REGION');
    const endpoint = this.configService.get<string>('ALIYUN_OSS_ENDPOINT');

    if (
      !this.hasConfiguredValue(accessKeyId) ||
      !this.hasConfiguredValue(accessKeySecret) ||
      !this.hasConfiguredValue(bucket) ||
      !this.hasConfiguredValue(region)
    ) {
      return false;
    }

    this.bucketName = bucket;
    this.storageProvider = 'aliyun-oss';
    this.ossClient = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
      endpoint,
      secure: !endpoint || endpoint.startsWith('https://'),
    });
    this.logger.log(`Aliyun OSS client initialized for bucket: ${bucket}`);
    return true;
  }

  private initS3() {
    this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('S3_ENDPOINT'); // For MinIO/LocalStack

    // Only init S3 client if we have valid credentials
    if (
      this.hasConfiguredValue(accessKeyId) &&
      this.hasConfiguredValue(secretAccessKey) &&
      this.hasConfiguredValue(this.bucketName)
    ) {
      this.s3Client = new S3Client({
        region: region || 'us-east-1',
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        endpoint: endpoint, // Optional, for MinIO
        forcePathStyle: !!endpoint, // needed for MinIO
      });
      this.storageProvider = 's3';
      this.logger.log(`S3 Client initialized for bucket: ${this.bucketName}`);
    } else {
      this.logger.warn(
        'Object storage configuration missing. Falling back to local storage (production unsafe).',
      );
    }
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /*
   * Process and save image with compression
   */
  async saveImage(
    file: Express.Multer.File,
    ownerUserId?: number,
  ): Promise<{
    assetId: number | null;
    url: string;
    width: number;
    height: number;
    moderationStatus: string;
  }> {
    if (this.isProduction && this.storageProvider === 'local') {
      this.safeUnlink(file.path);
      throw new BadRequestException(
        'Uploads are disabled until object storage is configured.',
      );
    }

    if (!IMAGE_MIME_PATTERN.test(file.mimetype)) {
      this.safeUnlink(file.path);
      throw new BadRequestException('Only image files are allowed!');
    }

    try {
      // 1. Process with Sharp
      const sharpInstance = sharp.default(file.path);
      const metadata = await sharpInstance.metadata();

      // Resize & Compress
      const processedBuffer = await sharpInstance
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
      const shouldModerateOssObject =
        this.storageProvider === 'aliyun-oss' &&
        this.moderationService.isAliyunImageModerationEnabled();
      let moderationStatus: MediaModerationStatus =
        this.defaultImageModerationStatus();

      if (!shouldModerateOssObject) {
        // Check the exact image bytes that will be stored.
        this.moderationService.checkImage(processedBuffer, file.originalname);
        moderationStatus = this.localImageModerationStatus();
      }

      // 3. Upload to configured object storage
      if (this.ossClient) {
        let uploaded = false;
        try {
          await this.uploadToAliyunOss(filename, processedBuffer, 'image/webp');
          uploaded = true;

          if (shouldModerateOssObject) {
            await this.moderationService.checkOssImage(filename, {
              bucketName: this.bucketName,
              regionId: this.configService.get<string>('ALIYUN_OSS_REGION'),
            });
            moderationStatus = 'approved';
          }
        } catch (error) {
          if (uploaded) {
            await this.deleteFromAliyunOss(filename);
          }
          throw error;
        } finally {
          this.safeUnlink(file.path);
        }

        return this.persistImageAsset(ownerUserId, {
          url: this.getAliyunOssUrl(filename),
          width: metadata.width || 0,
          height: metadata.height || 0,
          storageKey: filename,
          sha256: this.hash(processedBuffer),
          moderationStatus,
        });
      } else if (this.s3Client) {
        await this.uploadToS3(filename, processedBuffer, 'image/webp');

        // Cleanup local temp file
        this.safeUnlink(file.path);

        const s3Url = this.getS3Url(filename);
        return this.persistImageAsset(ownerUserId, {
          url: s3Url,
          width: metadata.width || 0,
          height: metadata.height || 0,
          storageKey: filename,
          sha256: this.hash(processedBuffer),
          moderationStatus,
        });
      } else {
        // Fallback to local storage logic (or keep it as legacy)
        const filepath = path.join(this.uploadDir, filename);
        fs.writeFileSync(filepath, processedBuffer);
        this.safeUnlink(file.path);

        const baseUrl =
          this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
        return this.persistImageAsset(ownerUserId, {
          url: `${baseUrl}/uploads/${filename}`,
          width: metadata.width || 0,
          height: metadata.height || 0,
          storageKey: filename,
          sha256: this.hash(processedBuffer),
          moderationStatus,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Image processing/upload failed: ${error.message}`);
        // try cleanup
        this.safeUnlink(file.path);
        throw new BadRequestException(error.message || 'Image upload failed');
      }
      throw error;
    }
  }

  private async persistImageAsset(
    ownerUserId: number | undefined,
    result: {
      url: string;
      width: number;
      height: number;
      storageKey: string;
      sha256: string;
      moderationStatus: MediaModerationStatus;
    },
  ) {
    if (!ownerUserId) {
      return {
        assetId: null,
        url: result.url,
        width: result.width,
        height: result.height,
        moderationStatus: result.moderationStatus,
      };
    }

    const asset = await this.mediaRepo.save(
      this.mediaRepo.create({
        ownerUserId,
        purpose: 'profile_photo',
        storageKey: result.storageKey,
        url: result.url,
        mimeType: 'image/webp',
        width: result.width,
        height: result.height,
        sha256: result.sha256,
        moderationStatus: result.moderationStatus,
        moderationReason: '',
      }),
    );
    return {
      assetId: asset.id,
      url: result.url,
      width: result.width,
      height: result.height,
      moderationStatus: asset.moderationStatus,
    };
  }

  private hash(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private defaultImageModerationStatus(): MediaModerationStatus {
    return 'pending';
  }

  private localImageModerationStatus(): MediaModerationStatus {
    if (!this.isProduction) {
      return 'approved';
    }
    return 'pending';
  }

  /*
   * Save generic file (video, etc.)
   */
  async saveFile(file: Express.Multer.File): Promise<string> {
    if (this.isProduction && this.storageProvider === 'local') {
      this.safeUnlink(file.path);
      throw new BadRequestException(
        'Uploads are disabled until object storage is configured.',
      );
    }

    if (!VIDEO_MIME_PATTERN.test(file.mimetype)) {
      this.safeUnlink(file.path);
      throw new BadRequestException('Only video files are allowed!');
    }

    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    if (this.ossClient) {
      try {
        const fileBuffer = fs.readFileSync(file.path);
        await this.uploadToAliyunOss(filename, fileBuffer, file.mimetype);
        return this.getAliyunOssUrl(filename);
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`File upload failed: ${error.message}`);
        }
        throw new BadRequestException('File upload failed');
      } finally {
        this.safeUnlink(file.path);
      }
    } else if (this.s3Client) {
      try {
        // Read from temp file
        const fileBuffer = fs.readFileSync(file.path);

        // Optional: Content Moderation for non-images (implied text files?)
        // For now, only image moderation is strictly required by the prompt's explicit checkImage hook.

        await this.uploadToS3(filename, fileBuffer, file.mimetype);

        return this.getS3Url(filename);
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`File upload failed: ${error.message}`);
        }
        throw new BadRequestException('File upload failed');
      } finally {
        this.safeUnlink(file.path);
      }
    } else {
      const filepath = path.join(this.uploadDir, filename);
      // Move file from temp to final destination
      fs.renameSync(file.path, filepath);

      const baseUrl =
        this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
      return `${baseUrl}/uploads/${filename}`;
    }
  }

  private async uploadToAliyunOss(
    key: string,
    body: Buffer,
    contentType: string,
  ) {
    if (!this.ossClient) {
      throw new BadRequestException('Aliyun OSS client is not initialized');
    }

    const options: Parameters<OSS['put']>[2] = {
      mime: contentType,
    };

    if (
      this.isEnabled(
        this.configService.get<string>('ALIYUN_OSS_SET_PUBLIC_OBJECT_ACL'),
      )
    ) {
      options.headers = {
        'x-oss-object-acl': 'public-read',
      };
    }

    await this.ossClient.put(key, body, options);
  }

  private async deleteFromAliyunOss(key: string) {
    if (!this.ossClient) return;

    try {
      await this.ossClient.delete(key);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.warn(
          `Failed to delete rejected OSS object ${key}: ${error.message}`,
        );
      }
    }
  }

  private async uploadToS3(key: string, body: Buffer, contentType: string) {
    if (!this.s3Client) {
      throw new BadRequestException('S3 client is not initialized');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read', // Caution: Ensure bucket policy allows this or use signed URLs
    });
    await this.s3Client.send(command);
  }

  private getAliyunOssUrl(key: string): string {
    const publicBaseUrl = this.configService.get<string>(
      'ALIYUN_OSS_PUBLIC_BASE_URL',
    );
    if (publicBaseUrl) {
      return `${publicBaseUrl.replace(/\/$/, '')}/${encodeURI(key)}`;
    }

    const endpoint =
      this.configService.get<string>('ALIYUN_OSS_ENDPOINT') ||
      `${this.configService.get<string>('ALIYUN_OSS_REGION')}.aliyuncs.com`;
    const host = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${this.bucketName}.${host}/${encodeURI(key)}`;
  }

  private getS3Url(key: string): string {
    const publicBaseUrl = this.configService.get<string>('S3_PUBLIC_BASE_URL');
    if (publicBaseUrl) {
      return `${publicBaseUrl.replace(/\/$/, '')}/${encodeURI(key)}`;
    }

    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    if (endpoint) {
      // Development fallback for MinIO/LocalStack. Production readiness requires S3_PUBLIC_BASE_URL.
      return `${endpoint.replace(/\/$/, '')}/${this.bucketName}/${encodeURI(key)}`;
    }
    // AWS S3 style: https://bucket-name.s3.region.amazonaws.com/key
    const region = this.configService.get<string>('AWS_REGION');
    return `https://${this.bucketName}.s3.${region}.amazonaws.com/${encodeURI(
      key,
    )}`;
  }

  private safeUnlink(filePath: string) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
