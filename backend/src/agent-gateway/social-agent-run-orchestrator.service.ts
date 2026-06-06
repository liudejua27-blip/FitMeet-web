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
import type {
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { TonePolicyService } from './response-quality/tone-policy.service';

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
  ) {}

  async run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit?: StreamEmit,
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

    let task = await this.taskLifecycle.createOrReuseTask({
      ownerUserId,
      goal,
      permissionMode,
      idempotencyKey: idempotencyKey || null,
    });
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

    const mainAgentRun = await this.mainAgentTurn.handleRunTurn({
      ownerUserId,
      task,
      message: goal,
      permissionMode,
      visibleSteps,
      emit,
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
      emit,
      alphaTurn,
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
    this.realtime?.emitAgentEvent(ownerUserId, 'agent:completed', {
      taskId: task.id,
      status: result.status,
      candidateCount: result.candidates.length,
      approvalRequiredCount: result.approvalRequiredActions.length,
    });
    await this.fitMeetRuntime?.completeRun({
      runId: runtimeRun?.id,
      userId: ownerUserId,
      status:
        result.approvalRequiredActions.length > 0 ||
        result.candidates.length > 0
          ? FitMeetAgentRunStatus.WaitingConfirmation
          : FitMeetAgentRunStatus.Completed,
      assistantMessage: result.assistantMessage,
      resultPayload: {
        taskId: task.id,
        candidateCount: result.candidates.length,
        approvalRequiredCount: result.approvalRequiredActions.length,
      },
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
}
