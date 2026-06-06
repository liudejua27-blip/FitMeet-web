import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { sanitizeForDisplay } from '../common/display-text.util';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import { TonePolicyService } from './response-quality/tone-policy.service';
import type {
  SocialAgentChatRunResult,
  SocialAgentIntentRouteResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import {
  buildSocialAgentBlockedRunResult,
  buildSocialAgentClarificationRunResult,
  socialAgentClarificationStep,
  socialAgentSafetyBlockedStep,
} from './social-agent-chat-run.presenter';
import {
  socialAgentAlphaClarifyingMessage,
  socialAgentAlphaNeedsClarification,
} from './social-agent-route-response.presenter';

@Injectable()
export class SocialAgentMainAgentTurnService {
  private readonly logger = new Logger(SocialAgentMainAgentTurnService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly alphaAgent?: FitMeetAlphaAgentSdkService,
    @Optional()
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  async handleRouteTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    hasCandidates: boolean;
    startedAt: number;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult | null;
  }> {
    const alphaTurn = await this.alphaAgent?.prepareTurn({
      ownerUserId: input.ownerUserId,
      taskId: input.task.id,
      message: input.message,
      permissionMode: input.task.permissionMode,
      context: { hasCandidates: input.hasCandidates },
    });
    if (alphaTurn?.safety.blocked) {
      return {
        task: input.task,
        result: await this.handleBlockedTurn({
          task: input.task,
          alphaTurn,
          startedAt: input.startedAt,
        }),
      };
    }
    if (socialAgentAlphaNeedsClarification(alphaTurn)) {
      return {
        task: input.task,
        result: await this.handleClarificationTurn({
          task: input.task,
          alphaTurn,
          startedAt: input.startedAt,
        }),
      };
    }
    return { task: input.task, result: null };
  }

  async handleRunTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    permissionMode: AgentTaskPermissionMode;
    visibleSteps: SocialAgentVisibleStep[];
    emit?: StreamEmit;
    visibleStepLabel: (id: string, label: string) => string;
    completeRuntimeClarification?: (
      result: SocialAgentChatRunResult,
    ) => Promise<void>;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentChatRunResult | null;
    alphaTurn?: FitMeetAlphaTurnDecision;
  }> {
    const alphaTurn = await this.alphaAgent?.prepareTurn({
      ownerUserId: input.ownerUserId,
      taskId: input.task.id,
      message: input.message,
      permissionMode: input.permissionMode,
      context: { flow: 'run_stream' },
    });
    if (alphaTurn?.safety.blocked) {
      return {
        task: input.task,
        alphaTurn,
        result: await this.handleBlockedRunTurn({
          ownerUserId: input.ownerUserId,
          task: input.task,
          alphaTurn,
          visibleSteps: input.visibleSteps,
          emit: input.emit,
        }),
      };
    }
    if (socialAgentAlphaNeedsClarification(alphaTurn)) {
      const result = await this.handleClarificationRunTurn({
        ownerUserId: input.ownerUserId,
        task: input.task,
        alphaTurn,
        visibleSteps: input.visibleSteps,
        emit: input.emit,
        visibleStepLabel: input.visibleStepLabel,
      });
      await input.completeRuntimeClarification?.(result);
      return { task: input.task, result, alphaTurn };
    }
    return { task: input.task, result: null, alphaTurn };
  }

  private async handleBlockedTurn(input: {
    task: AgentTask;
    alphaTurn: FitMeetAlphaTurnDecision;
    startedAt: number;
  }): Promise<SocialAgentIntentRouteResult> {
    const { task, alphaTurn } = input;
    task.status = AgentTaskStatus.Failed;
    task.riskLevel = AgentTaskRiskLevel.Blocked;
    task.statusReason = 'main_agent_guardrail_blocked';
    task.result = {
      ...(task.result ?? {}),
      alphaAgent: {
        traceId: alphaTurn.traceId,
        safety: alphaTurn.safety,
        cards: alphaTurn.cards,
        agentTrace: alphaTurn.agentTrace,
      },
    };
    await this.taskRepo.save(task);
    const assistantMessage =
      alphaTurn.assistantMessage ||
      '这个请求不符合 FitMeet 的安全边界，我不能继续执行。';
    const result: SocialAgentIntentRouteResult = {
      intent: 'safety_or_boundary',
      confidence: 1,
      entities: this.emptyIntentEntities(),
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'direct_reply',
      source: 'rules',
      action: 'answer',
      taskId: task.id,
      assistantMessage,
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: alphaTurn.cards,
      safety: alphaTurn.safety,
      permissionMode: task.permissionMode,
      traceId: alphaTurn.traceId,
      agentTrace: alphaTurn.agentTrace,
      structuredIntent: alphaTurn.structuredIntent,
    };
    await this.writeEvent(
      task,
      AgentTaskEventType.TaskFailed,
      'Main Agent 已拦截不安全请求',
      {
        traceId: alphaTurn.traceId,
        safety: alphaTurn.safety,
        agentTrace: alphaTurn.agentTrace,
      },
    );
    await this.messageLog.recordAssistantMessage(
      task,
      assistantMessage,
      result,
    );
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);
    return result;
  }

  private async handleClarificationTurn(input: {
    task: AgentTask;
    alphaTurn?: FitMeetAlphaTurnDecision;
    startedAt: number;
  }): Promise<SocialAgentIntentRouteResult> {
    const { task, alphaTurn } = input;
    const assistantMessage = socialAgentAlphaClarifyingMessage(
      alphaTurn,
      (question, fallback) =>
        this.tonePolicy?.safeAssistantMessage(question, fallback) ?? '',
    );
    task.status = AgentTaskStatus.AwaitingFeedback;
    task.statusReason = 'main_agent_waiting_for_clarification';
    task.result = {
      ...(task.result ?? {}),
      alphaAgent: {
        traceId: alphaTurn?.traceId,
        safety: alphaTurn?.safety,
        cards: alphaTurn?.cards ?? [],
        agentTrace: alphaTurn?.agentTrace,
        structuredIntent: alphaTurn?.structuredIntent,
      },
    };
    await this.taskRepo.save(task);
    const result: SocialAgentIntentRouteResult = {
      intent: 'unknown',
      confidence: 0.86,
      entities: this.emptyIntentEntities(),
      shouldSearch: false,
      shouldReplan: false,
      shouldUpdateProfile: false,
      shouldExecuteAction: false,
      replyStrategy: 'ask_clarifying_question',
      source: 'rules',
      action: 'clarify',
      taskId: task.id,
      assistantMessage,
      savedContext: true,
      profileUpdated: false,
      shouldQueueRun: false,
      runMode: null,
      queuedRun: null,
      pendingApproval: null,
      activityResults: [],
      profileUpdateProposal: null,
      cards: alphaTurn?.cards ?? [],
      safety: alphaTurn?.safety,
      permissionMode: task.permissionMode,
      traceId: alphaTurn?.traceId,
      agentTrace: alphaTurn?.agentTrace,
      structuredIntent: alphaTurn?.structuredIntent,
    };
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Main Agent 正在等待用户补充需求',
      { structuredIntent: alphaTurn?.structuredIntent },
    );
    await this.messageLog.recordAssistantMessage(
      task,
      assistantMessage,
      result,
    );
    this.metrics.recordAction(result.action);
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);
    return result;
  }

  private async handleBlockedRunTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    alphaTurn: FitMeetAlphaTurnDecision;
    visibleSteps: SocialAgentVisibleStep[];
    emit?: StreamEmit;
  }): Promise<SocialAgentChatRunResult> {
    const { alphaTurn, task, visibleSteps } = input;
    const blockedStep = socialAgentSafetyBlockedStep();
    visibleSteps.push(blockedStep);
    task.status = AgentTaskStatus.Failed;
    task.riskLevel = AgentTaskRiskLevel.Blocked;
    task.statusReason = 'main_agent_guardrail_blocked';
    task.result = {
      ...(task.result ?? {}),
      alphaAgent: {
        traceId: alphaTurn.traceId,
        safety: alphaTurn.safety,
        cards: alphaTurn.cards,
        agentTrace: alphaTurn.agentTrace,
      },
    };
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.TaskFailed,
      blockedStep.label,
      {
        traceId: alphaTurn.traceId,
        safety: alphaTurn.safety,
        agentTrace: alphaTurn.agentTrace,
      },
    );
    await input.emit?.({ type: 'step', step: blockedStep });
    const events = await this.readTaskEvents(task, input.ownerUserId);
    const result = buildSocialAgentBlockedRunResult({
      task,
      visibleSteps,
      alphaTurn,
      events,
    });
    await input.emit?.({ type: 'result', result });
    return result;
  }

  private async handleClarificationRunTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    alphaTurn?: FitMeetAlphaTurnDecision;
    visibleSteps: SocialAgentVisibleStep[];
    emit?: StreamEmit;
    visibleStepLabel: (id: string, label: string) => string;
  }): Promise<SocialAgentChatRunResult> {
    const { alphaTurn, task, visibleSteps } = input;
    const clarifyStep = socialAgentClarificationStep(
      input.visibleStepLabel('clarify', '正在等待你补充需求'),
    );
    visibleSteps.push(clarifyStep);
    task.status = AgentTaskStatus.AwaitingFeedback;
    task.statusReason = 'main_agent_waiting_for_clarification';
    task.result = {
      ...(task.result ?? {}),
      alphaAgent: {
        traceId: alphaTurn?.traceId,
        safety: alphaTurn?.safety,
        cards: alphaTurn?.cards ?? [],
        agentTrace: alphaTurn?.agentTrace,
        structuredIntent: alphaTurn?.structuredIntent,
      },
    };
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Main Agent 正在等待用户补充需求',
      { structuredIntent: alphaTurn?.structuredIntent },
    );
    await input.emit?.({ type: 'step', step: clarifyStep });
    const events = await this.readTaskEvents(task, input.ownerUserId);
    const result = buildSocialAgentClarificationRunResult({
      task,
      visibleSteps,
      assistantMessage: socialAgentAlphaClarifyingMessage(
        alphaTurn,
        (question, fallback) =>
          this.tonePolicy?.safeAssistantMessage(question, fallback) ?? '',
      ),
      alphaTurn,
      events,
    });
    await input.emit?.({ type: 'result', result });
    return result;
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.main_agent_turn.event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async readTaskEvents(
    task: AgentTask,
    ownerUserId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const events = await this.eventRepo.find({
      where: { taskId: task.id, ownerUserId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });
    return events.map((event) =>
      sanitizeForDisplay({
        id: event.id,
        taskId: event.taskId,
        eventType: event.eventType,
        actor: event.actor,
        summary: event.summary,
        payload: event.payload,
        stepId: event.stepId,
        toolCallId: event.toolCallId,
        createdAt: event.createdAt,
      }),
    ) as Array<Record<string, unknown>>;
  }

  private emptyIntentEntities(): SocialAgentIntentRouteResult['entities'] {
    return {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    };
  }
}
