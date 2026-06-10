import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AIService } from '../ai/ai.service';
import { FriendsService } from '../friends/friends.service';
import { MatchService } from '../match/match.service';
import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import { MessagesService } from '../messages/messages.service';
import { UpdateSocialRequestDto } from '../social-requests/dto/update-social-request.dto';
import { SocialRequestsService } from '../social-requests/social-requests.service';
import { SocialProfileService } from '../users/social-profile.service';
import { sanitizeCity } from '../common/city.util';
import { MatchReasonerService } from './match-reasoner.service';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { AgentPermissionService } from './agent-permission.service';
import { AgentLoopService } from './agent-loop.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { AgentApprovalService } from './agent-approval.service';
import { rememberSocialAgentShortTerm } from './social-agent-memory.util';
import { toSocialAgentMessageArray } from './social-agent-loop-state';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SceneRiskPolicyResult } from './scene-risk-policy.service';
import { SocialAgentToolName } from './social-agent-tool.types';
import type {
  SocialAgentRunNextResult,
  SocialAgentTaskExecutionResult,
  SocialAgentToolCallRecord,
} from './social-agent-tool.types';
import { buildSocialAgentConversationOptions } from './social-agent-message-options';
import { SocialAgentTargetResolverService } from './social-agent-target-resolver.service';
import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SocialAgentActionSideEffectService } from './social-agent-action-side-effect.service';
import { SocialAgentToolExecutionPolicyService } from './social-agent-tool-execution-policy.service';
import { SocialAgentConfirmationPolicyService } from './social-agent-confirmation-policy.service';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentPaymentIntentToolService } from './social-agent-payment-intent-tool.service';
import { SocialAgentMessageToolService } from './social-agent-message-tool.service';
import { SocialAgentActivityToolService } from './social-agent-activity-tool.service';
import { SocialAgentInboxToolService } from './social-agent-inbox-tool.service';
import {
  SocialAgentConversationToolService,
  type SocialAgentConversationToolResult,
} from './social-agent-conversation-tool.service';
import {
  SocialAgentDecisionToolService,
  type SocialAgentDecisionToolResult,
} from './social-agent-decision-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { summarizeSocialAgentToolCalls } from './social-agent-tool-execution-summary';
import { buildSocialAgentProfileContextPatch } from './social-agent-profile-context-patch';
import { buildSocialAgentSocialRequestToolInput } from './social-agent-social-request-tool-input';
import { buildSocialAgentRunNextResult } from './social-agent-run-next-result';
import {
  buildSocialAgentInboxEventPayload,
  type SocialAgentInboxEventInput,
} from './social-agent-inbox-event-payload';
import { buildSocialAgentFriendActionResult } from './social-agent-friend-action-result';
import {
  buildSocialAgentStepCompletedEvent,
  buildSocialAgentStepStartedEvent,
  buildSocialAgentToolCalledEvent,
  buildSocialAgentToolFailedEvent,
  buildSocialAgentToolReturnedEvent,
} from './social-agent-tool-step-events.presenter';
import {
  buildSocialAgentTaskFailureLogPayload,
  buildSocialAgentToolFailureLogPayload,
} from './social-agent-tool-executor-log.presenter';
import {
  buildSocialAgentTaskEventRecord,
  type SocialAgentTaskEventRecordInput,
} from './social-agent-task-event-record.presenter';
import {
  appendSocialAgentToolCallToTask,
  applySocialAgentPlanStepCallToTask,
} from './social-agent-tool-execution-state';
import {
  socialAgentTaskCompletionState,
  socialAgentTaskFailureState,
} from './social-agent-task-execution-state';
import {
  socialAgentRunNextActionState,
  socialAgentRunNextDecisionState,
  socialAgentRunNextReadReplyState,
  socialAgentRunNextSummaryFailedState,
} from './social-agent-run-next-state';
import { requiresMandatorySocialAgentApproval } from './social-agent-tool-policy';
import {
  socialAgentAdhocActionCompletionState,
  type SocialAgentAdhocActionTaskState,
  socialAgentUnconfirmedAdhocActionState,
} from './social-agent-adhoc-action-state';
import {
  buildSocialAgentPendingApprovalOutput,
  buildSocialAgentRiskGateDecision,
} from './social-agent-risk-gate.presenter';
import {
  buildSocialAgentPendingApprovalsToolOutput,
  readSocialAgentApprovalToolId,
} from './social-agent-approval-tool.presenter';
import {
  buildSocialAgentCurrentTaskSummary,
  shouldPersistSocialAgentCurrentTaskSummary,
} from './social-agent-current-task-summary.presenter';
import { buildSocialAgentDraftOpenerResult } from './social-agent-draft-opener.presenter';
import { buildSocialAgentCandidateMessageActionResult } from './social-agent-candidate-message-action-result';
import { buildSocialAgentSocialRequestResult } from './social-agent-social-request-result.presenter';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';

export { SocialAgentToolName } from './social-agent-tool.types';
export type {
  SocialAgentRunNextResult,
  SocialAgentTaskExecutionResult,
  SocialAgentToolCallRecord,
  SocialAgentToolCallStatus,
} from './social-agent-tool.types';

type StepRecord = Record<string, unknown>;

type ExecuteTaskOptions = {
  maxSteps?: number;
  stopOnError?: boolean;
};

type ToolReliabilityContract = {
  idempotencyKey: string;
  generatedIdempotencyKey: boolean;
  timeoutMs: number;
  maxRetries: number;
  retryable: boolean;
  highRisk: boolean;
  mandatoryApproval: boolean;
  compensationAction: string | null;
};

@Injectable()
export class SocialAgentToolExecutorService {
  private readonly logger = new Logger(SocialAgentToolExecutorService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    private readonly permissions: AgentPermissionService,
    private readonly approvals: AgentApprovalService,
    private readonly approvalDispatcher: AgentApprovalDispatcherService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
    private readonly socialProfiles: SocialProfileService,
    private readonly socialRequests: SocialRequestsService,
    private readonly candidatePool: SocialAgentCandidatePoolService,
    private readonly matchService: MatchService,
    private readonly matchReasoner: MatchReasonerService,
    private readonly ai: AIService,
    private readonly messages: MessagesService,
    private readonly friends: FriendsService,
    private readonly targetResolver: SocialAgentTargetResolverService,
    private readonly toolJsonModel: SocialAgentToolJsonModelService,
    private readonly actionSideEffects: SocialAgentActionSideEffectService,
    private readonly toolExecutionPolicy: SocialAgentToolExecutionPolicyService,
    private readonly confirmationPolicy: SocialAgentConfirmationPolicyService,
    private readonly toolCallFactory: SocialAgentToolCallFactoryService,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly paymentIntentTools: SocialAgentPaymentIntentToolService,
    private readonly messageTools: SocialAgentMessageToolService,
    private readonly activityTools: SocialAgentActivityToolService,
    private readonly inboxTools: SocialAgentInboxToolService,
    private readonly conversationTools: SocialAgentConversationToolService,
    private readonly decisionTools: SocialAgentDecisionToolService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
    @Optional()
    private readonly agentLoop?: AgentLoopService,
  ) {}

  async executeTask(
    taskId: number,
    options: ExecuteTaskOptions = {},
  ): Promise<SocialAgentTaskExecutionResult> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);

    const plan = Array.isArray(task.plan) ? [...task.plan] : [];
    if (plan.length === 0)
      throw new BadRequestException('Agent task has no plan');

    const maxSteps = Math.max(1, options.maxSteps ?? plan.length);
    const stopOnError = options.stopOnError ?? true;
    const executedCalls: SocialAgentToolCallRecord[] = [];
    task.status = AgentTaskStatus.Executing;
    task.startedAt = task.startedAt ?? new Date();

    for (
      let index = 0;
      index < plan.length && executedCalls.length < maxSteps;
      index += 1
    ) {
      const step = plan[index];
      if (!this.toolCallFactory.shouldExecuteStep(step)) continue;

      const call = await this.executePlanStep(task, step, index);
      executedCalls.push(call);
      applySocialAgentPlanStepCallToTask({
        task,
        plan,
        stepIndex: index,
        step,
        call,
        withStepResult: (currentStep, toolCall) =>
          this.toolCallFactory.withStepResult(currentStep, toolCall),
      });

      if (call.status === 'failed' || call.status === 'blocked') {
        this.applyTaskFailureState(task, call);
        await this.taskRepo.save(task);
        this.logTaskFailure(task, call);
        if (stopOnError) break;
      } else {
        await this.taskRepo.save(task);
      }
    }

    const summary = summarizeSocialAgentToolCalls(executedCalls);
    if (
      !summary.hasFailureOrBlock &&
      this.toolCallFactory.hasNoRemainingExecutableSteps(task.plan)
    ) {
      const completionState = this.applyTaskCompletionState(
        task,
        this.taskMemory.shouldWaitForReply(task),
      );
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      if (completionState.status === AgentTaskStatus.Succeeded) {
        await this.createTaskEvent(task, AgentTaskEventType.TaskSucceeded, {
          summary: 'Social agent task execution succeeded',
          payload: { executedSteps: executedCalls.length },
        });
      } else {
        await this.createTaskEvent(task, AgentTaskEventType.Note, {
          summary: 'Social agent task is waiting for reply',
          payload: { executedSteps: executedCalls.length, status: task.status },
        });
      }
    }

    return {
      taskId: task.id,
      executedSteps: summary.executedSteps,
      succeededSteps: summary.succeededSteps,
      failedSteps: summary.failedSteps,
      blockedSteps: summary.blockedSteps,
      toolCalls: executedCalls,
    };
  }

  async runNext(
    taskId: number,
    ownerUserId?: number,
  ): Promise<SocialAgentRunNextResult> {
    const task = await this.taskRepo.findOne({
      where: ownerUserId ? { id: taskId, ownerUserId } : { id: taskId },
    });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);

    let runNextResult: SocialAgentRunNextResult | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    const execution = await loopService.execute({
      taskId,
      goal: `Continue Social Agent task ${taskId}`,
      agent: 'FitMeet Main Agent',
      maxToolCalls: 1,
      timeoutMs: 30_000,
      plan: {
        reason: 'run-next must pass through the unified AgentLoop.',
        tools: [
          {
            agent: 'Meet Loop Agent',
            toolName: 'run_next_execute',
            input: { ownerUserId: ownerUserId ?? null },
          },
        ],
      },
      runner: async () => {
        runNextResult = await this.runNextInternal(task);
        return {
          taskId: runNextResult.taskId,
          status: runNextResult.status,
          executedSteps: runNextResult.executedSteps,
          handledReply: runNextResult.handledReply,
          decision: runNextResult.decision,
        };
      },
    });
    if (!runNextResult) {
      throw new Error('AgentLoop did not produce a run-next result');
    }
    const result = runNextResult as SocialAgentRunNextResult;
    return {
      ...result,
      agentLoop: execution.loop,
    };
  }

  private async runNextInternal(
    task: AgentTask,
  ): Promise<SocialAgentRunNextResult> {
    const taskId = task.id;
    if (
      task.status !== AgentTaskStatus.WaitingReply &&
      task.status !== AgentTaskStatus.WaitingResult &&
      task.status !== AgentTaskStatus.AwaitingFeedback
    ) {
      const result = await this.executeTask(taskId, { maxSteps: 1 });
      const updated = await this.taskRepo.findOne({ where: { id: taskId } });
      return {
        ...result,
        status: updated?.status ?? task.status,
        handledReply: false,
        decision: null,
      };
    }

    task.status = AgentTaskStatus.Executing;
    task.statusReason = null;
    task.startedAt = task.startedAt ?? new Date();
    rememberSocialAgentShortTerm(task, {});
    await this.taskRepo.save(task);

    const calls: SocialAgentToolCallRecord[] = [];
    const readCall = await this.executeAdhocStep(task, {
      id: 'run_next_read_reply',
      toolName: SocialAgentToolName.ReadTaskConversationMessages,
      status: 'planned',
      input: { limit: 50 },
    });
    calls.push(readCall);

    const newMessages = toSocialAgentMessageArray(readCall.output?.newMessages);
    if (readCall.status !== 'succeeded' || newMessages.length === 0) {
      this.applyRunNextTaskState(
        task,
        socialAgentRunNextReadReplyState({
          readCallStatus: readCall.status,
          newMessageCount: newMessages.length,
        }),
      );
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      return this.runNextResult(task, calls, false, null);
    }

    const summaryCall = await this.executeAdhocStep(task, {
      id: 'run_next_summarize_reply',
      toolName: SocialAgentToolName.SummarizeReply,
      status: 'planned',
      input: { messages: newMessages },
    });
    calls.push(summaryCall);

    if (summaryCall.status !== 'succeeded') {
      this.applyRunNextTaskState(task, socialAgentRunNextSummaryFailedState());
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      return this.runNextResult(task, calls, true, null);
    }

    const decisionCall = await this.executeAdhocStep(task, {
      id: 'run_next_decide_action',
      toolName: SocialAgentToolName.DecideNextSocialAction,
      status: 'planned',
      input: {
        messages: newMessages,
        summary: summaryCall.output,
      },
    });
    calls.push(decisionCall);

    const decision = decisionCall.output;
    const nextAction = this.toolInput.string(decision?.nextAction);
    const nextToolName = this.toolCallFactory.normalizeToolName(
      decision?.toolName,
    );
    const decisionState = socialAgentRunNextDecisionState({
      nextAction,
      hasExecutableTool: decisionCall.status === 'succeeded' && !!nextToolName,
    });
    if (decisionState) {
      this.applyRunNextTaskState(task, decisionState);
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      return this.runNextResult(task, calls, true, decision ?? null);
    }

    const actionCall = await this.executeAdhocStep(task, {
      id: `run_next_${nextToolName}`,
      toolName: nextToolName,
      action: decision?.action,
      status: 'planned',
      input: this.toolInput.isRecord(decision?.input) ? decision.input : {},
    });
    calls.push(actionCall);

    this.applyRunNextTaskState(
      task,
      socialAgentRunNextActionState({ actionStatus: actionCall.status }),
    );
    rememberSocialAgentShortTerm(task, {});
    await this.taskRepo.save(task);
    return this.runNextResult(task, calls, true, decision);
  }

  async executeStep(
    taskId: number,
    stepId: string,
  ): Promise<SocialAgentToolCallRecord> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);
    const plan = Array.isArray(task.plan) ? [...task.plan] : [];
    const stepIndex = plan.findIndex(
      (step) => this.toolCallFactory.stepId(step) === stepId,
    );
    if (stepIndex < 0)
      throw new NotFoundException(`Agent plan step ${stepId} not found`);

    const call = await this.executePlanStep(task, plan[stepIndex], stepIndex);
    applySocialAgentPlanStepCallToTask({
      task,
      plan,
      stepIndex,
      step: plan[stepIndex],
      call,
      withStepResult: (currentStep, toolCall) =>
        this.toolCallFactory.withStepResult(currentStep, toolCall),
    });
    rememberSocialAgentShortTerm(task, {});
    await this.taskRepo.save(task);
    return call;
  }

  private async rejectUnconfirmedAdhocDangerousAction(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<SocialAgentToolCallRecord | null> {
    if (!this.confirmationPolicy.isDangerousAdhocAction(toolName)) return null;
    if (this.confirmationPolicy.hasExplicitApprovalCredential(input)) {
      return null;
    }

    const startedAt = new Date();
    const callId = this.toolCallFactory.safeToolCallId(
      task.id,
      toolName,
      startedAt,
    );

    try {
      await this.confirmationPolicy.validateDangerousAdhocActionTarget(
        task,
        toolName,
        input,
      );
    } catch (error) {
      const blocked = error instanceof ForbiddenException;
      return this.toolCallFactory.buildToolCall({
        id: callId,
        stepId,
        toolName,
        status: blocked ? 'blocked' : 'failed',
        input,
        output: null,
        error: this.toolInput.errorPayload(error),
        startedAt,
      });
    }

    return this.toolCallFactory.buildToolCall({
      id: callId,
      stepId,
      toolName,
      status: 'blocked',
      input,
      output: null,
      error: {
        code: 'APPROVAL_REQUIRED',
        message:
          'This action requires an approved Agent approval request before execution.',
        statusCode: 403,
      },
      startedAt,
    });
  }

  async executeToolAction(
    taskId: number,
    toolName: SocialAgentToolName | string,
    input: Record<string, unknown>,
    ownerUserId?: number,
  ): Promise<SocialAgentToolCallRecord> {
    const normalizedToolName = this.toolCallFactory.normalizeToolName(toolName);
    if (!normalizedToolName) {
      throw new BadRequestException(`Unknown tool ${String(toolName)}`);
    }

    let didRun = false;
    let actionResult: SocialAgentToolCallRecord | null = null;
    const loopService = this.agentLoop ?? new AgentLoopService();
    await loopService.execute({
      taskId,
      goal: `Execute Social Agent tool action`,
      agent: 'FitMeet Main Agent',
      maxToolCalls: 1,
      maxRetries: 0,
      timeoutMs: 30_000,
      plan: {
        reason:
          'Adhoc task tool actions must enter the unified AgentLoop; the executor enforces approval gates.',
        tools: [
          {
            agent: this.agentForToolAction(normalizedToolName),
            toolName: 'tool_action_execute',
            input: this.toolActionLoopInput(taskId, input, ownerUserId),
          },
        ],
      },
      runner: async () => {
        actionResult = await this.executeToolActionInternal(
          taskId,
          normalizedToolName,
          input,
          ownerUserId,
        );
        didRun = true;
        return {
          handled: true,
          taskId,
          status: actionResult.status,
          toolName: normalizedToolName,
          outputKeys: this.recordKeys(actionResult.output),
          errorCode: actionResult.error?.code ?? null,
        };
      },
    });

    if (!didRun || !actionResult) {
      throw new Error(
        `AgentLoop completed without executing tool action: ${normalizedToolName}`,
      );
    }
    return actionResult;
  }

  private async executeToolActionInternal(
    taskId: number,
    normalizedToolName: SocialAgentToolName,
    input: Record<string, unknown>,
    ownerUserId?: number,
  ): Promise<SocialAgentToolCallRecord> {
    const task = await this.taskRepo.findOne({
      where: ownerUserId ? { id: taskId, ownerUserId } : { id: taskId },
    });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);

    task.status = AgentTaskStatus.Executing;
    task.startedAt = task.startedAt ?? new Date();
    task.statusReason = null;
    await this.taskRepo.save(task);

    const actionInput = this.confirmationPolicy.withAdhocConfirmationMetadata(
      normalizedToolName,
      input,
      ownerUserId,
    );
    const stepId = `action_${normalizedToolName}_${Date.now()}`;
    const unconfirmedDangerousAction = requiresMandatorySocialAgentApproval(
      normalizedToolName,
      actionInput,
    )
      ? null
      : await this.rejectUnconfirmedAdhocDangerousAction(
          task,
          normalizedToolName,
          actionInput,
          stepId,
        );
    if (unconfirmedDangerousAction) {
      this.applyAdhocActionState(
        task,
        socialAgentUnconfirmedAdhocActionState({
          call: unconfirmedDangerousAction,
          readErrorText: (value) => this.toolInput.string(value),
        }),
      );
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      return unconfirmedDangerousAction;
    }

    const call = await this.executeAdhocStep(task, {
      id: stepId,
      toolName: normalizedToolName,
      status: 'planned',
      input: actionInput,
    });

    this.applyAdhocActionState(
      task,
      socialAgentAdhocActionCompletionState({
        call,
        shouldWaitForReply: this.taskMemory.shouldWaitForReply(task),
        readErrorText: (value) => this.toolInput.string(value),
      }),
    );
    rememberSocialAgentShortTerm(task, {});
    await this.taskRepo.save(task);
    return call;
  }

  private agentForToolAction(
    toolName: SocialAgentToolName,
  ): FitMeetAlphaAgentName {
    if (
      [
        SocialAgentToolName.GetMyProfile,
        SocialAgentToolName.GetAiProfile,
        SocialAgentToolName.GenerateProfileQuestions,
        SocialAgentToolName.UpdateAiProfileFromAnswers,
        SocialAgentToolName.UpdateProfileFromAgentContext,
        SocialAgentToolName.ReadLongTermMemory,
      ].includes(toolName)
    ) {
      return 'Life Graph Agent';
    }
    if (
      [
        SocialAgentToolName.SearchMatches,
        SocialAgentToolName.SearchActivities,
        SocialAgentToolName.SearchPublicIntents,
        SocialAgentToolName.ExplainMatches,
        SocialAgentToolName.SaveCandidate,
        SocialAgentToolName.GetCandidatePoolDebug,
      ].includes(toolName)
    ) {
      return 'Social Match Agent';
    }
    if (
      [
        SocialAgentToolName.PublishSocialRequest,
        SocialAgentToolName.CreateSocialRequest,
        SocialAgentToolName.DraftOpener,
        SocialAgentToolName.SendMessageToCandidate,
        SocialAgentToolName.SendMessage,
        SocialAgentToolName.ConnectCandidate,
        SocialAgentToolName.AddFriend,
        SocialAgentToolName.CreateActivity,
        SocialAgentToolName.JoinActivity,
        SocialAgentToolName.InviteActivity,
        SocialAgentToolName.OfflineMeeting,
        SocialAgentToolName.ShareLocation,
        SocialAgentToolName.Payment,
        SocialAgentToolName.ReplyMessage,
        SocialAgentToolName.GetPendingApprovals,
        SocialAgentToolName.ApproveAction,
        SocialAgentToolName.RejectAction,
      ].includes(toolName)
    ) {
      return 'Meet Loop Agent';
    }
    return 'FitMeet Main Agent';
  }

  private toolActionLoopInput(
    taskId: number,
    input: Record<string, unknown>,
    ownerUserId?: number,
  ): Record<string, unknown> {
    return {
      taskId,
      ownerUserId: ownerUserId ?? null,
      fieldCount: Object.keys(input).length,
      hasMessage:
        typeof input.message === 'string' ||
        typeof input.text === 'string' ||
        typeof input.suggestedOpener === 'string',
      executorEnforcesApproval: true,
    };
  }

  private recordKeys(value: unknown): string[] {
    return value && typeof value === 'object' ? Object.keys(value) : [];
  }

  private buildToolReliabilityContract(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    stepId: string,
  ): ToolReliabilityContract {
    const explicitKey = this.readIdempotencyKey(input);
    const mandatoryApproval = requiresMandatorySocialAgentApproval(
      toolName,
      input,
    );
    const highRisk = mandatoryApproval || this.isHighRiskTool(toolName);
    const timeoutMs = this.toolTimeoutMs(toolName);
    const maxRetries = this.toolRetryCount(toolName, highRisk, explicitKey);
    return {
      idempotencyKey:
        explicitKey ??
        `social-agent-tool:${task.id}:${stepId}:${toolName}:${this.simpleHash(input)}`,
      generatedIdempotencyKey: !explicitKey,
      timeoutMs,
      maxRetries,
      retryable: maxRetries > 0,
      highRisk,
      mandatoryApproval,
      compensationAction: this.compensationActionForTool(toolName),
    };
  }

  private withReliabilityInput(
    input: Record<string, unknown>,
    reliability: ToolReliabilityContract,
  ): Record<string, unknown> {
    const metadata = this.toolInput.isRecord(input.metadata)
      ? input.metadata
      : {};
    return {
      ...input,
      idempotencyKey: input.idempotencyKey ?? reliability.idempotencyKey,
      metadata: {
        ...metadata,
        idempotencyKey:
          metadata.idempotencyKey ??
          input.idempotencyKey ??
          reliability.idempotencyKey,
        reliability: {
          timeoutMs: reliability.timeoutMs,
          maxRetries: reliability.maxRetries,
          retryable: reliability.retryable,
          highRisk: reliability.highRisk,
          mandatoryApproval: reliability.mandatoryApproval,
          generatedIdempotencyKey: reliability.generatedIdempotencyKey,
          compensationAction: reliability.compensationAction,
        },
      },
    };
  }

  private withReliabilityOutput(
    output: Record<string, unknown>,
    reliability: ToolReliabilityContract,
  ): Record<string, unknown> {
    return {
      ...output,
      reliability: {
        idempotencyKey: reliability.idempotencyKey,
        retryable: reliability.retryable,
        timeoutMs: reliability.timeoutMs,
        maxRetries: reliability.maxRetries,
        highRisk: reliability.highRisk,
        compensationAction: reliability.compensationAction,
      },
    };
  }

  private findIdempotentToolCall(
    task: AgentTask,
    toolName: SocialAgentToolName,
    idempotencyKey: string,
  ): SocialAgentToolCallRecord | null {
    const calls = Array.isArray(task.toolCalls) ? task.toolCalls : [];
    for (const raw of [...calls].reverse()) {
      const call = raw as Partial<SocialAgentToolCallRecord>;
      if (call.toolName !== toolName) continue;
      if (call.status !== 'succeeded' && call.status !== 'blocked') continue;
      const existingKey = this.readIdempotencyKey(call.input ?? {});
      if (existingKey === idempotencyKey) {
        return call as SocialAgentToolCallRecord;
      }
    }
    return null;
  }

  private async dispatchToolWithReliability(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    stepId: string,
    reliability: ToolReliabilityContract,
  ): Promise<unknown> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= reliability.maxRetries; attempt += 1) {
      try {
        return await this.withTimeout(
          this.dispatchTool(task, toolName, input, stepId),
          reliability.timeoutMs,
          toolName,
        );
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryTool(error, reliability, attempt)) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    toolName: SocialAgentToolName,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`tool_timeout:${toolName}:${timeoutMs}`));
      }, timeoutMs);
      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private shouldRetryTool(
    error: unknown,
    reliability: ToolReliabilityContract,
    attempt: number,
  ): boolean {
    if (attempt >= reliability.maxRetries) return false;
    if (!reliability.retryable || reliability.highRisk) return false;
    const message = error instanceof Error ? error.message : String(error);
    return /timeout|temporar|network|rate|unavailable|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(
      message,
    );
  }

  private reliableErrorPayload(
    error: unknown,
    reliability: ToolReliabilityContract,
  ): Record<string, unknown> {
    const payload = this.toolInput.errorPayload(error);
    return {
      ...payload,
      retryable: reliability.retryable && !reliability.highRisk,
      userMessage: this.userSafeToolFailureMessage(payload, reliability),
      idempotencyKey: reliability.idempotencyKey,
      timeoutMs: reliability.timeoutMs,
      maxRetries: reliability.maxRetries,
      highRisk: reliability.highRisk,
      compensationAction: reliability.compensationAction,
      compensationStatus: reliability.highRisk
        ? 'manual_review_required'
        : 'retry_available',
    };
  }

  private userSafeToolFailureMessage(
    payload: Record<string, unknown>,
    reliability: ToolReliabilityContract,
  ): string {
    const message = this.toolInput.string(payload.message) ?? '';
    if (/approval|confirm|确认|APPROVAL_REQUIRED/i.test(message)) {
      return '这一步需要你确认后才能继续，我没有执行会影响他人的动作。';
    }
    if (/timeout|timed? out|tool_timeout/i.test(message)) {
      return reliability.highRisk
        ? '这个高风险动作执行超时了，我不会自动重试，避免重复发送或重复创建。你可以确认状态后再决定是否重试。'
        : '工具响应超时了，我已经停止本次执行；这个动作可以安全重试。';
    }
    if (reliability.highRisk) {
      return '这个高风险动作没有完成，我没有继续自动重试。请先确认状态，再决定是否重新执行或撤回。';
    }
    return '工具调用失败了，我保留了上下文和幂等标记，你可以让我重试或换一种方式继续。';
  }

  private readIdempotencyKey(input: Record<string, unknown>): string | null {
    const direct = this.toolInput.string(input.idempotencyKey);
    if (direct) return direct;
    const metadata = this.toolInput.isRecord(input.metadata)
      ? input.metadata
      : null;
    const nested = metadata
      ? this.toolInput.string(metadata.idempotencyKey)
      : null;
    return nested || null;
  }

  private toolTimeoutMs(toolName: SocialAgentToolName): number {
    const envKey = `FITMEET_AGENT_TOOL_${toolName.toUpperCase()}_TIMEOUT_MS`;
    const specific = this.positiveInt(process.env[envKey]);
    if (specific) return specific;
    const shared = this.positiveInt(process.env.FITMEET_AGENT_TOOL_TIMEOUT_MS);
    if (shared) return shared;
    if (this.isHighRiskTool(toolName)) return 12_000;
    if (
      toolName === SocialAgentToolName.SearchMatches ||
      toolName === SocialAgentToolName.SearchActivities ||
      toolName === SocialAgentToolName.SearchPublicIntents
    ) {
      return 15_000;
    }
    return 10_000;
  }

  private toolRetryCount(
    toolName: SocialAgentToolName,
    highRisk: boolean,
    explicitIdempotencyKey: string | null,
  ): number {
    const envKey = `FITMEET_AGENT_TOOL_${toolName.toUpperCase()}_RETRIES`;
    const specific = this.positiveInt(process.env[envKey]);
    if (specific !== null) return highRisk ? 0 : specific;
    const shared = this.positiveInt(process.env.FITMEET_AGENT_TOOL_RETRIES);
    if (shared !== null) return highRisk ? 0 : shared;
    if (highRisk) return explicitIdempotencyKey ? 0 : 0;
    return 1;
  }

  private isHighRiskTool(toolName: SocialAgentToolName): boolean {
    return [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.ReplyMessage,
      SocialAgentToolName.ConnectCandidate,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.CreateActivity,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.JoinActivity,
      SocialAgentToolName.OfflineMeeting,
      SocialAgentToolName.ShareLocation,
      SocialAgentToolName.Payment,
      SocialAgentToolName.PublishSocialRequest,
    ].includes(toolName);
  }

  private compensationActionForTool(
    toolName: SocialAgentToolName,
  ): string | null {
    switch (toolName) {
      case SocialAgentToolName.PublishSocialRequest:
      case SocialAgentToolName.CreateSocialRequest:
        return 'cancel_social_request_or_unpublish_public_intent';
      case SocialAgentToolName.CreateActivity:
      case SocialAgentToolName.InviteActivity:
      case SocialAgentToolName.JoinActivity:
      case SocialAgentToolName.OfflineMeeting:
        return 'cancel_or_update_activity_and_notify_participants';
      case SocialAgentToolName.SendMessage:
      case SocialAgentToolName.SendMessageToCandidate:
      case SocialAgentToolName.ReplyMessage:
        return 'send_correction_or_retraction_message';
      case SocialAgentToolName.ConnectCandidate:
      case SocialAgentToolName.AddFriend:
        return 'remove_connection_or_mark_contact_request_cancelled';
      case SocialAgentToolName.ShareLocation:
        return 'stop_location_sharing_and_notify_counterpart';
      case SocialAgentToolName.Payment:
        return 'cancel_payment_intent_or_refund_via_manual_review';
      case SocialAgentToolName.UpdateAiProfileFromAnswers:
      case SocialAgentToolName.UpdateProfileFromAgentContext:
        return 'revert_profile_or_life_graph_field_from_audit';
      default:
        return null;
    }
  }

  private positiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.trunc(parsed);
  }

  private simpleHash(value: unknown): string {
    const text = this.toolInput.safeUnknownText(value);
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  private async executePlanStep(
    task: AgentTask,
    step: StepRecord,
    index: number,
  ): Promise<SocialAgentToolCallRecord> {
    const stepId = this.toolCallFactory.stepId(step) || `step_${index + 1}`;
    const toolName = this.toolCallFactory.resolveToolName(step);
    const input = this.toolCallFactory.stepInput(step);
    const reliability = this.buildToolReliabilityContract(
      task,
      toolName,
      input,
      stepId,
    );
    const executionInput = this.withReliabilityInput(input, reliability);
    const startedAt = new Date();
    const callId = this.toolCallFactory.safeToolCallId(
      task.id,
      toolName,
      startedAt,
    );
    const policy =
      await this.toolExecutionPolicy.buildPolicyMetadataWithPatches(
        task,
        toolName,
        executionInput,
      );
    const duplicateCall = this.findIdempotentToolCall(
      task,
      toolName,
      reliability.idempotencyKey,
    );
    if (duplicateCall) {
      await this.createTaskEvent(
        task,
        AgentTaskEventType.ToolReturned,
        buildSocialAgentToolReturnedEvent({
          toolName,
          stepId,
          toolCallId: duplicateCall.id,
          inputSummary: this.taskMemory.preview(
            this.toolInput.safeUnknownText(executionInput),
            240,
          ),
          call: duplicateCall,
        }),
      );
      return duplicateCall;
    }

    await this.createTaskEvent(
      task,
      AgentTaskEventType.StepStarted,
      buildSocialAgentStepStartedEvent({
        toolName,
        stepId,
        toolCallId: callId,
        input: executionInput,
      }),
    );
    await this.createTaskEvent(
      task,
      AgentTaskEventType.ToolCalled,
      buildSocialAgentToolCalledEvent({
        toolName,
        stepId,
        toolCallId: callId,
        input: executionInput,
        policy: {
          ...policy,
          reliability,
        },
      }),
    );
    const inputSummary = this.taskMemory.preview(
      this.toolInput.safeUnknownText(executionInput),
      240,
    );

    try {
      await this.confirmationPolicy.validateDangerousAdhocActionTarget(
        task,
        toolName,
        executionInput,
      );
      this.toolExecutionPolicy.assertHighRiskFrequencyLimit(task, toolName);
      const gatedOutput = await this.maybeGateActionByRisk(
        task,
        toolName,
        executionInput,
        stepId,
        policy.sceneRisk as SceneRiskPolicyResult,
      );
      if (gatedOutput) {
        const call = this.toolCallFactory.buildToolCall({
          id: callId,
          stepId,
          toolName,
          status: 'succeeded',
          input: executionInput,
          output: this.withReliabilityOutput(gatedOutput, reliability),
          error: null,
          startedAt,
        });
        await this.recordActionSideEffects(
          task,
          toolName,
          executionInput,
          call,
        );
        await this.createTaskEvent(
          task,
          AgentTaskEventType.ToolReturned,
          buildSocialAgentToolReturnedEvent({
            toolName,
            stepId,
            toolCallId: callId,
            inputSummary,
            call,
            pendingApproval: true,
          }),
        );
        await this.createTaskEvent(
          task,
          AgentTaskEventType.StepCompleted,
          buildSocialAgentStepCompletedEvent({
            toolName,
            stepId,
            toolCallId: callId,
            call,
            pendingApproval: true,
          }),
        );
        return call;
      }
      this.toolExecutionPolicy.assertToolAllowed({
        mode: task.permissionMode,
        step,
        toolName,
      });
      this.confirmationPolicy.assertAgentConnectionBound(
        task,
        toolName,
        executionInput,
      );
      const output = await this.dispatchToolWithReliability(
        task,
        toolName,
        executionInput,
        stepId,
        reliability,
      );
      const outputRecord = this.withReliabilityOutput(
        this.toolInput.asRecord(output),
        reliability,
      );
      const call = this.toolCallFactory.buildToolCall({
        id: callId,
        stepId,
        toolName,
        status: 'succeeded',
        input: executionInput,
        output: outputRecord,
        error: null,
        startedAt,
      });
      await this.recordActionSideEffects(task, toolName, executionInput, call);
      await this.createTaskEvent(
        task,
        AgentTaskEventType.ToolReturned,
        buildSocialAgentToolReturnedEvent({
          toolName,
          stepId,
          toolCallId: callId,
          inputSummary,
          call,
        }),
      );
      await this.createTaskEvent(
        task,
        AgentTaskEventType.StepCompleted,
        buildSocialAgentStepCompletedEvent({
          toolName,
          stepId,
          toolCallId: callId,
          call,
        }),
      );
      return call;
    } catch (error) {
      const blocked = error instanceof ForbiddenException;
      const call = this.toolCallFactory.buildToolCall({
        id: callId,
        stepId,
        toolName,
        status: blocked ? 'blocked' : 'failed',
        input: executionInput,
        output: null,
        error: this.reliableErrorPayload(error, reliability),
        startedAt,
      });
      this.logToolFailure(task, toolName, stepId, call, error);
      try {
        await this.recordActionSideEffects(
          task,
          toolName,
          executionInput,
          call,
        );
      } catch (sideEffectError) {
        call.error = {
          ...(call.error ?? {}),
          sideEffectError: this.toolInput.errorPayload(sideEffectError),
        };
      }
      await this.createTaskEvent(
        task,
        AgentTaskEventType.ToolFailed,
        buildSocialAgentToolFailedEvent({
          toolName,
          stepId,
          toolCallId: callId,
          inputSummary,
          call,
        }),
      );
      return call;
    }
  }

  private async dispatchTool(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    switch (toolName) {
      case SocialAgentToolName.GetMyProfile:
      case SocialAgentToolName.GetAiProfile:
        return this.socialProfiles.get(
          this.toolInput.number(input.userId) ?? task.ownerUserId,
        );
      case SocialAgentToolName.GenerateProfileQuestions:
        return this.socialProfiles.generateQuestions(task.ownerUserId);
      case SocialAgentToolName.UpdateAiProfileFromAnswers:
        return this.updateAiProfileFromAnswers(task.ownerUserId, input);
      case SocialAgentToolName.UpdateProfileFromAgentContext:
        return this.updateProfileFromAgentContext(task, input);
      case SocialAgentToolName.GetCurrentTaskMemory:
        return this.taskMemory.currentTaskMemory(task);
      case SocialAgentToolName.PublishSocialRequest:
        return this.createSocialRequest(task, {
          ...input,
          mode: input.mode ?? 'publish',
          publish: input.publish ?? true,
        });
      case SocialAgentToolName.CreateSocialRequest:
        return this.createSocialRequest(task, input);
      case SocialAgentToolName.SearchPublicIntents:
        return this.searchPublicIntents(task, input);
      case SocialAgentToolName.SearchActivities:
        return this.searchActivities(task, input);
      case SocialAgentToolName.SearchMatches:
        return this.searchMatches(task, input);
      case SocialAgentToolName.ExplainMatches:
        return this.explainMatches(task, input);
      case SocialAgentToolName.DraftOpener:
        return this.draftOpener(input);
      case SocialAgentToolName.SendMessageToCandidate:
        return this.sendMessageToCandidate(task, input, stepId);
      case SocialAgentToolName.SendMessage:
        return this.sendMessage(task, input, stepId);
      case SocialAgentToolName.ConnectCandidate:
        return this.connectCandidate(task, input, stepId);
      case SocialAgentToolName.AddFriend:
        return this.addFriend(task, input, stepId);
      case SocialAgentToolName.CreateActivity:
      case SocialAgentToolName.InviteActivity:
      case SocialAgentToolName.OfflineMeeting:
        return this.createActivity(task, input, toolName, stepId);
      case SocialAgentToolName.ShareLocation:
        return this.shareLocation(task, input);
      case SocialAgentToolName.JoinActivity:
        return this.joinActivity(task, input);
      case SocialAgentToolName.SaveCandidate:
        return this.saveCandidate(task, input);
      case SocialAgentToolName.GetConversations:
        return this.inboxTools.getConversations(task, input);
      case SocialAgentToolName.GetAgentInbox:
        return this.inboxTools.getAgentInbox(task, input);
      case SocialAgentToolName.WriteInbox:
        return this.inboxTools.writeInbox(task, input, stepId);
      case SocialAgentToolName.ReadInbox:
        return this.inboxTools.readInbox(task, input);
      case SocialAgentToolName.GetPendingApprovals:
        return this.getPendingApprovals(task, input);
      case SocialAgentToolName.ApproveAction:
        return this.approveAction(task, input);
      case SocialAgentToolName.RejectAction:
        return this.rejectAction(task, input);
      case SocialAgentToolName.ReadLongTermMemory:
        return this.longTermMemory.readSnapshot(task.ownerUserId);
      case SocialAgentToolName.SummarizeCurrentTask:
        return this.summarizeCurrentTask(task, input);
      case SocialAgentToolName.GetCandidatePoolDebug:
        return this.getCandidatePoolDebug(task, input);
      case SocialAgentToolName.ReadTaskConversationMessages:
        return this.runConversationTool(
          task,
          await this.conversationTools.readTaskConversationMessages(
            task,
            input,
          ),
          stepId,
        );
      case SocialAgentToolName.SummarizeReply:
        return this.runConversationTool(
          task,
          await this.conversationTools.summarizeReply(task, input),
          stepId,
        );
      case SocialAgentToolName.DecideNextSocialAction:
        return this.runDecisionTool(
          task,
          await this.decisionTools.decideNextSocialAction(task, input),
        );
      case SocialAgentToolName.ReplyMessage:
        return this.replyMessage(task, input, stepId);
      case SocialAgentToolName.Payment:
        return this.recordPaymentIntent(task, input, stepId);
    }
    return assertUnreachableSocialAgentToolName(toolName);
  }

  private async maybeGateActionByRisk(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    stepId: string,
    policy: SceneRiskPolicyResult,
  ): Promise<Record<string, unknown> | null> {
    if (this.isDraftOnlySocialRequestTool(toolName, input)) return null;

    const decision = buildSocialAgentRiskGateDecision({
      task,
      toolName,
      toolInput: input,
      stepId,
      policy,
      hasUserApproval:
        this.confirmationPolicy.hasExplicitApprovalCredential(input),
    });

    if (decision.kind === 'none') return null;
    if (decision.kind === 'simulated') return decision.output;

    const approval = await this.approvals.create(decision.approvalInput);
    return buildSocialAgentPendingApprovalOutput({
      approval,
      policy: decision.policy,
    });
  }

  private isDraftOnlySocialRequestTool(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): boolean {
    if (toolName !== SocialAgentToolName.CreateSocialRequest) return false;
    const mode = this.toolInput.string(input.mode ?? input.intent);
    return (
      mode === 'ai_draft' ||
      mode === 'private_draft' ||
      mode === 'draft_only' ||
      mode === 'draft'
    );
  }

  private async updateAiProfileFromAnswers(
    ownerUserId: number,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const answers = Array.isArray(input.answers) ? input.answers : [];
    let latest: unknown = null;
    for (const raw of answers) {
      if (!this.toolInput.isRecord(raw)) continue;
      const key = this.toolInput.string(raw.key);
      const answer = this.toolInput.string(raw.answer ?? raw.value);
      if (!key || !answer) continue;
      latest = await this.socialProfiles.saveAnswer(ownerUserId, key, answer);
    }
    if (latest) return latest;

    if (this.toolInput.isRecord(input.profile)) {
      return this.socialProfiles.saveAiDraft(ownerUserId, {
        profile: input.profile as never,
        enableMatching: this.toolInput.bool(input.enableMatching),
        sensitiveTagsConfirmed: this.toolInput.bool(
          input.sensitiveTagsConfirmed,
        ),
        sensitiveTagDecisions: this.toolInput.isRecord(
          input.sensitiveTagDecisions,
        )
          ? (input.sensitiveTagDecisions as never)
          : undefined,
      });
    }

    if (typeof input.rawText === 'string' || answers.length > 0) {
      const draft = await this.socialProfiles.generateAiDraft(ownerUserId, {
        rawText: this.toolInput.string(input.rawText),
        answers: answers as never,
        source: 'social_agent_tool_executor',
      });
      return this.socialProfiles.saveAiDraft(ownerUserId, {
        profile: draft.draft,
        enableMatching: this.toolInput.bool(input.enableMatching),
        sensitiveTagsConfirmed: this.toolInput.bool(
          input.sensitiveTagsConfirmed,
        ),
      });
    }

    throw new BadRequestException('answers, profile, or rawText is required');
  }

  private async updateProfileFromAgentContext(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const patch = buildSocialAgentProfileContextPatch(input);

    const saved =
      Object.keys(patch.dto).length > 0
        ? await this.socialProfiles.upsert(task.ownerUserId, patch.dto)
        : await this.socialProfiles.get(task.ownerUserId);
    await this.createTaskEvent(
      task,
      AgentTaskEventType.SocialAgentContextAppended,
      {
        summary: 'Updated social profile from agent context',
        payload: {
          extractedProfile: patch.extractedProfile,
          updatedFields: patch.updatedFields,
          memoryFields: patch.memoryFields,
          missingFields: patch.missingFields,
          sourceMessage: patch.sourceMessage,
        },
      },
    );
    return {
      success: true,
      updatedFields: patch.updatedFields,
      memoryFields: patch.memoryFields,
      missingFields: patch.missingFields,
      profile: saved,
    };
  }

  private async createSocialRequest(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const parsed = buildSocialAgentSocialRequestToolInput(
      task,
      input,
      this.toolInput,
    );
    const agent = await this.loadAgentConnection(task.agentConnectionId);

    if (parsed.shouldCreateDraft) {
      return this.socialRequests.aiDraft(task.ownerUserId, parsed.rawText, {
        agentTaskId: task.id,
        agentId: task.agentConnectionId,
        source: 'social_agent_tool_executor',
      });
    }

    if (parsed.shouldCreateFromNaturalLanguage) {
      return this.socialRequests.createFromNaturalLanguage(
        parsed.rawText,
        task.ownerUserId,
        agent,
      );
    }

    const request = parsed.socialRequestId
      ? await this.socialRequests.update(
          parsed.socialRequestId,
          task.ownerUserId,
          parsed.dto as UpdateSocialRequestDto,
          agent,
        )
      : await this.socialRequests.create(task.ownerUserId, parsed.dto, {
          agent,
        });

    if (!parsed.shouldSyncPublicIntent) {
      return buildSocialAgentSocialRequestResult({
        request: this.toolInput.asRecord(request),
        asRecord: (value) => this.toolInput.asRecord(value),
      });
    }

    const publicIntent = await this.socialRequests.syncPublicIntentById(
      request.id,
      task.ownerUserId,
    );
    return buildSocialAgentSocialRequestResult({
      request: this.toolInput.asRecord(request),
      publicIntent: this.toolInput.asRecord(publicIntent),
      asRecord: (value) => this.toolInput.asRecord(value),
    });
  }

  private async searchMatches(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const socialRequestId = this.toolInput.number(
      input.socialRequestId ?? input.requestId,
    );
    return this.candidatePool.searchSocial({
      ownerUserId: task.ownerUserId,
      socialRequestId,
      city: sanitizeCity(input.city),
      activityType: this.toolInput.string(input.activityType),
      interestTags: this.toolInput.stringArray(
        input.interestTags ?? input.tags,
      ),
      timePreference: this.toolInput.string(input.timePreference),
      locationPreference: this.toolInput.string(input.locationPreference),
      rawText: this.toolInput.string(
        input.rawText ?? input.goal ?? input.message,
      ),
      limit: this.toolInput.number(input.limit) ?? undefined,
    });
  }

  private async searchPublicIntents(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = this.toolInput.asRecord(
      await this.searchMatches(task, input),
    );
    const candidates = Array.isArray(result.candidates)
      ? result.candidates.filter(
          (candidate) =>
            this.toolInput.isRecord(candidate) &&
            candidate.source === 'public_intent',
        )
      : [];
    return {
      ...result,
      candidates,
      publicIntents: candidates,
      emptyReason: candidates.length === 0 ? 'no_real_candidates' : null,
      message:
        candidates.length === 0 ? '当前没有找到符合条件的公开约练卡片。' : '',
    };
  }

  private async searchActivities(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await this.candidatePool.searchActivity({
      ownerUserId: task.ownerUserId,
      taskId: task.id,
      city: sanitizeCity(input.city),
      activityType: this.toolInput.string(input.activityType),
      interestTags: this.toolInput.stringArray(
        input.interestTags ?? input.tags,
      ),
      timePreference: this.toolInput.string(input.timePreference),
      locationPreference: this.toolInput.string(input.locationPreference),
      rawText: this.toolInput.string(
        input.rawText ?? input.goal ?? input.message,
      ),
      limit: this.toolInput.number(input.limit) ?? undefined,
    });
    return {
      ...result,
      activities: result.activityResults,
    };
  }

  private async explainMatches(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const candidateUserId = this.toolInput.number(
      input.candidateUserId ?? input.targetUserId,
    );
    if (candidateUserId) {
      const [ownerProfile, candidateProfile] = await Promise.all([
        this.socialProfiles.get(task.ownerUserId),
        this.socialProfiles.get(candidateUserId),
      ]);
      return this.matchReasoner.explain({
        ownerProfile,
        candidateProfile,
        publicTags: this.toolInput.isRecord(input.publicTags)
          ? (input.publicTags as never)
          : undefined,
        privatePreferenceSignals: this.toolInput.stringArray(
          input.privatePreferenceSignals,
        ),
        confirmedSensitiveTags: this.toolInput.stringArray(
          input.confirmedSensitiveTags,
        ),
        avoidSignals: this.toolInput.stringArray(input.avoidSignals),
        safetySignals: this.toolInput.stringArray(input.safetySignals),
        scoreBreakdown: this.toolInput.isRecord(input.scoreBreakdown)
          ? (input.scoreBreakdown as never)
          : undefined,
      });
    }

    return {
      explanation: await this.ai.explainMatchFor(
        this.toolInput.isRecord(input.request) ? input.request : {},
        this.toolInput.isRecord(input.candidate) ? input.candidate : {},
        this.toolInput.number(input.score) ?? undefined,
      ),
    };
  }

  private async draftOpener(input: Record<string, unknown>): Promise<unknown> {
    const candidate = this.toolInput.isRecord(input.candidate)
      ? input.candidate
      : input;
    const message = await this.ai.generateInviteMessage(
      this.toolInput.isRecord(input.request) ? input.request : input,
      candidate,
    );
    const displayName =
      this.toolInput.string(candidate.displayName ?? candidate.nickname) ??
      '对方';
    return buildSocialAgentDraftOpenerResult({
      message,
      displayName,
    });
  }

  async resolveCandidateTargetUser(
    input: Record<string, unknown>,
    ownerUserId: number,
  ): Promise<number> {
    return this.targetResolver.resolveCandidateTargetUser(input, ownerUserId);
  }

  private async sendMessageToCandidate(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const targetUserId = await this.resolveCandidateTargetUser(
      input,
      task.ownerUserId,
    );
    const output = this.toolInput.asRecord(
      await this.sendMessage(
        task,
        {
          ...input,
          targetUserId,
        },
        stepId,
      ),
    );
    return buildSocialAgentCandidateMessageActionResult({
      output,
      taskId: task.id,
      targetUserId,
      string: (value) => this.toolInput.string(value),
    });
  }

  private async sendMessage(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const result = await this.messageTools.sendMessage(task, input, stepId);
    if (result.loopUpdates)
      this.taskMemory.rememberConversation(task, result.loopUpdates);
    if (result.sentMessage)
      this.taskMemory.rememberSentMessage(task, result.sentMessage);
    return result.output;
  }

  private async addFriend(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const targetUserId = await this.resolveCandidateTargetUser(
      input,
      task.ownerUserId,
    );
    const friend = await this.friends.ensureFollowing(
      task.ownerUserId,
      targetUserId,
    );
    const friendRecord = this.toolInput.asRecord(friend);
    const rawFriendRequestId =
      friendRecord.friendRequestId ?? friendRecord.followId ?? friendRecord.id;
    const numericFriendRequestId = this.toolInput.number(rawFriendRequestId);
    const friendRequestId =
      this.toolInput.string(rawFriendRequestId) ??
      (numericFriendRequestId != null ? String(numericFriendRequestId) : null);
    if (this.toolInput.bool(input.openConversation) !== true) {
      return buildSocialAgentFriendActionResult({
        friendRecord,
        taskId: task.id,
        targetUserId,
        friendRequestId,
        conversationId: null,
      });
    }

    const conversation = await this.messages.startConversation(
      task.ownerUserId,
      targetUserId,
      this.messageConversationOptions(task, stepId, {
        ...(this.toolInput.isRecord(input.metadata) ? input.metadata : {}),
        toolName: SocialAgentToolName.AddFriend,
        targetUserId,
        candidateRecordId: this.toolInput.number(input.candidateRecordId),
        socialRequestId: this.toolInput.number(
          input.socialRequestId ?? input.requestId,
        ),
      }),
    );
    const conversationId = this.toolInput.string(conversation.conversationId);
    if (conversationId) {
      this.taskMemory.rememberConversation(task, {
        conversationId,
        targetUserId,
        sourceTool: SocialAgentToolName.AddFriend,
      });
    }
    return buildSocialAgentFriendActionResult({
      friendRecord,
      taskId: task.id,
      conversationId: conversationId ?? null,
      targetUserId,
      friendRequestId,
    });
  }

  private async connectCandidate(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const targetUserId = await this.resolveCandidateTargetUser(
      input,
      task.ownerUserId,
    );
    return this.addFriend(
      task,
      {
        ...input,
        targetUserId,
        openConversation: input.openConversation ?? true,
      },
      stepId,
    );
  }

  private async createActivity(
    task: AgentTask,
    input: Record<string, unknown>,
    toolName: SocialAgentToolName,
    stepId: string,
  ): Promise<unknown> {
    const result = await this.activityTools.createActivity(
      task,
      input,
      toolName,
      stepId,
    );
    if (result.loopUpdates)
      this.taskMemory.rememberConversation(task, result.loopUpdates);
    if (result.sentMessage)
      this.taskMemory.rememberSentMessage(task, result.sentMessage);
    return result.output;
  }

  private shareLocation(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      success: false,
      taskId: task.id,
      status: 'not_implemented',
      targetUserId: this.toolInput.number(input.targetUserId) ?? null,
      message:
        'Precise location sharing is not implemented for automatic Agent execution.',
    };
  }

  private async joinActivity(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    return this.activityTools.joinActivity(task, input);
  }

  private async saveCandidate(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const candidateId = this.toolInput.number(
      input.candidateRecordId ?? input.candidateId,
    );
    const socialRequestId = this.toolInput.number(
      input.socialRequestId ?? input.requestId,
    );
    const candidateUserId = this.toolInput.number(
      input.candidateUserId ?? input.targetUserId,
    );

    const row = candidateId
      ? await this.candidateRepo.findOne({ where: { id: candidateId } })
      : socialRequestId && candidateUserId
        ? await this.candidateRepo.findOne({
            where: { socialRequestId, candidateUserId },
          })
        : null;
    if (!row) throw new NotFoundException('Candidate not found');

    row.status = SocialRequestCandidateStatus.Approved;
    const saved = await this.candidateRepo.save(row);
    return { id: saved.id, status: saved.status };
  }

  private async getPendingApprovals(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const limit = this.toolInput.number(input.limit);
    const approvals = await this.approvals.getPending(task.ownerUserId);
    return buildSocialAgentPendingApprovalsToolOutput(approvals, limit);
  }

  private async approveAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const approvalId = readSocialAgentApprovalToolId(input, (value) =>
      this.toolInput.number(value),
    );
    return this.approvals.approve(approvalId, task.ownerUserId, (approval) =>
      this.approvalDispatcher.dispatch(approval),
    );
  }

  private async rejectAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const approvalId = readSocialAgentApprovalToolId(input, (value) =>
      this.toolInput.number(value),
    );
    return this.approvals.reject(approvalId, task.ownerUserId);
  }

  private async summarizeCurrentTask(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const summary = buildSocialAgentCurrentTaskSummary({
      task,
      memory: this.taskMemory.currentTaskMemory(task),
      isRecord: (value): value is Record<string, unknown> =>
        this.toolInput.isRecord(value),
    });
    const shouldPersist = shouldPersistSocialAgentCurrentTaskSummary({
      request: input,
      bool: (value) => this.toolInput.bool(value),
    });
    return {
      summary,
      longTermMemory: shouldPersist
        ? await this.longTermMemory.summarizeTask(task)
        : null,
    };
  }

  private async getCandidatePoolDebug(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const intent =
      this.toolInput.string(input.intent) === 'activity_search'
        ? 'activity_search'
        : 'social_search';
    return this.candidatePool.debugCandidatePool(
      task.ownerUserId,
      this.toolInput.number(input.taskId) ?? task.id,
      intent,
    );
  }

  private async replyMessage(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const result = await this.messageTools.replyMessage(task, input, stepId);
    if (result.loopUpdates)
      this.taskMemory.rememberConversation(task, result.loopUpdates);
    if (result.sentMessage)
      this.taskMemory.rememberSentMessage(task, result.sentMessage);
    if (result.inboxEvent) {
      await this.writeSocialAgentInboxEvent(
        task,
        result.inboxEvent.eventType,
        result.inboxEvent.input,
      );
    }
    return result.output;
  }

  private async runDecisionTool(
    task: AgentTask,
    result: SocialAgentDecisionToolResult,
  ): Promise<unknown> {
    this.taskMemory.rememberConversation(task, result.loopUpdates);
    rememberSocialAgentShortTerm(task, result.shortTermUpdates);
    await this.writeSocialAgentInboxEvent(
      task,
      result.inboxEvent.eventType,
      result.inboxEvent.input,
    );
    return result.output;
  }

  private async runConversationTool(
    task: AgentTask,
    result: SocialAgentConversationToolResult,
    stepId: string,
  ): Promise<unknown> {
    if (result.loopUpdates)
      this.taskMemory.rememberConversation(task, result.loopUpdates);
    if (result.receivedMessages && result.receivedMessages.length > 0) {
      this.taskMemory.rememberReceivedReplies(
        task,
        result.receivedMessages,
        stepId,
      );
    }
    if (result.shortTermUpdates) {
      rememberSocialAgentShortTerm(task, result.shortTermUpdates);
    }
    if (result.taskEvent) {
      await this.createTaskEvent(
        task,
        result.taskEvent.type,
        result.taskEvent.input,
      );
    }
    if (result.inboxEvent) {
      await this.writeSocialAgentInboxEvent(
        task,
        result.inboxEvent.eventType,
        result.inboxEvent.input,
      );
    }
    return result.output;
  }

  private async recordPaymentIntent(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const result = await this.paymentIntentTools.record(task, input, stepId);
    if (result.paymentIntentKeys) {
      this.taskMemory.rememberConversation(task, {
        paymentIntentKeys: result.paymentIntentKeys,
        sourceTool: SocialAgentToolName.Payment,
      });
    }
    return result.output;
  }

  private async executeAdhocStep(
    task: AgentTask,
    step: StepRecord,
  ): Promise<SocialAgentToolCallRecord> {
    const call = await this.executePlanStep(
      task,
      step,
      task.toolCalls?.length ?? 0,
    );
    appendSocialAgentToolCallToTask({ task, call });
    await this.taskRepo.save(task);
    return call;
  }

  private runNextResult(
    task: AgentTask,
    calls: SocialAgentToolCallRecord[],
    handledReply: boolean,
    decision: Record<string, unknown> | null,
  ): SocialAgentRunNextResult {
    return buildSocialAgentRunNextResult({
      task,
      calls,
      handledReply,
      decision,
    });
  }

  private applyRunNextTaskState(
    task: AgentTask,
    state: { status: AgentTaskStatus; statusReason: string },
  ): void {
    task.status = state.status;
    task.statusReason = state.statusReason;
  }

  private applyTaskFailureState(
    task: AgentTask,
    call: SocialAgentToolCallRecord,
  ): void {
    const state = socialAgentTaskFailureState({
      call,
      readErrorText: (value) => this.toolInput.string(value),
    });
    task.status = state.status;
    task.statusReason = state.statusReason;
    task.error = state.error;
  }

  private applyTaskCompletionState(
    task: AgentTask,
    shouldWaitForReply: boolean,
  ): ReturnType<typeof socialAgentTaskCompletionState> {
    const state = socialAgentTaskCompletionState({ shouldWaitForReply });
    task.status = state.status;
    task.completedAt = state.completedAt;
    if ('statusReason' in state) {
      task.statusReason = state.statusReason;
    }
    return state;
  }

  private applyAdhocActionState(
    task: AgentTask,
    state: SocialAgentAdhocActionTaskState,
  ): void {
    task.status = state.status;
    task.statusReason = state.statusReason;
    if ('error' in state) {
      task.error = state.error ?? null;
    }
  }

  private async writeSocialAgentInboxEvent(
    task: AgentTask,
    eventType: string,
    input: SocialAgentInboxEventInput,
  ): Promise<void> {
    const payload = buildSocialAgentInboxEventPayload({
      task,
      eventType,
      inboxEvent: input,
      preview: (value) => this.taskMemory.preview(value),
    });
    if (!payload) return;
    await this.messages.createAgentInboxEvent(payload);
  }

  private async recordActionSideEffects(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    call: SocialAgentToolCallRecord,
  ): Promise<void> {
    const policy =
      await this.toolExecutionPolicy.buildPolicyMetadataWithPatches(
        task,
        toolName,
        input,
      );
    await this.actionSideEffects.record({
      task,
      toolName,
      input,
      call,
      policy,
    });
  }

  private async createTaskEvent(
    task: AgentTask,
    type: AgentTaskEventType,
    input: SocialAgentTaskEventRecordInput,
  ): Promise<void> {
    try {
      await this.eventRepo.save(
        this.eventRepo.create(
          buildSocialAgentTaskEventRecord({
            task,
            type,
            event: input,
            safeVarchar: (value, max) =>
              this.toolCallFactory.safeVarchar(value, max),
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `[SocialAgentToolExecutor] failed to write task event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async loadAgentConnection(
    agentConnectionId: number | null,
  ): Promise<AgentConnection | null> {
    if (!agentConnectionId) return null;
    return this.connectionRepo.findOne({ where: { id: agentConnectionId } });
  }

  private messageConversationOptions(
    task: AgentTask,
    stepId: string,
    metadata: Record<string, unknown> = {},
  ) {
    return buildSocialAgentConversationOptions(task, stepId, metadata);
  }

  private logToolFailure(
    task: AgentTask,
    toolName: SocialAgentToolName,
    stepId: string,
    call: SocialAgentToolCallRecord,
    error: unknown,
  ): void {
    this.logger.error(
      JSON.stringify(
        buildSocialAgentToolFailureLogPayload({
          task,
          toolName,
          stepId,
          call,
        }),
      ),
      error instanceof Error ? error.stack : undefined,
    );
  }

  private logTaskFailure(
    task: AgentTask,
    call: SocialAgentToolCallRecord,
  ): void {
    this.logger.error(
      JSON.stringify(buildSocialAgentTaskFailureLogPayload({ task, call })),
    );
  }
}

function assertUnreachableSocialAgentToolName(toolName: never): never {
  throw new BadRequestException(
    `Unhandled social agent tool ${String(toolName)}`,
  );
}
