import { Injectable, Optional } from '@nestjs/common';

import {
  AgentTask,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
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

@Injectable()
export class SocialAgentMainAgentTurnService {
  constructor(
    private readonly turnResults: SocialAgentMainAgentTurnResultService,
    @Optional()
    private readonly alphaAgent?: FitMeetAlphaAgentSdkService,
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
        result: await this.turnResults.handleBlockedRouteTurn({
          task: input.task,
          alphaTurn,
          startedAt: input.startedAt,
        }),
      };
    }
    if (socialAgentAlphaNeedsClarification(alphaTurn)) {
      return {
        task: input.task,
        result: await this.turnResults.handleClarificationRouteTurn({
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
        result: await this.turnResults.handleBlockedRunTurn({
          ownerUserId: input.ownerUserId,
          task: input.task,
          alphaTurn,
          visibleSteps: input.visibleSteps,
          emit: input.emit,
        }),
      };
    }
    if (socialAgentAlphaNeedsClarification(alphaTurn)) {
      const result = await this.turnResults.handleClarificationRunTurn({
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
}
