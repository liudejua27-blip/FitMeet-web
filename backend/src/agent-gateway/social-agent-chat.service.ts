import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText, sanitizeForDisplay } from '../common/display-text.util';
import { MatchService, MatchedCandidateView } from '../match/match.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { UpdateSocialRequestDto } from '../social-requests/dto/update-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { SocialRequestsService } from '../social-requests/social-requests.service';
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
import { SocialAgentPlannerService } from './social-agent-planner.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

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
type StreamEmit = (event: SocialAgentChatStreamEvent) => void | Promise<void>;

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
    private readonly socialRequests: SocialRequestsService,
    private readonly matchService: MatchService,
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

    const task = await this.createOrReuseTask({
      ownerUserId,
      goal,
      permissionMode,
      idempotencyKey: idempotencyKey || null,
    });
    await emit?.({ type: 'task', taskId: task.id, status: task.status });

    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      await emit?.({ type: 'step', step: { id, label, status: 'running' } });
      const step: SocialAgentVisibleStep = { id, label, status: 'done' };
      visibleSteps.push(step);
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

    const draftResult = await this.socialRequests.aiDraft(ownerUserId, goal);
    const draft = this.buildDraft(
      task.id,
      draftResult.draft,
      draftResult.card,
      draftResult.profileUsed,
    );

    const stagedRequest = await this.createPrivateDraftRequest(ownerUserId, task, draft);
    draft.socialRequestId = stagedRequest.id;

    const candidates = await this.searchCandidates(ownerUserId, draft);
    await done('search', '正在检索附近候选人', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.SearchMatches,
      socialRequestId: stagedRequest.id,
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

    task.status = AgentTaskStatus.AwaitingConfirmation;
    task.statusReason = 'recommendations_ready_waiting_user_confirmation';
    task.result = {
      ...(task.result ?? {}),
      chatRun: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidateCount: candidates.length,
        topCandidateUserId: candidates[0]?.userId ?? null,
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

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const agent = await this.resolveAgentConnection(ownerUserId, task.agentConnectionId);
    const requestId = this.number(draft.socialRequestId ?? draft.metadata?.socialRequestId);
    const dto = this.toPublishDto(task, draft);
    const request = requestId
      ? await this.socialRequests.update(requestId, ownerUserId, dto, agent)
      : await this.socialRequests.create(ownerUserId, dto, { agent });

    await this.writeEvent(task, AgentTaskEventType.ConfirmationReceived, '用户确认发布约练', {
      socialRequestId: request.id,
    });

    return { taskId, socialRequest: sanitizeForDisplay(request) };
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
    body: { targetUserId?: number; message?: string; candidate?: Record<string, unknown> },
  ): Promise<SocialAgentToolCallRecord> {
    await this.assertTaskOwner(taskId, ownerUserId);
    const text = cleanDisplayText(body.message, '').trim();
    if (!body.targetUserId || !text) {
      throw new BadRequestException('请选择候选人并填写要发送的消息');
    }

    return this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SendMessage,
      {
        targetUserId: body.targetUserId,
        text,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
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

  private async createPrivateDraftRequest(
    ownerUserId: number,
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<UserSocialRequest> {
    const agent = await this.resolveAgentConnection(ownerUserId, task.agentConnectionId);
    return this.socialRequests.create(
      ownerUserId,
      {
        ...this.toDraftDto(draft),
        metadata: {
          ...(draft.metadata ?? {}),
          agentTaskId: task.id,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        },
      },
      { agent },
    );
  }

  private async readProfileSummary(ownerUserId: number): Promise<Record<string, unknown> | null> {
    try {
      const profile = await this.socialProfiles.get(ownerUserId);
      return {
        city: profile.city ?? '',
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
    ownerUserId: number,
    draft: SocialAgentRequestDraft,
  ): Promise<SocialAgentChatCandidate[]> {
    if (draft.socialRequestId) {
      const match = await this.matchService.runMatch(draft.socialRequestId, ownerUserId, {
        limit: 10,
      });
      return match.candidates.map((candidate) =>
        this.toChatCandidate(draft.agentTaskId, draft.socialRequestId ?? null, candidate),
      );
    }

    const candidates = await this.matchService.searchNearby({
      userId: ownerUserId,
      city: cleanDisplayText(draft.city, ''),
      activityType: cleanDisplayText(draft.activityType, ''),
      interestTags: Array.isArray(draft.interestTags) ? draft.interestTags : [],
      radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
      safetyRequirement: draft.safetyRequirement,
      agentAllowedRequired: true,
      limit: 10,
    });
    return candidates.map((candidate) => this.toChatCandidate(draft.agentTaskId, null, candidate));
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
      city: cleanDisplayText(draft.city, ''),
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

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
  ) {
    await this.eventRepo.save(
      this.eventRepo.create({
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        eventType,
        actor: AgentTaskEventActor.Agent,
        summary,
        payload: sanitizeForDisplay(payload) as Record<string, unknown>,
      }),
    );
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
