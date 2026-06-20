import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentTask, AgentTaskEventType } from './entities/agent-task.entity';
import { createSocialAgentRunId } from './social-agent-chat-run.presenter';
import type {
  SocialAgentAppendContextResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentFollowUpContext,
} from './social-agent-chat.types';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentReplanRunService } from './social-agent-replan-run.service';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { TonePolicyService } from './response-quality/tone-policy.service';

@Injectable()
export class SocialAgentReplanFacadeService {
  private readonly logger = new Logger(SocialAgentReplanFacadeService.name);

  constructor(
    private readonly runState: SocialAgentRunStateService,
    private readonly followUpContext: SocialAgentFollowUpContextService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly replanRuns: SocialAgentReplanRunService,
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  async replanAndRefresh(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
    options: { signal?: AbortSignal | null } = {},
  ): Promise<SocialAgentAsyncRunSnapshot> {
    this.assertNotAborted(options.signal);
    let task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    const followUp = userMessage
      ? await this.appendFollowUpContext(task, userMessage)
      : this.readLatestFollowUpContext(task);
    if (!followUp) throw new BadRequestException('请输入补充要求');
    task = followUp.task;
    this.assertNotAborted(options.signal);

    const runId = createSocialAgentRunId();
    const queuedRun = await this.runState.queueReplanRun({
      task,
      runId,
      followUp,
    });

    void this.replanRuns
      .execute({
        ownerUserId,
        taskId,
        body: {
          ...body,
          userMessage: followUp.userMessage,
        },
        runId,
        signal: options.signal ?? null,
        visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
      })
      .catch((error) => {
        this.logger.error(
          JSON.stringify({
            event: 'social_agent.replan.background_failed',
            taskId,
            runId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        void this.markRunFailed(ownerUserId, taskId, runId, error).catch(
          (markError) => {
            this.logger.error(
              JSON.stringify({
                event: 'social_agent.replan.mark_failed_failed',
                taskId,
                runId,
                message:
                  markError instanceof Error
                    ? markError.message
                    : String(markError),
              }),
            );
          },
        );
      });

    return queuedRun;
  }

  async appendContext(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ): Promise<SocialAgentAppendContextResult> {
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    if (!userMessage) throw new BadRequestException('请输入补充要求');
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    const context = await this.appendFollowUpContext(task, userMessage);
    return {
      taskId,
      saved: true,
      eventType: AgentTaskEventType.SocialAgentContextAppended,
      userMessage: context.userMessage,
      previousGoal: context.previousGoal,
      refreshedGoal: context.refreshedGoal,
      appendedAt: context.appendedAt,
    };
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }

  private async appendFollowUpContext(
    task: AgentTask,
    userMessage: string,
  ): Promise<SocialAgentFollowUpContext> {
    return this.followUpContext.appendFollowUpContext(task, userMessage);
  }

  private readLatestFollowUpContext(
    task: AgentTask,
    expectedMessage?: string,
  ): SocialAgentFollowUpContext | null {
    return this.followUpContext.readLatestFollowUpContext(
      task,
      expectedMessage,
    );
  }

  private async markRunFailed(
    ownerUserId: number,
    taskId: number,
    runId: string,
    error: unknown,
    options: { message?: string; statusReason?: string } = {},
  ): Promise<void> {
    await this.runState.markRunFailed(
      ownerUserId,
      taskId,
      runId,
      error,
      (id, label) => this.userVisibleStepLabel(id, label),
      options,
    );
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }
}
