import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';

export type SocialAgentSemanticResponseCacheHit = {
  answer: string;
  similarity: number;
  approxChars: number;
  alias: string | null;
};

export type SocialAgentSemanticResponseCacheStats = {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  size: number;
  savedApproxPromptChars: number;
};

type CacheEntry = {
  id: string;
  answer: string;
  alias: string | null;
  intent: string | null;
  model: string;
  promptPrefixHash: string | null;
  normalizedText: string;
  tokens: Set<string>;
  createdAt: number;
  expiresAt: number;
  approxChars: number;
};

type CacheInput = {
  userMessage: string;
  answer?: string | null;
  intent?: string | null;
  model: string;
  promptPrefixHash?: string | null;
};

type CacheOptions = {
  ttlMs?: number;
  threshold?: number;
  approxPromptChars?: number;
};

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_THRESHOLD = 0.78;

@Injectable()
export class SocialAgentSemanticResponseCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;
  private savedApproxPromptChars = 0;

  get(
    input: CacheInput,
    options: CacheOptions = {},
  ): SocialAgentSemanticResponseCacheHit | null {
    const now = Date.now();
    this.evictExpired(now);
    const query = this.prepare(input.userMessage);
    if (!query.normalizedText || query.tokens.size === 0) {
      this.misses += 1;
      return null;
    }
    let best: { entry: CacheEntry; similarity: number } | null = null;
    for (const entry of this.entries.values()) {
      if (!this.sameScope(entry, input)) continue;
      const similarity = this.similarity(query, entry);
      if (!best || similarity > best.similarity) {
        best = { entry, similarity };
      }
    }
    const threshold = this.normalizeThreshold(options.threshold);
    if (!best || best.similarity < threshold) {
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    this.savedApproxPromptChars += best.entry.approxChars;
    return {
      answer: best.entry.answer,
      similarity: best.similarity,
      approxChars: best.entry.approxChars,
      alias: best.entry.alias,
    };
  }

  set(input: CacheInput, options: CacheOptions = {}): string | null {
    const answer = cleanDisplayText(input.answer, '').trim();
    if (!answer) return null;
    const prepared = this.prepare(input.userMessage);
    if (!prepared.normalizedText || prepared.tokens.size === 0) return null;
    const now = Date.now();
    this.evictExpired(now);
    while (this.entries.size >= DEFAULT_MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
    const id = [
      'semantic',
      input.model,
      input.promptPrefixHash ?? 'none',
      this.normalizeIntent(input.intent),
      prepared.alias ?? 'generic',
      prepared.normalizedText,
    ].join('|');
    this.entries.set(id, {
      id,
      answer,
      alias: prepared.alias,
      intent: this.normalizeIntent(input.intent),
      model: input.model,
      promptPrefixHash: input.promptPrefixHash ?? null,
      normalizedText: prepared.normalizedText,
      tokens: prepared.tokens,
      createdAt: now,
      expiresAt: now + this.normalizeTtl(options.ttlMs),
      approxChars: this.normalizeApproxChars(
        options.approxPromptChars,
        answer.length + prepared.normalizedText.length,
      ),
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

  stats(): SocialAgentSemanticResponseCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      size: this.entries.size,
      savedApproxPromptChars: this.savedApproxPromptChars,
    };
  }

  private sameScope(entry: CacheEntry, input: CacheInput): boolean {
    return (
      entry.model === input.model &&
      entry.promptPrefixHash === (input.promptPrefixHash ?? null) &&
      entry.intent === this.normalizeIntent(input.intent)
    );
  }

  private similarity(
    query: { alias: string | null; tokens: Set<string> },
    entry: CacheEntry,
  ): number {
    const base = this.jaccard(query.tokens, entry.tokens);
    if (query.alias && query.alias === entry.alias) {
      return Math.max(base, 0.94);
    }
    return base;
  }

  private prepare(text: string): {
    normalizedText: string;
    alias: string | null;
    tokens: Set<string>;
  } {
    const normalizedText = cleanDisplayText(text, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '');
    const alias = this.aliasFor(text);
    const tokens = new Set<string>();
    if (alias) tokens.add(`alias:${alias}`);
    for (let i = 0; i < normalizedText.length; i += 1) {
      tokens.add(normalizedText[i]);
      if (i < normalizedText.length - 1) {
        tokens.add(normalizedText.slice(i, i + 2));
      }
    }
    return { normalizedText, alias, tokens };
  }

  private aliasFor(text: string): string | null {
    const value = cleanDisplayText(text, '').toLowerCase();
    if (
      /(你|agent|fitmeet).{0,8}(能做什么|可以干什么|有什么功能|会什么|怎么用|能帮我什么)|功能介绍|使用说明/i.test(
        value,
      )
    ) {
      return 'capability_help';
    }
    if (
      /(安全吗|隐私|审批|确认|会不会自动|自动发|联系方式|公开位置|精确位置|安全边界|风控)/i.test(
        value,
      )
    ) {
      return 'safety_help';
    }
    if (
      /(怎么找|如何找|怎么约|如何约|流程|步骤).{0,12}(搭子|活动|约练|朋友|人)/i.test(
        value,
      )
    ) {
      return 'workflow_help';
    }
    return null;
  }

  private jaccard(left: Set<string>, right: Set<string>): number {
    if (left.size === 0 || right.size === 0) return 0;
    let intersection = 0;
    for (const item of left) {
      if (right.has(item)) intersection += 1;
    }
    const union = left.size + right.size - intersection;
    return union > 0 ? intersection / union : 0;
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

  private normalizeThreshold(value: number | undefined): number {
    if (!Number.isFinite(value) || value === undefined) {
      return DEFAULT_THRESHOLD;
    }
    return Math.min(Math.max(value, 0.1), 0.99);
  }

  private normalizeIntent(intent: string | null | undefined): string | null {
    const normalized = cleanDisplayText(intent, '').trim();
    return normalized || null;
  }
}
