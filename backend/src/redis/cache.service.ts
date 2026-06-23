import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private redisService: RedisService) {}

  /**
   * 缓存用户信息（1小时）
   */
  async cacheUser(userId: number, userData: unknown): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.setex(`user:${userId}`, 3600, JSON.stringify(userData));
      this.logger.debug(`Cached user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to cache user ${userId}:`, error);
    }
  }

  /**
   * 获取缓存的用户信息
   */
  async getUser(userId: number): Promise<unknown> {
    try {
      const redis = this.redisService.getClient();
      const data = await redis.get(`user:${userId}`);
      return data ? this.parseJson(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get cached user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 缓存用户会话
   */
  async cacheSession(
    sessionId: string,
    data: unknown,
    ttl: number = 86400,
  ): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
    } catch (error) {
      this.logger.error(`Failed to cache session ${sessionId}:`, error);
    }
  }

  /**
   * 获取会话数据
   */
  async getSession(sessionId: string): Promise<unknown> {
    try {
      const redis = this.redisService.getClient();
      const data = await redis.get(`session:${sessionId}`);
      return data ? this.parseJson<unknown>(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.del(`session:${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to delete session ${sessionId}:`, error);
    }
  }

  /**
   * 缓存活动列表（3分钟）
   */
  async cacheMeets(type: string, meets: unknown[]): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      const key = type === 'all' ? 'meets:all' : `meets:${type}`;
      await redis.setex(key, 180, JSON.stringify(meets));
      this.logger.debug(`Cached ${meets.length} meets for type ${type}`);
    } catch (error) {
      this.logger.error(`Failed to cache meets for type ${type}:`, error);
    }
  }

  /**
   * 获取缓存的活动列表
   */
  async getMeets(type: string): Promise<unknown[] | null> {
    try {
      const redis = this.redisService.getClient();
      const key = type === 'all' ? 'meets:all' : `meets:${type}`;
      const data = await redis.get(key);
      return data ? this.parseJson<unknown[]>(data) : null;
    } catch (error) {
      this.logger.error(`Failed to get cached meets for type ${type}:`, error);
      return null;
    }
  }

  /**
   * 清除特定缓存
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        this.logger.debug(
          `Invalidated ${keys.length} cache keys matching ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache pattern ${pattern}:`,
        error,
      );
    }
  }

  /**
   * 清除所有缓存（谨慎使用）
   */
  async flushAll(): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.flushdb();
      this.logger.warn('Flushed all cache');
    } catch (error) {
      this.logger.error('Failed to flush cache:', error);
    }
  }

  private parseJson<T>(data: string): T {
    return JSON.parse(data) as T;
  }
}
