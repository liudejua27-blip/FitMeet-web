import {
  AgentTask,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from '../entities/agent-task.entity';
import { LoopDecisionService } from './loop-classifier.service';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    ownerUserId: 7,
    goal: '找搭子',
    memory: {},
    result: {},
    status: AgentTaskStatus.Pending,
    permissionMode: AgentTaskPermissionMode.Confirm,
    ...overrides,
  } as AgentTask;
}

describe('LoopDecisionService', () => {
  it('calls DeepSeek JSON runtime with the loop decision purpose and multi-turn context', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 0.93,
        reason: 'semantic_workout',
        workoutHints: {
          activityType: '羽毛球',
          timeText: '明晚',
          locationText: '华师大附近',
          venueType: 'campus',
          candidatePreference: '水平差不多',
        },
      }),
    };
    const service = new LoopDecisionService(toolJson as never);

    const result = await service.decide({
      task: makeTask({
        memory: {
          socialAgentConversation: {
            turns: [
              {
                role: 'user',
                text: '附近有玩x的吗',
                at: '2026-06-30T01:00:00.000Z',
              },
              {
                role: 'assistant',
                text: '你想找哪类搭子？',
                at: '2026-06-30T01:00:01.000Z',
              },
            ],
          },
          workoutLoop: {
            stage: 'intake',
            slots: { locationText: '附近' },
          },
        },
      }),
      message: '明晚华师大附近活动一下，找水平差不多的人',
      ruleReason: 'no_loop_keyword',
    });

    expect(toolJson.callJson).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'loop_decision',
        taskId: 101,
        fallback: expect.any(Function),
      }),
    );
    expect(result).toMatchObject({
      intent: 'workout',
      confidence: 0.93,
      shouldEnterLoop: true,
      workoutHints: expect.objectContaining({
        activityType: '羽毛球',
        timeText: '明晚',
        locationText: '华师大附近',
      }),
    });
    const prompt = JSON.parse(toolJson.callJson.mock.calls[0][0].prompt);
    expect(prompt.instruction).toContain('multi-turn LoopDecision brain');
    expect(prompt.instruction).toContain('Do not invent latitude');
    expect(prompt.routingPolicy.workout).toContain('sports');
    expect(prompt.taskContext).toMatchObject({
      taskGoal: '找搭子',
      currentMessage: '明晚华师大附近活动一下，找水平差不多的人',
      recentUserMessages: [
        '附近有玩x的吗',
        '明晚华师大附近活动一下，找水平差不多的人',
      ],
      loopMemory: {
        workoutLoop: {
          stage: 'intake',
          slots: { locationText: '附近' },
        },
      },
    });
    expect(prompt.taskContext.recentConversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', text: '附近有玩x的吗' }),
        expect.objectContaining({
          role: 'user',
          text: '明晚华师大附近活动一下，找水平差不多的人',
        }),
      ]),
    );
  });

  it('returns uncertain when the model runtime is unavailable', async () => {
    const service = new LoopDecisionService();

    await expect(
      service.decide({
        task: makeTask(),
        message: '想找人活动一下',
      }),
    ).resolves.toMatchObject({
      intent: 'uncertain',
      confidence: 0,
      reason: 'loop_decision_unavailable',
      shouldEnterLoop: false,
    });
  });

  it('rejects invalid JSON shape conservatively', async () => {
    const toolJson = {
      callJson: jest.fn().mockResolvedValue({
        intent: 'workout',
        confidence: 5,
      }),
    };
    const service = new LoopDecisionService(toolJson as never);

    await expect(
      service.decide({
        task: makeTask(),
        message: '明晚羽毛球',
      }),
    ).resolves.toMatchObject({
      intent: 'uncertain',
      confidence: 0,
      reason: 'loop_decision_schema_invalid',
      shouldEnterLoop: false,
    });
  });

  it('maps loop hints into llm-sourced prefilled slots', () => {
    const service = new LoopDecisionService();

    expect(
      service.workoutSlotsFromHints(
        {
          activityType: '骑行',
          timeText: '周末',
          locationText: '奥体附近',
          candidatePreference: '离我近一点',
        },
        0.88,
      ),
    ).toMatchObject({
      activityType: '骑行',
      timePreference: '周末',
      locationText: '奥体附近',
      candidatePreference: '离我近一点',
      slotMeta: {
        activityType: { source: 'llm', confidence: 0.88 },
        timePreference: { source: 'llm', confidence: 0.88 },
        locationText: { source: 'llm', confidence: 0.88 },
      },
    });

    expect(
      service.friendSlotsFromHints(
        {
          friendGoal: '认识同城朋友',
          locationText: '同城',
          topicTags: ['咖啡'],
          genderPreference: '不限性别',
        },
        0.8,
      ),
    ).toMatchObject({
      friendGoal: '认识同城朋友',
      locationText: '同城',
      topicTags: ['咖啡'],
      genderPreference: '不限性别',
      slotMeta: {
        friendGoal: { source: 'llm', confidence: 0.8 },
        topicTags: { source: 'llm', confidence: 0.8 },
      },
    });

    expect(
      service.travelSlotsFromHints(
        {
          destination: '川西',
          departureTime: '周末',
          tags: ['拍照'],
        },
        0.86,
      ),
    ).toMatchObject({
      destination: '川西',
      departureTime: '周末',
      tags: ['拍照'],
      slotMeta: {
        destination: { source: 'llm', confidence: 0.86 },
        tags: { source: 'llm', confidence: 0.86 },
      },
    });
  });
});
