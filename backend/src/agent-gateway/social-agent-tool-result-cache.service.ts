import { createHash } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';

export type SocialAgentToolResultCacheStats = {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  size: number;
  savedApproxPromptChars: number;
  distributedHits: number;
  distributedMisses: number;
  distributedWrites: number;
  distributedErrors: number;
};

export type SocialAgentToolResultCacheRead<T> = {
  value: T;
  hit: boolean;
  approxStoredChars: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
  approxChars: number;
};

type CacheOptions = {
  ttlMs?: number;
};

type DistributedCacheEntry<T> = {
  value: T;
  approxChars: number;
  createdAt: string;
};

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 256;
const REDIS_KEY_PREFIX = 'fitmeet:social-agent:tool-result-cache';

@Injectable()
export class SocialAgentToolResultCacheService {
  private readonly logger = new Logger(SocialAgentToolResultCacheService.name);
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;
  private savedApproxPromptChars = 0;
  private distributedHits = 0;
  private distributedMisses = 0;
  private distributedWrites = 0;
  private distributedErrors = 0;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  get<T>(key: string): T | null {
    return this.read<T>(key)?.value ?? null;
  }

  getWithMeta<T>(key: string): SocialAgentToolResultCacheRead<T> | null {
    const read = this.read<T>(key);
    if (!read) return null;
    return {
      value: read.value,
      hit: true,
      approxStoredChars: read.approxStoredChars,
    };
  }

  private read<T>(key: string): { value: T; approxStoredChars: number } | null {
    const now = Date.now();
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      this.evictions += 1;
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    this.savedApproxPromptChars += entry.approxChars;
    return {
      value: entry.value,
      approxStoredChars: entry.approxChars,
    };
  }

  set<T>(key: string, value: T, options: CacheOptions = {}): T {
    const now = Date.now();
    this.evictExpired(now);
    while (this.entries.size >= DEFAULT_MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
    const approxChars = this.approxChars(value);
    this.entries.set(key, {
      value,
      createdAt: now,
      expiresAt: now + this.normalizeTtl(options.ttlMs),
      approxChars,
    });
    this.writes += 1;
    return value;
  }

  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    const read = await this.getOrSetWithMeta(key, loader, options);
    return read.value;
  }

  async getOrSetWithMeta<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<SocialAgentToolResultCacheRead<T>> {
    const cached = this.getWithMeta<T>(key);
    if (cached) return cached;

    const distributed = await this.readDistributed<T>(key);
    if (distributed) {
      this.set(key, distributed.value, options);
      this.savedApproxPromptChars += distributed.approxChars;
      return {
        value: distributed.value,
        hit: true,
        approxStoredChars: distributed.approxChars,
      };
    }

    const value = await loader();
    const approxStoredChars = this.approxChars(value);
    this.set(key, value, options);
    await this.writeDistributed(key, value, {
      ttlMs: this.normalizeTtl(options.ttlMs),
      approxStoredChars,
    });
    return {
      value,
      hit: false,
      approxStoredChars,
    };
  }

  delete(key: string): void {
    this.entries.delete(key);
    void this.deleteDistributed(key);
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.evictions = 0;
    this.savedApproxPromptChars = 0;
    this.distributedHits = 0;
    this.distributedMisses = 0;
    this.distributedWrites = 0;
    this.distributedErrors = 0;
  }

  stats(): SocialAgentToolResultCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      size: this.entries.size,
      savedApproxPromptChars: this.savedApproxPromptChars,
      distributedHits: this.distributedHits,
      distributedMisses: this.distributedMisses,
      distributedWrites: this.distributedWrites,
      distributedErrors: this.distributedErrors,
    };
  }

  private async readDistributed<T>(
    key: string,
  ): Promise<{ value: T; approxChars: number } | null> {
    const client = this.distributedClient();
    if (!client) return null;

    try {
      const raw = await client.get(this.redisKey(key));
      if (!raw) {
        this.distributedMisses += 1;
        return null;
      }

      const parsed = JSON.parse(raw) as DistributedCacheEntry<T>;
      this.distributedHits += 1;
      return {
        value: parsed.value,
        approxChars:
          Number.isFinite(parsed.approxChars) && parsed.approxChars >= 0
            ? parsed.approxChars
            : this.approxChars(parsed.value),
      };
    } catch (error) {
      this.recordDistributedError(error);
      return null;
    }
  }

  private async writeDistributed<T>(
    key: string,
    value: T,
    options: { ttlMs: number; approxStoredChars: number },
  ): Promise<void> {
    const client = this.distributedClient();
    if (!client) return;

    try {
      const ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000));
      const entry: DistributedCacheEntry<T> = {
        value,
        approxChars: options.approxStoredChars,
        createdAt: new Date().toISOString(),
      };
      await client.setex(this.redisKey(key), ttlSeconds, JSON.stringify(entry));
      this.distributedWrites += 1;
    } catch (error) {
      this.recordDistributedError(error);
    }
  }

  private async deleteDistributed(key: string): Promise<void> {
    const client = this.distributedClient();
    if (!client) return;

    try {
      await client.del(this.redisKey(key));
    } catch (error) {
      this.recordDistributedError(error);
    }
  }

  private distributedClient(): Pick<Redis, 'get' | 'setex' | 'del'> | null {
    if (!this.distributedCacheEnabled()) return null;
    try {
      return this.redisService?.getClient() ?? null;
    } catch (error) {
      this.recordDistributedError(error);
      return null;
    }
  }

  private distributedCacheEnabled(): boolean {
    const backend = this.configService
      ?.get<string>('SOCIAL_AGENT_CACHE_BACKEND')
      ?.toLowerCase();
    const toolBackend = this.configService
      ?.get<string>('SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND')
      ?.toLowerCase();
    return (
      backend === 'redis' ||
      backend === 'hybrid' ||
      toolBackend === 'redis'
    );
  }

  private redisKey(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex');
    return `${REDIS_KEY_PREFIX}:${digest}`;
  }

  private recordDistributedError(error: unknown): void {
    this.distributedErrors += 1;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.debug(`Distributed tool result cache unavailable: ${message}`);
  }

  private evictExpired(now = Date.now()): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        this.evictions += 1;
      }
    }
  }

  private normalizeTtl(ttlMs: number | undefined): number {
    if (!Number.isFinite(ttlMs) || ttlMs === undefined) {
      return DEFAULT_TTL_MS;
    }
    return Math.max(1, Math.floor(ttlMs));
  }

  private approxChars(value: unknown): number {
    try {
      return JSON.stringify(value)?.length ?? 0;
    } catch {
      return 0;
    }
  }
}
