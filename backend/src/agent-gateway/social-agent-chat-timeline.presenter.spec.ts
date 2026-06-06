import type { AgentTask } from './entities/agent-task.entity';
import {
  AgentTaskPermissionMode,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  buildSocialAgentTimelineSnapshot,
  readSocialAgentTimelineCandidates,
} from './social-agent-chat-timeline.presenter';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    status: AgentTaskStatus.AwaitingConfirmation,
    memory: {},
    result: {},
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
    updatedAt: new Date('2026-06-05T00:01:00.000Z'),
    ...overrides,
  } as AgentTask;
}

describe('social-agent-chat-timeline.presenter', () => {
  it('normalizes stored candidate summaries for restored agent sessions', () => {
    const candidates = readSocialAgentTimelineCandidates(task(), [
      {
        userId: '22',
        nickname: 'Alex',
        source: 'activity',
        score: '86',
        risk: { level: 'low', warnings: ['公开活动'] },
        interestTags: ['跑步', '', '夜跑'],
        matchReasons: ['同城', '时间匹配'],
        candidateExplanation: {
          fitReasons: ['配速接近'],
          awkwardPoints: ['需要确认时间'],
          suggestedOpener: '今晚青大慢跑 3km 可以吗？',
          safeFirstStep: '先在公开操场见面',
        },
      },
      { nickname: 'missing id' },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      agentTaskId: 101,
      targetUserId: 22,
      userId: 22,
      candidateUserId: 22,
      nickname: 'Alex',
      source: 'activity',
      score: 86,
      risk: { level: 'low', warnings: ['公开活动'] },
      interestTags: ['跑步', '夜跑'],
      matchReasons: ['同城', '时间匹配'],
      candidateExplanation: {
        fitReasons: ['配速接近'],
        awkwardPoints: ['需要确认时间'],
        suggestedOpener: '今晚青大慢跑 3km 可以吗？',
        safeFirstStep: '先在公开操场见面',
      },
    });
  });

  it('builds timeline messages from memory and candidate events', () => {
    const snapshot = buildSocialAgentTimelineSnapshot({
      task: task(),
      taskSummary: {
        id: 101,
        title: '找跑步搭子',
        goal: '今晚青岛跑步',
        status: AgentTaskStatus.AwaitingConfirmation,
        statusReason: null,
        permissionMode: AgentTaskPermissionMode.Confirm,
        updatedAt: '2026-06-05T00:02:00.000Z',
        createdAt: '2026-06-05T00:00:00.000Z',
      },
      sessionMessages: [
        {
          id: 'turn_user_1',
          role: 'user',
          kind: 'text',
          content: '帮我找跑步搭子',
          createdAt: '2026-06-05T00:00:00.000Z',
        },
      ],
      memory: {},
      result: null,
      events: [
        {
          id: 501,
          eventType: AgentTaskEventType.SocialAgentCandidatesReturned,
          summary: '已返回候选卡片',
          createdAt: '2026-06-05T00:01:00.000Z',
          payload: {
            message: '我找到了一个合适候选人',
            createdAt: '2026-06-05T00:01:00.000Z',
            candidates: [{ userId: 22, nickname: 'Alex' }],
            activityResults: [
              {
                id: 'intent_1',
                source: 'public_intent',
                title: '青岛大学夜跑',
              },
            ],
          },
        },
      ],
      latestRun: null,
      pendingApprovals: [],
      candidateActions: {},
      restoredAt: '2026-06-05T00:02:00.000Z',
    });

    expect(snapshot.messages).toEqual([
      expect.objectContaining({
        id: 'turn_user_1',
        role: 'user',
        kind: 'text',
        text: '帮我找跑步搭子',
      }),
      expect.objectContaining({
        role: 'assistant',
        kind: 'candidates',
        text: '我找到了一个合适候选人',
        candidates: [
          expect.objectContaining({
            targetUserId: 22,
            nickname: 'Alex',
          }),
        ],
        activityResults: [
          expect.objectContaining({
            id: 'intent_1',
            title: '青岛大学夜跑',
          }),
        ],
      }),
    ]);
  });
});
