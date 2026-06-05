import type { AgentTask } from './entities/agent-task.entity';
import {
  applySocialAgentTaskMemoryForIntent,
  profileKeyForSocialAgentIntent,
} from './social-agent-intent-memory.presenter';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import {
  readSocialAgentTaskMemory,
  writeSocialAgentTaskMemory,
} from './social-agent-memory.util';

function makeTask(): AgentTask {
  return {
    id: 42,
    goal: '',
    memory: {},
  } as AgentTask;
}

function route(
  intent: SocialAgentIntentType,
  patch: Partial<SocialAgentIntentRouterResult> = {},
): SocialAgentIntentRouterResult {
  return {
    intent,
    confidence: 0.9,
    entities: {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    },
    shouldSearch: false,
    shouldReplan: false,
    shouldUpdateProfile: false,
    shouldExecuteAction: false,
    replyStrategy: 'append_context',
    source: 'rules',
    ...patch,
  };
}

describe('social-agent-intent-memory.presenter', () => {
  it('stores active entities for search intents', () => {
    const task = makeTask();

    applySocialAgentTaskMemoryForIntent(
      task,
      '帮我找青岛周末羽毛球搭子',
      route('social_search', {
        entities: {
          city: '青岛',
          activityType: '羽毛球',
          targetGender: '',
          timePreference: '周末',
          locationPreference: '',
        },
      }),
    );

    const memory = readSocialAgentTaskMemory(task);
    expect(memory.currentGoal).toBe('帮我找青岛周末羽毛球搭子');
    expect(memory.activeEntities).toMatchObject({
      city: '青岛',
      activityType: '羽毛球',
      timePreference: '周末',
    });
  });

  it('moves recommended candidates to rejected when a fresh batch is requested', () => {
    const task = makeTask();
    const memory = readSocialAgentTaskMemory(task);
    memory.candidateState.recommendedIds = [11, 12];
    memory.candidateState.rejectedIds = [8];
    writeSocialAgentTaskMemory(task, memory);

    applySocialAgentTaskMemoryForIntent(
      task,
      '这几个不合适，换一批',
      route('candidate_followup'),
    );

    const next = readSocialAgentTaskMemory(task);
    expect(next.candidateState.recommendedIds).toEqual([]);
    expect(next.candidateState.rejectedIds).toEqual([8, 11, 12]);
  });

  it('leaves candidate memory untouched for ordinary follow-up', () => {
    const task = makeTask();
    const memory = readSocialAgentTaskMemory(task);
    memory.candidateState.recommendedIds = [11, 12];
    writeSocialAgentTaskMemory(task, memory);

    applySocialAgentTaskMemoryForIntent(
      task,
      '为什么推荐第一个',
      route('candidate_followup'),
    );

    expect(readSocialAgentTaskMemory(task).candidateState).toMatchObject({
      recommendedIds: [11, 12],
      rejectedIds: [],
    });
  });

  it('maps profile update and safety intents to profile answer keys', () => {
    expect(profileKeyForSocialAgentIntent('profile_update', '我比较慢热')).toBe(
      'traits',
    );
    expect(
      profileKeyForSocialAgentIntent('profile_update', '周末下午都有时间'),
    ).toBe('availableTimes');
    expect(
      profileKeyForSocialAgentIntent('safety_or_boundary', '不要自动发微信'),
    ).toBe('avoidTraits');
    expect(
      profileKeyForSocialAgentIntent('safety_or_boundary', '先站内聊'),
    ).toBe('privacyBoundary');
  });
});
