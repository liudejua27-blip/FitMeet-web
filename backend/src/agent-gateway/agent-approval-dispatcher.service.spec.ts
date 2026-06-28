import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalStatus,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { SocialRequestCandidateStatus } from '../match/social-request-candidate.entity';
import { UserSocialRequestStatus } from '../social-requests/social-request.entity';

describe('AgentApprovalDispatcherService', () => {
  function makeService(
    options: {
      activities?: Record<string, jest.Mock>;
      approvalRepo?: Record<string, jest.Mock>;
      actionLogs?: Record<string, jest.Mock>;
      l5Runtime?: Record<string, jest.Mock>;
      longTermMemory?: Record<string, jest.Mock>;
      socialRequests?: Record<string, jest.Mock>;
      taskRepo?: Record<string, jest.Mock>;
    } = {},
  ) {
    const activities = options.activities ?? {};
    const approvalRepo =
      options.approvalRepo ??
      ({
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      } as Record<string, jest.Mock>);
    const actionLogs =
      options.actionLogs ??
      ({
        logAgentAction: jest.fn().mockResolvedValue(undefined),
      } as Record<string, jest.Mock>);
    const l5Runtime =
      options.l5Runtime ??
      ({
        transitionMeetLoop: jest.fn().mockResolvedValue(undefined),
      } as Record<string, jest.Mock>);
    const socialRequests =
      options.socialRequests ??
      ({
        syncPublicIntentById: jest.fn().mockResolvedValue({
          id: 'public_301',
          status: 'active',
        }),
      } as Record<string, jest.Mock>);
    const longTermMemory =
      options.longTermMemory ??
      ({
        updateConfirmedMemory: jest.fn().mockResolvedValue({
          success: true,
          status: 'updated',
          memoryKey: 'availableTimes',
        }),
      } as Record<string, jest.Mock>);
    const logRepo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const taskRepo =
      options.taskRepo ??
      ({
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn((input) => Promise.resolve(input)),
      } as Record<string, jest.Mock>);
    const service = new AgentApprovalDispatcherService(
      {} as never,
      activities as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      logRepo as never,
      approvalRepo as never,
      {} as never,
      { update: jest.fn().mockResolvedValue({ affected: 1 }) } as never,
      { update: jest.fn().mockResolvedValue({ affected: 1 }) } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { startConversation: jest.fn(), sendMessage: jest.fn() } as never,
      { pushNewMessageToUser: jest.fn() } as never,
      { create: jest.fn() } as never,
      actionLogs as never,
      socialRequests as never,
      l5Runtime as never,
      taskRepo as never,
      undefined,
      longTermMemory as never,
    );
    return {
      actionLogs,
      approvalRepo,
      l5Runtime,
      logRepo,
      service,
      longTermMemory,
      socialRequests,
      taskRepo,
    };
  }

  it('dispatches approved public social request publish through SocialRequestsService', async () => {
    const socialRequests = {
      syncPublicIntentById: jest
        .fn()
        .mockResolvedValue({ id: 'public_301', status: 'active' }),
    };
    const task = {
      id: 101,
      ownerUserId: 7,
      status: 'awaiting_confirmation',
      statusReason: 'publish_social_request_requires_approval',
      result: {
        publishSocialRequest: {
          status: 'pending_approval',
          socialRequestId: 301,
          approvalId: 9910,
        },
      },
      memory: { shortTerm: { publishStatus: 'pending_approval' } },
      completedAt: null,
    };
    const taskRepo = {
      findOne: jest.fn().mockResolvedValue(task),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const { actionLogs, logRepo, service } = makeService({
      socialRequests,
      taskRepo,
    });

    const result = await service.dispatch({
      id: 9910,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.PostPublish,
      actionType: 'publish_social_request',
      skillName: 'agent.social_request.publish',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.High,
      summary: '公开发布社交需求 #301',
      reason: '',
      createdBy: 'agent',
      payload: {
        socialRequestId: 301,
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
      },
      relatedSocialRequestId: 301,
      relatedCandidateId: null,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(socialRequests.syncPublicIntentById).toHaveBeenCalledWith(301, 7);
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_social_request',
        result: 'success',
        payload: expect.objectContaining({
          approvalId: 9910,
          socialRequestId: 301,
          publicIntentId: 'public_301',
        }),
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        actionType: 'sync_to_hall',
        actionStatus: 'executed',
        outputSummary: 'post_publish_dispatched',
        payload: expect.objectContaining({
          approvalId: 9910,
          approvalType: ApprovalType.PostPublish,
          socialRequestId: 301,
          publicIntentId: 'public_301',
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      result: expect.objectContaining({
        id: 'public_301',
        status: 'published',
        socialRequestId: 301,
        publicIntentId: 'public_301',
        discoverHref: '/discover?publicIntentId=public_301',
        publicIntentHref: '/public-intent/public_301',
        synced: true,
        publicLoop: expect.objectContaining({
          stage: 'discover_visible',
          publicIntentId: 'public_301',
          discoverHref: '/discover?publicIntentId=public_301',
          publicIntentHref: '/public-intent/public_301',
        }),
      }),
    });
    expect(taskRepo.findOne).toHaveBeenCalledWith({
      where: { id: 101, ownerUserId: 7 },
    });
    expect(taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        statusReason: 'social_request_published_and_synced',
        result: expect.objectContaining({
          publishSocialRequest: expect.objectContaining({
            approvalId: 9910,
            socialRequestId: 301,
            publicIntentId: 'public_301',
            discoverHref: '/discover?publicIntentId=public_301',
            publicIntentHref: '/public-intent/public_301',
            status: 'published',
            synced: true,
          }),
        }),
        memory: expect.objectContaining({
          shortTerm: expect.objectContaining({
            publishedSocialRequestId: 301,
            publicIntentId: 'public_301',
            discoverHref: '/discover?publicIntentId=public_301',
            publicIntentHref: '/public-intent/public_301',
            publishStatus: 'published',
          }),
        }),
      }),
    );
  });

  it('dispatches approved mark-candidate-messaged approvals into candidate state updates', async () => {
    const socialCandidateRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const socialRequestRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const logRepo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const actionLogs = {
      logAgentAction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AgentApprovalDispatcherService(
      {} as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      logRepo as never,
      { update: jest.fn().mockResolvedValue({ affected: 1 }) } as never,
      {} as never,
      socialRequestRepo as never,
      socialCandidateRepo as never,
      { findOne: jest.fn(), save: jest.fn(), create: jest.fn() } as never,
      { startConversation: jest.fn(), sendMessage: jest.fn() } as never,
      { pushNewMessageToUser: jest.fn() } as never,
      { create: jest.fn() } as never,
      actionLogs as never,
    );

    const result = await service.dispatch({
      id: 9911,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: null,
      type: ApprovalType.Custom,
      actionType: 'mark_candidate_messaged',
      skillName: 'agent.social_request.mark_messaged',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: '将候选 #501 标记为已触达',
      reason: '',
      createdBy: 'agent',
      payload: {
        socialRequestId: 301,
        candidateRecordId: 501,
        checkpointRequired: true,
      },
      relatedSocialRequestId: 301,
      relatedCandidateId: 501,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(socialCandidateRepo.update).toHaveBeenCalledWith(
      { id: 501 },
      { status: SocialRequestCandidateStatus.Messaged },
    );
    expect(socialRequestRepo.update).toHaveBeenCalledWith(
      { id: 301, userId: 7 },
      { status: UserSocialRequestStatus.Chatting },
    );
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'confirm_social_request_candidate',
        result: 'success',
        payload: expect.objectContaining({
          approvalId: 9911,
          socialRequestId: 301,
          candidateRecordId: 501,
        }),
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        actionType: 'send_message',
        actionStatus: 'executed',
        outputSummary: 'mark_candidate_messaged_dispatched',
        payload: expect.objectContaining({
          approvalId: 9911,
          approvalType: ApprovalType.Custom,
          socialRequestId: 301,
          candidateRecordId: 501,
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      result: {
        socialRequestId: 301,
        candidateRecordId: 501,
        status: SocialRequestCandidateStatus.Messaged,
      },
    });
  });

  it('dispatches approved long-term memory approvals into confirmed memory writes', async () => {
    const longTermMemory = {
      updateConfirmedMemory: jest.fn().mockResolvedValue({
        success: true,
        status: 'updated',
        memoryKey: 'availableTimes',
      }),
    };
    const { actionLogs, logRepo, service } = makeService({ longTermMemory });

    const result = await service.dispatch({
      id: 9920,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.Custom,
      actionType: 'update_long_term_memory',
      skillName: 'agent.memory.update',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: '写入长期记忆：可约时间',
      reason: '',
      createdBy: 'agent',
      payload: {
        memoryKey: 'availableTimes',
        value: ['周末下午', '工作日晚上'],
        reason: '用户确认保存',
        proposalId: 'proposal_9920',
        tags: ['availability', 'confirmed'],
      },
      relatedSocialRequestId: null,
      relatedCandidateId: null,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(longTermMemory.updateConfirmedMemory).toHaveBeenCalledWith({
      userId: 7,
      taskId: 101,
      memoryKey: 'availableTimes',
      value: ['周末下午', '工作日晚上'],
      reason: '用户确认保存',
      proposalId: 'proposal_9920',
      confirmed: true,
      source: 'approval_dispatcher',
      tags: ['availability', 'confirmed'],
    });
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent_event',
        result: 'success',
        payload: expect.objectContaining({
          approvalId: 9920,
          actionType: 'update_long_term_memory',
          memoryKey: 'availableTimes',
        }),
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        actionStatus: 'executed',
        outputSummary: 'long_term_memory_dispatched',
        payload: expect.objectContaining({
          approvalId: 9920,
          actionType: 'update_long_term_memory',
          memoryKey: 'availableTimes',
        }),
      }),
    );
    expect(result).toEqual({
      ok: true,
      result: expect.objectContaining({
        success: true,
        status: 'updated',
        memoryKey: 'availableTimes',
      }),
    });
  });

  it('rolls back approved long-term memory dispatch when confirmed memory write is not updated', async () => {
    const longTermMemory = {
      updateConfirmedMemory: jest.fn().mockResolvedValue({
        success: false,
        status: 'confirmation_required',
        confirmationRequired: true,
        memoryKey: '',
      }),
    };
    const approvalRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const { actionLogs, logRepo, service } = makeService({
      approvalRepo,
      longTermMemory,
    });

    const result = await service.dispatch({
      id: 9921,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.Custom,
      actionType: 'update_long_term_memory',
      skillName: 'agent.memory.update',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: '写入长期记忆',
      reason: '',
      createdBy: 'agent',
      payload: {},
      relatedSocialRequestId: null,
      relatedCandidateId: null,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(longTermMemory.updateConfirmedMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        taskId: 101,
        memoryKey: '',
        value: '',
        confirmed: true,
        source: 'approval_dispatcher',
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain(
      'long_term_memory_dispatch_not_updated:confirmation_required',
    );
    expect(approvalRepo.update).toHaveBeenCalledWith(
      9921,
      expect.objectContaining({
        status: ApprovalStatus.Pending,
        respondedAt: null,
      }),
    );
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'intercepted',
        result: 'error',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionStatus: 'failed',
        outputSummary: expect.stringContaining(
          'long_term_memory_dispatch_not_updated',
        ),
      }),
    );
  });

  it('dispatches approved activity creation with safety and idempotency context', async () => {
    const activities = {
      create: jest.fn().mockResolvedValue({
        id: 700,
        invitedUserId: 22,
        status: 'pending_confirm',
      }),
    };
    const { actionLogs, l5Runtime, service } = makeService({ activities });

    const result = await service.dispatch({
      id: 9902,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.CreateActivity,
      actionType: 'create_activity',
      skillName: 'create_activity',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.High,
      summary: '创建周末约练活动',
      reason: '',
      createdBy: 'agent',
      payload: {
        type: 'running',
        title: '周末慢跑',
        city: '青岛',
        locationName: '青岛大学附近公共场所',
        publicPlaceOnly: true,
        noPreciseLocation: true,
        safetyBoundary: '公共场所见面，不共享精确位置。',
        checkinReminder: '活动开始前我会提醒你确认是否到达。',
        reviewPrompt: '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
        idempotencyKey: 'activity-create:101:9001',
        resumeMode: 'resume_after_approval',
        candidateUserId: 22,
      },
      relatedSocialRequestId: 301,
      relatedCandidateId: 501,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(activities.create).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: 'running',
        title: '周末慢跑',
        publicPlaceOnly: true,
        noPreciseLocation: true,
        safetyBoundary: '公共场所见面，不共享精确位置。',
        idempotencyKey: 'activity-create:101:9001',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        actionStatus: 'executed',
        outputSummary: 'create_activity_dispatched',
        payload: expect.objectContaining({
          activityId: 700,
          approvalId: 9902,
          approvalType: ApprovalType.CreateActivity,
        }),
      }),
    );
    expect(l5Runtime.transitionMeetLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 7,
        agentTaskId: 101,
        activityId: 700,
        candidateUserId: 22,
        stage: 'activity_confirmed',
        waitingFor: 'activity_check_in',
        state: expect.objectContaining({
          source: 'approval_dispatch',
          approvalId: 9902,
          actionType: 'create_activity',
          status: 'activity_confirmed',
          loopStage: 'activity_confirmed',
          publicPlaceOnly: true,
          noPreciseLocation: true,
          idempotencyKey: 'activity-create:101:9001',
          resumeMode: 'resume_after_approval',
        }),
        review: null,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      result: { id: 700, status: 'pending_confirm' },
    });
  });

  it('rolls failed activity creation back to pending so the approval can be retried', async () => {
    const activities = {
      create: jest
        .fn()
        .mockRejectedValue(new Error('activity service offline')),
    };
    const approvalRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const { actionLogs, l5Runtime, logRepo, service } = makeService({
      activities,
      approvalRepo,
    });

    const result = await service.dispatch({
      id: 9903,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.CreateActivity,
      actionType: 'create_activity',
      skillName: 'create_activity',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.High,
      summary: '创建周末约练活动',
      reason: '',
      createdBy: 'agent',
      payload: { type: 'running', title: '周末慢跑' },
      relatedSocialRequestId: 301,
      relatedCandidateId: 501,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(approvalRepo.update).toHaveBeenCalledWith(9903, {
      status: ApprovalStatus.Pending,
      respondedAt: null,
    });
    expect(logRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'intercepted',
        result: 'error',
        blockReason: 'activity service offline',
      }),
    );
    expect(actionLogs.logAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionStatus: 'failed',
        outputSummary: 'dispatch_failed: activity service offline',
        reason: 'approval_dispatch_failed',
      }),
    );
    expect(l5Runtime.transitionMeetLoop).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      errorMessage: 'activity service offline',
    });
  });

  it('resumes an approved candidate connect from the serialized approval payload', async () => {
    const followRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Record<string, unknown>) => ({
        id: 601,
        ...input,
      })),
      save: jest.fn((input: Record<string, unknown>) =>
        Promise.resolve({ id: 601, ...input }),
      ),
    };
    const messages = {
      startConversation: jest.fn().mockResolvedValue({
        conversationId: 'conv-22',
        preexisting: false,
        targetUserId: 22,
      }),
    };
    const socialCandidateRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const socialRequestRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const logRepo = {
      create: jest.fn((input) => input),
      save: jest.fn((input) => Promise.resolve(input)),
    };
    const actionLogs = {
      logAgentAction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AgentApprovalDispatcherService(
      {} as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      logRepo as never,
      { update: jest.fn().mockResolvedValue({ affected: 1 }) } as never,
      {} as never,
      socialRequestRepo as never,
      socialCandidateRepo as never,
      followRepo as never,
      messages as never,
      { pushNewMessageToUser: jest.fn() } as never,
      { create: jest.fn() } as never,
      actionLogs as never,
    );

    const result = await service.dispatch({
      id: 9901,
      userId: 7,
      agentConnectionId: null,
      agentTaskId: 101,
      type: ApprovalType.ContactRequest,
      actionType: 'add_friend',
      skillName: 'add_friend',
      status: ApprovalStatus.Approved,
      riskLevel: ApprovalRiskLevel.Medium,
      summary: '加好友并聊天：这位用户',
      reason: '',
      createdBy: 'agent',
      payload: {
        source: 'candidate_opportunity_card',
        targetUserId: 22,
        candidateRecordId: 501,
        socialRequestId: 301,
        openConversation: true,
        idempotencyKey: 'candidate-connect:101:22',
        opportunityId: 'opportunity:101:22',
        checkpointRequired: true,
        resumeMode: 'resume_after_approval',
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      relatedSocialRequestId: 301,
      relatedCandidateId: 501,
      relatedActivityId: null,
      agentRationale: '',
      expiresAt: new Date('2026-06-07T00:00:00.000Z'),
      respondedAt: new Date('2026-06-06T00:00:00.000Z'),
    } as unknown as AgentApprovalRequest);

    expect(followRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        followerId: 7,
        followingId: 22,
      }),
    );
    expect(messages.startConversation).toHaveBeenCalledWith(
      7,
      22,
      expect.objectContaining({
        ownerUserId: 7,
        actorUserId: 7,
        metadata: expect.objectContaining({
          source: 'approval_dispatch',
          approvalRequestId: 9901,
          agentTaskId: 101,
          targetUserId: 22,
          candidateRecordId: 501,
          socialRequestId: 301,
          idempotencyKey: 'candidate-connect:101:22',
          opportunityId: 'opportunity:101:22',
          resumeMode: 'resume_after_approval',
          checkpointRequired: true,
        }),
      }),
    );
    expect(socialCandidateRepo.update).toHaveBeenCalledWith(
      { id: 501 },
      { status: SocialRequestCandidateStatus.Approved },
    );
    expect(socialRequestRepo.update).toHaveBeenCalledWith(
      { id: 301, userId: 7 },
      { status: UserSocialRequestStatus.Chatting },
    );
    expect(result).toMatchObject({
      ok: true,
      result: {
        following: true,
        targetUserId: 22,
        friendRequestId: '601',
        conversationId: 'conv-22',
        openedConversation: true,
        socialRequestId: 301,
        candidateRecordId: 501,
        idempotencyKey: 'candidate-connect:101:22',
      },
    });
  });
});
