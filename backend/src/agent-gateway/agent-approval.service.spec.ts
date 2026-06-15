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
  it('always requires approval for sending messages, even in open mode', () => {
    const result = makeService().classify({
      type: ApprovalType.SendMessage,
      payload: { toUserId: 2, text: 'hello' },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(result).toMatchObject({
      requiresApproval: true,
      blocked: false,
      riskLevel: ApprovalRiskLevel.Low,
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'message_send_requires_explicit_approval',
      ]),
    );
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
        'message_send_requires_explicit_approval',
      ]),
    );
  });

  it('always requires approval before adding or connecting a candidate', () => {
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

    expect(open.requiresApproval).toBe(true);
    expect(open.riskLevel).toBe(ApprovalRiskLevel.Medium);
    expect(open.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'contact_request_requires_explicit_approval',
      ]),
    );
    expect(basic.requiresApproval).toBe(true);
  });

  it('always requires approval for contact exchange, activity creation, public publish, offline meeting, and payment', () => {
    for (const type of [
      ApprovalType.ContactExchange,
      ApprovalType.CreateActivity,
      ApprovalType.PostPublish,
      ApprovalType.OfflineMeeting,
      ApprovalType.Payment,
    ]) {
      const result = makeService().classify({
        type,
        payload: { targetUserId: 2 },
        settings: makeSettings({ mode: AgentSettingsMode.Open }),
      });

      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).not.toBe(ApprovalRiskLevel.Low);
      expect(result.reasons).toContain(
        'approval_required_by_permission_engine',
      );
    }
  });

  it('keeps every product high-risk social action behind explicit approval in open mode', () => {
    const cases: Array<{
      label: string;
      type: ApprovalType;
      actionType?: 'send_message' | 'add_friend' | 'create_activity' | 'payment' | 'generate_suggestion';
      payload: Record<string, unknown>;
      riskLevel: ApprovalRiskLevel;
      reason: string;
    }> = [
      {
        label: '发消息',
        type: ApprovalType.SendMessage,
        payload: { toUserId: 2, text: '周末一起跑步吗？' },
        riskLevel: ApprovalRiskLevel.Low,
        reason: 'message_send_requires_explicit_approval',
      },
      {
        label: '连接候选人/加好友',
        type: ApprovalType.ContactRequest,
        payload: { targetUserId: 2, schemaAction: 'candidate.connect' },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'contact_request_requires_explicit_approval',
      },
      {
        label: '创建约练活动',
        type: ApprovalType.CreateActivity,
        payload: { activityType: 'running_partner', time: '周末下午' },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'activity_create_requires_explicit_approval',
      },
      {
        label: '公开发布',
        type: ApprovalType.PostPublish,
        payload: { schemaAction: 'public_publish', title: '周末跑步局' },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'public_publish_requires_explicit_approval',
      },
      {
        label: '隐私修改',
        type: ApprovalType.Custom,
        actionType: 'generate_suggestion',
        payload: {
          schemaAction: 'modify_public_profile',
          fieldKey: 'profileDiscoverable',
          value: true,
        },
        riskLevel: ApprovalRiskLevel.High,
        reason: 'privacy_change_requires_explicit_approval',
      },
      {
        label: '支付',
        type: ApprovalType.Payment,
        actionType: 'payment',
        payload: { amount: 199, currency: 'CNY' },
        riskLevel: ApprovalRiskLevel.High,
        reason: 'payment_requires_payment_intent_and_audit',
      },
    ];

    for (const item of cases) {
      const result = makeService().classify({
        type: item.type,
        actionType: item.actionType,
        payload: item.payload,
        settings: makeSettings({ mode: AgentSettingsMode.Open }),
      });

      expect(result.blocked).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe(item.riskLevel);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          'approval_required_by_permission_engine',
          item.reason,
        ]),
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

  it('requires approval for privacy switches and public profile writes even when routed as custom actions', () => {
    const result = makeService().classify({
      type: ApprovalType.Custom,
      actionType: 'generate_suggestion',
      payload: {
        schemaAction: 'modify_public_profile',
        fieldKey: 'profileDiscoverable',
        value: true,
      },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.riskLevel).toBe(ApprovalRiskLevel.High);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'privacy_change_requires_explicit_approval',
      ]),
    );
  });

  it('requires approval for sensitive profile writes and long-term Life Graph memory updates', () => {
    const sensitive = makeService().classify({
      type: ApprovalType.Custom,
      actionType: 'generate_suggestion',
      payload: {
        schemaAction: 'update_sensitive_profile',
        fieldKey: 'medicalBoundary',
      },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });
    const memory = makeService().classify({
      type: ApprovalType.Custom,
      actionType: 'generate_suggestion',
      payload: {
        schemaAction: 'life_graph.accept_update',
        fieldKey: 'relationshipGoal',
      },
      settings: makeSettings({ mode: AgentSettingsMode.Open }),
    });

    expect(sensitive.requiresApproval).toBe(true);
    expect(sensitive.riskLevel).toBe(ApprovalRiskLevel.High);
    expect(sensitive.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'sensitive_profile_write_requires_explicit_approval',
      ]),
    );
    expect(memory.requiresApproval).toBe(true);
    expect(memory.riskLevel).toBe(ApprovalRiskLevel.Medium);
    expect(memory.reasons).toEqual(
      expect.arrayContaining([
        'approval_required_by_permission_engine',
        'life_graph_memory_write_requires_explicit_approval',
      ]),
    );
  });

  it('keeps schema-driven Tool UI side effects behind approval even when routed as custom actions', () => {
    const cases: Array<{
      label: string;
      payload: Record<string, unknown>;
      riskLevel: ApprovalRiskLevel;
      reason: string;
    }> = [
      {
        label: 'candidate connect',
        payload: {
          schemaAction: 'candidate.connect',
          targetUserId: 2,
        },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'contact_request_requires_explicit_approval',
      },
      {
        label: 'opener send',
        payload: {
          schemaAction: 'opener.confirm_send',
          targetUserId: 2,
          message: '周末一起跑步吗？',
        },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'message_send_requires_explicit_approval',
      },
      {
        label: 'activity create',
        payload: {
          schemaAction: 'activity.confirm_create',
          activityType: 'running',
        },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'activity_create_requires_explicit_approval',
      },
      {
        label: 'meet loop resume after approval',
        payload: {
          schemaAction: 'meet_loop.resume',
          resumeMode: 'resume_after_approval',
          checkpointRequired: true,
        },
        riskLevel: ApprovalRiskLevel.Medium,
        reason: 'meet_loop_resume_requires_checkpoint_confirmation',
      },
      {
        label: 'payment schema action',
        payload: {
          schemaAction: 'payment.confirm',
          amount: 199,
        },
        riskLevel: ApprovalRiskLevel.High,
        reason: 'payment_requires_payment_intent_and_audit',
      },
    ];

    for (const item of cases) {
      const result = makeService().classify({
        type: ApprovalType.Custom,
        actionType: 'generate_suggestion',
        payload: item.payload,
        settings: makeSettings({ mode: AgentSettingsMode.Open }),
      });

      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe(item.riskLevel);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          'approval_required_by_permission_engine',
          item.reason,
        ]),
      );
    }
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

  it('keeps task pending actions when approved dispatch fails so the same checkpoint can retry', async () => {
    const approval = {
      id: 12,
      userId: 1,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.ContactRequest,
      actionType: 'add_friend',
      skillName: 'add_friend',
      status: ApprovalStatus.Pending,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: 'connect a candidate',
      payload: { targetUserId: 22, idempotencyKey: 'candidate-connect:101:22' },
      expiresAt: new Date(Date.now() + 10000),
    };
    const task = {
      id: 101,
      ownerUserId: 1,
      memory: {
        taskMemory: {
          pendingActions: [
            {
              id: 12,
              type: 'contact_request',
              actionType: 'connect_candidate',
              summary: 'connect a candidate',
              riskLevel: 'medium',
              at: '2026-06-07T00:00:00.000Z',
              payload: {
                source: 'candidate_opportunity_card',
                idempotencyKey: 'candidate-connect:101:22',
              },
            },
          ],
        },
      },
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(approval),
      save: jest.fn((row) => Promise.resolve(row)),
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

    await service.approve(12, 1, async () => ({
      ok: false,
      errorMessage: 'conversation write failed',
    }));

    expect(task.memory).toMatchObject({
      taskMemory: {
        pendingActions: [
          expect.objectContaining({
            id: 12,
            payload: expect.objectContaining({
              idempotencyKey: 'candidate-connect:101:22',
            }),
          }),
        ],
      },
    });
    expect(taskRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          approvalId: 12,
          decision: 'approved',
          dispatchError: undefined,
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
