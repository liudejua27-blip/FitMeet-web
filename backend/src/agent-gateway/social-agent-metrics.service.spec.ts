import { SocialAgentMetricsService } from './social-agent-metrics.service';

describe('SocialAgentMetricsService', () => {
  it('records tool result cache hit/miss and estimated prompt savings', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordToolResultCache({
      cacheName: 'candidate_pool_source',
      hit: false,
      approxChars: 120,
    });
    metrics.recordToolResultCache({
      cacheName: 'candidate_pool_source',
      hit: true,
      approxChars: 120,
    });

    expect(metrics.snapshot()).toMatchObject({
      toolResultCacheTotal: {
        'candidate_pool_source|miss': 1,
        'candidate_pool_source|hit': 1,
        'candidate_pool_source|saved_approx_prompt_chars': 120,
      },
      toolResultCacheSummary: {
        candidate_pool_source: {
          hits: 1,
          misses: 1,
          total: 2,
          hitRate: 0.5,
          savedApproxPromptChars: 120,
        },
      },
    });
  });

  it('summarizes multiple tool result caches independently', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordToolResultCache({
      cacheName: 'candidate_pool_source',
      hit: true,
      approxChars: 90,
    });
    metrics.recordToolResultCache({
      cacheName: 'candidate_public_profile_summary',
      hit: false,
      approxChars: 140,
    });
    metrics.recordToolResultCache({
      cacheName: 'candidate_public_profile_summary',
      hit: true,
      approxChars: 140,
    });
    metrics.recordToolResultCache({
      cacheName: 'candidate_public_profile_summary',
      hit: true,
      approxChars: 160,
    });

    expect(metrics.snapshot()).toMatchObject({
      toolResultCacheSummary: {
        candidate_pool_source: {
          hits: 1,
          misses: 0,
          total: 1,
          hitRate: 1,
          savedApproxPromptChars: 90,
        },
        candidate_public_profile_summary: {
          hits: 2,
          misses: 1,
          total: 3,
          hitRate: 0.6667,
          savedApproxPromptChars: 300,
        },
      },
    });
  });

  it('records exact LLM output cache hit/miss and estimated savings', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordLlmOutputCache({
      cacheName: 'final_response_exact',
      hit: false,
      approxChars: 80,
    });
    metrics.recordLlmOutputCache({
      cacheName: 'final_response_exact',
      hit: true,
      approxChars: 80,
    });

    expect(metrics.snapshot()).toMatchObject({
      llmOutputCacheTotal: {
        'final_response_exact|miss': 1,
        'final_response_exact|hit': 1,
        'final_response_exact|saved_approx_prompt_chars': 80,
      },
      llmOutputCacheSummary: {
        final_response_exact: {
          hits: 1,
          misses: 1,
          total: 2,
          hitRate: 0.5,
          savedApproxPromptChars: 80,
        },
      },
    });
  });

  it('summarizes exact and semantic LLM output caches independently', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordLlmOutputCache({
      cacheName: 'final_response_exact',
      hit: true,
      approxChars: 80,
    });
    metrics.recordLlmOutputCache({
      cacheName: 'final_response_semantic',
      hit: false,
      approxChars: 200,
    });
    metrics.recordLlmOutputCache({
      cacheName: 'final_response_semantic',
      hit: false,
      approxChars: 200,
    });
    metrics.recordLlmOutputCache({
      cacheName: 'final_response_semantic',
      hit: true,
      approxChars: 200,
    });

    expect(metrics.snapshot()).toMatchObject({
      llmOutputCacheSummary: {
        final_response_exact: {
          hits: 1,
          misses: 0,
          total: 1,
          hitRate: 1,
          savedApproxPromptChars: 80,
        },
        final_response_semantic: {
          hits: 1,
          misses: 2,
          total: 3,
          hitRate: 0.3333,
          savedApproxPromptChars: 200,
        },
      },
    });
  });

  it('summarizes LLM prompt fingerprint reuse by cache name', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordLlmOutputCache({
      cacheName: 'intent_router_exact',
      hit: false,
      promptPrefixHash: 'prefix-a',
      dynamicContextHash: 'dynamic-a',
    });
    metrics.recordLlmOutputCache({
      cacheName: 'intent_router_exact',
      hit: true,
      promptPrefixHash: 'prefix-a',
      dynamicContextHash: 'dynamic-b',
    });
    metrics.recordLlmOutputCache({
      cacheName: 'brain_planner_exact',
      hit: false,
      promptPrefixHash: 'prefix-b',
      dynamicContextHash: 'dynamic-c',
    });

    expect(metrics.snapshot()).toMatchObject({
      llmPromptFingerprintSummary: {
        intent_router_exact: {
          observations: 2,
          distinctPromptPrefixHashes: 1,
          distinctDynamicContextHashes: 2,
          promptPrefixReuseRate: 0.5,
        },
        brain_planner_exact: {
          observations: 1,
          distinctPromptPrefixHashes: 1,
          distinctDynamicContextHashes: 1,
          promptPrefixReuseRate: 0,
        },
      },
    });
  });

  it('aggregates cache efficiency across tool and LLM output caches', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordToolResultCache({
      cacheName: 'candidate_pool_source',
      hit: true,
      approxChars: 100,
    });
    metrics.recordToolResultCache({
      cacheName: 'candidate_public_profile_summary',
      hit: false,
      approxChars: 150,
    });
    metrics.recordToolResultCache({
      cacheName: 'candidate_public_profile_summary',
      hit: true,
      approxChars: 150,
    });
    metrics.recordLlmOutputCache({
      cacheName: 'final_response_exact',
      hit: false,
      approxChars: 200,
    });
    metrics.recordLlmOutputCache({
      cacheName: 'final_response_exact',
      hit: true,
      approxChars: 200,
    });
    metrics.recordEmbeddingCache({
      cacheName: 'rag_doc',
      hit: false,
      approxChars: 180,
    });
    metrics.recordEmbeddingCache({
      cacheName: 'rag_doc',
      hit: true,
      approxChars: 180,
    });

    expect(metrics.snapshot()).toMatchObject({
      embeddingCacheSummary: {
        rag_doc: {
          hits: 1,
          misses: 1,
          total: 2,
          hitRate: 0.5,
          savedApproxPromptChars: 180,
        },
      },
      cacheEfficiencySummary: {
        toolResult: {
          hits: 2,
          misses: 1,
          total: 3,
          hitRate: 0.6667,
          savedApproxPromptChars: 250,
        },
        llmOutput: {
          hits: 1,
          misses: 1,
          total: 2,
          hitRate: 0.5,
          savedApproxPromptChars: 200,
        },
        embedding: {
          hits: 1,
          misses: 1,
          total: 2,
          hitRate: 0.5,
          savedApproxPromptChars: 180,
        },
        combined: {
          hits: 4,
          misses: 3,
          total: 7,
          hitRate: 0.5714,
          savedApproxPromptChars: 630,
        },
      },
      tokenOptimizationSummary: {
        estimatedAvoidedLlmCalls: 0,
        cacheHits: 4,
        cacheMisses: 3,
        cacheTotal: 7,
        cacheHitRate: 0.5714,
        savedApproxPromptChars: 630,
      },
    });
  });

  it('summarizes deterministic workflow routes and avoided LLM calls', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordIntent('social_search', 'rules');
    metrics.recordWorkflowRoute('social_search', 'explicit_social_workflow', {
      skipBrain: true,
    });
    metrics.recordIntent('action_request', 'rules');
    metrics.recordWorkflowRoute('action_request', 'social_action_workflow', {
      skipBrain: true,
    });
    metrics.recordIntent('casual_chat', 'deepseek');

    expect(metrics.snapshot()).toMatchObject({
      workflowRouteTotal: {
        'social_search|explicit_social_workflow': 1,
        'action_request|social_action_workflow': 1,
      },
      workflowEfficiencySummary: {
        total: 2,
        totalIntentRoutes: 3,
        workflowRouteRate: 0.6667,
        estimatedAvoidedLlmCalls: 4,
        byIntent: {
          social_search: 1,
          action_request: 1,
        },
        byReason: {
          explicit_social_workflow: 1,
          social_action_workflow: 1,
        },
      },
      tokenOptimizationSummary: {
        estimatedAvoidedLlmCalls: 4,
        workflowAvoidedLlmCalls: 4,
      },
    });
  });

  it('summarizes deterministic route replies and avoided conversational LLM calls', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordDeterministicRouteReply('casual_chat');
    metrics.recordDeterministicRouteReply('casual_chat');
    metrics.recordDeterministicRouteReply('product_help');

    expect(metrics.snapshot()).toMatchObject({
      deterministicRouteReplyTotal: {
        casual_chat: 2,
        product_help: 1,
      },
      deterministicRouteEfficiencySummary: {
        total: 3,
        estimatedAvoidedLlmCalls: 3,
        byIntent: {
          casual_chat: 2,
          product_help: 1,
        },
      },
    });
  });

  it('summarizes deterministic low-risk card actions and avoided final LLM calls', () => {
    const metrics = new SocialAgentMetricsService();

    metrics.recordDeterministicAction('candidate.like');
    metrics.recordDeterministicAction('candidate.like');
    metrics.recordDeterministicAction('candidate.generate_opener', {
      estimatedAvoidedLlmCalls: 1,
    });

    expect(metrics.snapshot()).toMatchObject({
      deterministicActionTotal: {
        'candidate.like': 2,
        'candidate.generate_opener': 1,
      },
      deterministicActionEfficiencySummary: {
        total: 3,
        estimatedAvoidedLlmCalls: 3,
        byAction: {
          'candidate.like': 2,
          'candidate.generate_opener': 1,
        },
      },
    });
  });
});
