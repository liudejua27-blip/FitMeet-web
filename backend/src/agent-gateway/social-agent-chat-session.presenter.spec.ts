import { AgentTaskStatus } from './entities/agent-task.entity';
import type { AgentTask } from './entities/agent-task.entity';
import { readSocialAgentRestorableResult } from './social-agent-chat-session.presenter';

describe('readSocialAgentRestorableResult', () => {
  it('does not restore debug reason counters from latest run results into user-facing sessions', () => {
    const task = {
      id: 101,
      status: AgentTaskStatus.WaitingReply,
      result: {},
      memory: {},
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: {
        taskId: 101,
        runId: 'sar_debug_restore',
        status: 'completed',
        phase: 'completed',
        message: '已完成',
        visibleSteps: [{ id: 'done', label: '完成', status: 'done' }],
        queuedAt: '2026-06-05T00:00:00.000Z',
        startedAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:03:00.000Z',
        completedAt: '2026-06-05T00:03:00.000Z',
        failedAt: null,
        pollAfterMs: 1500,
        error: null,
        replan: null,
        result: {
          taskId: 101,
          status: AgentTaskStatus.WaitingReply,
          visibleSteps: [{ id: 'done', label: '完成', status: 'done' }],
          assistantMessage: '我找到了一个合适候选人',
          socialRequestDraft: null,
          candidates: [{ targetUserId: 22, nickname: 'Alex' } as never],
          approvalRequiredActions: [],
          events: [],
          debugReasons: {
            usersTotal: 3,
            socialProfilesTotal: 2,
            publicIntentsTotal: 1,
            eligibleProfiles: 1,
            eligiblePublicIntents: 1,
            eligibleActivities: 0,
            filteredBySelf: 0,
            filteredByBlocked: 0,
            filteredByCity: 0,
            filteredByBoundary: 2,
            scoreBelowThreshold: 0,
          },
        },
      },
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result).toMatchObject({
      taskId: 101,
      assistantMessage: '我找到了一个合适候选人',
      debugReasons: null,
    });
    expect(JSON.stringify(result)).not.toContain('filteredByBoundary');
  });

  it('does not restore debug reason counters from legacy task memory into user-facing session results', () => {
    const task = {
      id: 101,
      status: AgentTaskStatus.WaitingReply,
      result: {
        chatRun: {
          message: '我找到了一个合适候选人',
          debugReasons: {
            usersTotal: 3,
            socialProfilesTotal: 2,
            publicIntentsTotal: 1,
            eligibleProfiles: 1,
            eligiblePublicIntents: 1,
            eligibleActivities: 0,
            filteredBySelf: 0,
            filteredByBlocked: 0,
            filteredByCity: 0,
            filteredByBoundary: 2,
            scoreBelowThreshold: 0,
          },
        },
      },
      memory: {
        shortTerm: {
          candidates: [
            {
              targetUserId: 22,
              nickname: 'Alex',
              matchReasons: ['公开资料显示你们都喜欢散步'],
            },
          ],
        },
      },
    } as unknown as AgentTask;

    const result = readSocialAgentRestorableResult({
      task,
      latestRun: null,
      events: [],
      visibleStepLabel: (_, label) => label,
    });

    expect(result).toMatchObject({
      taskId: 101,
      assistantMessage: '我找到了一个合适候选人',
      debugReasons: null,
      candidates: [expect.objectContaining({ targetUserId: 22 })],
    });
    expect(JSON.stringify(result)).not.toContain('filteredByBoundary');
  });
});
