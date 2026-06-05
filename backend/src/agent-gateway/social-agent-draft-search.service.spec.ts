import {
  SocialRequestSafety,
  SocialRequestType,
} from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import type { SocialAgentRequestDraft } from './social-agent-chat.types';
import { SocialAgentToolName } from './social-agent-tool-executor.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    taskType: 'social_agent_chat',
    title: 'FitMeet Social Agent 聊天任务',
    goal: '今晚青岛轻松跑步',
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

function makeDraft(
  overrides: Partial<SocialAgentRequestDraft> = {},
): SocialAgentRequestDraft {
  return {
    agentTaskId: 101,
    type: SocialRequestType.RunningPartner,
    rawText: '今晚青岛轻松跑步',
    title: '今晚青岛轻松跑步',
    description: '公开地点，低压力，一起轻松跑。',
    city: '青岛',
    activityType: 'running',
    interestTags: ['跑步', '低压力'],
    radiusKm: 5,
    safetyRequirement: SocialRequestSafety.LowRiskOnly,
    socialRequestId: 301,
    metadata: { source: 'test' },
    ...overrides,
  } as SocialAgentRequestDraft;
}

function makeHarness() {
  const executor = {
    executeToolAction: jest.fn(
      (
        _taskId: number,
        toolName: SocialAgentToolName,
        input: Record<string, unknown>,
      ) => {
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'ai_draft'
        ) {
          return Promise.resolve({
            id: 'action_create_social_request_draft_1',
            toolName,
            status: 'succeeded',
            output: {
              draft: {
                type: SocialRequestType.RunningPartner,
                rawText: input.rawText,
                title: '今晚青岛轻松跑步',
                city: '青岛',
              },
              card: { title: '今晚青岛轻松跑步' },
              profileUsed: { city: '青岛' },
            },
            error: null,
          });
        }
        if (
          toolName === SocialAgentToolName.CreateSocialRequest &&
          input.mode === 'private_draft'
        ) {
          return Promise.resolve({
            id: 'action_create_social_request_private_1',
            toolName,
            status: 'succeeded',
            output: { id: 301, socialRequestId: 301 },
            error: null,
          });
        }
        if (toolName === SocialAgentToolName.SearchMatches) {
          return Promise.resolve({
            id: 'action_search_matches_1',
            toolName,
            status: 'succeeded',
            output: {
              socialRequestId: 301,
              candidates: [
                {
                  userId: 22,
                  candidateRecordId: 501,
                  nickname: '小林',
                  score: 87.4,
                  reasons: ['距离近', '都喜欢夜跑'],
                },
              ],
              message: '找到 1 位候选人',
              debugReasons: { accepted: 1 },
            },
            error: null,
          });
        }
        return Promise.resolve({
          id: 'unsupported',
          toolName,
          status: 'failed',
          output: null,
          error: { message: 'unsupported tool' },
        });
      },
    ),
  };
  return {
    executor,
    service: new SocialAgentDraftSearchService(executor as never),
  };
}

describe('SocialAgentDraftSearchService', () => {
  it('generates a social request draft through the AI draft tool', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask();

    const result = await service.generateDraftWithTool(
      task,
      '今晚青岛轻松跑步',
    );

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'ai_draft',
        rawText: '今晚青岛轻松跑步',
        goal: '今晚青岛轻松跑步',
        metadata: {
          agentTaskId: 101,
          source: 'social_agent_chat',
        },
      }),
      7,
    );
    expect(result).toMatchObject({
      draft: { title: '今晚青岛轻松跑步', city: '青岛' },
      card: { title: '今晚青岛轻松跑步' },
      profileUsed: { city: '青岛' },
    });
  });

  it('creates a private draft that requires publish confirmation', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask();

    const socialRequestId = await service.createPrivateDraftRequest(
      task,
      makeDraft(),
    );

    expect(socialRequestId).toBe(301);
    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.CreateSocialRequest,
      expect.objectContaining({
        mode: 'private_draft',
        metadata: expect.objectContaining({
          agentTaskId: 101,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        }),
      }),
      7,
    );
  });

  it('searches persisted social request candidates and normalizes matches', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask();

    const result = await service.searchCandidates(task, makeDraft());

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      {
        socialRequestId: 301,
        rawText: '今晚青岛轻松跑步',
        limit: 10,
      },
      7,
    );
    expect(result).toMatchObject({
      message: '找到 1 位候选人',
      debugReasons: { accepted: 1 },
      candidates: [
        expect.objectContaining({
          userId: 22,
          candidateUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          nickname: '小林',
        }),
      ],
    });
  });

  it('searches draft criteria when no persisted request exists', async () => {
    const { executor, service } = makeHarness();
    const task = makeTask();

    await service.searchCandidates(
      task,
      makeDraft({ socialRequestId: null, radiusKm: undefined }),
    );

    expect(executor.executeToolAction).toHaveBeenCalledWith(
      101,
      SocialAgentToolName.SearchMatches,
      expect.objectContaining({
        city: '青岛',
        activityType: 'running',
        interestTags: ['跑步', '低压力'],
        radiusKm: 5,
        rawText: '今晚青岛轻松跑步',
        limit: 10,
      }),
      7,
    );
  });

  it('surfaces draft generation tool failures', async () => {
    const { executor, service } = makeHarness();
    executor.executeToolAction.mockResolvedValueOnce({
      id: 'action_create_social_request_draft_1',
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'failed',
      output: null,
      error: { message: 'draft model unavailable' },
    } as never);

    await expect(
      service.generateDraftWithTool(makeTask(), '今晚青岛轻松跑步'),
    ).rejects.toThrow('draft model unavailable');
  });
});
