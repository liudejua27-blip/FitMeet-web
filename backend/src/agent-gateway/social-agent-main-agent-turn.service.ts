import { Injectable, Optional } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { AgentLoopService } from './agent-loop.service';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import type {
  SocialAgentChatRunResult,
  SocialAgentIntentRouteResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentMainAgentTurnResultService } from './social-agent-main-agent-turn-result.service';
import { socialAgentAlphaNeedsClarification } from './social-agent-route-response.presenter';
import { SocialAgentContextHydratorService } from './social-agent-context-hydrator.service';

@Injectable()
export class SocialAgentMainAgentTurnService {
  constructor(
    private readonly turnResults: SocialAgentMainAgentTurnResultService,
    @Optional()
    private readonly alphaAgent?: FitMeetAlphaAgentSdkService,
    @Optional()
    private readonly agentLoop?: AgentLoopService,
    @Optional()
    private readonly contextHydrator?: SocialAgentContextHydratorService,
  ) {}

  async handleRouteTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    hasCandidates: boolean;
    startedAt: number;
    signal?: AbortSignal | null;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentIntentRouteResult | null;
  }> {
    return this.executeMainAgentTurnLoop({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      permissionMode: input.task.permissionMode,
      context: await this.hydratedMainAgentContext({
        ownerUserId: input.ownerUserId,
        task: input.task,
        base: { hasCandidates: input.hasCandidates },
      }),
      flow: 'route_turn',
      signal: input.signal,
      resultFactory: async (alphaTurn) => {
        if (alphaTurn?.safety.blocked) {
          return this.turnResults.handleBlockedRouteTurn({
            task: input.task,
            alphaTurn,
            startedAt: input.startedAt,
          });
        }
        if (socialAgentAlphaNeedsClarification(alphaTurn, input.task)) {
          return this.turnResults.handleClarificationRouteTurn({
            task: input.task,
            alphaTurn,
            startedAt: input.startedAt,
          });
        }
        return null;
      },
    });
  }

  async handleRunTurn(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    permissionMode: AgentTaskPermissionMode;
    visibleSteps: SocialAgentVisibleStep[];
    emit?: StreamEmit;
    visibleStepLabel: (id: string, label: string) => string;
    signal?: AbortSignal | null;
    completeRuntimeClarification?: (
      result: SocialAgentChatRunResult,
    ) => Promise<void>;
  }): Promise<{
    task: AgentTask;
    result: SocialAgentChatRunResult | null;
    alphaTurn?: FitMeetAlphaTurnDecision;
  }> {
    const loopResult = await this.executeMainAgentTurnLoop({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      permissionMode: input.permissionMode,
      context: await this.hydratedMainAgentContext({
        ownerUserId: input.ownerUserId,
        task: input.task,
        base: { flow: 'run_stream' },
      }),
      flow: 'run_turn',
      signal: input.signal,
      resultFactory: async (alphaTurn) => {
        if (alphaTurn?.safety.blocked) {
          return this.turnResults.handleBlockedRunTurn({
            ownerUserId: input.ownerUserId,
            task: input.task,
            alphaTurn,
            visibleSteps: input.visibleSteps,
            emit: input.emit,
          });
        }
        if (socialAgentAlphaNeedsClarification(alphaTurn, input.task)) {
          const result = await this.turnResults.handleClarificationRunTurn({
            ownerUserId: input.ownerUserId,
            task: input.task,
            alphaTurn,
            visibleSteps: input.visibleSteps,
            emit: input.emit,
            visibleStepLabel: input.visibleStepLabel,
          });
          await input.completeRuntimeClarification?.(result);
          return result;
        }
        return null;
      },
    });
    return {
      task: loopResult.task,
      result: loopResult.result,
      alphaTurn: loopResult.alphaTurn,
    };
  }

  private async executeMainAgentTurnLoop<TResult>(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    permissionMode: AgentTaskPermissionMode;
    context: Record<string, unknown>;
    flow: 'route_turn' | 'run_turn';
    signal?: AbortSignal | null;
    resultFactory: (
      alphaTurn?: FitMeetAlphaTurnDecision,
    ) => Promise<TResult | null>;
  }): Promise<{
    task: AgentTask;
    result: TResult | null;
    alphaTurn?: FitMeetAlphaTurnDecision;
  }> {
    let alphaTurn: FitMeetAlphaTurnDecision | undefined;
    let result: TResult | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId: input.task.id,
      goal: input.message,
      agent: 'FitMeet Main Agent',
      plan: {
        reason: 'Main Agent turn decisions execute only through AgentLoop.',
        tools: [
          {
            agent: 'Agent Brain',
            toolName: 'main_agent_prepare_turn',
            requiresApproval: false,
            input: {
              flow: input.flow,
              permissionMode: input.permissionMode,
              context: input.context,
            },
          },
        ],
      },
      maxToolCalls: 1,
      maxRetries: 0,
      signal: input.signal,
      runner: async () => {
        alphaTurn = await this.alphaAgent?.prepareTurn({
          ownerUserId: input.ownerUserId,
          taskId: input.task.id,
          message: input.message,
          permissionMode: input.permissionMode,
          context: input.context,
        });
        result = await input.resultFactory(alphaTurn);
        return {
          handled: Boolean(result),
          blocked: alphaTurn?.safety.blocked === true,
          needsClarification: socialAgentAlphaNeedsClarification(
            alphaTurn,
            input.task,
          ),
          traceId: alphaTurn?.traceId ?? null,
        };
      },
    });
    if (result && typeof result === 'object' && 'agentLoop' in result) {
      (result as { agentLoop?: unknown }).agentLoop ??= execution.loop;
    }
    return { task: input.task, result, alphaTurn };
  }

  private async hydratedMainAgentContext(input: {
    ownerUserId: number;
    task: AgentTask;
    base: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (!this.contextHydrator) return input.base;
    const hydrated = await this.contextHydrator
      .hydrateContext({
        userId: input.ownerUserId,
        taskId: input.task.id,
        threadId: `agent-task:${input.task.id}`,
      })
      .catch(() => null);
    if (!hydrated) return input.base;
    return {
      ...input.base,
      recentMessages: hydrated.recentMessages,
      taskMemory: hydrated.taskMemory,
      taskSlots: hydrated.taskSlots,
      taskSlotSummary: hydrated.taskSlotSummary,
      knownTaskSlotConstraints: hydrated.knownTaskSlotConstraints,
      pendingApprovals: hydrated.pendingApprovals,
      candidateActions: hydrated.candidateActions,
      lifeGraphSummary: hydrated.lifeGraphSummary,
      lifeGraphGovernanceSummary: hydrated.lifeGraphGovernanceSummary,
    };
  }
}
