import {
  buildSocialAgentExactCacheKey,
  buildSocialAgentPromptFingerprint,
  readSocialAgentExactCacheKeyFingerprint,
} from './social-agent-prompt-fingerprint.util';

describe('social-agent-prompt-fingerprint', () => {
  it('keeps the prompt prefix hash stable when only dynamic context changes', () => {
    const first = buildSocialAgentPromptFingerprint({
      schema: 'social_agent_brain_planner.v1',
      model: 'deepseek-v4-pro',
      useCase: 'planner',
      messages: [
        { role: 'system', content: 'fixed policy and tool contract' },
        { role: 'user', content: '{"message":"今天晚上散步"}' },
      ],
    });
    const second = buildSocialAgentPromptFingerprint({
      schema: 'social_agent_brain_planner.v1',
      model: 'deepseek-v4-pro',
      useCase: 'planner',
      messages: [
        { role: 'system', content: 'fixed policy and tool contract' },
        { role: 'user', content: '{"message":"周末下午羽毛球"}' },
      ],
    });

    expect(first.promptPrefixHash).toBe(second.promptPrefixHash);
    expect(first.dynamicContextHash).not.toBe(second.dynamicContextHash);
    expect(first.exactHash).not.toBe(second.exactHash);
  });

  it('changes the prompt prefix hash when static policy changes', () => {
    const first = buildSocialAgentPromptFingerprint({
      schema: 'social_agent_tool_json.v1',
      model: 'deepseek-v4-pro',
      useCase: 'tool_json',
      messages: [
        { role: 'system', content: 'return json only' },
        { role: 'user', content: '{"candidate":"陈砚"}' },
      ],
    });
    const second = buildSocialAgentPromptFingerprint({
      schema: 'social_agent_tool_json.v1',
      model: 'deepseek-v4-pro',
      useCase: 'tool_json',
      messages: [
        {
          role: 'system',
          content: 'return json only and include schemaVersion',
        },
        { role: 'user', content: '{"candidate":"陈砚"}' },
      ],
    });

    expect(first.promptPrefixHash).not.toBe(second.promptPrefixHash);
    expect(first.dynamicContextHash).toBe(second.dynamicContextHash);
  });

  it('builds cache keys that expose prefix and dynamic fingerprints', () => {
    const fingerprint = buildSocialAgentPromptFingerprint({
      schema: 'social_agent_intent_router.v1',
      model: 'deepseek-v4-flash',
      useCase: 'planner',
      messages: [
        { role: 'system', content: 'fixed router policy' },
        { role: 'user', content: '{"message":"你好"}' },
      ],
    });

    expect(
      buildSocialAgentExactCacheKey({
        cacheName: 'intent_router_exact',
        fingerprint,
      }),
    ).toMatch(
      /^intent_router_exact:prefix:[a-f0-9]{24}:dynamic:[a-f0-9]{24}:exact:[a-f0-9]{40}$/,
    );
  });

  it('reads prefix and dynamic hashes back from exact cache keys', () => {
    const fingerprint = buildSocialAgentPromptFingerprint({
      schema: 'social_agent_intent_router.v1',
      model: 'deepseek-v4-pro',
      useCase: 'planner',
      messages: [
        { role: 'system', content: 'policy' },
        { role: 'user', content: '我想找跑步搭子' },
      ],
    });
    const key = buildSocialAgentExactCacheKey({
      cacheName: 'intent_router_exact',
      fingerprint,
    });

    expect(readSocialAgentExactCacheKeyFingerprint(key)).toEqual({
      promptPrefixHash: fingerprint.promptPrefixHash,
      dynamicContextHash: fingerprint.dynamicContextHash,
    });
    expect(readSocialAgentExactCacheKeyFingerprint('legacy:key')).toBeNull();
  });
});
