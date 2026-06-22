import { Injectable } from '@nestjs/common';

export type SocialAgentLlmOutputCacheStats = {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  size: number;
  savedApproxPromptChars: number;
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

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 128;

@Injectable()
export class SocialAgentLlmOutputCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;
  private savedApproxPromptChars = 0;

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
      approxChars: this.normalizeApproxChars(options.approxPromptChars, answer.length),
    });
    this.writes += 1;
    return answer;
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.evictions = 0;
    this.savedApproxPromptChars = 0;
  }

  stats(): SocialAgentLlmOutputCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      size: this.entries.size,
      savedApproxPromptChars: this.savedApproxPromptChars,
    };
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

  private normalizeApproxChars(value: number | undefined, fallback: number): number {
    if (!Number.isFinite(value) || value === undefined || value <= 0) {
      return Math.max(0, Math.floor(fallback));
    }
    return Math.floor(value);
  }
}
