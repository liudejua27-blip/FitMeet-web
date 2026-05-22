import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText, sanitizeForDisplay } from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import type { MatchedCandidateView } from '../match/match.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { UpdateSocialRequestDto } from '../social-requests/dto/update-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { SocialProfileService } from '../users/social-profile.service';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
  SocialAgentPlannerResult,
  SocialAgentPlannerService,
} from './social-agent-planner.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import {
  appendShortTermMemoryItem,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';

export interface SocialAgentVisibleStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

export interface SocialAgentChatCandidate {
  agentTaskId: number;
  socialRequestId: number | null;
  userId: number;
  candidateRecordId: number | null;
  nickname: string;
  avatar: string;
  color: string;
  city: string;
  score: number;
  level: string;
  distanceKm: number | null;
  commonTags: string[];
  reasons: string[];
  risk: { level: string; warnings: string[] };
  suggestedMessage: string;
  status?: string;
}

export interface SocialAgentChatRunResult {
  taskId: number;
  status: AgentTaskStatus;
  visibleSteps: SocialAgentVisibleStep[];
  assistantMessage: string;
  socialRequestDraft: (CreateSocialRequestDto & {
    agentTaskId: number;
    socialRequestId?: number | null;
    mode: 'draft';
    card?: Record<string, unknown>;
    profileUsed?: Record<string, unknown>;
  }) | null;
  candidates: SocialAgentChatCandidate[];
  approvalRequiredActions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

export type SocialAgentChatStreamEvent =
  | { type: 'task'; taskId: number; status: AgentTaskStatus }
  | { type: 'step'; step: SocialAgentVisibleStep }
  | { type: 'result'; result: SocialAgentChatRunResult }
  | { type: 'error'; message: string };

type SocialAgentRequestDraft = NonNullable<SocialAgentChatRunResult['socialRequestDraft']>;
type SocialAgentChatRunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  idempotencyKey?: string | null;
};
type SocialAgentChatReplanRunBody = {
  userMessage?: string | null;
  reason?: SocialAgentPlanReason;
  failure?: SocialAgentPlanFailureContext | null;
};
type StreamEmit = (event: SocialAgentChatStreamEvent) => void | Promise<void>;

export interface SocialAgentChatReplanRunResult extends SocialAgentChatRunResult {
  replan: SocialAgentPlannerResult;
}

@Injectable()
export class SocialAgentChatService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    private readonly planner: SocialAgentPlannerService,
    private readonly executor: SocialAgentToolExecutorService,
    private readonly socialProfiles: SocialProfileService,
  ) {}

  run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentChatRunResult> {
    return this.runInternal(ownerUserId, body);
  }

  runStream(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    return this.runInternal(ownerUserId, body, emit);
  }

  async replanAndRefresh(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ): Promise<SocialAgentChatReplanRunResult> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    if (!userMessage) throw new BadRequestException('请输入补充要求');

    const previousGoal = cleanDisplayText(task.goal, '');
    const refreshedGoal = this.composeFollowUpGoal(previousGoal, userMessage);
    task.goal = refreshedGoal;
    task.status = AgentTaskStatus.Planning;
    task.statusReason = 'user_follow_up_replan_refresh';
    task.result = {
      ...(task.result ?? {}),
      latestFollowUp: {
        userMessage,
        previousGoal,
        refreshedGoal,
        receivedAt: new Date().toISOString(),
      },
    };
    rememberSocialAgentShortTerm(task, {
      latestUserFollowUp: userMessage,
      previousGoal,
      currentGoal: refreshedGoal,
    });
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.FeedbackReceived,
      '用户补充了社交需求',
      { userMessage, previousGoal, refreshedGoal },
      AgentTaskEventActor.User,
    );

    const visibleSteps: SocialAgentVisibleStep[] = [];
    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      this.rememberShortTermStep(task, id, label, 'running');
      const step: SocialAgentVisibleStep = { id, label, status: 'done' };
      visibleSteps.push(step);
      this.rememberShortTermStep(task, id, label, 'done');
      await this.writeEvent(task, eventType, label, payload);
    };

    await done(
      'follow_up_understand',
      '正在理解你的补充要求',
      AgentTaskEventType.GoalUnderstood,
      { userMessage, refreshedGoal },
    );

    const replan = await this.planner.replanTask(taskId, {
      reason: body.reason ?? 'user_follow_up',
      userMessage,
      failure: body.failure ?? null,
    });
    task = await this.assertTaskOwner(taskId, ownerUserId);
    await done(
      'follow_up_replan',
      replan.source === 'fallback'
        ? '已使用本地策略更新 Agent 计划'
        : '已调用 DeepSeek 更新 Agent 计划',
      AgentTaskEventType.PlanUpdated,
      {
        planSource: replan.source,
        fallbackReason: replan.fallbackReason,
        replanAttempt: replan.replanAttempt,
        planStepCount: replan.plan.length,
      },
    );

    const draftResult = await this.generateDraftWithTool(task, refreshedGoal);
    task = await this.assertTaskOwner(taskId, ownerUserId);
    const draft = this.buildDraft(
      task.id,
      draftResult.draft,
      draftResult.card,
      draftResult.profileUsed,
    );
    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft);
    task = await this.assertTaskOwner(taskId, ownerUserId);
    await done('draft', '已重新生成约练草稿', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.CreateSocialRequest,
      draft: this.safeDraftForEvent(draft),
    });

    const candidates = await this.searchCandidates(task, draft);
    task = await this.assertTaskOwner(taskId, ownerUserId);
    await done('search', '已重新检索附近候选人', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.SearchMatches,
      socialRequestId: draft.socialRequestId,
      candidateCount: candidates.length,
    });
    await done(
      'rank',
      '已根据新的时间、地点、兴趣和安全边界排序',
      AgentTaskEventType.StepCompleted,
      { candidateCount: candidates.length },
    );
    await done('reason', '已刷新推荐理由', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.ExplainMatches,
      topCandidateUserId: candidates[0]?.userId ?? null,
    });
    await done('done', '已根据补充要求刷新结果', AgentTaskEventType.TaskSucceeded, {
      candidateCount: candidates.length,
      requiresConfirmation: true,
      replanAttempt: replan.replanAttempt,
    });

    const result = await this.completeRecommendationResult(
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      'follow_up_replan_refreshed',
    );
    return { ...result, replan };
  }

  private async runInternal(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit?: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    const goal = cleanDisplayText(body.goal, '').trim();
    if (!goal) throw new BadRequestException('请输入你的社交需求');

    const permissionMode = this.normalizePermissionMode(body.permissionMode);
    const idempotencyKey = cleanDisplayText(body.idempotencyKey, '');
    const visibleSteps: SocialAgentVisibleStep[] = [];

    let task = await this.createOrReuseTask({
      ownerUserId,
      goal,
      permissionMode,
      idempotencyKey: idempotencyKey || null,
    });
    this.rememberShortTermStep(task, 'task.created', '已创建 Social Agent 任务', 'done');
    await emit?.({ type: 'task', taskId: task.id, status: task.status });

    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      await emit?.({ type: 'step', step: { id, label, status: 'running' } });
      this.rememberShortTermStep(task, id, label, 'running');
      const step: SocialAgentVisibleStep = { id, label, status: 'done' };
      visibleSteps.push(step);
      this.rememberShortTermStep(task, id, label, 'done');
      await this.writeEvent(task, eventType, label, payload);
      await emit?.({ type: 'step', step });
    };

    await done('understand', '正在理解你的社交需求', AgentTaskEventType.GoalUnderstood, {
      goal,
      permissionMode,
    });

    await done(
      'permission',
      `正在检查权限模式：${this.modeLabel(permissionMode)}`,
      AgentTaskEventType.Note,
      {
        permissionMode,
        policy: 'recommendation_plus_confirmation',
      },
    );

    const profileSummary = await this.readProfileSummary(ownerUserId);
    const planResult = await this.planner.planExistingTask(task);
    await done(
      'deepseek',
      planResult.source === 'fallback'
        ? '正在使用本地策略生成匹配意图'
        : '正在调用 DeepSeek 生成匹配意图',
      AgentTaskEventType.PlanGenerated,
      {
        planSource: planResult.source,
        fallbackReason: planResult.fallbackReason,
        planStepCount: Array.isArray(task.plan) ? task.plan.length : 0,
        profileSummary,
      },
    );

    const draftResult = await this.generateDraftWithTool(task, goal);
    task = await this.assertTaskOwner(task.id, ownerUserId);
    const draft = this.buildDraft(
      task.id,
      draftResult.draft,
      draftResult.card,
      draftResult.profileUsed,
    );

    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft);
    task = await this.assertTaskOwner(task.id, ownerUserId);

    const candidates = await this.searchCandidates(task, draft);
    task = await this.assertTaskOwner(task.id, ownerUserId);
    await done('search', '正在检索附近候选人', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.SearchMatches,
      socialRequestId: draft.socialRequestId,
      candidateCount: candidates.length,
    });

    await done(
      'rank',
      '正在根据时间、地点、兴趣和安全边界排序',
      AgentTaskEventType.StepCompleted,
      { candidateCount: candidates.length },
    );

    await done('draft', '正在生成约练草稿', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.CreateSocialRequest,
      draft: this.safeDraftForEvent(draft),
    });

    await done('reason', '正在生成推荐理由', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.ExplainMatches,
      topCandidateUserId: candidates[0]?.userId ?? null,
    });

    await done('done', '已完成', AgentTaskEventType.TaskSucceeded, {
      candidateCount: candidates.length,
      requiresConfirmation: true,
    });

    return this.completeRecommendationResult(
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      'recommendations_ready_waiting_user_confirmation',
      emit,
    );
  }

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const requestId = this.number(draft.socialRequestId ?? draft.metadata?.socialRequestId);
    const dto = this.toPublishDto(task, draft);
    const publishAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...dto,
        socialRequestId: requestId,
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        metadata: {
          ...(dto.metadata ?? {}),
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    if (publishAction.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(publishAction.error?.message, '发布约练失败'),
      );
    }

    task = await this.assertTaskOwner(taskId, ownerUserId);
    const output = this.isRecord(publishAction.output) ? publishAction.output : {};
    const socialRequestId = this.number(output.socialRequestId ?? output.id ?? requestId);
    if (!socialRequestId) throw new BadRequestException('发布约练缺少 socialRequestId');
    const publicIntent = this.isRecord(output.publicIntent) ? output.publicIntent : {};
    const publicIntentId =
      cleanDisplayText(output.publicIntentId ?? publicIntent.id, '') || null;
    const socialRequest = this.isRecord(output.socialRequest) ? output.socialRequest : output;

    await this.writeEvent(task, AgentTaskEventType.ConfirmationReceived, '用户确认发布约练', {
      socialRequestId,
      publicIntentId,
      status: 'published',
      toolName: SocialAgentToolName.CreateSocialRequest,
      toolCallId: publishAction.id,
    });
    this.rememberShortTermStep(task, 'publish_social_request', '用户确认发布约练', 'done');
    rememberSocialAgentShortTerm(task, {
      publishedSocialRequestId: socialRequestId,
      publicIntentId,
      socialRequestId,
      publishStatus: 'published',
    });
    task.status = AgentTaskStatus.Succeeded;
    task.statusReason = 'social_request_published_and_synced';
    task.completedAt = new Date();
    task.result = {
      ...(task.result ?? {}),
      publishSocialRequest: {
        socialRequestId,
        publicIntentId,
        status: 'published',
        synced: true,
        toolCallId: publishAction.id,
      },
    };
    await this.taskRepo.save(task);

    return {
      success: true,
      taskId,
      socialRequestId,
      publicIntentId,
      status: 'published',
      taskStatus: task.status,
      synced: true,
      toolCallId: publishAction.id,
      socialRequest: sanitizeForDisplay(socialRequest),
    };
  }

  async saveCandidate(
    ownerUserId: number,
    taskId: number,
    body: {
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      targetUserId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<SocialAgentToolCallRecord> {
    await this.assertTaskOwner(taskId, ownerUserId);
    const candidateRecordId = this.number(body.candidateRecordId);
    const socialRequestId = this.number(body.socialRequestId);
    const targetUserId = this.number(body.targetUserId);
    if (!candidateRecordId && (!socialRequestId || !targetUserId)) {
      throw new BadRequestException('候选人缺少可收藏的持久化记录');
    }

    return this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SaveCandidate,
      {
        candidateRecordId,
        socialRequestId,
        targetUserId,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
  }

  async sendCandidateMessage(
    ownerUserId: number,
    taskId: number,
    body: {
      targetUserId?: number;
      candidateUserId?: number;
      message?: string;
      suggestedOpener?: string;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    await this.assertTaskOwner(taskId, ownerUserId);
    const targetUserId = this.number(body.targetUserId ?? body.candidateUserId);
    const text = cleanDisplayText(body.message ?? body.suggestedOpener, '').trim();
    if (!targetUserId || !text) {
      throw new BadRequestException('请选择候选人并填写要发送的消息');
    }
    const candidateRecordId = this.number(
      body.candidateRecordId ?? body.candidate?.candidateRecordId,
    );
    const socialRequestId = this.number(
      body.socialRequestId ?? body.candidate?.socialRequestId,
    );

    const messageAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SendMessage,
      {
        targetUserId,
        candidateUserId: targetUserId,
        text,
        message: text,
        suggestedOpener: text,
        candidateRecordId,
        socialRequestId,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    const output = this.isRecord(messageAction.output) ? messageAction.output : {};
    const messageId = cleanDisplayText(output.id ?? output.messageId, '') || null;
    const conversationId = cleanDisplayText(output.conversationId, '') || null;
    const candidate = this.isRecord(output.candidate) ? output.candidate : null;

    return {
      success: messageAction.status === 'succeeded',
      taskId,
      targetUserId,
      status: messageAction.status === 'succeeded' ? 'sent' : 'failed',
      messageId,
      conversationId,
      candidateStatus: cleanDisplayText(candidate?.status, '') || null,
      messageAction,
    };
  }

  async connectCandidate(
    ownerUserId: number,
    taskId: number,
    body: {
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const targetUserId = this.number(body.targetUserId ?? body.candidateUserId);
    if (!targetUserId) throw new BadRequestException('请选择要加好友的候选人');

    const friendAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.AddFriend,
      {
        targetUserId,
        candidateRecordId: this.number(body.candidateRecordId),
        socialRequestId: this.number(body.socialRequestId),
        openConversation: true,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );

    if (friendAction.status !== 'succeeded') {
      return {
        taskId,
        targetUserId,
        success: false,
        status: friendAction.status,
        friendAction,
        friendRequestId: null,
        conversationId: null,
      };
    }

    const friendOutput = this.isRecord(friendAction.output) ? friendAction.output : {};
    const friendRequestId = cleanDisplayText(
      friendOutput.friendRequestId ?? friendOutput.followId ?? friendOutput.id,
      '',
    ) || null;
    task = await this.assertTaskOwner(taskId, ownerUserId);
    const conversationId = cleanDisplayText(friendOutput.conversationId, '') || null;

    await this.writeEvent(task, AgentTaskEventType.ConfirmationReceived, '用户确认加好友并进入聊天', {
      targetUserId,
      conversationId,
      friendActionId: friendAction.id,
    });
    this.rememberShortTermStep(task, 'connect_candidate', '用户确认加好友并进入聊天', 'done');
    rememberSocialAgentShortTerm(task, {
      conversationId,
      targetUserId,
      connectedCandidate: {
        targetUserId,
        candidateRecordId: this.number(body.candidateRecordId),
        socialRequestId: this.number(body.socialRequestId),
      },
    });
    await this.taskRepo.save(task);

    return {
      taskId,
      targetUserId,
      success: true,
      status: 'connected',
      following: true,
      friendRequestId,
      conversationId,
      friendAction,
    };
  }

  private async createOrReuseTask(input: {
    ownerUserId: number;
    goal: string;
    permissionMode: AgentTaskPermissionMode;
    idempotencyKey: string | null;
  }): Promise<AgentTask> {
    if (input.idempotencyKey) {
      const existing = await this.taskRepo.findOne({
        where: { ownerUserId: input.ownerUserId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    const agent = await this.resolveAgentConnection(input.ownerUserId, null);
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId: input.ownerUserId,
        agentConnectionId: agent?.id ?? null,
        taskType: 'social_agent_chat',
        title: 'FitMeet Social Agent 聊天任务',
        goal: input.goal,
        input: {
          source: 'social_agent_chat',
          executionBoundary: 'recommendation_plus_confirmation',
        },
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.Pending,
        permissionMode: input.permissionMode,
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey: input.idempotencyKey,
      }),
    );
    await this.writeEvent(task, AgentTaskEventType.TaskCreated, '已创建 Social Agent 聊天任务', {
      permissionMode: input.permissionMode,
    });
    return task;
  }

  private async generateDraftWithTool(
    task: AgentTask,
    goal: string,
  ): Promise<{
    draft: CreateSocialRequestDto;
    card: unknown;
    profileUsed: unknown;
  }> {
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'ai_draft',
        rawText: goal,
        goal,
        metadata: {
          agentTaskId: task.id,
          source: 'social_agent_chat',
        },
      },
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '生成约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    if (!this.isRecord(output.draft)) {
      throw new BadRequestException('生成约练草稿失败：缺少 draft');
    }
    return {
      draft: output.draft as unknown as CreateSocialRequestDto,
      card: output.card,
      profileUsed: output.profileUsed,
    };
  }

  private async createPrivateDraftRequest(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<number> {
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...this.toDraftDto(draft),
        mode: 'private_draft',
        metadata: {
          ...(draft.metadata ?? {}),
          agentTaskId: task.id,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        },
      },
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '创建私有约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    const socialRequestId = this.number(output.socialRequestId ?? output.id);
    if (!socialRequestId) {
      throw new BadRequestException('创建私有约练草稿失败：缺少 socialRequestId');
    }
    return socialRequestId;
  }

  private async readProfileSummary(ownerUserId: number): Promise<Record<string, unknown> | null> {
    try {
      const profile = await this.socialProfiles.get(ownerUserId);
      return {
        city: sanitizeCity(profile.city),
        interestTags: profile.interestTags ?? [],
        availableTimes: profile.availableTimes ?? [],
        profileDiscoverable: profile.profileDiscoverable,
        agentCanRecommendMe: profile.agentCanRecommendMe,
      };
    } catch {
      return null;
    }
  }

  private async searchCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<SocialAgentChatCandidate[]> {
    const input = draft.socialRequestId
      ? { socialRequestId: draft.socialRequestId, limit: 10 }
      : {
          city: sanitizeCity(draft.city),
          activityType: cleanDisplayText(draft.activityType, ''),
          interestTags: Array.isArray(draft.interestTags) ? draft.interestTags : [],
          radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
          safetyRequirement: draft.safetyRequirement,
          limit: 10,
        };
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SearchMatches,
      input,
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '检索候选人失败'),
      );
    }
    const matchedCandidates = this.readMatchedCandidates(call.output);
    if (draft.socialRequestId) {
      return matchedCandidates.map((candidate) =>
        this.toChatCandidate(draft.agentTaskId, draft.socialRequestId ?? null, candidate),
      );
    }
    return matchedCandidates.map((candidate) =>
      this.toChatCandidate(draft.agentTaskId, null, candidate),
    );
  }

  private readMatchedCandidates(output: unknown): MatchedCandidateView[] {
    const record = this.isRecord(output) ? output : {};
    const candidates = Array.isArray(record.candidates)
      ? record.candidates
      : Array.isArray(record.value)
        ? record.value
        : [];
      return candidates.filter(this.isRecord) as unknown as MatchedCandidateView[];
  }

  private async completeRecommendationResult(
    ownerUserId: number,
    task: AgentTask,
    visibleSteps: SocialAgentVisibleStep[],
    draft: SocialAgentRequestDraft,
    candidates: SocialAgentChatCandidate[],
    statusReason: string,
    emit?: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    task.status = AgentTaskStatus.AwaitingConfirmation;
    task.statusReason = statusReason;
    this.rememberShortTermCandidates(task, draft, candidates);
    this.rememberShortTermStep(
      task,
      'awaiting_confirmation',
      '等待用户确认下一步动作',
      'awaiting_confirmation',
    );
    task.result = {
      ...(task.result ?? {}),
      chatRun: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidateCount: candidates.length,
        topCandidateUserId: candidates[0]?.userId ?? null,
        refreshedAt: new Date().toISOString(),
        statusReason,
      },
    };
    task.memory = {
      ...(task.memory ?? {}),
      socialAgentChat: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidates: candidates.map((candidate) => ({
          userId: candidate.userId,
          socialRequestId: candidate.socialRequestId,
          candidateRecordId: candidate.candidateRecordId,
          score: candidate.score,
        })),
      },
    };
    await this.taskRepo.save(task);

    const events = await this.eventRepo.find({
      where: { taskId: task.id, ownerUserId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });

    const result = {
      taskId: task.id,
      status: task.status,
      visibleSteps,
      assistantMessage: this.assistantMessage(candidates),
      socialRequestDraft: draft,
      candidates,
      approvalRequiredActions: this.approvalActions(task.id, draft, candidates),
      events: events.map((event) => this.toEventDto(event)),
    };
    await emit?.({ type: 'result', result });
    return result;
  }

  private toChatCandidate(
    agentTaskId: number,
    socialRequestId: number | null,
    candidate: MatchedCandidateView,
  ): SocialAgentChatCandidate {
    return {
      agentTaskId,
      socialRequestId,
      userId: candidate.userId,
      candidateRecordId: candidate.candidateRecordId ?? null,
      nickname: cleanDisplayText(candidate.nickname, '用户'),
      avatar: cleanDisplayText(candidate.avatar, ''),
      color: cleanDisplayText(candidate.color, '#202124'),
      city: '',
      score: Math.round(candidate.score),
      level: String(candidate.level),
      distanceKm: candidate.distanceKm,
      commonTags: (candidate.commonTags ?? [])
        .map((tag) => cleanDisplayText(tag, ''))
        .filter(Boolean),
      reasons: (candidate.reasons ?? [])
        .map((reason) => cleanDisplayText(reason, ''))
        .filter(Boolean),
      risk: {
        level: String(candidate.risk?.level ?? 'low'),
        warnings: (candidate.risk?.warnings ?? [])
          .map((warning) => cleanDisplayText(warning, ''))
          .filter(Boolean),
      },
      suggestedMessage: cleanDisplayText(candidate.suggestedMessage, ''),
      status: candidate.status ? String(candidate.status) : undefined,
    };
  }

  private buildDraft(
    agentTaskId: number,
    draft: CreateSocialRequestDto,
    card: unknown,
    profileUsed: unknown,
  ): SocialAgentRequestDraft {
    return {
      ...draft,
      type: this.normalizeSocialRequestType(draft.type),
      rawText: cleanDisplayText(draft.rawText, ''),
      title: cleanDisplayText(draft.title, '约练草稿'),
      description: cleanDisplayText(draft.description, cleanDisplayText(draft.rawText, '')),
      city: sanitizeCity(draft.city),
      radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
      interestTags: Array.isArray(draft.interestTags) ? draft.interestTags : [],
      activityType: cleanDisplayText(draft.activityType, ''),
      safetyRequirement: draft.safetyRequirement ?? SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
      requireUserConfirmation: true,
      agentAllowed: true,
      metadata: {
        ...(draft.metadata ?? {}),
        agentTaskId,
        source: 'social_agent_chat',
        publishPolicy: 'requires_user_confirmation',
      },
      agentTaskId,
      socialRequestId: null,
      mode: 'draft',
      card: this.isRecord(card) ? card : undefined,
      profileUsed: this.isRecord(profileUsed) ? profileUsed : undefined,
    };
  }

  private toDraftDto(draft: SocialAgentRequestDraft): CreateSocialRequestDto {
    return {
      ...draft,
      type: this.normalizeSocialRequestType(draft.type),
      city: sanitizeCity(draft.city),
      status: UserSocialRequestStatus.Draft,
      visibility: SocialRequestVisibility.Private,
      requireUserConfirmation: true,
      source: SocialRequestSource.CustomAgent,
      metadata: {
        ...(draft.metadata ?? {}),
        socialRequestId: draft.socialRequestId ?? null,
      },
    };
  }

  private toPublishDto(
    task: AgentTask,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): UpdateSocialRequestDto & CreateSocialRequestDto {
    return {
      ...draft,
      type: this.normalizeSocialRequestType(draft.type),
      status: UserSocialRequestStatus.Matching,
      visibility: SocialRequestVisibility.Public,
      requireUserConfirmation: true,
      source: SocialRequestSource.CustomAgent,
      metadata: {
        ...(draft.metadata ?? {}),
        agentTaskId: task.id,
        socialRequestId: this.number(draft.socialRequestId ?? draft.metadata?.socialRequestId),
        confirmationSource: 'social_agent_chat',
      },
    };
  }

  private approvalActions(
    taskId: number,
    draft: SocialAgentChatRunResult['socialRequestDraft'],
    candidates: SocialAgentChatCandidate[],
  ): Array<Record<string, unknown>> {
    const actions: Array<Record<string, unknown>> = [];
    if (draft) {
      actions.push({
        type: 'publish_social_request',
        label: '确认发布约练',
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: draft.socialRequestId ?? null,
      });
    }
    for (const candidate of candidates.slice(0, 3)) {
      actions.push({
        type: 'save_candidate',
        label: `收藏 ${candidate.nickname}`,
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        targetUserId: candidate.userId,
      });
      actions.push({
        type: 'send_message',
        label: `确认发送给 ${candidate.nickname}`,
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        targetUserId: candidate.userId,
      });
      actions.push({
        type: 'add_friend',
        label: `加好友并聊天：${candidate.nickname}`,
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        targetUserId: candidate.userId,
      });
    }
    return actions;
  }

  private assistantMessage(candidates: SocialAgentChatCandidate[]): string {
    if (candidates.length === 0) {
      return '我完成了搜索，但暂时没有找到符合安全边界和权限要求的真实候选人。你可以放宽地点、时间或兴趣条件后再试一次。';
    }
    const first = candidates[0];
    const reason = first.reasons.slice(0, 2).join('；') || '画像和需求较匹配';
    return `我找到了 ${candidates.length} 位真实候选人。优先推荐 ${first.nickname}，匹配度 ${first.score}%，原因是 ${reason}。`;
  }

  private composeFollowUpGoal(previousGoal: string, userMessage: string): string {
    const prior = cleanDisplayText(previousGoal, '').trim();
    const followUp = cleanDisplayText(userMessage, '').trim();
    if (!prior) return followUp;
    return [
      '当前社交需求如下。用户补充拥有最高优先级；如果补充里出现“改成、换成、不要、先、明天、城市、活动类型”等约束，请覆盖原需求中的冲突字段。',
      `原需求：${prior}`,
      `用户补充：${followUp}`,
    ].join('\n');
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ) {
    await this.eventRepo.save(
      this.eventRepo.create({
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        eventType,
        actor,
        summary,
        payload: sanitizeForDisplay(payload) as Record<string, unknown>,
      }),
    );
  }

  private rememberShortTermStep(
    task: AgentTask,
    id: string,
    label: string,
    status: string,
  ) {
    const step = {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      currentStep: step,
      steps: appendShortTermMemoryItem(task, 'steps', step, 40),
    });
  }

  private rememberShortTermCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
    candidates: SocialAgentChatCandidate[],
  ) {
    rememberSocialAgentShortTerm(task, {
      socialRequestId: draft.socialRequestId ?? null,
      socialRequestDraft: this.safeDraftForEvent(draft),
      candidates: candidates.map((candidate) => ({
        userId: candidate.userId,
        nickname: candidate.nickname,
        score: candidate.score,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        commonTags: candidate.commonTags,
        reasons: candidate.reasons,
        suggestedMessage: candidate.suggestedMessage,
        status: candidate.status ?? null,
      })),
    });
  }

  private toEventDto(event: AgentTaskEvent): Record<string, unknown> {
    return sanitizeForDisplay({
      id: event.id,
      taskId: event.taskId,
      eventType: event.eventType,
      actor: event.actor,
      summary: event.summary,
      payload: event.payload,
      stepId: event.stepId,
      toolCallId: event.toolCallId,
      createdAt: event.createdAt,
    }) as Record<string, unknown>;
  }

  private async assertTaskOwner(taskId: number, ownerUserId: number): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId, ownerUserId } });
    if (!task) throw new NotFoundException(`Social agent task ${taskId} not found`);
    return task;
  }

  private async resolveAgentConnection(
    ownerUserId: number,
    preferredId: number | null,
  ): Promise<AgentConnection | null> {
    if (preferredId) {
      const explicit = await this.connectionRepo.findOne({
        where: { id: preferredId, userId: ownerUserId, status: ConnectionStatus.Active },
      });
      if (explicit) return explicit;
    }
    return (
      (await this.connectionRepo.findOne({
        where: { userId: ownerUserId, status: ConnectionStatus.Active },
        order: { updatedAt: 'DESC' },
      })) ?? null
    );
  }

  private normalizePermissionMode(
    mode: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return mode && Object.values(AgentTaskPermissionMode).includes(mode)
      ? mode
      : AgentTaskPermissionMode.Confirm;
  }

  private normalizeSocialRequestType(value: unknown): SocialRequestType {
    return Object.values(SocialRequestType).includes(value as SocialRequestType)
      ? (value as SocialRequestType)
      : SocialRequestType.Custom;
  }

  private modeLabel(mode: AgentTaskPermissionMode): string {
    if (mode === AgentTaskPermissionMode.Assist) return 'Assist Mode';
    if (mode === AgentTaskPermissionMode.LimitedAuto) return 'Limited Auto Mode';
    return 'Confirm Mode';
  }

  private safeDraftForEvent(value: unknown): Record<string, unknown> {
    return sanitizeForDisplay(value) as Record<string, unknown>;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
