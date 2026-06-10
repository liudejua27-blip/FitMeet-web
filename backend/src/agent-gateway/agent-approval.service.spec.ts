import { AgentApprovalService } from './agent-approval.service';
import {
  ApprovalStatus,
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  AgentSettings,
  AgentSettingsMode,
} from './entities/agent-settings.entity';
import {
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    id: 1,
    userId: 1,
    agentConnectionId: null,
    mode: AgentSettingsMode.Open,
    allowSearch: true,
    allowDraftMessage: true,
    allowSendMessage: true,
    allowAutoReply: true,
    allowCreateActivity: true,
    allowJoinActivity: true,
    allowShareLocation: true,
    allowUploadProof: true,
    allowContactExchange: true,
    maxDailyMessages: 20,
    requireApprovalForFirstMessage: false,
    requireApprovalForOfflineMeeting: false,
    requireApprovalForPhotoUpload: false,
    requireApprovalForAll: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as AgentSettings;
}

function makeService() {
  return new AgentApprovalService({} as never, {} as never, {} as never);
}

describe('AgentApprovalService classify', () => {
  it('allows low-risk send_message in open mode', () => {
    const result = makeService().classify({
      type: ApprovalType.SendMessage,
      payload: { toUserId: 2, text: 'hello' },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(result).toMatchObject({
      requiresApproval: false,
      blocked: false,
      riskLevel: ApprovalRiskLevel.Low,
    });
    expect(result.reasons).toContain('auto_execute_allowed_by_open');
  });

  it('requires approval for send_message in basic mode', () => {
    const result = makeService().classify({
      type: ApprovalType.SendMessage,
      payload: { toUserId: 2, text: 'hello' },
      settings: makeSettings({ mode: AgentSettingsMode.Basic }),
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'basic_mode_blocks_auto_send',
      ]),
    );
  });

  it('gates add friend by mode instead of treating it as contact exchange', () => {
    const open = makeService().classify({
      type: ApprovalType.ContactRequest,
      payload: { targetUserId: 2 },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });
    const basic = makeService().classify({
      type: ApprovalType.ContactRequest,
      payload: { targetUserId: 2 },
      settings: makeSettings({ mode: AgentSettingsMode.Basic }),
    });

    expect(open.requiresApproval).toBe(false);
    expect(open.riskLevel).toBe(ApprovalRiskLevel.Medium);
    expect(basic.requiresApproval).toBe(true);
  });

  it('always requires approval for contact exchange, offline meeting, and payment', () => {
    for (const type of [
      ApprovalType.ContactExchange,
      ApprovalType.OfflineMeeting,
      ApprovalType.Payment,
    ]) {
      const result = makeService().classify({
        type,
        payload: { targetUserId: 2 },
        settings: makeSettings({ mode: AgentSettingsMode.Open }),
      });

      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe(ApprovalRiskLevel.High);
      expect(result.reasons).toContain(
        'approval_required_by_permission_engine',
      );
    }
  });

  it('requires activity invites to have confirmation or a recorded permission source', () => {
    const result = makeService().classify({
      type: ApprovalType.JoinActivity,
      payload: { activityId: 33, targetUserId: 2 },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'activity_invite_requires_approval_or_permission_source',
      ]),
    );
  });
});

describe('AgentApprovalService pending approval realtime idempotency', () => {
  it('does not dispatch an already approved pending approval again', async () => {
    const approval = {
      id: 9,
      userId: 1,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.SendMessage,
      actionType: 'send_message',
      skillName: 'send_message',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: 'send a message',
      payload: {},
      expiresAt: new Date(Date.now() + 10000),
    };
    const repo = { findOne: jest.fn().mockResolvedValue(approval) };
    const dispatcher = jest.fn();
    const service = new AgentApprovalService(
      repo as never,
      {} as never,
      { emitToConnection: jest.fn() } as never,
      { emitToUser: jest.fn() } as never,
    );

    const result = await service.approve(9, 1, dispatcher);

    expect(result.dispatched).toBe(false);
    expect(result.dispatchResult).toEqual({
      idempotent: true,
      status: ApprovalStatus.Approved,
    });
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it('clears task pending actions when a pending approval is approved or rejected', async () => {
    const approvals = [
      {
        id: 12,
        userId: 1,
        agentConnectionId: null,
        agentTaskId: 101,
        type: ApprovalType.SendMessage,
        actionType: 'send_candidate_message',
        skillName: 'send_candidate_message',
        status: ApprovalStatus.Pending,
        riskLevel: ApprovalRiskLevel.Medium,
        summary: 'send a message',
        payload: {},
        expiresAt: new Date(Date.now() + 10000),
      },
      {
        id: 13,
        userId: 1,
        agentConnectionId: null,
        agentTaskId: 101,
        type: ApprovalType.SendMessage,
        actionType: 'send_candidate_message',
        skillName: 'send_candidate_message',
        status: ApprovalStatus.Pending,
        riskLevel: ApprovalRiskLevel.Medium,
        summary: 'send another message',
        payload: {},
        expiresAt: new Date(Date.now() + 10000),
      },
    ];
    const task = {
      id: 101,
      ownerUserId: 1,
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 12,
              type: 'send_message',
              actionType: 'send_candidate_message',
              summary: 'send a message',
              riskLevel: 'medium',
              at: '2026-06-07T00:00:00.000Z',
            },
            {
              id: 13,
              type: 'send_message',
              actionType: 'send_candidate_message',
              summary: 'send another message',
              riskLevel: 'medium',
              at: '2026-06-07T00:01:00.000Z',
            },
          ],
        },
      },
    };
    const repo = {
      findOne: jest.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve(approvals.find((approval) => approval.id === where.id)),
      ),
      save: jest.fn((approval) => Promise.resolve(approval)),
    };
    const logRepo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const eventRepo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const service = new AgentApprovalService(
      repo as never,
      logRepo as never,
      { emitToConnection: jest.fn() } as never,
      { emitToUser: jest.fn() } as never,
      taskRepo as never,
      eventRepo as never,
    );

    await service.approve(12, 1);
    await service.reject(13, 1);

    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [],
      },
    });
    expect(taskRepo.findOne).toHaveBeenCalledWith({
      where: { id: 101, ownerUserId: 1 },
    });
    expect(taskRepo.save).toHaveBeenCalledTimes(2);
    expect(eventRepo.save).toHaveBeenCalledTimes(2);
    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        ownerUserId: 1,
        eventType: AgentTaskEventType.ConfirmationReceived,
        actor: AgentTaskEventActor.User,
        summary: '用户已批准：send a message',
        payload: expect.objectContaining({
          approvalId: 12,
          decision: 'approved',
          status: ApprovalStatus.Approved,
        }),
      }),
    );
    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        ownerUserId: 1,
        eventType: AgentTaskEventType.ConfirmationReceived,
        actor: AgentTaskEventActor.User,
        summary: '用户已拒绝：send another message',
        payload: expect.objectContaining({
          approvalId: 13,
          decision: 'rejected',
          status: ApprovalStatus.Rejected,
        }),
      }),
    );
  });

  it('expires stale task approvals before returning pending approvals for restore', async () => {
    const expired = {
      id: 21,
      userId: 1,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.SendMessage,
      actionType: 'send_candidate_message',
      skillName: 'send_candidate_message',
      status: ApprovalStatus.Pending,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: 'expired message',
      payload: {},
      expiresAt: new Date(Date.now() - 1000),
    };
    const active = {
      id: 22,
      userId: 1,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.SendMessage,
      actionType: 'send_candidate_message',
      skillName: 'send_candidate_message',
      status: ApprovalStatus.Pending,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: 'active message',
      payload: {},
      expiresAt: new Date(Date.now() + 10000),
    };
    const task = {
      id: 101,
      ownerUserId: 1,
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 21,
              type: 'send_message',
              actionType: 'send_candidate_message',
              summary: 'expired message',
              riskLevel: 'medium',
              at: '2026-06-07T00:00:00.000Z',
            },
            {
              id: 22,
              type: 'send_message',
              actionType: 'send_candidate_message',
              summary: 'active message',
              riskLevel: 'medium',
              at: '2026-06-07T00:01:00.000Z',
            },
          ],
        },
      },
    };
    const repo = {
      find: jest
        .fn()
        .mockResolvedValueOnce([expired, active])
        .mockResolvedValueOnce([active]),
      save: jest.fn((approval) => Promise.resolve(approval)),
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const eventRepo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const service = new AgentApprovalService(
      repo as never,
      {} as never,
      { emitToConnection: jest.fn() } as never,
      undefined,
      taskRepo as never,
      eventRepo as never,
    );

    const result = await service.getPendingForTask(1, 101);

    expect(result).toEqual([active]);
    expect(expired.status).toBe(ApprovalStatus.Expired);
    expect(repo.save).toHaveBeenCalledWith(expired);
    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            id: 22,
            actionType: 'send_candidate_message',
          }),
        ],
      },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(task);
    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        ownerUserId: 1,
        eventType: AgentTaskEventType.ConfirmationReceived,
        actor: AgentTaskEventActor.System,
        summary: '确认请求已过期：expired message',
        payload: expect.objectContaining({
          approvalId: 21,
          decision: 'expired',
          status: ApprovalStatus.Expired,
        }),
      }),
    );
  });
});
