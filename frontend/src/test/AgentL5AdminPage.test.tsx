import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentL5RuntimeApi } from '../api/agentL5RuntimeApi';
import { AgentL5AdminPage } from '../pages/AgentL5AdminPage';

vi.mock('../api/agentL5RuntimeApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/agentL5RuntimeApi')>();
  return {
    ...actual,
    agentL5RuntimeApi: {
      dashboard: vi.fn(),
      runAutoRunnerOnce: vi.fn(),
    },
  };
});

describe('AgentL5AdminPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('visualizes replay cases, subagent memory, meet-loop state and canary decisions', async () => {
    vi.mocked(agentL5RuntimeApi.dashboard).mockResolvedValue({
      summary: {
        replayCases: 1,
        replayUsedForEval: 1,
        subagentMemories: 1,
        activeSubagents: 1,
        meetLoopStates: 1,
        activeMeetLoops: 1,
        canarySignals: 1,
        rollbackSignals: 1,
        autoRuns: 1,
      },
      replaySamples: [
        {
          id: 1,
          ownerUserId: 7,
          agentTaskId: 101,
          evalCaseId: 3,
          replayType: 'chat_turn',
          status: 'used_for_eval',
          input: { message: '今晚想找跑步搭子' },
          expectedBehavior: { shouldCallTool: true },
          replayContext: { route: 'match' },
          lastReplay: {
            pass: false,
            score: 0.91,
            regressionChecks: [
              {
                id: 'visible_process_trace',
                label: '可见过程时间线',
                pass: false,
                message: '缺少用户可见过程。',
              },
              {
                id: 'thread_task_run_binding',
                label: 'Thread / task / run 绑定',
                pass: true,
                message: '绑定稳定。',
              },
            ],
          },
          createdAt: '2026-06-09T12:00:00.000Z',
          updatedAt: '2026-06-09T12:00:00.000Z',
        },
      ],
      subagentMemory: [
        {
          id: 2,
          ownerUserId: 7,
          agentTaskId: 101,
          agentName: 'Social Match Agent',
          memoryScope: 'matching.candidate_memory',
          input: { message: '找跑步搭子' },
          observation: { candidateCount: 2 },
          critique: { text: 'candidate pool is usable' },
          handoffOutput: { nextAgent: 'Meet Loop Agent' },
          createdAt: '2026-06-09T12:00:00.000Z',
          updatedAt: '2026-06-09T12:05:00.000Z',
        },
      ],
      meetLoopStates: [
        {
          id: 3,
          ownerUserId: 7,
          agentTaskId: 101,
          activityId: 20,
          candidateUserId: 9,
          stage: 'activity_confirmed',
          waitingFor: 'activity_check_in',
          state: { place: 'park' },
          transitionHistory: [
            { from: null, to: 'invite_requested' },
            { from: 'invite_requested', to: 'activity_confirmed' },
          ],
          review: null,
          completedAt: null,
          createdAt: '2026-06-09T12:00:00.000Z',
          updatedAt: '2026-06-09T12:10:00.000Z',
        },
      ],
      patchEffects: [
        {
          id: 4,
          patchId: 8,
          metric: 'quality_drop',
          value: 0.12,
          sampleSize: 30,
          decision: 'rollback',
          note: 'rollback threshold hit',
          context: { rollout: 10 },
          createdAt: '2026-06-09T12:20:00.000Z',
        },
      ],
      autoRuns: [
        {
          id: 9,
          reflectionRunId: 11,
          patchType: 'prompt',
          title: 'Auto patch: user_facing',
          rationale: 'Generated from clustered failures.',
          target: 'fitmeet.agent.reply',
          patch: {
            autoRunner: { clusterKey: 'user_facing' },
            lastEvaluation: { evaluatedAt: '2026-06-09T12:15:00.000Z', passRate: 0.9 },
            rollout: { state: 'canary', percent: 10 },
            rollback: { reason: 'observe only' },
          },
          riskLevel: 'low',
          status: 'published',
          evalCaseIds: [3],
          reviewedByUserId: 7,
          reviewedAt: '2026-06-09T12:16:00.000Z',
          publishedAt: '2026-06-09T12:17:00.000Z',
          rolledBackAt: null,
          createdAt: '2026-06-09T12:14:00.000Z',
          updatedAt: '2026-06-09T12:20:00.000Z',
        },
      ],
      observability: {
        startedAt: '2026-06-09T12:00:00.000Z',
        counters: {
          'agent_run.started': 3,
          'llm.total': 4,
          'llm.failed': 1,
        },
        latency: {
          'llm.final_response': {
            count: 4,
            avgMs: 820,
            maxMs: 1600,
            firstMs: 700,
          },
        },
        llmTokenCost: {
          final_response: {
            calls: 4,
            success: 3,
            failed: 1,
            promptTokens: 12000,
            promptCacheHitTokens: 7200,
            promptCacheMissTokens: 4800,
            promptCacheHitRate: 0.6,
            completionTokens: 900,
            reasoningTokens: 120,
            reportedTokenCount: 1020,
            approxPromptChars: 24000,
            avgApproxPromptChars: 6000,
            estimatedBillableInputTokens: 4800,
            distinctPromptPrefixHashes: 1,
            distinctDynamicContextHashes: 3,
            models: ['deepseek-v4-pro'],
          },
        },
        executionCostSummary: {
          agentRunCount: 2,
          llmCallCount: 4,
          toolCallCount: 5,
          avgLlmCallsPerRun: 2,
          avgToolCallsPerRun: 2.5,
          llmByUseCase: {
            final_response: {
              calls: 4,
              estimatedBillableInputTokens: 4800,
              completionTokens: 900,
              reasoningTokens: 120,
              avgLatencyMs: 820,
            },
          },
          toolByName: {
            search_real_candidates: {
              calls: 5,
              failed: 1,
              blocked: 0,
              avgLatencyMs: 120,
            },
          },
        },
        recentRunCostSummary: [
          {
            runId: 'loop:1',
            traceId: 'trace:1',
            taskId: 101,
            status: 'completed',
            firstSeenAt: '2026-06-09T12:00:00.000Z',
            updatedAt: '2026-06-09T12:02:00.000Z',
            agentRunLatencyMs: 1800,
            failureReason: null,
            llmCallCount: 2,
            toolCallCount: 3,
            promptTokens: 12000,
            promptCacheHitTokens: 7200,
            promptCacheMissTokens: 4800,
            promptCacheHitRate: 0.6,
            estimatedBillableInputTokens: 4800,
            completionTokens: 900,
            reasoningTokens: 120,
            reportedTokenCount: 1020,
            approxPromptChars: 24000,
            models: ['deepseek-v4-pro'],
            llmUseCases: {
              final_response: 2,
            },
            tools: {
              search_real_candidates: {
                calls: 3,
                observed: 3,
                failed: 0,
                blocked: 0,
              },
            },
          },
        ],
        llmContextBudgetRecommendations: {
          final_response: {
            mode: 'strict',
            reasons: ['prompt_cache_hit_rate_low', 'prompt_prefix_churn_high'],
            calls: 4,
            avgApproxPromptChars: 6000,
            avgBillableInputTokens: 1200,
            promptCacheHitRate: 0.6,
            distinctPromptPrefixHashes: 4,
            distinctDynamicContextHashes: 3,
          },
        },
        failureReasons: {},
        queueDepth: {},
        alerts: [],
      },
      socialAgentMetrics: {
        workflowEfficiencySummary: {
          total: 3,
          totalIntentRoutes: 5,
          workflowRouteRate: 0.6,
          estimatedAvoidedLlmCalls: 6,
          byIntent: {
            social_search: 2,
            action_request: 1,
          },
          byReason: {
            explicit_social_workflow: 2,
            social_action_workflow: 1,
          },
        },
        deterministicRouteEfficiencySummary: {
          total: 5,
          estimatedAvoidedLlmCalls: 5,
          byIntent: {
            casual_chat: 3,
            product_help: 2,
          },
        },
        deterministicActionEfficiencySummary: {
          total: 4,
          estimatedAvoidedLlmCalls: 4,
          byAction: {
            'candidate.like': 2,
            'candidate.generate_opener': 1,
            'activity.view_detail': 1,
          },
        },
        cacheEfficiencySummary: {
          combined: {
            hits: 9,
            misses: 4,
            total: 13,
            hitRate: 0.6923,
            savedApproxPromptChars: 62000,
          },
          llmOutput: {
            hits: 2,
            misses: 1,
            total: 3,
            hitRate: 0.6667,
            savedApproxPromptChars: 18000,
          },
          toolResult: {
            hits: 4,
            misses: 2,
            total: 6,
            hitRate: 0.6667,
            savedApproxPromptChars: 32000,
          },
          embedding: {
            hits: 3,
            misses: 1,
            total: 4,
            hitRate: 0.75,
            savedApproxPromptChars: 12000,
          },
        },
        llmOutputCacheSummary: {
          final_response_exact: {
            hits: 2,
            misses: 1,
            total: 3,
            hitRate: 0.6667,
            savedApproxPromptChars: 18000,
          },
        },
        llmPromptFingerprintSummary: {
          intent_router_exact: {
            observations: 4,
            distinctPromptPrefixHashes: 1,
            distinctDynamicContextHashes: 4,
            promptPrefixReuseRate: 0.75,
          },
        },
        toolResultCacheSummary: {
          candidate_pool: {
            hits: 4,
            misses: 2,
            total: 6,
            hitRate: 0.6667,
            savedApproxPromptChars: 32000,
          },
        },
        embeddingCacheSummary: {
          rag_doc: {
            hits: 3,
            misses: 1,
            total: 4,
            hitRate: 0.75,
            savedApproxPromptChars: 12000,
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <AgentL5AdminPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('后台智能体运行管理')).toBeInTheDocument());
    expect(screen.getByText('Replay Cases')).toBeInTheDocument();
    expect(screen.getByText('used_for_eval')).toBeInTheDocument();
    expect(screen.getByText(/今晚想找跑步搭子/)).toBeInTheDocument();
    expect(screen.getByTestId('social-codex-regression-summary')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
    expect(screen.getByText(/可见过程时间线/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Subagent Memory/ }));
    expect(screen.getAllByText('Social Match Agent').length).toBeGreaterThan(0);
    expect(screen.getByText('matching.candidate_memory')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Meet-loop State/ }));
    expect(screen.getAllByText('activity_confirmed').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting for: activity_check_in')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Canary Decision/ }));
    expect(screen.getByText('quality_drop')).toBeInTheDocument();
    expect(screen.getAllByText('rollback').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Auto Runner/ }));
    expect(screen.getByText('Auto patch: user_facing')).toBeInTheDocument();
    expect(screen.getByText('0.9 pass')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Observability/ }));
    expect(screen.getAllByText('final_response').length).toBeGreaterThan(0);
    expect(screen.getByText('strict')).toBeInTheDocument();
    expect(screen.getByText(/cache hit low/)).toBeInTheDocument();
    expect(screen.getByText(/prefix churn/)).toBeInTheDocument();
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('deepseek-v4-pro').length).toBeGreaterThan(0);
    expect(screen.getByText('Run Cost Density')).toBeInTheDocument();
    expect(screen.getAllByText('LLM calls').length).toBeGreaterThan(0);
    expect(screen.getByText(/4 · 2\/run/)).toBeInTheDocument();
    expect(screen.getByText('LLM Stage Cost')).toBeInTheDocument();
    expect(screen.getByText(/4 calls · 4.8K input/)).toBeInTheDocument();
    expect(screen.getByText('Tool Stage Cost')).toBeInTheDocument();
    expect(screen.getAllByText(/search_real_candidates/).length).toBeGreaterThan(0);
    expect(screen.getByText('loop:1')).toBeInTheDocument();
    expect(screen.getByText(/2 LLM · 3 tools/)).toBeInTheDocument();
    expect(screen.getByText(/final_response 2/)).toBeInTheDocument();
    expect(screen.getByText(/search_real_candidates 3/)).toBeInTheDocument();
    expect(screen.getByText('Workflow Efficiency')).toBeInTheDocument();
    expect(screen.getByText('Workflow route rate')).toBeInTheDocument();
    expect(screen.getByText(/3\/5 routes/)).toBeInTheDocument();
    expect(screen.getByText('Estimated avoided LLM calls')).toBeInTheDocument();
    expect(screen.getByText('Explicit social workflow · 2')).toBeInTheDocument();
    expect(screen.getByText('Deterministic Replies')).toBeInTheDocument();
    expect(screen.getByText('Deterministic chat replies')).toBeInTheDocument();
    expect(screen.getByText('casual_chat')).toBeInTheDocument();
    expect(screen.getByText('Deterministic Actions')).toBeInTheDocument();
    expect(screen.getByText('Deterministic low-risk actions')).toBeInTheDocument();
    expect(screen.getByText('candidate.like')).toBeInTheDocument();
    expect(screen.getByText('Cache Efficiency')).toBeInTheDocument();
    expect(screen.getByText('Combined Cache')).toBeInTheDocument();
    expect(screen.getByText(/9\/13 hit/)).toBeInTheDocument();
    expect(screen.getByText('LLM Output Cache')).toBeInTheDocument();
    expect(screen.getByText('Prompt Prefix Reuse')).toBeInTheDocument();
    expect(screen.getByText('Tool Result Cache')).toBeInTheDocument();
    expect(screen.getByText('Embedding Cache')).toBeInTheDocument();
    expect(screen.getByText('final_response_exact')).toBeInTheDocument();
    expect(screen.getByText('intent_router_exact')).toBeInTheDocument();
    expect(screen.getByText(/75% reuse/)).toBeInTheDocument();
    expect(screen.getByText('candidate_pool')).toBeInTheDocument();
    expect(screen.getByText('rag_doc')).toBeInTheDocument();
  });
});
