import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
import {
  socialAgentAdhocActionCompletionState,
  type SocialAgentAdhocActionTaskState,
  socialAgentUnconfirmedAdhocActionState,
} from './social-agent-adhoc-action-state';
import {
  buildSocialAgentPendingApprovalOutput,
  buildSocialAgentRiskGateDecision,
} from './social-agent-risk-gate.presenter';

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
    const task = await this.taskRepo.findOne({
      where: ownerUserId ? { id: taskId, ownerUserId } : { id: taskId },
    });
    if (!task) throw new NotFoundException(`Agent task ${taskId} not found`);

    task.status = AgentTaskStatus.Executing;
    task.startedAt = task.startedAt ?? new Date();
    task.statusReason = null;
    await this.taskRepo.save(task);

    const normalizedToolName = this.toolCallFactory.normalizeToolName(toolName);
    if (!normalizedToolName) {
      throw new BadRequestException(`Unknown tool ${String(toolName)}`);
    }

    const actionInput = this.confirmationPolicy.withAdhocConfirmationMetadata(
      normalizedToolName,
      input,
      ownerUserId,
    );
    const stepId = `action_${normalizedToolName}_${Date.now()}`;
    const unconfirmedDangerousAction =
      await this.rejectUnconfirmedAdhocDangerousAction(
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

  private async executePlanStep(
    task: AgentTask,
    step: StepRecord,
    index: number,
  ): Promise<SocialAgentToolCallRecord> {
    const stepId = this.toolCallFactory.stepId(step) || `step_${index + 1}`;
    const toolName = this.toolCallFactory.resolveToolName(step);
    const input = this.toolCallFactory.stepInput(step);
    const startedAt = new Date();
    const callId = this.toolCallFactory.safeToolCallId(
      task.id,
      toolName,
      startedAt,
    );
    const policy = this.toolExecutionPolicy.buildPolicyMetadata(
      task,
      toolName,
      input,
    );

    await this.createTaskEvent(
      task,
      AgentTaskEventType.StepStarted,
      buildSocialAgentStepStartedEvent({
        toolName,
        stepId,
        toolCallId: callId,
        input,
      }),
    );
    await this.createTaskEvent(
      task,
      AgentTaskEventType.ToolCalled,
      buildSocialAgentToolCalledEvent({
        toolName,
        stepId,
        toolCallId: callId,
        input,
        policy,
      }),
    );
    const inputSummary = this.taskMemory.preview(
      this.toolInput.safeUnknownText(input),
      240,
    );

    try {
      this.toolExecutionPolicy.assertToolAllowed({
        mode: task.permissionMode,
        step,
        toolName,
      });
      this.toolExecutionPolicy.assertHighRiskFrequencyLimit(task, toolName);
      this.confirmationPolicy.assertAgentConnectionBound(task, toolName, input);
      const gatedOutput = await this.maybeGateActionByRisk(
        task,
        toolName,
        input,
        stepId,
        policy.sceneRisk as SceneRiskPolicyResult,
      );
      if (gatedOutput) {
        const call = this.toolCallFactory.buildToolCall({
          id: callId,
          stepId,
          toolName,
          status: 'succeeded',
          input,
          output: gatedOutput,
          error: null,
          startedAt,
        });
        await this.recordActionSideEffects(task, toolName, input, call);
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
      const output = await this.dispatchTool(task, toolName, input, stepId);
      const outputRecord = this.toolInput.asRecord(output);
      const call = this.toolCallFactory.buildToolCall({
        id: callId,
        stepId,
        toolName,
        status: 'succeeded',
        input,
        output: outputRecord,
        error: null,
        startedAt,
      });
      await this.recordActionSideEffects(task, toolName, input, call);
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
        input,
        output: null,
        error: this.toolInput.errorPayload(error),
        startedAt,
      });
      this.logToolFailure(task, toolName, stepId, call, error);
      try {
        await this.recordActionSideEffects(task, toolName, input, call);
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
    const decision = buildSocialAgentRiskGateDecision({
      task,
      toolName,
      toolInput: input,
      stepId,
      policy,
      hasUserApproval: this.confirmationPolicy.hasUserApproval(input),
    });

    if (decision.kind === 'none') return null;
    if (decision.kind === 'simulated') return decision.output;

    const approval = await this.approvals.create(decision.approvalInput);
    return buildSocialAgentPendingApprovalOutput({ approval, policy });
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
      return {
        ...this.toolInput.asRecord(request),
        socialRequest: request,
        socialRequestId: request.id,
      };
    }

    const publicIntent = await this.socialRequests.syncPublicIntentById(
      request.id,
      task.ownerUserId,
    );
    return {
      ...this.toolInput.asRecord(request),
      socialRequest: request,
      socialRequestId: request.id,
      publicIntent,
      publicIntentId: publicIntent.id,
      publicIntentStatus: publicIntent.status,
      synced: true,
    };
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
    return {
      message,
      confirmation: {
        actionType: 'send_message',
        title: `这条消息会发送给${displayName}`,
        body: '我先帮你写好了，你确认后我再发。确认前不会发送、加好友或创建活动。',
        primaryAction: '确认发送',
        secondaryActions: ['语气更自然', '更简短', '重新生成', '取消'],
        safetyBoundary:
          '建议先站内沟通，第一次见面选择公共场所，不急着交换联系方式。',
      },
      meetLoopStage: 'opener_drafted',
      nextStep: 'user_confirmation_required',
    };
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
    const messageId =
      this.toolInput.string(output.id ?? output.messageId) ?? null;
    const conversationId = this.toolInput.string(output.conversationId) ?? null;
    return {
      ...output,
      success: true,
      taskId: task.id,
      targetUserId,
      candidateUserId: targetUserId,
      messageId,
      conversationId,
      status: output.skipped ? 'skipped' : 'sent',
      messageAction: {
        status: output.skipped ? 'skipped' : 'sent',
        messageId,
        conversationId,
      },
    };
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
    return { approvals: limit ? approvals.slice(0, limit) : approvals };
  }

  private async approveAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const approvalId = this.toolInput.number(input.approvalId ?? input.id);
    if (!approvalId) throw new BadRequestException('approvalId is required');
    return this.approvals.approve(approvalId, task.ownerUserId, (approval) =>
      this.approvalDispatcher.dispatch(approval),
    );
  }

  private async rejectAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const approvalId = this.toolInput.number(input.approvalId ?? input.id);
    if (!approvalId) throw new BadRequestException('approvalId is required');
    return this.approvals.reject(approvalId, task.ownerUserId);
  }

  private async summarizeCurrentTask(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const memory = this.taskMemory.currentTaskMemory(task);
    const summary = {
      taskId: task.id,
      title: task.title,
      goal: task.goal,
      status: task.status,
      statusReason: task.statusReason,
      permissionMode: task.permissionMode,
      riskLevel: task.riskLevel,
      plan: Array.isArray(task.plan) ? task.plan.slice(-10) : [],
      recentToolCalls: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-10)
        : [],
      result: this.toolInput.isRecord(task.result) ? task.result : {},
      memory,
    };
    const shouldPersist = this.toolInput.bool(
      input.persistLongTerm ?? input.writeLongTerm,
    );
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
    const policy = this.toolExecutionPolicy.buildPolicyMetadata(
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
