import { Injectable, BadRequestException, Logger } from '@nestjs/common';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  // Basic keyword list - in production use external dictionary or AI service
  private bannedWords = ['badword1', 'badword2', 'spam', 'scam', 'hate', '垃圾', '诈骗', '违规'];


  /**
   * Synchronous check for sensitive words (legacy/fast check)
   */
  checkForSensitiveWords(content: string): void {
    if (!content) return;

    // Simple implementation
    const lowerContent = content.toLowerCase();
    const foundBadWord = this.bannedWords.find(word => lowerContent.includes(word));

    if (foundBadWord) {
      this.logger.warn(`Text moderation failed: Keyword '${foundBadWord}' found.`);
      throw new BadRequestException(`Content contains prohibited word: ${foundBadWord}`);
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
  async checkImage(imageBuffer: Buffer, filename: string = 'unknown'): Promise<boolean> {
      this.logger.log(`Starting moderation for image: ${filename}`);

      // Simulated External API Call
      const isSafe = await this.simulateExternalImageScan(imageBuffer, filename);

      if (!isSafe) {
          this.logger.warn(`Image moderation failed for ${filename}`);
          throw new BadRequestException('Image content violates safety guidelines.');
      }
      return true;
  }

  // Helpers...
  private async simulateExternalTextScan(text: string): Promise<boolean> {
    // Mock latency
    await new Promise(resolve => setTimeout(resolve, 100));
    // Simulate failing for specific content testing
    if (text.includes('FAIL_AI_CHECK')) return false;
    return true;
  }

  private async simulateExternalImageScan(buffer: Buffer, filename: string): Promise<boolean> {
      await new Promise(resolve => setTimeout(resolve, 200));
      // Simulate failure based on filename convention for testing
      if (filename.includes('test-bad')) return false;

      // In real scenario, we would send buffer to AWS Rekognition or Aliyun Green
      return true;
  }
}
