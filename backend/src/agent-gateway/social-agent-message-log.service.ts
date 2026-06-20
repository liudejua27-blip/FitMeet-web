import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  appendSocialAgentConversationTurn,
  upsertLastSocialAgentAssistantConversationTurn,
} from './social-agent-chat-memory.presenter';
import { shouldStreamFallbackAssistantText } from './social-agent-chat-stream.presenter';
import type {
  SocialAgentChatRunResult,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import {
  appendSocialAgentShortTermTurn,
  recordSocialAgentShortTermAction,
  transitionSocialAgentState,
  upsertLastSocialAgentShortTermAssistantTurn,
} from './social-agent-memory.util';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';

@Injectable()
export class SocialAgentMessageLogService {
  private readonly logger = new Logger(SocialAgentMessageLogService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @Optional()
    private readonly slotStateMachine?: SocialAgentTaskMemoryStateMachineService,
  ) {}

  async recordUserMessage(task: AgentTask, message: string): Promise<void> {
    const now = new Date().toISOString();
    appendSocialAgentConversationTurn(task, {
      role: 'user',
      text: message,
      at: now,
    });
    appendSocialAgentShortTermTurn(task, {
      role: 'user',
      text: message,
      at: now,
    });
    transitionSocialAgentState(task, 'user_message');
    const slots =
      this.slotStateMachine ?? new SocialAgentTaskMemoryStateMachineService();
    slots.applyUserMessage(task, message);
    task.status =
      task.status === AgentTaskStatus.Pending
        ? AgentTaskStatus.AwaitingFeedback
        : task.status;
    task.statusReason = 'user_message_received';
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentMessageUser,
      '用户发送 Social Agent 消息',
      { message, createdAt: now },
      AgentTaskEventActor.User,
    );
  }

  async recordIntentRoute(
    task: AgentTask,
    route: SocialAgentIntentRouterResult,
  ): Promise<void> {
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Social Agent 已完成意图路由',
      {
        intent: route.intent,
        confidence: route.confidence,
        entities: route.entities,
        shouldSearch: route.shouldSearch,
        shouldReplan: route.shouldReplan,
        shouldUpdateProfile: route.shouldUpdateProfile,
        shouldExecuteAction: route.shouldExecuteAction,
        replyStrategy: route.replyStrategy,
        source: route.source,
      },
      AgentTaskEventActor.System,
    );
  }

  async recordAssistantMessage(
    task: AgentTask,
    message: string,
    route: SocialAgentIntentRouteResult,
    options: { replaceLastAssistantTurn?: boolean } = {},
  ): Promise<void> {
    const now = new Date().toISOString();
    const assistantText = cleanDisplayText(message, '').trim();
    const persistAssistantTurn =
      this.shouldPersistAssistantConversationTurn(assistantText);
    if (persistAssistantTurn) {
      const conversationTurn = {
        role: 'assistant',
        text: assistantText,
        intent: route.intent,
        at: now,
        ...(route.activityResults?.length
          ? { activityResults: sanitizeForDisplay(route.activityResults) }
          : {}),
        ...(route.pendingApproval
          ? {
              kind: 'approval',
              pendingApproval: sanitizeForDisplay(route.pendingApproval),
          }
        : {}),
      };
      if (options.replaceLastAssistantTurn) {
        upsertLastSocialAgentAssistantConversationTurn(task, conversationTurn);
      } else {
        appendSocialAgentConversationTurn(task, conversationTurn);
      }
      const shortTermTurn = {
        role: 'assistant',
        text: assistantText,
        intent: route.intent,
        action: route.action,
        at: now,
      } as const;
      if (options.replaceLastAssistantTurn) {
        upsertLastSocialAgentShortTermAssistantTurn(task, shortTermTurn);
      } else {
        appendSocialAgentShortTermTurn(task, shortTermTurn);
      }
    }
    recordSocialAgentShortTermAction(task, {
      action: route.action,
      intent: route.intent,
      status: route.shouldQueueRun ? 'queued' : 'completed',
      at: now,
    });
    task.result = {
      ...(task.result ?? {}),
      latestMessageRoute: {
        intent: route.intent,
        confidence: route.confidence,
        action: route.action,
        replyStrategy: route.replyStrategy,
        shouldQueueRun: route.shouldQueueRun,
        runId: route.queuedRun?.runId ?? null,
        at: now,
      },
    };
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentMessageAssistant,
      persistAssistantTurn ? 'Social Agent 回复消息' : 'Social Agent 状态更新',
      {
        message: persistAssistantTurn ? assistantText : null,
        messageSuppressed: !persistAssistantTurn,
        intent: route.intent,
        action: route.action,
        activityResults: route.activityResults ?? [],
        pendingApproval: route.pendingApproval ?? null,
        riskAdvice:
          route.intent === 'safety_or_boundary'
            ? '首次线下见面建议选择公开场所，并保留平台内沟通记录。'
            : null,
        queuedRunId: route.queuedRun?.runId ?? null,
        createdAt: now,
      },
      AgentTaskEventActor.Agent,
    );
  }

  async recordAssistantRunMessage(
    task: AgentTask,
    message: string,
    run: SocialAgentChatRunResult,
  ): Promise<void> {
    const now = new Date().toISOString();
    const assistantText = cleanDisplayText(message, '').trim();
    const persistAssistantTurn =
      this.shouldPersistAssistantConversationTurn(assistantText);
    const action = this.runAction(run);
    if (persistAssistantTurn) {
      appendSocialAgentConversationTurn(task, {
        role: 'assistant',
        text: assistantText,
        kind: run.approvalRequiredActions.length ? 'approval' : 'run_result',
        status: run.status,
        action,
        at: now,
        ...(run.socialRequestDraft
          ? { socialRequestDraft: sanitizeForDisplay(run.socialRequestDraft) }
          : {}),
        ...(run.candidates.length
          ? {
              candidateCount: run.candidates.length,
              candidatePreview: sanitizeForDisplay(
                run.candidates.slice(0, 3).map((candidate) => ({
                  userId: candidate.userId,
                  nickname: candidate.nickname,
                  city: candidate.city,
                  score: candidate.score,
                  reasons: candidate.reasons,
                })),
              ),
            }
          : {}),
        ...(run.approvalRequiredActions.length
          ? {
              approvalRequiredActions: sanitizeForDisplay(
                run.approvalRequiredActions,
              ),
            }
          : {}),
      });
      appendSocialAgentShortTermTurn(task, {
        role: 'assistant',
        text: assistantText,
        action,
        at: now,
      });
    }
    recordSocialAgentShortTermAction(task, {
      action,
      intent: run.candidates.length ? 'social_search' : 'conversation',
      status: run.approvalRequiredActions.length ? 'waiting' : 'completed',
      at: now,
    });
    task.result = {
      ...(task.result ?? {}),
      latestRunMessage: {
        action,
        status: run.status,
        candidateCount: run.candidates.length,
        approvalRequiredCount: run.approvalRequiredActions.length,
        messageSuppressed: !persistAssistantTurn,
        at: now,
      },
    };
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentMessageAssistant,
      persistAssistantTurn ? 'Social Agent 回复消息' : 'Social Agent 状态更新',
      {
        message: persistAssistantTurn ? assistantText : null,
        messageSuppressed: !persistAssistantTurn,
        action,
        status: run.status,
        candidateCount: run.candidates.length,
        approvalRequiredCount: run.approvalRequiredActions.length,
        socialRequestDraft: run.socialRequestDraft ?? null,
        createdAt: now,
      },
      AgentTaskEventActor.Agent,
    );
  }

  private shouldPersistAssistantConversationTurn(message: string): boolean {
    if (!message) return false;
    return shouldStreamFallbackAssistantText(message);
  }

  private runAction(run: SocialAgentChatRunResult): string {
    if (run.approvalRequiredActions.length) return 'approval_required';
    if (run.candidates.length) return 'recommend_candidates';
    if (run.socialRequestDraft) return 'create_social_request_draft';
    if (run.safety?.blocked) return 'safety_blocked';
    return 'answer';
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
          event: 'social_agent.message_log.event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private safeVarchar(value: unknown, max = 80): string {
    return cleanDisplayText(value, '').slice(0, max);
  }
}
