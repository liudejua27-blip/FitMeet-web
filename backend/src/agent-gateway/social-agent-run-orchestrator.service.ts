import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentRunStatus } from './entities/fitmeet-agent-runtime.entity';
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import {
  appendShortTermMemoryItem,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentRunRecommendationService } from './social-agent-run-recommendation.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';
import type {
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentStreamOptions,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { buildSocialAgentRunCompletionSnapshot } from './social-agent-run-completion.presenter';
import { TonePolicyService } from './response-quality/tone-policy.service';
import { AgentSelfImproveService } from './agent-self-improve.service';
import { AgentRunCheckpointService } from './agent-run-checkpoint.service';

@Injectable()
export class SocialAgentRunOrchestratorService {
  constructor(
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
    private readonly runRecommendations: SocialAgentRunRecommendationService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
    @Optional()
    private readonly fitMeetRuntime?: FitMeetAgentRuntimeService,
    @Optional()
    private readonly tonePolicy?: TonePolicyService,
    @Optional()
    private readonly selfImprove?: AgentSelfImproveService,
    @Optional()
    private readonly checkpoints?: AgentRunCheckpointService,
  ) {}

  async run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit?: StreamEmit,
    options: SocialAgentStreamOptions = {},
  ): Promise<SocialAgentChatRunResult> {
    const goal = cleanDisplayText(body.goal, '').trim();
    if (!goal) throw new BadRequestException('请输入你的社交需求');

    const permissionMode = this.normalizePermissionMode(body.permissionMode);
    const idempotencyKey = cleanDisplayText(body.idempotencyKey, '');
    const visibleSteps: SocialAgentVisibleStep[] = [];
    const runtimeRun = await this.fitMeetRuntime?.startRun({
      userId: ownerUserId,
      userMessage: goal,
      permissionMode,
    });

    let task = await this.taskLifecycle.ensureConversationTask(
      ownerUserId,
      body.taskId ?? this.number(body.clientContext?.threadId),
      goal,
      idempotencyKey || null,
      body.clientContext?.threadId ?? null,
    );
    task.permissionMode = permissionMode;
    if (!cleanDisplayText(task.goal, '').trim()) task.goal = goal;
    await this.fitMeetRuntime?.attachTask(runtimeRun?.id, task.id);
    this.realtime?.emitAgentEvent(ownerUserId, 'agent:thinking', {
      taskId: task.id,
      goal,
      status: 'understanding',
    });
    this.rememberShortTermStep(
      task,
      'task.created',
      '已创建 Social Agent 任务',
      'done',
    );
    await emit?.({ type: 'task', taskId: task.id, status: task.status });
    const checkpointingEmit: StreamEmit = async (event) => {
      if (event.type === 'step') {
        await this.checkpoints?.saveStep({
          ownerUserId,
          task,
          goal,
          step: event.step,
          steps: visibleSteps,
          traceId: null,
          runId: runtimeRun?.id ? String(runtimeRun.id) : null,
        });
      }
      await emit?.(event);
    };

    const mainAgentRun = await this.mainAgentTurn.handleRunTurn({
      ownerUserId,
      task,
      message: goal,
      permissionMode,
      visibleSteps,
      emit: checkpointingEmit,
      signal: options.signal,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
      completeRuntimeClarification: async (result) => {
        await this.fitMeetRuntime?.completeRun({
          runId: runtimeRun?.id,
          userId: ownerUserId,
          status: FitMeetAgentRunStatus.WaitingConfirmation,
          assistantMessage: result.assistantMessage,
          resultPayload: { taskId: task.id, awaitingClarification: true },
        });
      },
    });
    task = mainAgentRun.task;
    if (mainAgentRun.result) return mainAgentRun.result;
    const alphaTurn = mainAgentRun.alphaTurn;

    const recommendation = await this.runRecommendations.run({
      ownerUserId,
      task,
      goal,
      permissionMode,
      visibleSteps,
      emit: checkpointingEmit,
      alphaTurn,
      signal: options.signal,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
      recordRuntimeStep: async (input) => {
        await this.fitMeetRuntime?.recordStep({
          runId: runtimeRun?.id,
          userId: ownerUserId,
          ...input,
        });
      },
      recordRuntimeTool: async (input) => {
        await this.fitMeetRuntime?.recordToolCall({
          runId: runtimeRun?.id,
          userId: ownerUserId,
          ...input,
        });
      },
    });
    task = recommendation.task;
    const result = recommendation.result;
    const completion = buildSocialAgentRunCompletionSnapshot(result, task.id);
    const checkpoint = await this.checkpoints?.saveResult({
      ownerUserId,
      task,
      goal,
      result,
      steps: visibleSteps,
    });
    if (checkpoint) {
      result.runtime = {
        ...(result.runtime ?? {}),
        checkpointId: checkpoint.id,
        checkpointType: checkpoint.type,
        canResume: completion.resultPayload.approvalRequiredCount > 0,
        canReplay: true,
        canFork: true,
      };
    }
    this.realtime?.emitAgentEvent(ownerUserId, 'agent:completed', {
      taskId: task.id,
      status: result.status,
      candidateCount: completion.resultPayload.candidateCount,
      approvalRequiredCount: completion.resultPayload.approvalRequiredCount,
    });
    await this.fitMeetRuntime?.completeRun({
      runId: runtimeRun?.id,
      userId: ownerUserId,
      status: completion.status,
      assistantMessage: result.assistantMessage,
      resultPayload: completion.resultPayload,
    });
    await this.selfImprove?.recordOnlineReplayFromRoute({
      ownerUserId,
      taskId: task.id,
      userMessage: goal,
      assistantMessage: result.assistantMessage,
      route: {
        intent: result.structuredIntent?.intent ?? 'social_search',
        source: 'run_orchestrator',
      },
      result: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
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

  private normalizePermissionMode(
    mode: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return mode && Object.values(AgentTaskPermissionMode).includes(mode)
      ? mode
      : AgentTaskPermissionMode.Confirm;
  }

  private number(value: unknown): number | null {
    return parseSocialAgentThreadTaskId(value);
  }
}
