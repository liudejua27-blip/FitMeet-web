import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentTask,
  AgentTaskEventType,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import { TonePolicyService } from './response-quality/tone-policy.service';
import {
  buildSocialAgentBlockedRunResult,
  buildSocialAgentClarificationRunResult,
  socialAgentClarificationStep,
  socialAgentSafetyBlockedStep,
} from './social-agent-chat-run.presenter';
import type {
  SocialAgentChatRunResult,
  SocialAgentIntentRouteResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentMainAgentTurnEventsService } from './social-agent-main-agent-turn-events.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { socialAgentAlphaClarifyingMessage } from './social-agent-route-response.presenter';

@Injectable()
export class SocialAgentMainAgentTurnResultService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly turnEvents: SocialAgentMainAgentTurnEventsService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional()
    private readonly tonePolicy?: TonePolicyService,
  ) {}

  async handleBlockedRouteTurn(input: {
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
    await this.turnEvents.writeEvent(
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

  async handleClarificationRouteTurn(input: {
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
    await this.turnEvents.writeEvent(
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

  async handleBlockedRunTurn(input: {
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
    await this.turnEvents.writeEvent(
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
    const events = await this.turnEvents.readTaskEvents(
      task,
      input.ownerUserId,
    );
    const result = buildSocialAgentBlockedRunResult({
      task,
      visibleSteps,
      alphaTurn,
      events,
    });
    await input.emit?.({ type: 'result', result });
    return result;
  }

  async handleClarificationRunTurn(input: {
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
    await this.turnEvents.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Main Agent 正在等待用户补充需求',
      { structuredIntent: alphaTurn?.structuredIntent },
    );
    await input.emit?.({ type: 'step', step: clarifyStep });
    const events = await this.turnEvents.readTaskEvents(
      task,
      input.ownerUserId,
    );
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
