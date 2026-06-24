import { AgentActionType } from '../agent-gateway/entities/agent-action-log.entity';
import { SocialRequestType } from './social-request.entity';
import { SocialRequestsService } from './social-requests.service';

function makeService() {
  const repo = {
    create: jest.fn((input) => input),
    save: jest.fn((input) => Promise.resolve({ ...input, id: 42 })),
    findOne: jest.fn(),
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 7,
      name: '小李',
      city: '',
      interestTags: [],
    }),
  };
  const socialProfileRepo = {
    findOne: jest.fn().mockResolvedValue({
      userId: 7,
      city: '',
      interestTags: [],
      ageRange: '',
      nearbyArea: '',
      fitnessGoals: [],
      availableTimes: [],
      socialPreference: null,
      rejectRules: null,
      privacyBoundary: null,
    }),
  };
  const publicIntentRepo = {
    create: jest.fn((input) => input),
    save: jest.fn((input) => Promise.resolve(input)),
    findOne: jest.fn(),
  };
  const ai = {
    isLlmEnabled: jest.fn().mockReturnValue(true),
    parseSocialRequest: jest.fn().mockResolvedValue({
      interestTags: ['轻松社交'],
      suggestedTitle: '今晚青岛大学散步',
      goal: '今晚在青岛大学附近轻松散步。',
    }),
    generateSocialRequestCard: jest.fn().mockResolvedValue({
      title: '继续找人',
      description: '',
      interestTags: [],
      locationPreference: '',
      timePreference: '',
      socialGoal: '',
      personalityPreference: [],
      riskNotes: [],
      privacyNotes: [],
    }),
  };
  const actionLogs = {
    logAgentAction: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const service = new SocialRequestsService(
    repo as never,
    userRepo as never,
    socialProfileRepo as never,
    publicIntentRepo as never,
    ai as never,
    actionLogs as never,
  );
  return { service, ai, actionLogs };
}

describe('SocialRequestsService', () => {
  it('uses taskContext slots when generating an agent social request draft', async () => {
    const { service, ai, actionLogs } = makeService();

    const result = await service.aiDraft(7, '可以，继续帮我找人', {
      agentTaskId: 101,
      source: 'social_agent_tool_executor',
      taskContext: {
        taskSlots: {
          activity: { value: '散步', state: 'completed' },
          time_window: { value: '今天晚上', state: 'completed' },
          location_text: { value: '青岛大学附近', state: 'completed' },
          geo_area: { value: '崂山区', state: 'inferred' },
          intensity: { value: '低强度', state: 'inferred' },
          candidate_preference: {
            value: '公开资料里有舞蹈相关标签的人优先',
            state: 'answered',
          },
        },
        taskSlotSummary: {
          activity: '散步',
          time_window: '今天晚上',
          location_text: '青岛大学附近',
          candidate_preference: '公开资料里有舞蹈相关标签的人优先',
        },
        knownTaskSlotConstraints: {
          doNotAskAgainFor: [
            'activity',
            'time_window',
            'location_text',
            'candidate_preference',
          ],
        },
      },
    });

    expect(ai.generateSocialRequestCard).toHaveBeenCalledWith(
      expect.stringContaining(
        '已确认信息：活动：散步；时间：今天晚上；地点：青岛大学附近',
      ),
      expect.objectContaining({ city: '青岛' }),
    );
    expect(result.draft).toMatchObject({
      type: SocialRequestType.CityWalk,
      rawText: '可以，继续帮我找人',
      city: '青岛',
      activityType: '散步',
      interestTags: expect.arrayContaining(['散步']),
      metadata: expect.objectContaining({
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
        nearbyArea: '崂山区',
        intensity: '低强度',
        candidatePreference: '公开资料里有舞蹈相关标签的人优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      }),
    });
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: AgentActionType.CreateSocialRequest,
      }),
    );
  });

  it('uses taskContext slots when creating from natural language fallback path', async () => {
    const { service, ai } = makeService();

    const result = await service.createFromNaturalLanguage(
      '可以，继续帮我找人',
      7,
      null,
      {
        agentTaskId: 102,
        source: 'social_agent_tool_executor',
        taskContext: {
          taskSlots: {
            activity: { value: '散步', state: 'completed' },
            time_window: { value: '今天晚上', state: 'completed' },
            location_text: { value: '青岛大学附近', state: 'completed' },
            geo_area: { value: '崂山区', state: 'inferred' },
            candidate_preference: {
              value: '公开资料里有舞蹈相关标签的人优先',
              state: 'answered',
            },
          },
          taskSlotSummary: {
            activity: '散步',
            time_window: '今天晚上',
            location_text: '青岛大学附近',
            candidate_preference: '公开资料里有舞蹈相关标签的人优先',
          },
          knownTaskSlotConstraints: {
            doNotAskAgainFor: [
              'activity',
              'time_window',
              'location_text',
              'candidate_preference',
            ],
          },
        },
      },
    );

    expect(ai.parseSocialRequest).toHaveBeenCalledWith(
      expect.stringContaining(
        '已确认信息：活动：散步；时间：今天晚上；地点：青岛大学附近',
      ),
    );
    expect(result).toMatchObject({
      type: SocialRequestType.CityWalk,
      city: '青岛',
      activityType: '散步',
      interestTags: expect.arrayContaining(['散步', '轻松社交']),
      metadata: expect.objectContaining({
        agentTaskId: 102,
        source: 'social_agent_tool_executor',
        timePreference: '今天晚上',
        locationPreference: '青岛大学附近',
        nearbyArea: '崂山区',
        candidatePreference: '公开资料里有舞蹈相关标签的人优先',
        candidatePreferencePolicy:
          'public_discoverable_profiles_and_user_consented_public_tags_only',
      }),
    });
  });
});
