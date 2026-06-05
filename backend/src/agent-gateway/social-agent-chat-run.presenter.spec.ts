import type { AgentTask } from './entities/agent-task.entity';
import { AgentTaskStatus } from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import type { SocialAgentAsyncRunSnapshot } from './social-agent-chat.types';
import {
  buildSocialAgentBlockedRunResult,
  buildSocialAgentClarificationRunResult,
  createSocialAgentRunId,
  readLatestSocialAgentStoredRun,
  readSocialAgentStoredRun,
  socialAgentClarificationStep,
  socialAgentSafetyBlockedStep,
  withSocialAgentStoredRun,
} from './social-agent-chat-run.presenter';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    result: {},
    ...overrides,
  } as AgentTask;
}

function run(
  overrides: Partial<SocialAgentAsyncRunSnapshot> = {},
): SocialAgentAsyncRunSnapshot {
  return {
    taskId: 101,
    runId: 'sar_test_1',
    status: 'queued',
    phase: 'queued',
    message: 'queued',
    visibleSteps: [],
    queuedAt: '2026-06-05T00:00:00.000Z',
    startedAt: null,
    updatedAt: '2026-06-05T00:00:00.000Z',
    completedAt: null,
    failedAt: null,
    pollAfterMs: 1500,
    error: null,
    replan: null,
    result: null,
    ...overrides,
  };
}

function alphaTurn(
  overrides: Partial<FitMeetAlphaTurnDecision> = {},
): FitMeetAlphaTurnDecision {
  return {
    traceId: 'trace-1',
    safety: {
      blocked: true,
      level: 'blocked',
      reasons: ['unsafe_request'],
      boundaryNotes: ['只支持安全线下社交'],
      requiredConfirmations: [],
    },
    agentTrace: {
      traceId: 'trace-1',
      sdkEnabled: true,
      model: 'gpt-5-mini',
      agentPath: ['FitMeet Main Agent'],
      handoffs: [],
      guardrails: [{ name: 'safety', status: 'blocked' }],
    },
    cards: [
      {
        id: 'safety-1',
        type: 'safety_boundary',
        title: '安全边界',
        data: {},
        actions: [],
      },
    ],
    structuredIntent: { readiness: 'blocked' },
    ...overrides,
  };
}

describe('social-agent-chat-run.presenter', () => {
  it('builds stable blocked Main Agent run results', () => {
    const agentTask = task({
      status: AgentTaskStatus.Failed,
    });
    const turn = alphaTurn({ assistantMessage: '这个请求不能继续。' });

    const result = buildSocialAgentBlockedRunResult({
      task: agentTask,
      visibleSteps: [socialAgentSafetyBlockedStep()],
      alphaTurn: turn,
      events: [{ id: 1, summary: 'blocked' }],
    });

    expect(result).toMatchObject({
      taskId: 101,
      status: AgentTaskStatus.Failed,
      assistantMessage: '这个请求不能继续。',
      socialRequestDraft: null,
      candidates: [],
      approvalRequiredActions: [],
      cards: turn.cards,
      safety: turn.safety,
      traceId: 'trace-1',
      structuredIntent: { readiness: 'blocked' },
      visibleSteps: [
        {
          id: 'main_agent_safety',
          label: 'Main Agent 已拦截不安全请求',
          status: 'failed',
        },
      ],
      events: [{ id: 1, summary: 'blocked' }],
    });
  });

  it('builds stable clarification run results without candidates', () => {
    const turn = alphaTurn({
      safety: {
        blocked: false,
        level: 'low',
        reasons: [],
        boundaryNotes: [],
        requiredConfirmations: [],
      },
      structuredIntent: { readiness: 'clarify' },
    });

    const result = buildSocialAgentClarificationRunResult({
      task: task({ status: AgentTaskStatus.AwaitingFeedback }),
      visibleSteps: [socialAgentClarificationStep('正在等待你补充需求')],
      assistantMessage: '你更想今晚还是周末？',
      alphaTurn: turn,
      events: [],
    });

    expect(result).toMatchObject({
      taskId: 101,
      status: AgentTaskStatus.AwaitingFeedback,
      assistantMessage: '你更想今晚还是周末？',
      socialRequestDraft: null,
      candidates: [],
      approvalRequiredActions: [],
      cards: turn.cards,
      safety: turn.safety,
      traceId: 'trace-1',
      structuredIntent: { readiness: 'clarify' },
      visibleSteps: [
        {
          id: 'clarify',
          label: '正在等待你补充需求',
          status: 'done',
        },
      ],
    });
  });

  it('stores sanitized run snapshots under chatRuns and latestRunId', () => {
    const stored = withSocialAgentStoredRun(
      { keep: true, chatRuns: { sar_old: { runId: 'sar_old' } } },
      run({
        runId: 'sar_new',
        visibleSteps: [{ id: 'task.created', label: '创建', status: 'done' }],
      }),
    );

    expect(stored).toMatchObject({
      keep: true,
      latestRunId: 'sar_new',
      chatRuns: {
        sar_old: { runId: 'sar_old' },
        sar_new: {
          runId: 'sar_new',
          visibleSteps: [{ id: 'task.created', label: '创建', status: 'done' }],
        },
      },
    });
  });

  it('reads stored runs with safe defaults and labeled visible steps', () => {
    const agentTask = task({
      result: {
        chatRuns: {
          sar_dirty: {
            taskId: '202',
            status: 'surprising',
            phase: '',
            visibleSteps: [
              { id: 'append_context', label: 'old label', status: 'weird' },
              { label: 'missing id' },
            ],
            pollAfterMs: '2500',
            error: 'bad',
          },
        },
      },
    });

    expect(
      readSocialAgentStoredRun(
        agentTask,
        'sar_dirty',
        (id, label) => `${id}:${label}`,
      ),
    ).toMatchObject({
      taskId: 202,
      runId: 'sar_dirty',
      status: 'queued',
      phase: 'queued',
      visibleSteps: [
        {
          id: 'append_context',
          label: 'append_context:old label',
          status: 'pending',
        },
      ],
      pollAfterMs: 2500,
      error: null,
    });
  });

  it('prefers latestRunId and falls back to the newest updated run', () => {
    const latestTask = task({
      result: {
        latestRunId: 'sar_old',
        chatRuns: {
          sar_old: run({ runId: 'sar_old', updatedAt: '2026-06-05T00:00:00Z' }),
          sar_new: run({ runId: 'sar_new', updatedAt: '2026-06-05T00:01:00Z' }),
        },
      },
    });
    expect(
      readLatestSocialAgentStoredRun(latestTask, (_, label) => label),
    ).toMatchObject({ runId: 'sar_old' });

    const fallbackTask = task({
      result: {
        latestRunId: 'missing',
        chatRuns: latestTask.result?.chatRuns,
      },
    });
    expect(
      readLatestSocialAgentStoredRun(fallbackTask, (_, label) => label),
    ).toMatchObject({ runId: 'sar_new' });
  });

  it('creates run ids with the expected social agent prefix', () => {
    expect(createSocialAgentRunId()).toMatch(/^sar_\d+_[a-z0-9]+$/);
  });
});
