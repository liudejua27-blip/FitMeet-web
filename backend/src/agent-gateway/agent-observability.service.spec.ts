import { AgentObservabilityService } from './agent-observability.service';

describe('AgentObservabilityService', () => {
  it('records production metrics and raises alert snapshots', () => {
    const service = new AgentObservabilityService();
    const traceId = service.createTraceId('agent');

    service.recordAgentRun({
      traceId,
      runId: 'loop:1',
      taskId: 1,
      status: 'started',
    });
    for (let index = 0; index < 11; index += 1) {
      service.recordLlmCall({
        traceId,
        taskId: 1,
        useCase: 'final_response',
        model: 'deepseek',
        success: index < 9,
        latencyMs: 1000,
        firstTokenLatencyMs: index === 0 ? 3000 : 2600,
        promptTokens: 100,
        promptCacheHitTokens: index < 6 ? 80 : 0,
        promptCacheMissTokens: index < 6 ? 20 : 100,
        completionTokens: 12,
        reasoningTokens: 3,
        promptPrefixHash: 'prefix-a',
        dynamicContextHash: index % 2 === 0 ? 'dynamic-a' : 'dynamic-b',
        tokenCount: 10,
        approxPromptChars: index < 6 ? 1800 : 2400,
        failureReason: index < 9 ? null : 'deepseek_timeout',
      });
      service.recordToolCall({
        traceId,
        runId: 'loop:1',
        toolName: 'search_real_candidates',
        status: index < 9 ? 'observed' : 'failed',
        latencyMs: 120,
        failureReason: index < 9 ? null : 'tool_failed',
      });
      service.recordSse({
        streamName: 'message_stream',
        status: 'started',
      });
    }
    service.recordSse({
      streamName: 'message_stream',
      status: 'interrupted',
      failureReason: 'client_disconnected',
      latencyMs: 50,
    });
    service.recordDbQuery({
      operation: 'agent_tasks.find',
      latencyMs: 800,
      success: true,
    });
    service.recordQueueSnapshot([
      { queueName: 'fitmeet.subagent.social-match-agent', queueDepth: 30 },
    ]);

    const snapshot = service.snapshot();

    expect(snapshot.counters).toEqual(
      expect.objectContaining({
        'agent_run.started': 1,
        'llm.total': 11,
        'llm.failed': 2,
        'llm_prompt_tokens.final_response': 1100,
        'llm_prompt_cache_hit_tokens.final_response': 480,
        'llm_prompt_cache_miss_tokens.final_response': 620,
        'llm_completion_tokens.final_response': 132,
        'llm_reasoning_tokens.final_response': 33,
        'llm_approx_prompt_chars.final_response': 22800,
        'tool.failed': 2,
        'sse.interrupted': 1,
        'db.slow_query': 1,
      }),
    );
    expect(snapshot.llmTokenCost).toMatchObject({
      final_response: {
        calls: 11,
        success: 9,
        failed: 2,
        promptTokens: 1100,
        promptCacheHitTokens: 480,
        promptCacheMissTokens: 620,
        promptCacheHitRate: 0.4364,
        completionTokens: 132,
        reasoningTokens: 33,
        reportedTokenCount: 110,
        approxPromptChars: 22800,
        avgApproxPromptChars: 2073,
        estimatedBillableInputTokens: 620,
        distinctPromptPrefixHashes: 1,
        distinctDynamicContextHashes: 2,
        models: ['deepseek'],
      },
    });
    expect(snapshot.llmContextBudgetRecommendations).toMatchObject({
      final_response: {
        mode: 'standard',
        reasons: [],
        calls: 11,
        avgApproxPromptChars: 2073,
        avgBillableInputTokens: expect.any(Number),
        promptCacheHitRate: 0.4364,
        distinctPromptPrefixHashes: 1,
        distinctDynamicContextHashes: 2,
      },
    });
    expect(snapshot.executionCostSummary).toMatchObject({
      agentRunCount: 1,
      llmCallCount: 11,
      toolCallCount: 11,
      avgLlmCallsPerRun: 11,
      avgToolCallsPerRun: 11,
      llmByUseCase: {
        final_response: {
          calls: 11,
          estimatedBillableInputTokens: 620,
          completionTokens: 132,
          reasoningTokens: 33,
          avgLatencyMs: 1000,
        },
      },
      toolByName: {
        search_real_candidates: {
          calls: 11,
          failed: 2,
          blocked: 0,
          avgLatencyMs: 120,
        },
      },
    });
    expect(snapshot.recentRunCostSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'loop:1',
          traceId,
          taskId: 1,
          status: 'started',
          llmCallCount: 11,
          toolCallCount: 11,
          promptTokens: 1100,
          promptCacheHitTokens: 480,
          promptCacheMissTokens: 620,
          promptCacheHitRate: 0.4364,
          estimatedBillableInputTokens: 620,
          completionTokens: 132,
          reasoningTokens: 33,
          reportedTokenCount: 110,
          approxPromptChars: 22800,
          models: ['deepseek'],
          llmUseCases: {
            final_response: 11,
          },
          tools: {
            search_real_candidates: {
              calls: 11,
              observed: 9,
              failed: 2,
              blocked: 0,
            },
          },
        }),
      ]),
    );
    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'llm_failure_rate_high' }),
        expect.objectContaining({ code: 'tool_failure_rate_high' }),
        expect.objectContaining({ code: 'db_slow_query_detected' }),
        expect.objectContaining({ code: 'queue_backlog_high' }),
        expect.objectContaining({ code: 'token_latency_high' }),
      ]),
    );
  });

  it('raises LLM token budget and cache quality alerts', () => {
    const service = new AgentObservabilityService();

    expect(service.recommendedLlmContextMode('final_response')).toBe(
      'standard',
    );

    for (let index = 0; index < 12; index += 1) {
      service.recordLlmCall({
        taskId: 7,
        useCase: 'final_response',
        model: 'deepseek-v4-pro',
        success: true,
        latencyMs: 1800,
        promptTokens: 9000,
        promptCacheHitTokens: index === 0 ? 120 : 0,
        promptCacheMissTokens: index === 0 ? 8880 : 9000,
        completionTokens: 120,
        reasoningTokens: 40,
        approxPromptChars: 26000,
        promptPrefixHash: `prefix-${index}`,
        dynamicContextHash: `dynamic-${index}`,
      });
    }

    expect(service.snapshot().alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'llm_prompt_context_too_large',
          severity: 'critical',
        }),
        expect.objectContaining({
          code: 'llm_billable_input_per_call_high',
        }),
        expect.objectContaining({
          code: 'llm_prompt_cache_hit_rate_low',
        }),
        expect.objectContaining({
          code: 'llm_prompt_prefix_churn_high',
        }),
      ]),
    );
    expect(service.snapshot().llmContextBudgetRecommendations).toMatchObject({
      final_response: {
        mode: 'strict',
        reasons: expect.arrayContaining([
          'avg_prompt_context_too_large',
          'avg_billable_input_high',
          'prompt_cache_hit_rate_low',
          'prompt_prefix_churn_high',
        ]),
        avgApproxPromptChars: 26000,
        distinctPromptPrefixHashes: 12,
      },
    });
    expect(service.recommendedLlmContextMode('final_response')).toBe('strict');
  });
});
