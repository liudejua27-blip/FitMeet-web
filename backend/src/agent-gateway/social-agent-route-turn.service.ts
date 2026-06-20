import { Injectable, Optional } from '@nestjs/common';

import { AgentLoopService } from './agent-loop.service';
import { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
  SocialAgentRuntimeResumeMetadata,
  SocialAgentRouteMessageBody,
  SocialAgentStreamOptions,
  StreamEmit,
} from './social-agent-chat.types';
import { socialAgentAssistantMessageForRoute } from './social-agent-route-response.presenter';
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';
import { SocialAgentRouteCompletionService } from './social-agent-route-completion.service';
import { SocialAgentRouteEntranceService } from './social-agent-route-entrance.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';
import { createSocialAgentRouteTurnState } from './social-agent-route-turn-state';
import { SocialAgentRouteAgentLoopRunnerService } from './social-agent-route-agent-loop-runner.service';
import { hasExplicitCandidateMessageConfirmationIntent } from './social-agent-social-intent-gate';

type QueueInitialSearchForTask = (
  ownerUserId: number,
  task: AgentTask,
  goal: string,
) => Promise<SocialAgentAsyncRunSnapshot>;

type ReplanAndRefresh = (
  ownerUserId: number,
  taskId: number,
  body: SocialAgentChatReplanRunBody,
) => Promise<SocialAgentAsyncRunSnapshot>;
type CandidateConfirmationResult = Awaited<
  ReturnType<SocialAgentRouteCandidateConfirmationService['handle']>
>;

@Injectable()
export class SocialAgentRouteTurnService {
  constructor(
    private readonly candidateConfirmations: SocialAgentRouteCandidateConfirmationService,
    private readonly completions: SocialAgentRouteCompletionService,
    private readonly entrance: SocialAgentRouteEntranceService,
    private readonly routeDecisions: SocialAgentRouteDecisionService,
    private readonly routeLoopRunner: SocialAgentRouteAgentLoopRunnerService,
    @Optional() private readonly agentLoop?: AgentLoopService,
  ) {}

  async handleMessage(input: {
    ownerUserId: number;
    body: SocialAgentRouteMessageBody;
    emit?: StreamEmit;
    signal?: AbortSignal | null;
    streamOptions?: SocialAgentStreamOptions;
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, body } = input;
    const entered = await this.entrance.enter({
      ownerUserId,
      body,
      signal: input.signal,
    });
    if (entered.earlyResult) return entered.earlyResult;

    const { message, startedAt } = entered;
    let task = entered.task;
    const decision = await this.routeDecisions.prepare({
      ownerUserId,
      task,
      body,
      message,
      signal: input.signal,
    });
    task = decision.task;
    const { route } = decision;

    let candidateConfirmation: CandidateConfirmationResult = {
      handled: false,
      task,
      result: null,
    };
    if (hasExplicitCandidateMessageConfirmationIntent(message)) {
      candidateConfirmation = await this.handleCandidateConfirmationInLoop({
        ownerUserId,
        task,
        message,
        route,
        startedAt,
        signal: input.signal,
      });
    }
    if (candidateConfirmation.handled) return candidateConfirmation.result;

    const state = createSocialAgentRouteTurnState(
      socialAgentAssistantMessageForRoute({
        route,
        task: candidateConfirmation.task,
        message,
      }),
    );
    const branchRun = await this.routeLoopRunner.run({
      ownerUserId,
      task: candidateConfirmation.task,
      state,
      message,
      decision,
      conversationIntent:
        body.clientContext?.conversationIntent ?? body.conversationIntent ?? null,
      clientContext: body.clientContext ?? null,
      emit: input.emit,
      signal: input.signal,
      replanAndRefresh: input.replanAndRefresh,
      queueInitialSearchForTask: input.queueInitialSearchForTask,
    });

    return this.completions.complete({
      task: branchRun.task,
      route,
      assistantMessage: branchRun.actionTurn.assistantMessage,
      assistantMessageSource:
        branchRun.state.assistantMessageSource ?? 'fallback',
      savedContext: branchRun.state.savedContext,
      profileUpdated: branchRun.state.profileUpdated,
      queuedRun: branchRun.state.queuedRun,
      runMode: branchRun.state.runMode,
      pendingApproval: branchRun.actionTurn.pendingApproval,
      activityResults: branchRun.state.activityResults,
      profileUpdateProposal: branchRun.state.profileUpdateProposal,
      assistantStreamed: branchRun.state.assistantStreamed,
      agentLoop: branchRun.loop,
      subagentHandoffs: branchRun.subagentHandoffs,
      runtime: this.runtimeFromResumeContext(branchRun.resumeContext),
      startedAt,
      deferAssistantMessageLog:
        input.streamOptions?.deferAssistantMessageLog ?? false,
    });
  }

  private runtimeFromResumeContext(
    resumeContext: Awaited<
      ReturnType<SocialAgentRouteAgentLoopRunnerService['run']>
    >['resumeContext'],
  ): SocialAgentRuntimeResumeMetadata | null {
    if (!resumeContext?.checkpointId) return null;
    return {
      checkpointId: resumeContext.checkpointId,
      checkpointType:
        resumeContext.stepScope?.mode === 'through_step'
          ? 'step'
          : 'checkpoint',
      canResume: resumeContext.checkpointAction === 'resume',
      canReplay: true,
      canFork: true,
      parentCheckpointId:
        typeof resumeContext.parentCheckpointId === 'number'
          ? resumeContext.parentCheckpointId
          : null,
      threadId: resumeContext.threadId,
      idempotencyKey: resumeContext.idempotencyKey,
      checkpointAction:
        resumeContext.checkpointAction === 'resume' ||
        resumeContext.checkpointAction === 'retry' ||
        resumeContext.checkpointAction === 'replay' ||
        resumeContext.checkpointAction === 'fork'
          ? resumeContext.checkpointAction
          : null,
      resumeCursor: {
        threadId: resumeContext.threadId,
        checkpointId: resumeContext.checkpointId,
        parentCheckpointId: resumeContext.parentCheckpointId,
        action:
          resumeContext.checkpointAction === 'resume' ||
          resumeContext.checkpointAction === 'retry' ||
          resumeContext.checkpointAction === 'replay' ||
          resumeContext.checkpointAction === 'fork'
            ? resumeContext.checkpointAction
            : null,
        stepId: resumeContext.sourceStepId,
      },
      sourceStep: resumeContext.sourceStep,
      stepScope: resumeContext.stepScope,
      sideEffectPolicy: resumeContext.sideEffectPolicy,
    };
  }

  private async handleCandidateConfirmationInLoop(input: {
    ownerUserId: number;
    task: AgentTask;
    message: string;
    route: Awaited<
      ReturnType<SocialAgentRouteDecisionService['prepare']>
    >['route'];
    startedAt: number;
    signal?: AbortSignal | null;
  }): Promise<CandidateConfirmationResult> {
    let confirmation: CandidateConfirmationResult | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId: input.task.id,
      goal: input.message,
      agent: 'FitMeet Main Agent',
      plan: {
        reason: 'Candidate confirmation checks execute through AgentLoop.',
        tools: [
          {
            agent: 'Social Match Agent',
            toolName: 'candidate_confirmation_check',
            input: {
              taskId: input.task.id,
              intent: input.route.intent,
            },
          },
        ],
      },
      maxToolCalls: 1,
      maxRetries: 0,
      signal: input.signal,
      runner: async () => {
        confirmation = await this.candidateConfirmations.handle(input);
        return {
          handled: confirmation.handled,
          taskId: confirmation.task.id,
          action: confirmation.result?.action ?? null,
        };
      },
    });
    const result = confirmation as CandidateConfirmationResult | null;
    if (!result) {
      throw new Error('Candidate confirmation loop completed without result.');
    }
    if (result.handled) {
      result.result.agentLoop = result.result.agentLoop ?? execution.loop;
    }
    return result;
  }
}
