import { createHash } from 'node:crypto';

export type SocialAgentPromptFingerprintMessage = {
  role: string;
  content: string;
};

export type SocialAgentPromptFingerprintInput = {
  schema: string;
  model: string;
  useCase: string;
  messages: SocialAgentPromptFingerprintMessage[];
};

export type SocialAgentPromptFingerprint = {
  exactHash: string;
  promptPrefixHash: string;
  dynamicContextHash: string;
};

export function buildSocialAgentPromptFingerprint(
  input: SocialAgentPromptFingerprintInput,
): SocialAgentPromptFingerprint {
  const prefixMessages = input.messages.filter(
    (message, index) => index === 0 || message.role === 'system',
  );
  const dynamicMessages = input.messages.filter(
    (message, index) => index > 0 && message.role !== 'system',
  );

  const prefixPayload = {
    schema: input.schema,
    model: input.model,
    useCase: input.useCase,
    messages: prefixMessages,
  };
  const dynamicPayload = {
    schema: input.schema,
    model: input.model,
    useCase: input.useCase,
    messages: dynamicMessages,
  };
  const exactPayload = {
    schema: input.schema,
    model: input.model,
    useCase: input.useCase,
    messages: input.messages,
  };

  return {
    exactHash: shortHash(exactPayload, 40),
    promptPrefixHash: shortHash(prefixPayload, 24),
    dynamicContextHash: shortHash(dynamicPayload, 24),
  };
}

export function buildSocialAgentExactCacheKey(input: {
  cacheName: string;
  fingerprint: SocialAgentPromptFingerprint;
}): string {
  return [
    input.cacheName,
    `prefix:${input.fingerprint.promptPrefixHash}`,
    `dynamic:${input.fingerprint.dynamicContextHash}`,
    `exact:${input.fingerprint.exactHash}`,
  ].join(':');
}

export function readSocialAgentExactCacheKeyFingerprint(
  cacheKey: string,
): Pick<
  SocialAgentPromptFingerprint,
  'promptPrefixHash' | 'dynamicContextHash'
> | null {
  const match =
    /^.+:prefix:([a-f0-9]{24}):dynamic:([a-f0-9]{24}):exact:[a-f0-9]{40}$/.exec(
      cacheKey,
    );
  if (!match) return null;
  return {
    promptPrefixHash: match[1],
    dynamicContextHash: match[2],
  };
}

function shortHash(value: unknown, length: number): string {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex')
    .slice(0, length);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortObject(item));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortObject((value as Record<string, unknown>)[key]);
  }
  return out;
}
