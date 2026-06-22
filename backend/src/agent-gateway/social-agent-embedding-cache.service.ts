import { createHash } from 'crypto';

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';

import { cleanDisplayText } from '../common/display-text.util';
import { RedisService } from '../redis/redis.service';

export type SocialAgentEmbeddingCacheInput = {
  namespace: string;
  model: string;
  text: string;
  dimensions?: number | null;
  contentHash?: string | null;
};

export type SocialAgentEmbeddingCacheStats = {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  size: number;
  savedApproxInputChars: number;
  distributedHits: number;
  distributedMisses: number;
  distributedWrites: number;
  distributedErrors: number;
};

export type SocialAgentEmbeddingCacheRead = {
  key: string;
  vector: number[];
  hit: boolean;
  approxInputChars: number;
};

type CacheEntry = {
  key: string;
  vector: number[];
  createdAt: number;
  expiresAt: number;
  approxInputChars: number;
};

type CacheOptions = {
  ttlMs?: number;
};

type DistributedCacheEntry = {
  vector: number[];
  approxInputChars: number;
  createdAt: string;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 2_048;
const REDIS_KEY_PREFIX = 'fitmeet:social-agent:embedding-cache';

@Injectable()
export class SocialAgentEmbeddingCacheService {
  private readonly logger = new Logger(SocialAgentEmbeddingCacheService.name);
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;
  private savedApproxInputChars = 0;
  private distributedHits = 0;
  private distributedMisses = 0;
  private distributedWrites = 0;
  private distributedErrors = 0;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  get(input: SocialAgentEmbeddingCacheInput): number[] | null {
    return this.getWithMeta(input)?.vector ?? null;
  }

  getWithMeta(
    input: SocialAgentEmbeddingCacheInput,
  ): SocialAgentEmbeddingCacheRead | null {
    const key = this.keyFor(input);
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
    this.savedApproxInputChars += entry.approxInputChars;
    return {
      key,
      vector: entry.vector.slice(),
      hit: true,
      approxInputChars: entry.approxInputChars,
    };
  }

  set(
    input: SocialAgentEmbeddingCacheInput,
    vector: number[],
    options: CacheOptions = {},
  ): SocialAgentEmbeddingCacheRead {
    const key = this.keyFor(input);
    const now = Date.now();
    this.evictExpired(now);
    while (this.entries.size >= DEFAULT_MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
    const normalizedVector = this.normalizeVector(vector);
    const approxInputChars = this.approxInputChars(input);
    this.entries.set(key, {
      key,
      vector: normalizedVector,
      createdAt: now,
      expiresAt: now + this.normalizeTtl(options.ttlMs),
      approxInputChars,
    });
    this.writes += 1;
    return {
      key,
      vector: normalizedVector.slice(),
      hit: false,
      approxInputChars,
    };
  }

  async getOrSetWithMeta(
    input: SocialAgentEmbeddingCacheInput,
    loader: () => Promise<number[]> | number[],
    options: CacheOptions = {},
  ): Promise<SocialAgentEmbeddingCacheRead> {
    const cached = this.getWithMeta(input);
    if (cached) return cached;
    const distributed = await this.readDistributed(input);
    if (distributed) {
      this.set(input, distributed.vector, {
        ttlMs: this.normalizeTtl(options.ttlMs),
      });
      this.savedApproxInputChars += distributed.approxInputChars;
      return {
        key: this.keyFor(input),
        vector: distributed.vector.slice(),
        hit: true,
        approxInputChars: distributed.approxInputChars,
      };
    }
    const vector = await loader();
    const stored = this.set(input, vector, options);
    await this.writeDistributed(input, stored.vector, {
      ttlMs: this.normalizeTtl(options.ttlMs),
      approxInputChars: stored.approxInputChars,
    });
    return stored;
  }

  delete(input: SocialAgentEmbeddingCacheInput): void {
    this.entries.delete(this.keyFor(input));
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.evictions = 0;
    this.savedApproxInputChars = 0;
    this.distributedHits = 0;
    this.distributedMisses = 0;
    this.distributedWrites = 0;
    this.distributedErrors = 0;
  }

  stats(): SocialAgentEmbeddingCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      size: this.entries.size,
      savedApproxInputChars: this.savedApproxInputChars,
      distributedHits: this.distributedHits,
      distributedMisses: this.distributedMisses,
      distributedWrites: this.distributedWrites,
      distributedErrors: this.distributedErrors,
    };
  }

  keyFor(input: SocialAgentEmbeddingCacheInput): string {
    const namespace = this.cleanKeyPart(input.namespace, 'default');
    const model = this.cleanKeyPart(input.model, 'unknown');
    const dimensions =
      Number.isFinite(input.dimensions) &&
      input.dimensions &&
      input.dimensions > 0
        ? Math.floor(input.dimensions)
        : 0;
    const hash =
      input.contentHash && input.contentHash.trim()
        ? input.contentHash.trim()
        : this.hashText(input.text);
    return [namespace, model, dimensions, hash].join('|');
  }

  private async readDistributed(
    input: SocialAgentEmbeddingCacheInput,
  ): Promise<{ vector: number[]; approxInputChars: number } | null> {
    const client = this.distributedClient();
    if (!client) return null;

    try {
      const raw = await client.get(this.redisKey(input));
      if (!raw) {
        this.distributedMisses += 1;
        return null;
      }
      const parsed = JSON.parse(raw) as DistributedCacheEntry;
      if (!Array.isArray(parsed.vector)) {
        this.distributedMisses += 1;
        return null;
      }
      this.distributedHits += 1;
      const vector = this.normalizeVector(parsed.vector);
      return {
        vector,
        approxInputChars:
          Number.isFinite(parsed.approxInputChars) &&
          parsed.approxInputChars >= 0
            ? parsed.approxInputChars
            : this.approxInputChars(input),
      };
    } catch (error) {
      this.recordDistributedError(error);
      return null;
    }
  }

  private async writeDistributed(
    input: SocialAgentEmbeddingCacheInput,
    vector: number[],
    options: { ttlMs: number; approxInputChars: number },
  ): Promise<void> {
    const client = this.distributedClient();
    if (!client) return;

    try {
      const ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000));
      const entry: DistributedCacheEntry = {
        vector: this.normalizeVector(vector),
        approxInputChars: options.approxInputChars,
        createdAt: new Date().toISOString(),
      };
      await client.setex(
        this.redisKey(input),
        ttlSeconds,
        JSON.stringify(entry),
      );
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

  private redisKey(input: SocialAgentEmbeddingCacheInput): string {
    const digest = createHash('sha256')
      .update(this.keyFor(input))
      .digest('hex');
    return `${REDIS_KEY_PREFIX}:${digest}`;
  }

  private recordDistributedError(error: unknown): void {
    this.distributedErrors += 1;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.debug(`Distributed embedding cache unavailable: ${message}`);
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

  private normalizeVector(vector: number[]): number[] {
    return vector.map((value) =>
      Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0,
    );
  }

  private approxInputChars(input: SocialAgentEmbeddingCacheInput): number {
    return this.normalizeText(input.text).length;
  }

  private hashText(text: string): string {
    return createHash('sha256')
      .update(this.normalizeText(text))
      .digest('hex')
      .slice(0, 32);
  }

  private normalizeText(text: string): string {
    return cleanDisplayText(text, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private cleanKeyPart(value: string, fallback: string): string {
    const cleaned = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]+/g, '_');
    return cleaned || fallback;
  }
}
