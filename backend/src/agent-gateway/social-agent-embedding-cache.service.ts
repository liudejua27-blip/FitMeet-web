import { createHash } from 'crypto';

import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';

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

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 2_048;

@Injectable()
export class SocialAgentEmbeddingCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;
  private savedApproxInputChars = 0;

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
    const vector = await loader();
    return this.set(input, vector, options);
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
  }

  stats(): SocialAgentEmbeddingCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      size: this.entries.size,
      savedApproxInputChars: this.savedApproxInputChars,
    };
  }

  keyFor(input: SocialAgentEmbeddingCacheInput): string {
    const namespace = this.cleanKeyPart(input.namespace, 'default');
    const model = this.cleanKeyPart(input.model, 'unknown');
    const dimensions =
      Number.isFinite(input.dimensions) && input.dimensions && input.dimensions > 0
        ? Math.floor(input.dimensions)
        : 0;
    const hash =
      input.contentHash && input.contentHash.trim()
        ? input.contentHash.trim()
        : this.hashText(input.text);
    return [namespace, model, dimensions, hash].join('|');
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
    return cleanDisplayText(text, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanKeyPart(value: string, fallback: string): string {
    const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_');
    return cleaned || fallback;
  }
}
