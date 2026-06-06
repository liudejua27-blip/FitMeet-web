import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { SocialRequestType } from '../social-requests/social-request.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { buildSocialAgentSocialRequestToolInput } from './social-agent-social-request-tool-input';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

const toolInput = new SocialAgentToolInputParserService();

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    taskType: 'social_goal',
    title: '找青岛跑步搭子',
    goal: '周末找青岛跑步搭子',
    input: {},
    plan: [],
    toolCalls: [],
    result: {},
    memory: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Assist,
    riskLevel: 'low' as never,
    idempotencyKey: null,
    statusReason: null,
    error: null,
    startedAt: null,
    awaitingConfirmationAt: null,
    completedAt: null,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
    updatedAt: new Date('2026-06-06T00:00:00.000Z'),
    ...overrides,
  } as AgentTask;
}

describe('buildSocialAgentSocialRequestToolInput', () => {
  it('marks missing type plus raw text as a natural language create flow', () => {
    const parsed = buildSocialAgentSocialRequestToolInput(
      task(),
      {
        rawText: '青岛周末跑步搭子',
        city: '青岛',
        tags: ['跑步', '周末'],
        metadata: { source: 'agent' },
      },
      toolInput,
    );

    expect(parsed).toMatchObject({
      mode: undefined,
      rawText: '青岛周末跑步搭子',
      socialRequestId: undefined,
      shouldCreateDraft: false,
      shouldCreateFromNaturalLanguage: true,
      shouldSyncPublicIntent: false,
    });
    expect(parsed.dto).toMatchObject({
      type: SocialRequestType.Custom,
      rawText: '青岛周末跑步搭子',
      title: '找青岛跑步搭子',
      description: '周末找青岛跑步搭子',
      city: '青岛',
      interestTags: ['跑步', '周末'],
      metadata: { source: 'agent', agentTaskId: 100 },
    } satisfies Partial<CreateSocialRequestDto>);
  });

  it('builds an update dto and publish intent from explicit typed input', () => {
    const parsed = buildSocialAgentSocialRequestToolInput(
      task({ title: '默认标题', goal: '默认目标' }),
      {
        mode: 'publish',
        socialRequestId: '301',
        type: SocialRequestType.FitnessPartner,
        title: '今晚跑步',
        description: '找人今晚一起跑步',
        rawText: '今晚跑步',
        city: ' Qingdao ',
        radiusKm: '5',
        activityType: 'running',
        interestTags: ['running', 'coffee'],
        metadata: { channel: 'ios' },
      },
      toolInput,
    );

    expect(parsed).toMatchObject({
      mode: 'publish',
      rawText: '今晚跑步',
      socialRequestId: 301,
      shouldCreateDraft: false,
      shouldCreateFromNaturalLanguage: false,
      shouldSyncPublicIntent: true,
    });
    expect(parsed.dto).toMatchObject({
      type: SocialRequestType.FitnessPartner,
      title: '今晚跑步',
      description: '找人今晚一起跑步',
      city: 'Qingdao',
      radiusKm: 5,
      activityType: 'running',
      interestTags: ['running', 'coffee'],
      metadata: { channel: 'ios', agentTaskId: 100 },
    } satisfies Partial<CreateSocialRequestDto>);
  });

  it('recognizes draft-only mode and falls back raw text to the task goal', () => {
    const parsed = buildSocialAgentSocialRequestToolInput(
      task({ goal: '帮我整理一张咖啡局草稿' }),
      { intent: 'draft_only', rawText: '   ' },
      toolInput,
    );

    expect(parsed.rawText).toBe('帮我整理一张咖啡局草稿');
    expect(parsed.shouldCreateDraft).toBe(true);
    expect(parsed.shouldCreateFromNaturalLanguage).toBe(true);
    expect(parsed.shouldSyncPublicIntent).toBe(false);
  });
});
