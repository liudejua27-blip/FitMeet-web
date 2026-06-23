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
} from './social-agent-memory.util';
import { toSocialAgentPublishDto } from './social-agent-chat-result.presenter';
import {
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';

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
  ) {}

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): Promise<Record<string, unknown>> {
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
    task.status = AgentTaskStatus.Succeeded;
    task.statusReason = 'social_request_published_and_synced';
    task.completedAt = new Date();
    task.result = {
      ...(task.result ?? {}),
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
    };
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
