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

  private discoverHref(
    publicIntentId: string | null,
    socialRequestId: number,
  ): string {
    if (publicIntentId) {
      return `/public-intent/${encodeURIComponent(publicIntentId)}`;
    }
    return `/social-request/${encodeURIComponent(String(socialRequestId))}`;
  }
}
