import { BadRequestException } from '@nestjs/common';

import { ActivityProofPolicy } from '../activities/entities/activity-template.entity';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { SocialAgentActivityToolService } from './social-agent-activity-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 100,
    ownerUserId: 1,
    agentConnectionId: 7,
    permissionMode: AgentTaskPermissionMode.LimitedAuto,
    title: 'Agent social plan',
    goal: 'meet someone for a safe workout',
    memory: {},
    ...overrides,
  } as AgentTask;
}

function makeService() {
  const activities = {
    create: jest.fn(),
    join: jest.fn(),
  };
  const messages = {
    startConversation: jest.fn(),
    sendMessage: jest.fn(),
  };
  const toolInput = new SocialAgentToolInputParserService();
  const service = new SocialAgentActivityToolService(
    activities as never,
    messages as never,
    toolInput,
    new SocialAgentTaskMemoryService(toolInput),
  );

  return { service, activities, messages };
}

describe('SocialAgentActivityToolService', () => {
  it('creates activities with meet-loop safety defaults and no precise location leak', async () => {
    const { service, activities } = makeService();
    activities.create.mockResolvedValue({
      id: 77,
      status: 'pending_confirm',
      participantIds: [1, 2],
    });

    const result = await service.createActivity(
      makeTask(),
      {
        targetUserId: 2,
        title: 'Saturday easy run',
        city: 'Qingdao',
        lat: 36.0671,
        lng: 120.3826,
      },
      SocialAgentToolName.CreateActivity,
      'step_1',
    );

    expect(activities.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        title: 'Saturday easy run',
        city: 'Qingdao',
        locationName: '公共场所待确认',
        lat: undefined,
        lng: undefined,
        durationMinutes: 45,
        invitedUserId: 2,
        proofRequired: true,
        proofPolicy: ActivityProofPolicy.MutualOrProof,
        icebreakerTasks: expect.arrayContaining([
          expect.stringContaining('活动结束后'),
        ]),
      }),
    );
    expect(result.output).toMatchObject({ id: 77 });
    expect(result.loopUpdates).toMatchObject({
      sourceTool: SocialAgentToolName.CreateActivity,
      activityInviteKeys: [
        'activity:create_activity:2:saturday easy run::qingdao:公共场所待确认',
      ],
    });
  });

  it('skips duplicate activity invites using social loop memory keys', async () => {
    const { service, activities } = makeService();

    const result = await service.createActivity(
      makeTask({
        memory: {
          socialLoop: {
            activityInviteKeys: [
              'activity:create_activity:2:saturday easy run::qingdao:公共场所待确认',
            ],
          },
        },
      }),
      {
        targetUserId: 2,
        title: 'Saturday easy run',
        city: 'Qingdao',
      },
      SocialAgentToolName.CreateActivity,
      'step_1',
    );

    expect(activities.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      output: {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_activity_invite',
        toolName: SocialAgentToolName.CreateActivity,
        targetUserId: 2,
        title: 'Saturday easy run',
        startTime: null,
      },
    });
  });

  it('creates offline meetings and returns message memory patches', async () => {
    const { service, activities, messages } = makeService();
    const activity = {
      id: 33,
      title: 'Weekend running meetup',
      status: 'pending_confirm',
      city: 'Beijing',
      locationName: 'Chaoyang Park west gate',
      startTime: null,
    };
    activities.create.mockResolvedValue(activity);
    messages.startConversation.mockResolvedValue({ conversationId: 'conv_1' });
    messages.sendMessage.mockResolvedValue({
      id: 'msg_1',
      conversationId: 'conv_1',
    });

    const result = await service.createActivity(
      makeTask(),
      {
        targetUserId: 2,
        title: 'Weekend running meetup',
        locationName: 'Chaoyang Park west gate',
        city: 'Beijing',
      },
      SocialAgentToolName.OfflineMeeting,
      'step_1',
    );

    expect(messages.startConversation).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({
        metadata: expect.objectContaining({
          toolName: SocialAgentToolName.OfflineMeeting,
          activityId: 33,
          targetUserId: 2,
        }),
      }),
    );
    expect(messages.sendMessage).toHaveBeenCalledWith(
      'conv_1',
      1,
      expect.stringContaining('Weekend running meetup'),
      expect.objectContaining({
        senderType: 'agent',
        source: 'ai_delegate',
        metadata: expect.objectContaining({
          toolName: SocialAgentToolName.OfflineMeeting,
          activityId: 33,
          targetUserId: 2,
        }),
      }),
    );
    expect(result.output).toMatchObject({
      activityId: 33,
      invitedUserId: 2,
      conversationId: 'conv_1',
      messageId: 'msg_1',
    });
    expect(result.loopUpdates).toMatchObject({
      conversationId: 'conv_1',
      targetUserId: 2,
      lastMessageId: 'msg_1',
      lastAgentMessageId: 'msg_1',
      sourceTool: SocialAgentToolName.OfflineMeeting,
      activityId: 33,
    });
    expect(result.sentMessage).toMatchObject({
      id: 'msg_1',
      conversationId: 'conv_1',
      targetUserId: 2,
      toolName: SocialAgentToolName.OfflineMeeting,
      stepId: 'step_1',
    });
  });

  it('joins activities by id', async () => {
    const { service, activities } = makeService();
    activities.join.mockResolvedValue({ id: 99, status: 'confirmed' });

    await expect(
      service.joinActivity(makeTask(), { activityId: 99 }),
    ).resolves.toEqual({
      id: 99,
      status: 'confirmed',
      activityId: 99,
      joined: true,
    });
    expect(activities.join).toHaveBeenCalledWith(99, 1);
  });

  it('rejects offline meetings without a target and joins without an id', async () => {
    const { service } = makeService();

    await expect(
      service.createActivity(
        makeTask(),
        { title: 'meet up' },
        SocialAgentToolName.OfflineMeeting,
        'step_1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.joinActivity(makeTask(), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
