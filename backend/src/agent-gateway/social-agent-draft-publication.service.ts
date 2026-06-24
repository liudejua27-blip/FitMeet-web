import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import {
  appendShortTermMemoryItem,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { toSocialAgentPublishDto } from './social-agent-chat-result.presenter';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';
import { assertSocialAgentOpportunityPublishable } from './social-agent-opportunity-production-guard';

@Injectable()
export class SocialAgentDraftPublicationService {
  private readonly logger = new Logger(SocialAgentDraftPublicationService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly executor: SocialAgentToolExecutorService,
    @Optional()
    private readonly longTermMemory?: SocialAgentLongTermMemoryService,
    @Optional()
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo?: Repository<PublicSocialIntent>,
    @Optional()
    private readonly sideEffectLedger?: AgentSideEffectLedgerService,
  ) {}

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): Promise<Record<string, unknown>> {
    if (this.sideEffectLedger) {
      const idempotencyKey = this.publishIdempotencyKey(taskId, draft);
      const socialRequestId = this.number(
        draft.socialRequestId ?? draft.metadata?.socialRequestId,
      );
      const { result, reused } = await this.sideEffectLedger.run(
        {
          ownerUserId,
          agentTaskId: taskId,
          actionType: 'publish_social_request',
          idempotencyKey,
          resourceType: 'social_request',
          resourceId: socialRequestId,
          metadata: {
            source: 'social_agent_draft_publication',
            socialRequestId,
          },
        },
        () => this.publishDraftOnce(ownerUserId, taskId, draft),
      );
      if (reused) {
        this.logger.log({
          event: 'social_agent.publish.reused_side_effect',
          taskId,
          idempotencyKey,
          socialRequestId,
        });
      }
      return result;
    }
    return this.publishDraftOnce(ownerUserId, taskId, draft);
  }

  async dismissDraft(
    ownerUserId: number,
    taskId: number,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const now = new Date().toISOString();
    const result = this.record(task.result);
    const chatRun = this.record(result.chatRun);
    const activityDraft = this.record(result.activityDraft);
    const memory = this.record(task.memory);
    const socialAgentChat = this.record(memory.socialAgentChat);
    const existingDraft = this.firstNonEmptyRecord(
      payload.socialRequestDraft,
      payload.draft,
      chatRun.socialRequestDraft,
      socialAgentChat.socialRequestDraft,
      activityDraft,
    );
    const socialRequestId = this.number(
      payload.socialRequestId ??
        existingDraft.socialRequestId ??
        this.record(existingDraft.metadata).socialRequestId,
    );
    const dismissedDraft = {
      ...existingDraft,
      ...(socialRequestId ? { socialRequestId } : {}),
      visibility: 'hidden',
      publishStatus: 'dismissed',
      dismissed: true,
      dismissedAt: now,
      dismissedBy: 'user',
      publicDiscoverPublishSkipped: true,
      matchingStopped: true,
    };

    task.status = AgentTaskStatus.AwaitingFeedback;
    task.statusReason = 'social_intent_publish_dismissed';
    task.result = {
      ...result,
      chatRun: {
        ...chatRun,
        socialRequestDraft: null,
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        publishStatus: 'dismissed',
        publicDiscoverPublishSkipped: true,
        matchingStopped: true,
      },
      activityDraft: dismissedDraft,
      publishSocialRequest: {
        ...this.record(result.publishSocialRequest),
        ...(socialRequestId ? { socialRequestId } : {}),
        status: 'dismissed',
        synced: false,
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        dismissedAt: now,
        dismissedBy: 'user',
      },
    };
    task.memory = {
      ...memory,
      socialAgentChat: {
        ...socialAgentChat,
        socialRequestDraft: null,
        publishStatus: 'dismissed',
        publicIntentId: null,
        discoverHref: null,
        publicIntentHref: null,
        publicDiscoverPublishSkipped: true,
        matchingStopped: true,
        updatedAt: now,
      },
    };
    rememberSocialAgentShortTerm(task, {
      socialRequestDraft: null,
      publishStatus: 'dismissed',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      publicDiscoverPublishSkipped: true,
      matchingStopped: true,
      hasSearched: false,
      lastSearchCandidateCount: 0,
      lastSearchEmptyReason: null,
      lastSearchNextStep: null,
    });
    transitionSocialAgentState(task, 'message_action', {
      objective: 'meet_loop',
      nextStep: '已取消发布，不会进入发现或继续匹配。',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'user_next_message',
      lastCompletedStep: 'social_intent_publish_dismissed',
    });
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      '用户取消发布约练卡',
      {
        ...(socialRequestId ? { socialRequestId } : {}),
        action: cleanDisplayText(
          payload.action,
          'social_intent.decline_publish',
        ),
        status: 'dismissed',
        visibility: 'hidden',
        publicDiscoverPublishSkipped: true,
        matchingStopped: true,
      },
      AgentTaskEventActor.User,
    );
    return {
      success: true,
      taskId,
      socialRequestId,
      status: 'dismissed',
      visibility: 'hidden',
      publishStatus: 'dismissed',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      matchingStopped: true,
      message: '已取消发布，这张约练卡不会出现在发现页，也不会继续匹配。',
    };
  }

  private async publishDraftOnce(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): Promise<Record<string, unknown>> {
    assertSocialAgentOpportunityPublishable(draft);
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const requestId = this.number(
      draft.socialRequestId ?? draft.metadata?.socialRequestId,
    );
    const dto = toSocialAgentPublishDto(task.id, draft);
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
    const output = this.isRecord(publishAction.output)
      ? publishAction.output
      : {};
    const pendingApproval = this.pendingApprovalFromOutput(output);
    if (pendingApproval) {
      await this.writeEvent(
        task,
        AgentTaskEventType.ConfirmationRequested,
        '发布约练等待用户确认',
        {
          status: 'pending_approval',
          approvalId: pendingApproval.id,
          approval: pendingApproval,
          toolName: SocialAgentToolName.CreateSocialRequest,
          toolCallId: publishAction.id,
        },
      );
      this.rememberShortTermStep(
        task,
        'publish_social_request_approval',
        '发布约练等待用户确认',
        'awaiting_confirmation',
      );
      rememberSocialAgentShortTerm(task, {
        publishStatus: 'pending_approval',
        pendingPublishApprovalId: pendingApproval.id,
        pendingApprovals: [pendingApproval],
      });
      task.status = AgentTaskStatus.AwaitingConfirmation;
      task.statusReason = 'publish_social_request_requires_approval';
      task.result = {
        ...(task.result ?? {}),
        publishSocialRequest: {
          approvalId: pendingApproval.id,
          pendingApproval,
          status: 'pending_approval',
          synced: false,
          toolCallId: publishAction.id,
        },
      };
      await this.taskRepo.save(task);

      return {
        success: false,
        taskId,
        approvalId: pendingApproval.id,
        pendingApproval,
        status: 'pending_approval',
        taskStatus: task.status,
        synced: false,
        toolCallId: publishAction.id,
        message: '发布到发现前需要你确认，确认后才会公开约练卡。',
      };
    }

    const socialRequestId = this.number(
      output.socialRequestId ?? output.id ?? requestId,
    );
    if (!socialRequestId) {
      throw new BadRequestException('发布约练缺少 socialRequestId');
    }
    const publicIntent = this.isRecord(output.publicIntent)
      ? output.publicIntent
      : {};
    const publicIntentId =
      cleanDisplayText(output.publicIntentId ?? publicIntent.id, '') || null;
    if (!publicIntentId) {
      throw new BadRequestException('发布约练缺少 publicIntentId');
    }
    const publicIntentReadback = await this.readPublishedPublicIntent(
      publicIntentId,
      {
        socialRequestId,
        draft,
        publicIntent,
      },
    );
    const discoverHref = this.discoverHref(publicIntentId, socialRequestId);
    const publicIntentHref = this.publicIntentHref(
      publicIntentId,
      socialRequestId,
    );
    const socialRequest = this.isRecord(output.socialRequest)
      ? output.socialRequest
      : output;

    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      '用户确认发布约练',
      {
        socialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        status: 'published',
        toolName: SocialAgentToolName.CreateSocialRequest,
        toolCallId: publishAction.id,
      },
    );
    this.rememberShortTermStep(
      task,
      'publish_social_request',
      '用户确认发布约练',
      'done',
    );
    rememberSocialAgentShortTerm(task, {
      publishedSocialRequestId: socialRequestId,
      publicIntentId,
      discoverHref,
      publicIntentHref,
      socialRequestId,
      publishStatus: 'published',
    });
    const memory = this.record(task.memory);
    const socialAgentChat = this.record(memory.socialAgentChat);
    const result = this.record(task.result);
    const chatRun = this.record(result.chatRun);
    const activityDraft = this.record(result.activityDraft);
    const socialRequestDraft = this.firstNonEmptyRecord(
      chatRun.socialRequestDraft,
      socialAgentChat.socialRequestDraft,
    );
    const publishedAt = new Date().toISOString();
    task.memory = {
      ...memory,
      socialAgentChat: {
        ...socialAgentChat,
        socialRequestDraft:
          Object.keys(socialRequestDraft).length > 0
            ? {
                ...socialRequestDraft,
                socialRequestId,
                publicIntentId,
                discoverHref,
                publicIntentHref,
                publishStatus: 'published',
                visibility: 'public',
                publishedAt,
              }
            : socialAgentChat.socialRequestDraft,
        socialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        publishStatus: 'published',
        updatedAt: publishedAt,
      },
    };
    task.status = AgentTaskStatus.Succeeded;
    task.statusReason = 'social_request_published_and_synced';
    task.completedAt = new Date();
    task.result = {
      ...result,
      chatRun: {
        ...chatRun,
        socialRequestDraft:
          Object.keys(socialRequestDraft).length > 0
            ? {
                ...socialRequestDraft,
                socialRequestId,
                publicIntentId,
                discoverHref,
                publicIntentHref,
                publishStatus: 'published',
                visibility: 'public',
                publishedAt,
              }
            : chatRun.socialRequestDraft,
        socialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        publishStatus: 'published',
      },
      activityDraft: {
        ...activityDraft,
        socialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        publishStatus: 'published',
        visibility: 'public',
        autoPublished: true,
        publishedAt,
      },
      publishSocialRequest: {
        socialRequestId,
        publicIntentId,
        discoverHref,
        publicIntentHref,
        status: 'published',
        synced: true,
        toolCallId: publishAction.id,
      },
    };
    transitionSocialAgentState(task, 'message_action', {
      objective: 'meet_loop',
      nextStep: 'Discover 已可见，可以继续推荐候选。',
      shouldSearchNow: true,
      awaitingSearchConfirmation: false,
      waitingFor: 'post_publish_candidate_search',
      lastCompletedStep: 'published_to_discover',
    });
    await this.taskRepo.save(task);
    void this.longTermMemory?.summarizeTask(task).catch(() => undefined);

    return {
      success: true,
      taskId,
      socialRequestId,
      publicIntentId,
      discoverHref,
      publicIntentHref,
      status: 'published',
      taskStatus: task.status,
      synced: true,
      toolCallId: publishAction.id,
      socialRequest: sanitizeForDisplay(socialRequest),
      publicIntent: publicIntentReadback
        ? sanitizeForDisplay({
            id: publicIntentReadback.id,
            status: publicIntentReadback.status,
            mode: publicIntentReadback.mode,
            title: publicIntentReadback.title,
          })
        : undefined,
    };
  }

  private publishIdempotencyKey(
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): string {
    const explicit = cleanDisplayText(
      draft.metadata?.idempotencyKey ??
        (draft as { idempotencyKey?: unknown }).idempotencyKey,
      '',
    );
    if (explicit) return explicit;
    const socialRequestId = this.number(
      draft.socialRequestId ?? draft.metadata?.socialRequestId,
    );
    if (socialRequestId)
      return `publish-social-request:${taskId}:${socialRequestId}`;
    const fingerprint = [
      draft.title,
      draft.city,
      (draft as { locationName?: unknown }).locationName,
      (draft as { timePreference?: unknown }).timePreference,
      draft.type,
    ]
      .map((value) =>
        cleanDisplayText(value, '')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .slice(0, 40),
      )
      .filter(Boolean)
      .join(':');
    return `publish-social-request:${taskId}:${fingerprint || 'draft'}`;
  }

  private async readPublishedPublicIntent(
    publicIntentId: string,
    expected: {
      socialRequestId: number;
      draft: CreateSocialRequestDto & { socialRequestId?: number | null };
      publicIntent: Record<string, unknown>;
    },
  ): Promise<PublicSocialIntent | null> {
    if (!this.publicIntentRepo) {
      throw new BadRequestException('发布约练缺少发现页读回校验能力');
    }
    const readback = await this.publicIntentRepo.findOne({
      where: { id: publicIntentId },
    });
    if (!readback) {
      throw new BadRequestException('发布约练后未能在发现页读回公开卡片');
    }
    if (readback.mode !== 'public') {
      throw new BadRequestException('发布约练读回的公开卡片不可见');
    }
    this.assertPublicIntentReadbackMatches(readback, expected);
    return readback;
  }

  private assertPublicIntentReadbackMatches(
    readback: PublicSocialIntent,
    expected: {
      socialRequestId: number;
      draft: CreateSocialRequestDto & { socialRequestId?: number | null };
      publicIntent: Record<string, unknown>;
    },
  ): void {
    if (
      typeof readback.linkedSocialRequestId === 'number' &&
      readback.linkedSocialRequestId > 0 &&
      readback.linkedSocialRequestId !== expected.socialRequestId
    ) {
      throw new BadRequestException('发布约练读回的公开卡片关联需求不一致');
    }
    this.assertMatchingPublicText({
      label: '标题',
      actual: readback.title,
      expected: [expected.publicIntent.title, expected.draft.title],
    });
    this.assertMatchingPublicText({
      label: '城市',
      actual: readback.city,
      expected: [expected.publicIntent.city, expected.draft.city],
    });
    this.assertMatchingPublicText({
      label: '时间',
      actual: readback.timePreference,
      expected: [
        expected.publicIntent.timePreference,
        this.record(expected.draft.metadata).timePreference,
        expected.draft.timeStart,
      ],
    });
    this.assertMatchingPublicText({
      label: '地点',
      actual: readback.locationPreference,
      expected: [
        expected.publicIntent.locationPreference,
        this.record(expected.draft.metadata).locationPreference,
      ],
    });
  }

  private assertMatchingPublicText(input: {
    label: string;
    actual: unknown;
    expected: unknown[];
  }): void {
    const actual = this.normalizedPublicText(input.actual);
    const expected = this.firstNormalizedPublicText(input.expected);
    if (!actual || !expected) return;
    if (actual !== expected) {
      throw new BadRequestException(
        `发布约练读回的公开卡片${input.label}不一致`,
      );
    }
  }

  private firstNormalizedPublicText(values: unknown[]): string | null {
    for (const value of values) {
      const text = this.normalizedPublicText(value);
      if (text) return text;
    }
    return null;
  }

  private normalizedPublicText(value: unknown): string | null {
    const text = cleanDisplayText(value, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return text || null;
  }

  private async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task) {
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    }
    return task;
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.draft_publication.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private rememberShortTermStep(
    task: AgentTask,
    id: string,
    label: string,
    status: string,
  ): void {
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

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private record(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private firstNonEmptyRecord(...values: unknown[]): Record<string, unknown> {
    for (const value of values) {
      const record = this.record(value);
      if (Object.keys(record).length > 0) return record;
    }
    return {};
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private pendingApprovalFromOutput(
    output: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const isPending =
      output.pendingApproval === true || output.status === 'pending_approval';
    if (!isPending) return null;
    const approval = this.isRecord(output.approval) ? output.approval : {};
    const approvalId = this.number(output.approvalId ?? approval.id);
    if (!approvalId) return null;
    return {
      id: approvalId,
      type: cleanDisplayText(approval.type, 'custom'),
      actionType: cleanDisplayText(
        approval.actionType,
        'publish_social_request',
      ),
      summary: cleanDisplayText(approval.summary, '发布约练卡到发现页'),
      riskLevel: cleanDisplayText(approval.riskLevel, 'medium'),
      payload: this.isRecord(approval.payload) ? approval.payload : {},
      expiresAt: cleanDisplayText(approval.expiresAt, '') || null,
    };
  }

  private discoverHref(
    publicIntentId: string | null,
    socialRequestId: number,
  ): string {
    if (publicIntentId) {
      return `/discover?publicIntentId=${encodeURIComponent(publicIntentId)}`;
    }
    return `/discover?socialRequestId=${encodeURIComponent(String(socialRequestId))}`;
  }

  private publicIntentHref(
    publicIntentId: string | null,
    socialRequestId: number,
  ): string {
    if (publicIntentId) {
      return `/public-intent/${encodeURIComponent(publicIntentId)}`;
    }
    return `/discover?socialRequestId=${encodeURIComponent(String(socialRequestId))}`;
  }
}
