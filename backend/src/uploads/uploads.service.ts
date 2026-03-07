import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ModerationService } from '../moderation/moderation.service';

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadDir = 'public/uploads';
  private s3Client!: S3Client;
  private bucketName!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
  ) {
    this.ensureUploadDir();
  }

  onModuleInit() {
    // Default to empty value if keys are missing to prevent crash
    this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('S3_ENDPOINT'); // For MinIO/LocalStack

    // Only init S3 client if we have valid credentials
    if (accessKeyId && secretAccessKey && this.bucketName) {
      this.s3Client = new S3Client({
        region: region || 'us-east-1',
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        endpoint: endpoint, // Optional, for MinIO
        forcePathStyle: !!endpoint, // needed for MinIO
      });
      this.logger.log(`S3 Client initialized for bucket: ${this.bucketName}`);
    } else {
      this.logger.warn(
        'AWS S3 Configuration missing. Falling back to local storage (production unsafe).',
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
  ): Promise<{ url: string; width: number; height: number }> {
    if (!file.mimetype.match(/^image\/(jpg|jpeg|png|gif|webp)$/)) {
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

      // 2. Moderation Check (on processed buffer, or original if preferred)
      // We check the processed buffer because that's what we are keeping.
      await this.moderationService.checkImage(
        processedBuffer,
        file.originalname,
      );

      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;

      // 3. Upload to S3 if configured
      if (this.s3Client) {
        await this.uploadToS3(filename, processedBuffer, 'image/webp');

        // Cleanup local temp file
        fs.unlinkSync(file.path);

        const s3Url = this.getS3Url(filename);
        return {
          url: s3Url,
          width: metadata.width || 0,
          height: metadata.height || 0,
        };
      } else {
        // Fallback to local storage logic (or keep it as legacy)
        const filepath = path.join(this.uploadDir, filename);
        fs.writeFileSync(filepath, processedBuffer);
        fs.unlinkSync(file.path);

        const baseUrl =
          this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
        return {
          url: `${baseUrl}/uploads/${filename}`,
          width: metadata.width || 0,
          height: metadata.height || 0,
        };
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Image processing/upload failed: ${error.message}`);
        // try cleanup
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new BadRequestException(error.message || 'Image upload failed');
      }
      throw error;
    }
  }

  /*
   * Save generic file (video, etc.)
   */
  async saveFile(file: Express.Multer.File): Promise<string> {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    if (this.s3Client) {
      try {
        // Read from temp file
        const fileBuffer = fs.readFileSync(file.path);

        // Optional: Content Moderation for non-images (implied text files?)
        // For now, only image moderation is strictly required by the prompt's explicit checkImage hook.

        await this.uploadToS3(filename, fileBuffer, file.mimetype);

        fs.unlinkSync(file.path);
        return this.getS3Url(filename);
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`File upload failed: ${error.message}`);
        }
        throw new BadRequestException('File upload failed');
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

  private async uploadToS3(key: string, body: Buffer, contentType: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read', // Caution: Ensure bucket policy allows this or use signed URLs
    });
    await this.s3Client.send(command);
  }

  private getS3Url(key: string): string {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    if (endpoint) {
      // MinIO style: http://localhost:9000/bucket-name/key
      return `${endpoint}/${this.bucketName}/${key}`;
    }
    // AWS S3 style: https://bucket-name.s3.region.amazonaws.com/key
    const region = this.configService.get<string>('AWS_REGION');
    return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
  }
}
