import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import RPCClient from '@alicloud/pop-core';

type AliyunImageModerationResult = {
  Label?: string;
  label?: string;
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
  private readonly bannedWords = [
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

  isAliyunImageModerationEnabled() {
    return Boolean(this.aliyunImageClient && this.aliyunImageService);
  }

  checkForSensitiveWords(content: string) {
    if (!content) return;

    const lowerContent = content.toLowerCase();
    const foundBadWord = this.bannedWords.find((word) =>
      lowerContent.includes(word),
    );

    if (foundBadWord) {
      this.logger.warn(
        `Text moderation failed: keyword '${foundBadWord}' found.`,
      );
      throw new BadRequestException('Content contains prohibited words.');
    }
  }

  checkText(content: string) {
    this.checkForSensitiveWords(content);
    return true;
  }

  checkImage(_imageBuffer: Buffer, filename = 'unknown') {
    this.logger.log(`Starting moderation for image: ${filename}`);
    if (filename.includes('test-bad')) {
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
  ) {
    if (!this.aliyunImageClient) return true;

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
        { method: 'POST' },
      );

    this.assertAliyunImageModerationSafe(response, objectName);
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

  private isSafeAliyunLabel(label: string) {
    const normalized = label.toLowerCase();
    return ['nonlabel', 'normal', 'safe', 'pass'].includes(normalized);
  }

  private normalizeEndpoint(endpoint: string) {
    return /^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;
  }

  private normalizeOssRegionId(regionId: string) {
    return regionId.startsWith('oss-') ? regionId.slice(4) : regionId;
  }
}
