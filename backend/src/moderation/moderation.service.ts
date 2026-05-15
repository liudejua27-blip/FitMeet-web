import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import RPCClient from '@alicloud/pop-core';

type AliyunImageModerationResult = {
  Label?: string;
  label?: string;
  Confidence?: number;
  confidence?: number;
};

type AliyunImageModerationResponse = {
  Code?: number | string;
  code?: number | string;
  Msg?: string;
  msg?: string;
  Data?: {
    Result?: AliyunImageModerationResult[] | string;
    result?: AliyunImageModerationResult[] | string;
  };
  data?: {
    Result?: AliyunImageModerationResult[] | string;
    result?: AliyunImageModerationResult[] | string;
  };
};

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly aliyunImageService: string;
  private readonly aliyunImageClient?: RPCClient;

  // Basic keyword list - in production use external dictionary or AI service
  private bannedWords = [
    'badword1',
    'badword2',
    'spam',
    'scam',
    'hate',
    '垃圾',
    '诈骗',
    '违规',
  ];

  constructor(private readonly configService: ConfigService) {
    this.aliyunImageService =
      this.configService.get<string>('ALIYUN_IMAGE_MODERATION_SERVICE') ||
      'baselineCheck_global';

    const accessKeyId = this.configService.get<string>('ALIYUN_ACCESS_KEY_ID');
    const accessKeySecret = this.configService.get<string>(
      'ALIYUN_ACCESS_KEY_SECRET',
    );
    const endpoint = this.normalizeEndpoint(
      this.configService.get<string>('ALIYUN_IMAGE_MODERATION_ENDPOINT') ||
        'green-cip.ap-southeast-1.aliyuncs.com',
    );

    if (accessKeyId && accessKeySecret && this.aliyunImageService) {
      this.aliyunImageClient = new RPCClient({
        accessKeyId,
        accessKeySecret,
        endpoint,
        apiVersion: '2022-03-02',
      });
      this.logger.log(
        `Aliyun image moderation enabled with service: ${this.aliyunImageService}`,
      );
    }
  }

  isAliyunImageModerationEnabled(): boolean {
    return Boolean(this.aliyunImageClient && this.aliyunImageService);
  }

  /**
   * Synchronous check for sensitive words (legacy/fast check)
   */
  checkForSensitiveWords(content: string): void {
    if (!content) return;

    // Simple implementation
    const lowerContent = content.toLowerCase();
    const foundBadWord = this.bannedWords.find((word) =>
      lowerContent.includes(word),
    );

    if (foundBadWord) {
      this.logger.warn(
        `Text moderation failed: Keyword '${foundBadWord}' found.`,
      );
      throw new BadRequestException(
        `Content contains prohibited word: ${foundBadWord}`,
      );
    }
  }

  isValid(content: string): boolean {
    try {
      this.checkForSensitiveWords(content);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Async text moderation (includes AI check simulation)
   */
  async checkText(content: string): Promise<boolean> {
    // 1. Local Keyword Filter
    this.checkForSensitiveWords(content);

    // 2. Simulated External API Call (e.g. AI Check)
    return this.simulateExternalTextScan(content);
  }

  /**
   * Async image moderation
   */
  async checkImage(
    imageBuffer: Buffer,
    filename: string = 'unknown',
  ): Promise<boolean> {
    this.logger.log(`Starting moderation for image: ${filename}`);

    // Simulated External API Call
    const isSafe = await this.simulateExternalImageScan(imageBuffer, filename);

    if (!isSafe) {
      this.logger.warn(`Image moderation failed for ${filename}`);
      throw new BadRequestException(
        'Image content violates safety guidelines.',
      );
    }
    return true;
  }

  async checkOssImage(
    objectName: string,
    options: {
      bucketName?: string;
      regionId?: string;
      dataId?: string;
    } = {},
  ): Promise<boolean> {
    if (!this.aliyunImageClient) {
      return true;
    }

    const bucketName =
      options.bucketName ||
      this.configService.get<string>('ALIYUN_OSS_BUCKET') ||
      '';
    const regionId = this.normalizeOssRegionId(
      options.regionId ||
        this.configService.get<string>('ALIYUN_OSS_REGION') ||
        '',
    );

    if (!bucketName || !regionId) {
      throw new BadRequestException(
        'Aliyun image moderation requires OSS bucket and region config.',
      );
    }

    this.logger.log(`Starting Aliyun moderation for OSS image: ${objectName}`);

    const response =
      await this.aliyunImageClient.request<AliyunImageModerationResponse>(
        'ImageModeration',
        {
          Service: this.aliyunImageService,
          ServiceParameters: JSON.stringify({
            dataId: options.dataId || randomUUID(),
            ossBucketName: bucketName,
            ossRegionId: regionId,
            ossObjectName: objectName,
          }),
        },
        {
          method: 'POST',
        },
      );

    this.assertAliyunImageModerationSafe(response, objectName);
    return true;
  }

  // Helpers...
  private async simulateExternalTextScan(text: string): Promise<boolean> {
    // Mock latency
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Simulate failing for specific content testing
    if (text.includes('FAIL_AI_CHECK')) return false;
    return true;
  }

  private async simulateExternalImageScan(
    buffer: Buffer,
    filename: string,
  ): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Simulate failure based on filename convention for testing
    if (filename.includes('test-bad')) return false;

    // In real scenario, we would send buffer to AWS Rekognition or Aliyun Green
    return true;
  }

  private assertAliyunImageModerationSafe(
    response: AliyunImageModerationResponse,
    filename: string,
  ) {
    const code = response.Code ?? response.code;
    if (String(code) !== '200') {
      const message = response.Msg ?? response.msg ?? 'unknown error';
      this.logger.warn(
        `Aliyun image moderation request failed for ${filename}: ${message}`,
      );
      throw new BadRequestException('Image moderation service failed.');
    }

    const data = response.Data ?? response.data;
    const rawResults = data?.Result ?? data?.result;
    const results =
      typeof rawResults === 'string'
        ? (JSON.parse(rawResults) as AliyunImageModerationResult[])
        : rawResults;

    if (!results?.length) {
      this.logger.warn(
        `Aliyun image moderation returned no result: ${filename}`,
      );
      throw new BadRequestException('Image moderation service failed.');
    }

    const riskyLabels = results
      .map((result) => result.Label ?? result.label ?? '')
      .filter((label) => label && !this.isSafeAliyunLabel(label));

    if (riskyLabels.length > 0) {
      this.logger.warn(
        `Image moderation failed for ${filename}: ${riskyLabels.join(', ')}`,
      );
      throw new BadRequestException(
        'Image content violates safety guidelines.',
      );
    }
  }

  private isSafeAliyunLabel(label: string): boolean {
    const normalized = label.toLowerCase();
    return (
      normalized === 'nonlabel' ||
      normalized === 'normal' ||
      normalized === 'safe' ||
      normalized === 'pass'
    );
  }

  private normalizeEndpoint(endpoint: string): string {
    return /^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;
  }

  private normalizeOssRegionId(regionId: string): string {
    return regionId.startsWith('oss-') ? regionId.slice(4) : regionId;
  }
}
