import { createHash } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';

export type SocialAgentLlmOutputCacheStats = {
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

type CacheEntry = {
  answer: string;
  expiresAt: number;
  createdAt: number;
  approxChars: number;
};

type CacheOptions = {
  ttlMs?: number;
  approxPromptChars?: number;
};

type DistributedCacheEntry = {
  answer: string;
  approxChars: number;
  createdAt: string;
};

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 128;
const REDIS_KEY_PREFIX = 'fitmeet:social-agent:llm-output-cache';

@Injectable()
export class SocialAgentLlmOutputCacheService {
  private readonly logger = new Logger(SocialAgentLlmOutputCacheService.name);
  private readonly entries = new Map<string, CacheEntry>();
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

  get(key: string): string | null {
    const now = Date.now();
    const entry = this.entries.get(key);
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
    return entry.answer;
  }

  async getAsync(key: string): Promise<string | null> {
    const cached = this.get(key);
    if (cached !== null) return cached;
    if (!this.distributedCacheEnabled()) return null;

    const distributed = await this.readDistributed(key);
    if (!distributed) return null;
    this.set(key, distributed.answer, {
      ttlMs: DEFAULT_TTL_MS,
      approxPromptChars: distributed.approxChars,
    });
    this.savedApproxPromptChars += distributed.approxChars;
    return distributed.answer;
  }

  set(key: string, answer: string, options: CacheOptions = {}): string {
    const now = Date.now();
    this.evictExpired(now);
    while (this.entries.size >= DEFAULT_MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
    this.entries.set(key, {
      answer,
      createdAt: now,
      expiresAt: now + this.normalizeTtl(options.ttlMs),
      approxChars: this.normalizeApproxChars(
        options.approxPromptChars,
        answer.length,
      ),
    });
    this.writes += 1;
    return answer;
  }

  async setAsync(
    key: string,
    answer: string,
    options: CacheOptions = {},
  ): Promise<string> {
    const stored = this.set(key, answer, options);
    await this.writeDistributed(key, answer, {
      ttlMs: this.normalizeTtl(options.ttlMs),
      approxStoredChars: this.normalizeApproxChars(
        options.approxPromptChars,
        answer.length,
      ),
    });
    return stored;
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

  stats(): SocialAgentLlmOutputCacheStats {
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

  private async readDistributed(
    key: string,
  ): Promise<{ answer: string; approxChars: number } | null> {
    const client = this.distributedClient();
    if (!client) return null;

    try {
      const raw = await client.get(this.redisKey(key));
      if (!raw) {
        this.distributedMisses += 1;
        return null;
      }
      const parsed = JSON.parse(raw) as DistributedCacheEntry;
      if (!parsed.answer) {
        this.distributedMisses += 1;
        return null;
      }
      this.distributedHits += 1;
      return {
        answer: parsed.answer,
        approxChars:
          Number.isFinite(parsed.approxChars) && parsed.approxChars >= 0
            ? parsed.approxChars
            : parsed.answer.length,
      };
    } catch (error) {
      this.recordDistributedError(error);
      return null;
    }
  }

  private async writeDistributed(
    key: string,
    answer: string,
    options: { ttlMs: number; approxStoredChars: number },
  ): Promise<void> {
    const client = this.distributedClient();
    if (!client) return;

    try {
      const ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000));
      const entry: DistributedCacheEntry = {
        answer,
        approxChars: options.approxStoredChars,
        createdAt: new Date().toISOString(),
      };
      await client.setex(this.redisKey(key), ttlSeconds, JSON.stringify(entry));
      this.distributedWrites += 1;
    } catch (error) {
      this.recordDistributedError(error);
    }
  }

  private distributedClient(): Pick<Redis, 'get' | 'setex'> | null {
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
      ?.trim()
      .toLowerCase();
    return backend === 'redis' || backend === 'hybrid';
  }

  private redisKey(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex');
    return `${REDIS_KEY_PREFIX}:${digest}`;
  }

  private recordDistributedError(error: unknown): void {
    this.distributedErrors += 1;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.debug(`Distributed LLM output cache unavailable: ${message}`);
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

  private normalizeApproxChars(
    value: number | undefined,
    fallback: number,
  ): number {
    if (!Number.isFinite(value) || value === undefined || value <= 0) {
      return Math.max(0, Math.floor(fallback));
    }
    return Math.floor(value);
  }
}
