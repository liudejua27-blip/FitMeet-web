import * as fs from 'fs';
import * as path from 'path';

const directDeepSeekCallFiles = [
  '../ai/ai.service.ts',
  'social-agent-brain.service.ts',
  'social-agent-chat-deepseek-client.service.ts',
  'social-agent-final-response.service.ts',
  'social-agent-intent-router.service.ts',
  'social-agent-planner.service.ts',
  'social-agent-tool-json-model.service.ts',
  'match-reasoner.service.ts',
];

const qualityTimeoutGuards: Record<string, string[]> = {
  '../ai/ai.service.ts': [
    'resolveDeepSeekModel',
    'callDeepseekCompletion',
    'AI_DEEPSEEK_TIMEOUT_FLOOR_MS',
    'AI_DEEPSEEK_TIMEOUT_FALLBACK_MS',
    'Math.max(parsed, AI_DEEPSEEK_TIMEOUT_FLOOR_MS)',
  ],
  'social-agent-brain.service.ts': [
    'this.modelRouter.getTimeout(useCase)',
    'Math.min(\n      Math.max(configured, SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS),\n      60_000,\n    )',
  ],
  'social-agent-chat-deepseek-client.service.ts': [
    'this.modelRouter.getTimeout(useCase)',
    'SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS',
    'SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS',
    'SOCIAL_AGENT_QUALITY_TOOL_TIMEOUT_MS',
  ],
  'social-agent-final-response.service.ts': [
    'this.modelRouter.getTimeout(useCase)',
    'SOCIAL_AGENT_QUALITY_CHAT_TIMEOUT_MS',
  ],
  'social-agent-intent-router.service.ts': [
    'this.modelRouter.getTimeout(useCase)',
    'Math.min(\n      Math.max(configured, SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS),\n      60_000,\n    )',
  ],
  'social-agent-planner.service.ts': [
    'this.modelRouter.getTimeout(useCase)',
    'Math.min(\n        Math.max(configured, SOCIAL_AGENT_QUALITY_PLANNER_TIMEOUT_MS),\n        60_000,\n      )',
  ],
  'social-agent-tool-json-model.service.ts': [
    'selectSocialAgentToolTimeoutMs(useCase',
  ],
  'match-reasoner.service.ts': [
    "selectSocialAgentToolTimeoutMs('candidate_summary'",
  ],
};

const sharedDeepSeekClientGuards: Record<string, string[]> = {
  'social-agent-planner.service.ts': [
    'SocialAgentChatDeepSeekClientService',
    'this.deepSeek.complete',
  ],
  'social-agent-tool-json-model.service.ts': [
    'SocialAgentChatDeepSeekClientService',
    'this.deepSeek.complete',
  ],
  'match-reasoner.service.ts': [
    'SocialAgentChatDeepSeekClientService',
    'this.deepSeek.complete',
  ],
  'social-agent-final-response.service.ts': [
    'SocialAgentChatDeepSeekClientService',
    'this.deepSeek.complete',
  ],
};

function readSource(file: string): string {
  return fs.readFileSync(path.join(__dirname, file), 'utf8');
}

function readMethodBody(source: string, methodName: string): string {
  const match = new RegExp(
    `(?:^|\\n)\\s*(?:(?:private|public|protected)\\s+)?(?:async\\s+)?${methodName}\\b`,
  ).exec(source);
  const start = match?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const openBrace = source.indexOf('{', start);
  expect(openBrace).toBeGreaterThan(start);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openBrace + 1, index);
    }
  }
  throw new Error(`Could not read method body for ${methodName}`);
}

function readPrivateMethodSection(source: string, methodName: string): string {
  const match = new RegExp(`private\\s+(?:async\\s+)?${methodName}\\b`).exec(
    source,
  );
  const start = match?.index ?? -1;
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const nextMethod = /\n\s*private\s+(?:async\s+)?[a-zA-Z0-9_]+\b/.exec(rest);
  const end = nextMethod ? start + 1 + nextMethod.index : source.length;
  return source.slice(start, end);
}

function findPrematureTimeoutLiterals(source: string): string[] {
  const matches: string[] = [];
  const forbidden = [
    /\b2_?500\b/g,
    /\b3_?500\b/g,
    /\b5_?000\b/g,
    /\b9_?000\b/g,
    /SOCIAL_AGENT_(?:INTENT|PLANNER|CHAT|FINAL_RESPONSE|DEEPSEEK|CARD|CANDIDATE|SAFETY)[A-Z_]*TIMEOUT[A-Z_]*[^;\n]*\?\?\s*['"`]?(?:2500|3500|5000)['"`]?/g,
  ];
  for (const pattern of forbidden) {
    for (const match of source.matchAll(pattern)) {
      matches.push(match[0]);
    }
  }
  return matches;
}

describe('Social Agent DeepSeek quality production boundary', () => {
  it('does not reintroduce premature DeepSeek route, planner, or tool timeouts', () => {
    const violations: Array<{ file: string; matches: string[] }> = [];

    for (const file of directDeepSeekCallFiles) {
      const source = readSource(file);
      const matches = findPrematureTimeoutLiterals(source);
      if (matches.length > 0) {
        violations.push({ file, matches });
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps direct DeepSeek callers behind the shared quality timeout policy', () => {
    const violations: Array<{ file: string; missing: string[] }> = [];

    for (const file of directDeepSeekCallFiles) {
      const source = readSource(file);
      if (!source.includes('/v1/chat/completions')) continue;
      const expected = qualityTimeoutGuards[file] ?? [];
      const missing = expected.filter((pattern) => !source.includes(pattern));
      if (missing.length > 0) {
        violations.push({ file, missing });
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not let fast model fallbacks downgrade user-facing chat, planner, or final responses', () => {
    const directUserFacingCallers = [
      '../ai/ai.service.ts',
      'social-agent-chat-deepseek-client.service.ts',
      'social-agent-final-response.service.ts',
      'social-agent-planner.service.ts',
    ];
    const violations = directUserFacingCallers.flatMap((file) => {
      const source = readSource(file);
      return [
        'SOCIAL_AGENT_DEFAULT_FAST_MODEL',
        'DEEPSEEK_FAST_MODEL',
        'allowFast: this.fastRoutingMode()',
        'private fastRoutingMode',
      ]
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${file}: ${pattern}`);
    });
    const routerSource = readSource('social-agent-model-router.service.ts');
    const routerDefaultChatModel = readMethodBody(
      routerSource,
      'defaultChatModel',
    );

    expect(routerSource).not.toContain(
      "allowFast: this.routingMode() === 'fast'",
    );
    expect(routerDefaultChatModel).not.toContain('DEEPSEEK_FAST_MODEL');
    expect(routerDefaultChatModel).not.toContain(
      'SOCIAL_AGENT_DEFAULT_FAST_MODEL',
    );
    expect(violations).toEqual([]);
  });

  it('does not let legacy tool model helpers downgrade tool reasoning to fast models', () => {
    const source = readSource('social-agent-tool-model.ts');

    expect(source).not.toContain('SOCIAL_AGENT_DEFAULT_FAST_MODEL');
    expect(source).not.toContain('DEEPSEEK_FAST_MODEL');
    expect(source).not.toContain('allowFast: !qualityMode');
    expect(source).not.toContain("SOCIAL_AGENT_MODEL_ROUTING_MODE') ?? ''");
  });

  it('keeps AIService on the shared DeepSeek completion helper', () => {
    const source = readSource('../ai/ai.service.ts');

    expect(source).toContain('callDeepSeekChatCompletion');
    expect(source).not.toContain('/v1/chat/completions');
    expect(source).not.toContain('new AbortController()');
  });

  it('keeps reusable planner and tool-json calls on the shared DeepSeek client path', () => {
    const violations: Array<{ file: string; missing: string[] }> = [];

    for (const [file, expected] of Object.entries(sharedDeepSeekClientGuards)) {
      const source = readSource(file);
      const missing = expected.filter((pattern) => !source.includes(pattern));
      if (missing.length > 0) {
        violations.push({ file, missing });
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps tool JSON fallback calls on the common DeepSeek helper instead of a parallel fetch path', () => {
    const source = readSource('social-agent-tool-json-model.service.ts');

    expect(source).toContain('callDeepSeekChatCompletion');
    expect(source).not.toContain('/v1/chat/completions');
    expect(source).not.toContain('new AbortController()');
  });

  it('keeps match reasoner fallback calls on the common DeepSeek helper instead of a parallel fetch path', () => {
    const source = readSource('match-reasoner.service.ts');

    expect(source).toContain('callDeepSeekChatCompletion');
    expect(source).not.toContain('/v1/chat/completions');
    expect(source).not.toContain('new AbortController()');
  });

  it('keeps planner fallback calls on the common DeepSeek helper instead of a parallel fetch path', () => {
    const source = readSource('social-agent-planner.service.ts');

    expect(source).toContain('callDeepSeekChatCompletion');
    expect(source).not.toContain('/v1/chat/completions');
    expect(source).not.toContain('new AbortController()');
  });

  it('keeps intent router fallback calls on the common DeepSeek helper instead of a parallel fetch path', () => {
    const source = readSource('social-agent-intent-router.service.ts');

    expect(source).toContain('callDeepSeekChatCompletion');
    expect(source).not.toContain('/v1/chat/completions');
    expect(source).not.toContain('new AbortController()');
  });

  it('keeps brain fallback calls on the common DeepSeek helper instead of a parallel fetch path', () => {
    const source = readSource('social-agent-brain.service.ts');

    expect(source).toContain('callDeepSeekChatCompletion');
    expect(source).not.toContain('/v1/chat/completions');
    expect(source).not.toContain('new AbortController()');
  });

  it('normalizes direct DeepSeek model-call failure reasons through the shared classifier', () => {
    const directModelCallMethods = [
      {
        file: 'social-agent-brain.service.ts',
        method: 'callDeepSeekPlanner',
      },
      {
        file: 'social-agent-intent-router.service.ts',
        method: 'callDeepSeekRouter',
      },
      {
        file: 'social-agent-planner.service.ts',
        method: 'callDeepSeekPlan',
      },
      {
        file: 'social-agent-final-response.service.ts',
        method: 'generateWithDeepSeek',
      },
      {
        file: 'social-agent-chat-deepseek-client.service.ts',
        method: 'completeOnce',
      },
    ];
    const violations = directModelCallMethods.flatMap(({ file, method }) => {
      const source = readSource(file);
      const body = readPrivateMethodSection(source, method);
      const missingSharedClassifier = !body.includes(
        'socialAgentDeepSeekFailureReason(error)',
      );
      const rawReasonFallbacks = [
        'error instanceof Error ? error.message : String(error)',
        'error?.message',
      ].filter((pattern) => body.includes(pattern));

      return [
        ...(missingSharedClassifier
          ? [`${file}.${method}: missing shared classifier`]
          : []),
        ...rawReasonFallbacks.map(
          (pattern) => `${file}.${method}: raw reason ${pattern}`,
        ),
      ];
    });

    expect(violations).toEqual([]);
  });

  it('keeps intent routing LLM-first for short follow-up turns with existing task context', () => {
    const source = readSource('social-agent-intent-router.service.ts');
    const methodBody = readMethodBody(source, 'shouldTryDeepSeek');

    expect(methodBody).toContain('return true;');
    expect(methodBody).not.toMatch(
      /message\.length|\.length\s*[<>]=?\s*\d|fallback\.confidence|routeByRules|hasExplicitSocialExecutionIntent|hasSocialAgentImmediateSearchRequest|isProductHelpQuestion|isWorkflowHelpQuestion|casual_chat|product_help|workflow_help/,
    );
  });

  it('keeps final replies from degrading into stale fallback slot questions', () => {
    const source = readSource('social-agent-final-response.service.ts');
    const packerSource = readSource(
      'social-agent-token-budget-context-packer.service.ts',
    );
    const generateMethod = source.slice(
      source.indexOf('async generate('),
      source.indexOf('private async generateWithDeepSeek'),
    );
    const fallbackMethod = readMethodBody(source, 'contextAwareFallbackReply');
    const packerKnownSlotsMethod = readMethodBody(packerSource, 'knownSlots');
    const taskSlotConstraintsMethod = readMethodBody(
      packerSource,
      'taskSlotConstraints',
    );
    const slotEntriesMethod = readMethodBody(packerSource, 'slotEntries');
    const knownConstraintSlotEntriesMethod = readMethodBody(
      packerSource,
      'extractKnownConstraintSlotEntries',
    );
    const systemPromptMethod = readMethodBody(source, 'systemPrompt');

    expect(generateMethod).toContain('this.contextAwareFallbackReply(input)');
    expect(generateMethod).not.toContain('return input.fallbackReply');
    expect(fallbackMethod).toContain(
      'this.tokenBudgetContextPacker().knownSlots(input)',
    );
    expect(fallbackMethod).toContain('this.isStaleSlotClarification');
    expect(fallbackMethod).toContain('我记得你已经补充了');
    expect(packerKnownSlotsMethod).not.toContain(
      "slot.confirmation === 'user_confirmed'",
    );
    expect(taskSlotConstraintsMethod).toContain(
      "slot.confirmation === 'user_confirmed'",
    );
    expect(knownConstraintSlotEntriesMethod).toContain(
      'knownTaskSlotConstraints',
    );
    expect(knownConstraintSlotEntriesMethod).toContain('knownSlots');
    expect(knownConstraintSlotEntriesMethod).toContain('doNotAskAgainFor');
    expect(slotEntriesMethod).toContain('input.memoryContext?.taskSlots');
    expect(slotEntriesMethod).toContain('taskMemory.taskSlots');
    expect(slotEntriesMethod).toContain('taskContext.taskSlots');
    expect(slotEntriesMethod).toContain(
      'this.extractKnownConstraintSlotEntries(input.memoryContext)',
    );
    expect(systemPromptMethod).toContain(
      'taskContext.taskSlots 和 memoryContext.taskSlots 是用户已回答/已确认的信息硬约束',
    );
    expect(systemPromptMethod).toContain('不能重复追问');
    expect(systemPromptMethod).toContain(
      'taskContext.candidateActions/candidateState 是候选人操作事实',
    );
    expect(systemPromptMethod).toContain(
      'taskContext.pendingApprovals/pendingActions 是待用户确认的动作事实',
    );
  });
});
