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
  });
});
