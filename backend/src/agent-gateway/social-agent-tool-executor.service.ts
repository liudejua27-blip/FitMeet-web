import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AIService } from '../ai/ai.service';
import { ActivitiesService } from '../activities/activities.service';
import { CreateActivityDto } from '../activities/dto/activity.dto';
import { SocialActivity } from '../activities/entities/activity.entity';
import { ActivityType } from '../activities/entities/activity-template.entity';
import { FriendsService } from '../friends/friends.service';
import { MatchService } from '../match/match.service';
import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
} from '../match/social-request-candidate.entity';
import { MessagesService } from '../messages/messages.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { UpdateSocialRequestDto } from '../social-requests/dto/update-social-request.dto';
import {
  SocialRequestType,
  UserSocialRequest,
} from '../social-requests/social-request.entity';
import { SocialRequestsService } from '../social-requests/social-requests.service';
import { SocialProfileService } from '../users/social-profile.service';
import { UpdateSocialProfileDto } from '../users/dto/update-social-profile.dto';
import { User } from '../users/user.entity';
import { SafetyService } from '../safety/safety.service';
import { AgentActionLogService } from './agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  PaymentIntent,
  PaymentIntentStatus,
} from './entities/payment-intent.entity';
import { MatchReasonerService } from './match-reasoner.service';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { AgentApprovalService } from './agent-approval.service';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import {
  appendShortTermMemoryItem,
  readSocialAgentTaskMemory,
  rememberSocialAgentShortTerm,
  shortTermMemoryList,
} from './social-agent-memory.util';
import { sanitizeCity } from '../common/city.util';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  SocialAgentModelRouterService,
  SocialAgentModelUseCase,
} from './social-agent-model-router.service';

export enum SocialAgentToolName {
  GetMyProfile = 'get_my_profile',
  GetAiProfile = 'get_ai_profile',
  GenerateProfileQuestions = 'generate_profile_questions',
  UpdateAiProfileFromAnswers = 'update_ai_profile_from_answers',
  UpdateProfileFromAgentContext = 'update_profile_from_agent_context',
  GetCurrentTaskMemory = 'get_current_task_memory',
  PublishSocialRequest = 'publish_social_request',
  CreateSocialRequest = 'create_social_request',
  SearchPublicIntents = 'search_public_intents',
  SearchActivities = 'search_activities',
  SearchMatches = 'search_matches',
  ExplainMatches = 'explain_matches',
  DraftOpener = 'draft_opener',
  SendMessageToCandidate = 'send_message_to_candidate',
  SendMessage = 'send_message',
  ConnectCandidate = 'connect_candidate',
  AddFriend = 'add_friend',
  CreateActivity = 'create_activity',
  JoinActivity = 'join_activity',
  InviteActivity = 'invite_activity',
  SaveCandidate = 'save_candidate',
  GetConversations = 'get_conversations',
  GetAgentInbox = 'get_agent_inbox',
  WriteInbox = 'write_inbox',
  ReadInbox = 'read_inbox',
  GetPendingApprovals = 'get_pending_approvals',
  ApproveAction = 'approve_action',
  RejectAction = 'reject_action',
  ReadLongTermMemory = 'read_long_term_memory',
  SummarizeCurrentTask = 'summarize_current_task',
  GetCandidatePoolDebug = 'get_candidate_pool_debug',
  ReadTaskConversationMessages = 'read_task_conversation_messages',
  SummarizeReply = 'summarize_reply',
  DecideNextSocialAction = 'decide_next_social_action',
  ReplyMessage = 'reply_message',
  OfflineMeeting = 'offline_meeting',
  Payment = 'payment',
}

export type SocialAgentToolCallStatus = 'succeeded' | 'failed' | 'blocked';

export interface SocialAgentToolCallRecord extends Record<string, unknown> {
  id: string;
  stepId: string;
  toolName: SocialAgentToolName;
  status: SocialAgentToolCallStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface SocialAgentTaskExecutionResult {
  taskId: number;
  executedSteps: number;
  succeededSteps: number;
  failedSteps: number;
  blockedSteps: number;
  toolCalls: SocialAgentToolCallRecord[];
}

export interface SocialAgentRunNextResult extends SocialAgentTaskExecutionResult {
  status: AgentTaskStatus;
  handledReply: boolean;
  decision: Record<string, unknown> | null;
}

type StepRecord = Record<string, unknown>;

type AgentMessageRecord = Record<string, unknown> & {
  id?: string;
  conversationId?: string;
  text?: string;
  senderId?: number;
  senderType?: string;
};

type SocialLoopMemory = Record<string, unknown> & {
  taskId?: number;
  conversationId?: string;
  targetUserId?: number | null;
  lastMessageId?: string | null;
  lastAgentMessageId?: string | null;
  lastReceivedMessageId?: string | null;
  lastReadMessageId?: string | null;
  pendingMessageId?: string | null;
  latestReceivedMessage?: AgentMessageRecord | null;
  latestReceivedMessages?: AgentMessageRecord[];
  replySummary?: Record<string, unknown> | null;
  nextActionDecision?: Record<string, unknown> | null;
  processedMessageIds?: string[];
  sentMessageKeys?: string[];
  activityInviteKeys?: string[];
  paymentIntentKeys?: string[];
};

type ExecuteTaskOptions = {
  maxSteps?: number;
  stopOnError?: boolean;
};

type ToolAuditDetails = {
  userId: number;
  agentTaskId: number;
  toolName: SocialAgentToolName;
  inputSummary: string;
  outputSummary: string;
  riskLevel: AgentActionRiskLevel;
  requiresApproval: boolean;
  approvalId: number | null;
  status: SocialAgentToolCallStatus;
  error: Record<string, unknown> | null;
  createdAt: string;
};

const HIGH_RISK_TOOL_DAILY_LIMITS: Partial<
  Record<SocialAgentToolName, number>
> = {
  [SocialAgentToolName.OfflineMeeting]: 3,
  [SocialAgentToolName.Payment]: 3,
};

@Injectable()
export class SocialAgentToolExecutorService {
  private readonly logger = new Logger(SocialAgentToolExecutorService.name);
  private toolCallSequence = 0;

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(UserSocialRequest)
    private readonly userSocialRequestRepo: Repository<UserSocialRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepo: Repository<PaymentIntent>,
    private readonly config: ConfigService,
    private readonly actionLogs: AgentActionLogService,
    private readonly permissions: AgentPermissionService,
    private readonly toolRegistry: FitMeetAgentToolRegistryService,
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
    private readonly activities: ActivitiesService,
    private readonly safety: SafetyService,
    @Optional()
    private readonly modelRouter?: SocialAgentModelRouterService,
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
      if (!this.shouldExecuteStep(step)) continue;

      const call = await this.executePlanStep(task, step, index);
      executedCalls.push(call);
      plan[index] = this.withStepResult(step, call);
      task.plan = plan;
      task.toolCalls = [...(task.toolCalls ?? []), call];
      task.result = {
        ...(task.result ?? {}),
        lastToolCall: call,
        updatedAt: new Date().toISOString(),
      };

      if (call.status === 'failed' || call.status === 'blocked') {
        task.status = AgentTaskStatus.Failed;
        task.statusReason =
          this.string(call.error?.message) ??
          this.string(call.error?.code) ??
          call.status;
        task.error = call.error;
        await this.taskRepo.save(task);
        this.logTaskFailure(task, call);
        if (stopOnError) break;
      } else {
        await this.taskRepo.save(task);
      }
    }

    const failedSteps = executedCalls.filter(
      (call) => call.status === 'failed',
    ).length;
    const blockedSteps = executedCalls.filter(
      (call) => call.status === 'blocked',
    ).length;
    const succeededSteps = executedCalls.filter(
      (call) => call.status === 'succeeded',
    ).length;
    if (
      failedSteps + blockedSteps === 0 &&
      this.hasNoRemainingExecutableSteps(task.plan)
    ) {
      if (this.shouldWaitForReply(task)) {
        task.status = AgentTaskStatus.WaitingReply;
        task.statusReason = 'waiting_for_counterpart_reply';
        task.completedAt = null;
      } else {
        task.status = AgentTaskStatus.Succeeded;
        task.completedAt = new Date();
      }
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      if (task.status === AgentTaskStatus.Succeeded) {
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
      executedSteps: executedCalls.length,
      succeededSteps,
      failedSteps,
      blockedSteps,
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

    const newMessages = this.messageArray(readCall.output?.newMessages);
    if (readCall.status !== 'succeeded' || newMessages.length === 0) {
      task.status = AgentTaskStatus.WaitingReply;
      task.statusReason =
        newMessages.length === 0 ? 'no_new_reply' : 'reply_read_failed';
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
      task.status = AgentTaskStatus.WaitingReply;
      task.statusReason = 'reply_summary_failed';
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
    const nextAction = this.string(decision?.nextAction);
    if (nextAction === 'stop') {
      task.status = AgentTaskStatus.WaitingReply;
      task.statusReason = 'next_action_stop';
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      return this.runNextResult(task, calls, true, decision ?? null);
    }

    const nextToolName = this.normalizeToolName(decision?.toolName);
    if (decisionCall.status !== 'succeeded' || !nextToolName) {
      task.status = AgentTaskStatus.WaitingReply;
      task.statusReason = 'next_action_not_executable';
      rememberSocialAgentShortTerm(task, {});
      await this.taskRepo.save(task);
      return this.runNextResult(task, calls, true, decision ?? null);
    }

    const actionCall = await this.executeAdhocStep(task, {
      id: `run_next_${nextToolName}`,
      toolName: nextToolName,
      action: decision?.action,
      status: 'planned',
      input: this.isRecord(decision?.input) ? decision.input : {},
    });
    calls.push(actionCall);

    task.status =
      actionCall.status === 'succeeded'
        ? AgentTaskStatus.WaitingReply
        : AgentTaskStatus.WaitingResult;
    task.statusReason =
      actionCall.status === 'succeeded'
        ? 'next_action_executed_waiting_reply'
        : 'next_action_needs_attention';
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
    const stepIndex = plan.findIndex((step) => this.stepId(step) === stepId);
    if (stepIndex < 0)
      throw new NotFoundException(`Agent plan step ${stepId} not found`);

    const call = await this.executePlanStep(task, plan[stepIndex], stepIndex);
    plan[stepIndex] = this.withStepResult(plan[stepIndex], call);
    task.plan = plan;
    task.toolCalls = [...(task.toolCalls ?? []), call];
    task.result = {
      ...(task.result ?? {}),
      lastToolCall: call,
      updatedAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {});
    await this.taskRepo.save(task);
    return call;
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

    const normalizedToolName = this.normalizeToolName(toolName);
    if (!normalizedToolName) {
      throw new BadRequestException(`Unknown tool ${String(toolName)}`);
    }

    const actionInput = this.withAdhocConfirmationMetadata(
      normalizedToolName,
      input,
      ownerUserId,
    );
    const stepId = `action_${normalizedToolName}_${Date.now()}`;
    const call = await this.executeAdhocStep(task, {
      id: stepId,
      toolName: normalizedToolName,
      status: 'planned',
      input: actionInput,
    });

    if (call.status === 'succeeded') {
      task.status = this.shouldWaitForReply(task)
        ? AgentTaskStatus.WaitingReply
        : AgentTaskStatus.WaitingResult;
      task.statusReason = this.shouldWaitForReply(task)
        ? 'action_executed_waiting_reply'
        : 'action_executed_waiting_result';
    } else {
      task.status = AgentTaskStatus.WaitingResult;
      task.statusReason = this.string(call.error?.message) ?? call.status;
      task.error = call.error;
    }
    rememberSocialAgentShortTerm(task, {});
    await this.taskRepo.save(task);
    return call;
  }

  private async executePlanStep(
    task: AgentTask,
    step: StepRecord,
    index: number,
  ): Promise<SocialAgentToolCallRecord> {
    const stepId = this.stepId(step) || `step_${index + 1}`;
    const toolName = this.resolveToolName(step);
    const input = this.stepInput(step);
    const startedAt = new Date();
    const callId = this.safeToolCallId(task.id, toolName, startedAt);

    await this.createTaskEvent(task, AgentTaskEventType.StepStarted, {
      summary: `Started ${toolName}`,
      stepId,
      toolCallId: callId,
      payload: { toolName, input },
    });
    await this.createTaskEvent(task, AgentTaskEventType.ToolCalled, {
      summary: `Called ${toolName}`,
      stepId,
      toolCallId: callId,
      payload: {
        toolName,
        input,
        policy: this.toolPolicyMetadata(task, toolName),
      },
    });

    try {
      this.assertToolAllowed(task.permissionMode, step, toolName);
      this.assertHighRiskFrequencyLimit(task, toolName);
      this.assertAgentConnectionBound(task, toolName, input);
      const output = await this.dispatchTool(task, toolName, input, stepId);
      const outputRecord = this.asRecord(output);
      const call = this.buildToolCall({
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
      await this.createTaskEvent(task, AgentTaskEventType.ToolReturned, {
        summary: `${toolName} succeeded`,
        stepId,
        toolCallId: callId,
        payload: {
          toolName,
          inputSummary: this.preview(this.safeUnknownText(input), 240),
          status: call.status,
          output: call.output,
          error: null,
        },
      });
      await this.createTaskEvent(task, AgentTaskEventType.StepCompleted, {
        summary: `Completed ${toolName}`,
        stepId,
        toolCallId: callId,
        payload: { status: call.status },
      });
      return call;
    } catch (error) {
      const blocked = error instanceof ForbiddenException;
      const call = this.buildToolCall({
        id: callId,
        stepId,
        toolName,
        status: blocked ? 'blocked' : 'failed',
        input,
        output: null,
        error: this.errorPayload(error),
        startedAt,
      });
      this.logToolFailure(task, toolName, stepId, call, error);
      try {
        await this.recordActionSideEffects(task, toolName, input, call);
      } catch (sideEffectError) {
        call.error = {
          ...(call.error ?? {}),
          sideEffectError: this.errorPayload(sideEffectError),
        };
      }
      await this.createTaskEvent(task, AgentTaskEventType.ToolFailed, {
        summary: `${toolName} ${call.status}`,
        stepId,
        toolCallId: callId,
        payload: {
          toolName,
          inputSummary: this.preview(this.safeUnknownText(input), 240),
          status: call.status,
          output: null,
          error: call.error,
        },
      });
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
          this.number(input.userId) ?? task.ownerUserId,
        );
      case SocialAgentToolName.GenerateProfileQuestions:
        return this.socialProfiles.generateQuestions(task.ownerUserId);
      case SocialAgentToolName.UpdateAiProfileFromAnswers:
        return this.updateAiProfileFromAnswers(task.ownerUserId, input);
      case SocialAgentToolName.UpdateProfileFromAgentContext:
        return this.updateProfileFromAgentContext(task, input);
      case SocialAgentToolName.GetCurrentTaskMemory:
        return this.getCurrentTaskMemory(task);
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
      case SocialAgentToolName.JoinActivity:
        return this.joinActivity(task, input);
      case SocialAgentToolName.SaveCandidate:
        return this.saveCandidate(task, input);
      case SocialAgentToolName.GetConversations:
        return this.getConversations(task, input);
      case SocialAgentToolName.GetAgentInbox:
        return this.getAgentInbox(task, input);
      case SocialAgentToolName.WriteInbox:
        return this.writeInbox(task, input, stepId);
      case SocialAgentToolName.ReadInbox:
        return this.readInbox(task, input);
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
        return this.readTaskConversationMessages(task, input, stepId);
      case SocialAgentToolName.SummarizeReply:
        return this.summarizeReply(task, input);
      case SocialAgentToolName.DecideNextSocialAction:
        return this.decideNextSocialAction(task, input);
      case SocialAgentToolName.ReplyMessage:
        return this.replyMessage(task, input, stepId);
      case SocialAgentToolName.Payment:
        return this.recordPaymentIntent(task, input, stepId);
    }
  }

  private async updateAiProfileFromAnswers(
    ownerUserId: number,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const answers = Array.isArray(input.answers) ? input.answers : [];
    let latest: unknown = null;
    for (const raw of answers) {
      if (!this.isRecord(raw)) continue;
      const key = this.string(raw.key);
      const answer = this.string(raw.answer ?? raw.value);
      if (!key || !answer) continue;
      latest = await this.socialProfiles.saveAnswer(ownerUserId, key, answer);
    }
    if (latest) return latest;

    if (this.isRecord(input.profile)) {
      return this.socialProfiles.saveAiDraft(ownerUserId, {
        profile: input.profile as never,
        enableMatching: this.bool(input.enableMatching),
        sensitiveTagsConfirmed: this.bool(input.sensitiveTagsConfirmed),
        sensitiveTagDecisions: this.isRecord(input.sensitiveTagDecisions)
          ? (input.sensitiveTagDecisions as never)
          : undefined,
      });
    }

    if (typeof input.rawText === 'string' || answers.length > 0) {
      const draft = await this.socialProfiles.generateAiDraft(ownerUserId, {
        rawText: this.string(input.rawText),
        answers: answers as never,
        source: 'social_agent_tool_executor',
      });
      return this.socialProfiles.saveAiDraft(ownerUserId, {
        profile: draft.draft,
        enableMatching: this.bool(input.enableMatching),
        sensitiveTagsConfirmed: this.bool(input.sensitiveTagsConfirmed),
      });
    }

    throw new BadRequestException('answers, profile, or rawText is required');
  }

  private async updateProfileFromAgentContext(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const extracted = this.isRecord(input.extractedProfile)
      ? input.extractedProfile
      : {};
    const sourceMessage = this.string(input.sourceMessage) ?? '';
    const dto: UpdateSocialProfileDto = {};
    const updatedFields: string[] = [];
    const memoryFields: string[] = [];
    const missingFields: string[] = [];
    const setString = (field: string, value: unknown) => {
      const text = this.string(value);
      if (!text) return;
      dto[field] = text;
      updatedFields.push(field);
    };
    const setList = (field: string, value: unknown) => {
      const list = this.stringList(value);
      if (list.length === 0) return;
      dto[field] = list;
      updatedFields.push(field);
    };

    setString('gender', extracted.gender);
    setString('ageRange', extracted.ageRange);
    setString('city', extracted.city);
    setString('nearbyArea', extracted.nearbyArea);
    setString('zodiac', extracted.zodiac);
    setString('mbti', extracted.mbti);
    setList('traits', extracted.traits ?? extracted.personality);
    setList('interestTags', extracted.interestTags);
    setList('availableTimes', extracted.availableTimes);
    setList('wantToMeet', extracted.wantToMeet ?? extracted.socialGoal);
    setList(
      'preferredTraits',
      extracted.preferredTraits ?? extracted.targetPreference,
    );
    setString('rejectRules', extracted.rejectRules);
    setString('privacyBoundary', extracted.privacyBoundary);

    const supplemental: Record<string, unknown> = {};
    for (const field of [
      'height',
      'weight',
      'school',
      'targetPreference',
      'socialGoal',
    ]) {
      const value = extracted[field];
      if (value === undefined || value === null || value === '') continue;
      supplemental[field] = value;
      memoryFields.push(field);
    }
    if (Object.keys(supplemental).length > 0 || sourceMessage) {
      dto.matchSignals = {
        agentProfileMemory: supplemental,
        sourceMessage,
        updatedAt: new Date().toISOString(),
      };
      updatedFields.push('matchSignals');
    }
    for (const field of [
      'availableTimes',
      'privacyBoundary',
      'interestTags',
      'wantToMeet',
    ]) {
      if (!updatedFields.includes(field)) missingFields.push(field);
    }

    const saved =
      Object.keys(dto).length > 0
        ? await this.socialProfiles.upsert(task.ownerUserId, dto)
        : await this.socialProfiles.get(task.ownerUserId);
    await this.createTaskEvent(task, AgentTaskEventType.SocialAgentContextAppended, {
      summary: 'Updated social profile from agent context',
      payload: {
        extractedProfile: extracted,
        updatedFields,
        memoryFields,
        missingFields,
        sourceMessage,
      },
    });
    return {
      success: true,
      updatedFields,
      memoryFields,
      missingFields,
      profile: saved,
    };
  }

  private getCurrentTaskMemory(task: AgentTask): Record<string, unknown> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    return {
      taskId: task.id,
      ownerUserId: task.ownerUserId,
      status: task.status,
      goal: task.goal,
      permissionMode: task.permissionMode,
      taskMemory: readSocialAgentTaskMemory(task),
      shortTerm: this.isRecord(memory.shortTerm) ? memory.shortTerm : {},
      socialLoop: this.socialLoopMemory(task),
      recentToolCalls: Array.isArray(task.toolCalls)
        ? task.toolCalls.slice(-10)
        : [],
      result: this.isRecord(task.result) ? task.result : {},
    };
  }

  private async createSocialRequest(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const mode = this.string(input.mode ?? input.intent);
    const rawText =
      this.string(input.rawText ?? input.goal ?? task.goal) ?? task.goal;
    const agent = await this.loadAgentConnection(task.agentConnectionId);

    if (mode === 'ai_draft' || mode === 'draft_only') {
      return this.socialRequests.aiDraft(task.ownerUserId, rawText, {
        agentTaskId: task.id,
        agentId: task.agentConnectionId,
        source: 'social_agent_tool_executor',
      });
    }

    if (!this.string(input.type) && rawText) {
      return this.socialRequests.createFromNaturalLanguage(
        rawText,
        task.ownerUserId,
        agent,
      );
    }

    const dto: CreateSocialRequestDto = {
      ...(input as Partial<CreateSocialRequestDto>),
      type: this.socialRequestType(input.type) ?? SocialRequestType.Custom,
      rawText,
      title: this.string(input.title ?? task.title),
      description: this.string(input.description ?? task.goal),
      city: sanitizeCity(input.city),
      radiusKm: this.number(input.radiusKm) ?? undefined,
      activityType: this.string(input.activityType),
      interestTags: this.stringArray(input.interestTags ?? input.tags),
      metadata: {
        ...(this.isRecord(input.metadata) ? input.metadata : {}),
        agentTaskId: task.id,
      },
    };
    const socialRequestId = this.number(
      input.socialRequestId ?? input.requestId,
    );
    const request = socialRequestId
      ? await this.socialRequests.update(
          socialRequestId,
          task.ownerUserId,
          dto as UpdateSocialRequestDto,
          agent,
        )
      : await this.socialRequests.create(task.ownerUserId, dto, { agent });

    const shouldSyncPublicIntent =
      mode === 'publish' ||
      this.bool(input.publish) === true ||
      this.bool(input.syncPublicIntent) === true;
    if (!shouldSyncPublicIntent) {
      return {
        ...this.asRecord(request),
        socialRequest: request,
        socialRequestId: request.id,
      };
    }

    const publicIntent = await this.socialRequests.syncPublicIntentById(
      request.id,
      task.ownerUserId,
    );
    return {
      ...this.asRecord(request),
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
    const socialRequestId = this.number(
      input.socialRequestId ?? input.requestId,
    );
    return this.candidatePool.searchSocial({
      ownerUserId: task.ownerUserId,
      socialRequestId,
      city: sanitizeCity(input.city),
      activityType: this.string(input.activityType),
      interestTags: this.stringArray(input.interestTags ?? input.tags),
      timePreference: this.string(input.timePreference),
      locationPreference: this.string(input.locationPreference),
      rawText: this.string(input.rawText ?? input.goal ?? input.message),
      limit: this.number(input.limit) ?? undefined,
    });
  }

  private async searchPublicIntents(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = this.asRecord(await this.searchMatches(task, input));
    const candidates = Array.isArray(result.candidates)
      ? result.candidates.filter(
          (candidate) =>
            this.isRecord(candidate) && candidate.source === 'public_intent',
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
      activityType: this.string(input.activityType),
      interestTags: this.stringArray(input.interestTags ?? input.tags),
      timePreference: this.string(input.timePreference),
      locationPreference: this.string(input.locationPreference),
      rawText: this.string(input.rawText ?? input.goal ?? input.message),
      limit: this.number(input.limit) ?? undefined,
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
    const candidateUserId = this.number(
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
        publicTags: this.isRecord(input.publicTags)
          ? (input.publicTags as never)
          : undefined,
        privatePreferenceSignals: this.stringArray(
          input.privatePreferenceSignals,
        ),
        confirmedSensitiveTags: this.stringArray(input.confirmedSensitiveTags),
        avoidSignals: this.stringArray(input.avoidSignals),
        safetySignals: this.stringArray(input.safetySignals),
        scoreBreakdown: this.isRecord(input.scoreBreakdown)
          ? (input.scoreBreakdown as never)
          : undefined,
      });
    }

    return {
      explanation: await this.ai.explainMatchFor(
        this.isRecord(input.request) ? input.request : {},
        this.isRecord(input.candidate) ? input.candidate : {},
        this.number(input.score) ?? undefined,
      ),
    };
  }

  private async draftOpener(input: Record<string, unknown>): Promise<unknown> {
    const message = await this.ai.generateInviteMessage(
      this.isRecord(input.request) ? input.request : input,
      this.isRecord(input.candidate) ? input.candidate : input,
    );
    return { message };
  }

  async resolveCandidateTargetUser(
    input: Record<string, unknown>,
    ownerUserId: number,
  ): Promise<number> {
    const candidateInput = this.isRecord(input.candidate)
      ? input.candidate
      : {};
    const publicIntentId =
      this.string(input.publicIntentId ?? candidateInput.publicIntentId) ??
      null;
    const socialRequestId = this.number(
      input.socialRequestId ??
        input.requestId ??
        candidateInput.socialRequestId ??
        candidateInput.requestId,
    );
    const candidateRecordId = this.number(
      input.candidateRecordId ??
        input.candidateId ??
        candidateInput.candidateRecordId ??
        candidateInput.candidateId,
    );

    let targetUserId = this.number(
      input.targetUserId ??
        candidateInput.targetUserId ??
        input.candidateUserId ??
        candidateInput.candidateUserId ??
        input.userId ??
        candidateInput.userId ??
        input.toUserId ??
        candidateInput.toUserId ??
        input.recipientUserId ??
        candidateInput.recipientUserId ??
        input.recipientId ??
        candidateInput.recipientId ??
        input.receiverId ??
        candidateInput.receiverId ??
        input.followingId ??
        candidateInput.followingId,
    );

    if (publicIntentId) {
      const publicIntent = await this.publicIntentRepo.findOne({
        where: { id: publicIntentId },
      });
      const publicIntentUserId = this.number(publicIntent?.userId);
      if (targetUserId && publicIntentUserId && targetUserId !== publicIntentUserId) {
        throw this.targetBadRequest(
          'MISSING_TARGET_USER',
          '公开约练卡片目标用户不一致',
        );
      }
      targetUserId = targetUserId ?? publicIntentUserId;
    }

    if (!targetUserId && socialRequestId) {
      const socialRequest = await this.userSocialRequestRepo.findOne({
        where: { id: socialRequestId },
      });
      targetUserId = this.number(socialRequest?.userId);
    }

    if ((!targetUserId || targetUserId === ownerUserId) && candidateRecordId) {
      const candidate = await this.candidateRepo.findOne({
        where: { id: candidateRecordId },
      });
      targetUserId = this.number(candidate?.candidateUserId) ?? targetUserId;
    }

    if (!targetUserId) {
      throw this.targetBadRequest(
        'MISSING_TARGET_USER',
        '这个候选缺少目标用户，无法操作。',
      );
    }
    if (targetUserId === ownerUserId) {
      throw this.targetBadRequest('TARGET_IS_SELF', '不能把自己作为目标用户');
    }

    const targetUser = await this.userRepo.findOne({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw this.targetBadRequest('MISSING_TARGET_USER', '目标用户不存在');
    }

    const blockedUserIds = await this.safety.getMutualBlockUserIds(ownerUserId);
    if (blockedUserIds.has(targetUserId)) {
      throw new ForbiddenException({
        success: false,
        code: 'TARGET_BLOCKED',
        message: '你和该用户之间存在拉黑关系，无法操作。',
      });
    }

    return targetUserId;
  }

  private targetBadRequest(code: string, message: string): BadRequestException {
    return new BadRequestException({ success: false, code, message });
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
    const output = this.asRecord(
      await this.sendMessage(
        task,
        {
          ...input,
          targetUserId,
        },
        stepId,
      ),
    );
    const messageId = this.string(output.id ?? output.messageId) ?? null;
    const conversationId = this.string(output.conversationId) ?? null;
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
    const text = this.string(input.text ?? input.message ?? input.content);
    if (!text) throw new BadRequestException('text is required');

    let conversationId = this.string(input.conversationId);
    const targetUserId = this.number(input.targetUserId ?? input.toUserId);
    const targetForDedupe = targetUserId ?? this.memoryTargetUserId(task);
    const duplicateKey = this.messageDedupeKey(targetForDedupe, text);
    if (this.hasSocialLoopKey(task, 'sentMessageKeys', duplicateKey)) {
      return {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_message_content',
        conversationId:
          conversationId ?? this.socialLoopMemory(task).conversationId ?? null,
        targetUserId: targetForDedupe ?? null,
        textPreview: this.preview(text),
      };
    }
    if (!conversationId) {
      if (!targetUserId)
        throw new BadRequestException(
          'targetUserId or conversationId is required',
        );
      const conversation = await this.messages.startConversation(
        task.ownerUserId,
        targetUserId,
        this.messageConversationOptions(task, stepId),
      );
      conversationId = conversation.conversationId;
    }

    const message = await this.messages.sendMessage(
      conversationId,
      task.ownerUserId,
      text,
      this.messageSendOptions(task, stepId, input),
    );
    const output = this.asRecord(message);
    const candidateInput = this.isRecord(input.candidate)
      ? input.candidate
      : {};
    const candidateRecordId = this.number(
      input.candidateRecordId ??
        input.candidateId ??
        candidateInput.candidateRecordId,
    );
    const socialRequestId = this.number(
      input.socialRequestId ??
        input.requestId ??
        candidateInput.socialRequestId,
    );
    let candidate: { id: number; status: SocialRequestCandidateStatus } | null =
      null;
    if (candidateRecordId && socialRequestId) {
      try {
        candidate = await this.matchService.markCandidateMessaged(
          socialRequestId,
          candidateRecordId,
          task.ownerUserId,
        );
      } catch (error) {
        this.logger.warn(
          `markCandidateMessaged failed for task=${task.id}, candidate=${candidateRecordId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.rememberConversation(task, {
      conversationId,
      targetUserId: targetUserId ?? this.memoryTargetUserId(task),
      lastMessageId: this.string(output.id ?? output.messageId),
      lastAgentMessageId: this.string(output.id ?? output.messageId),
      sentMessageKeys: this.appendSocialLoopKey(
        task,
        'sentMessageKeys',
        duplicateKey,
      ),
      sourceTool: SocialAgentToolName.SendMessage,
    });
    this.rememberSentMessage(task, {
      id: this.string(output.id ?? output.messageId),
      conversationId,
      targetUserId: targetUserId ?? this.memoryTargetUserId(task),
      textPreview: this.preview(text),
      toolName: SocialAgentToolName.SendMessage,
      stepId,
    });
    return candidate ? { ...output, candidate } : output;
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
    const friendRecord = this.asRecord(friend);
    const rawFriendRequestId =
      friendRecord.friendRequestId ?? friendRecord.followId ?? friendRecord.id;
    const numericFriendRequestId = this.number(rawFriendRequestId);
    const friendRequestId =
      this.string(rawFriendRequestId) ??
      (numericFriendRequestId != null ? String(numericFriendRequestId) : null);
    if (this.bool(input.openConversation) !== true) {
      return {
        ...friendRecord,
        success: true,
        taskId: task.id,
        targetUserId,
        candidateUserId: targetUserId,
        friendRequestId,
        conversationId: null,
        status: 'connected',
        friendAction: {
          success: true,
          status: 'connected',
          targetUserId,
          candidateUserId: targetUserId,
          following: true,
          conversationId: null,
          friendRequestId,
        },
      };
    }

    const conversation = await this.messages.startConversation(
      task.ownerUserId,
      targetUserId,
      this.messageConversationOptions(task, stepId, {
        ...(this.isRecord(input.metadata) ? input.metadata : {}),
        toolName: SocialAgentToolName.AddFriend,
        targetUserId,
        candidateRecordId: this.number(input.candidateRecordId),
        socialRequestId: this.number(input.socialRequestId ?? input.requestId),
      }),
    );
    const conversationId = this.string(conversation.conversationId);
    if (conversationId) {
      this.rememberConversation(task, {
        conversationId,
        targetUserId,
        sourceTool: SocialAgentToolName.AddFriend,
      });
    }
    return {
      ...friendRecord,
      success: true,
      taskId: task.id,
      conversationId: conversationId ?? null,
      targetUserId,
      candidateUserId: targetUserId,
      friendRequestId,
      status: 'connected',
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId,
        candidateUserId: targetUserId,
        following: true,
        conversationId: conversationId ?? null,
        friendRequestId,
      },
    };
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
    const invitedUserId = this.number(
      input.invitedUserId ?? input.targetUserId,
    );
    if (toolName === SocialAgentToolName.OfflineMeeting && !invitedUserId) {
      throw new BadRequestException(
        'targetUserId or invitedUserId is required',
      );
    }

    const dto: CreateActivityDto = {
      ...(input as Partial<CreateActivityDto>),
      type:
        this.activityType(input.type ?? input.activityType) ??
        ActivityType.Custom,
      title:
        this.string(input.title ?? task.title) || this.activityTitle(toolName),
      description: this.string(input.description ?? input.note ?? task.goal),
      city: sanitizeCity(input.city),
      locationName: this.string(input.locationName ?? input.location),
      startTime: this.string(input.startTime ?? input.timeStart),
      durationMinutes: this.number(input.durationMinutes) ?? undefined,
      socialRequestId: this.number(input.socialRequestId) ?? undefined,
      matchedCandidateId:
        this.number(input.matchedCandidateId ?? input.candidateRecordId) ??
        undefined,
      invitedUserId: invitedUserId ?? undefined,
    };
    const activityDedupeKey = this.activityInviteDedupeKey(toolName, dto);
    if (this.hasSocialLoopKey(task, 'activityInviteKeys', activityDedupeKey)) {
      return {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_activity_invite',
        toolName,
        targetUserId: invitedUserId ?? null,
        title: dto.title,
        startTime: dto.startTime ?? null,
      };
    }
    const activity = await this.activities.create(task.ownerUserId, dto);
    this.rememberConversation(task, {
      activityInviteKeys: this.appendSocialLoopKey(
        task,
        'activityInviteKeys',
        activityDedupeKey,
      ),
      sourceTool: toolName,
    });

    if (toolName !== SocialAgentToolName.OfflineMeeting) return activity;
    const offlineTargetUserId = invitedUserId;
    if (!offlineTargetUserId) {
      throw new BadRequestException(
        'targetUserId or invitedUserId is required',
      );
    }

    const inviteMessage = await this.sendOfflineMeetingInvite(
      task,
      input,
      stepId,
      activity,
      offlineTargetUserId,
    );
    return {
      id: activity.id,
      activityId: activity.id,
      status: activity.status,
      invitedUserId: offlineTargetUserId,
      conversationId: this.string(inviteMessage.conversationId) || null,
      messageId:
        this.string(inviteMessage.id ?? inviteMessage.messageId) || null,
      activity,
      inviteMessage,
    };
  }

  private async sendOfflineMeetingInvite(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
    activity: SocialActivity,
    targetUserId: number,
  ): Promise<Record<string, unknown>> {
    const conversation = await this.messages.startConversation(
      task.ownerUserId,
      targetUserId,
      this.messageConversationOptions(task, stepId, {
        toolName: SocialAgentToolName.OfflineMeeting,
        activityId: activity.id,
        targetUserId,
      }),
    );
    const conversationId = conversation.conversationId;
    const text = this.offlineMeetingInviteText(input, activity);
    const message = await this.messages.sendMessage(
      conversationId,
      task.ownerUserId,
      text,
      {
        senderType: 'agent',
        senderAgentId: task.agentConnectionId,
        agentConnectionId: task.agentConnectionId,
        ownerUserId: task.ownerUserId,
        actorUserId: task.ownerUserId,
        source: 'ai_delegate',
        metadata: this.messageMetadata(task, stepId, {
          ...(this.isRecord(input.metadata) ? input.metadata : {}),
          toolName: SocialAgentToolName.OfflineMeeting,
          activityId: activity.id,
          targetUserId,
        }),
      },
    );
    const messageRecord = this.asRecord(message);
    this.rememberConversation(task, {
      conversationId,
      targetUserId,
      lastMessageId: this.string(messageRecord.id ?? messageRecord.messageId),
      lastAgentMessageId: this.string(
        messageRecord.id ?? messageRecord.messageId,
      ),
      sourceTool: SocialAgentToolName.OfflineMeeting,
      activityId: activity.id,
    });
    this.rememberSentMessage(task, {
      id: this.string(messageRecord.id ?? messageRecord.messageId),
      conversationId,
      targetUserId,
      textPreview: this.preview(text),
      toolName: SocialAgentToolName.OfflineMeeting,
      stepId,
    });
    return { ...this.asRecord(message), conversationId };
  }

  private async joinActivity(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const activityId = this.number(input.activityId ?? input.id);
    if (!activityId) throw new BadRequestException('activityId is required');
    const activity = await this.activities.join(activityId, task.ownerUserId);
    return {
      ...this.asRecord(activity),
      activityId,
      joined: true,
    };
  }

  private async saveCandidate(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const candidateId = this.number(
      input.candidateRecordId ?? input.candidateId,
    );
    const socialRequestId = this.number(
      input.socialRequestId ?? input.requestId,
    );
    const candidateUserId = this.number(
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

  private async writeInbox(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const agentConnectionId =
      task.agentConnectionId ?? this.number(input.agentConnectionId);
    if (!agentConnectionId)
      throw new BadRequestException('agentConnectionId is required');
    return this.messages.createAgentInboxEvent({
      agentConnectionId,
      ownerUserId: task.ownerUserId,
      eventType: this.string(input.eventType) || 'agent.task.updated',
      conversationId: this.string(input.conversationId) || null,
      messageId: this.string(input.messageId) || null,
      requestId: this.number(input.requestId ?? input.socialRequestId) ?? null,
      candidateRecordId: this.number(input.candidateRecordId) ?? null,
      fromUserId: this.number(input.fromUserId) ?? null,
      contentPreview: this.string(
        input.contentPreview ?? input.summary ?? input.text,
      ),
      unread: this.bool(input.unread) ?? true,
      dedupeKey:
        this.string(input.dedupeKey) ||
        `${agentConnectionId}:agent.task:${task.id}:${stepId}`,
      metadata: {
        ...(this.isRecord(input.metadata) ? input.metadata : {}),
        agentTaskId: task.id,
        stepId,
      },
    });
  }

  private async readInbox(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const agentConnectionId =
      task.agentConnectionId ?? this.number(input.agentConnectionId);
    if (!agentConnectionId)
      throw new BadRequestException('agentConnectionId is required');
    const conversationId = this.string(input.conversationId);
    if (conversationId) {
      return {
        messages: await this.messages.getAgentInboxMessages(
          conversationId,
          agentConnectionId,
          {
            limit: this.number(input.limit) ?? undefined,
          },
        ),
      };
    }
    return {
      events: await this.messages.getAgentInboxEvents(agentConnectionId, {
        limit: this.number(input.limit) ?? undefined,
        unreadOnly: this.bool(input.unreadOnly) ?? undefined,
        eventType: this.string(input.eventType) || undefined,
      }),
    };
  }

  private async getConversations(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const limit = this.number(input.limit);
    const conversations = await this.messages.getConversations(
      task.ownerUserId,
    );
    return {
      conversations: limit ? conversations.slice(0, limit) : conversations,
    };
  }

  private async getAgentInbox(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const agentConnectionId =
      task.agentConnectionId ?? this.number(input.agentConnectionId);
    const limit = this.number(input.limit) ?? undefined;
    const conversationId = this.string(input.conversationId);

    if (conversationId) {
      if (!agentConnectionId) {
        throw new BadRequestException('agentConnectionId is required');
      }
      return {
        messages: await this.messages.getAgentInboxMessages(
          conversationId,
          agentConnectionId,
          { limit },
        ),
      };
    }

    const [conversations, events] = await Promise.all([
      agentConnectionId
        ? this.messages.getAgentInboxConversations(agentConnectionId, {
            limit,
            unreadOnly: this.bool(input.unreadOnly) ?? undefined,
          })
        : Promise.resolve([]),
      agentConnectionId
        ? this.messages.getAgentInboxEvents(agentConnectionId, {
            limit,
            unreadOnly: this.bool(input.unreadOnly) ?? undefined,
            eventType: this.string(input.eventType) || undefined,
          })
        : this.messages.getAgentInboxEventsForOwner(task.ownerUserId, {
            limit,
            unreadOnly: this.bool(input.unreadOnly) ?? undefined,
            eventType: this.string(input.eventType) || undefined,
          }),
    ]);

    return { conversations, events };
  }

  private async getPendingApprovals(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const limit = this.number(input.limit);
    const approvals = await this.approvals.getPending(task.ownerUserId);
    return { approvals: limit ? approvals.slice(0, limit) : approvals };
  }

  private async approveAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const approvalId = this.number(input.approvalId ?? input.id);
    if (!approvalId) throw new BadRequestException('approvalId is required');
    return this.approvals.approve(approvalId, task.ownerUserId, (approval) =>
      this.approvalDispatcher.dispatch(approval),
    );
  }

  private async rejectAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const approvalId = this.number(input.approvalId ?? input.id);
    if (!approvalId) throw new BadRequestException('approvalId is required');
    return this.approvals.reject(approvalId, task.ownerUserId);
  }

  private async summarizeCurrentTask(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const memory = this.getCurrentTaskMemory(task);
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
      result: this.isRecord(task.result) ? task.result : {},
      memory,
    };
    const shouldPersist = this.bool(
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
      this.string(input.intent) === 'activity_search'
        ? 'activity_search'
        : 'social_search';
    return this.candidatePool.debugCandidatePool(
      task.ownerUserId,
      this.number(input.taskId) ?? task.id,
      intent,
    );
  }

  private async readTaskConversationMessages(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const agentConnectionId =
      task.agentConnectionId ?? this.number(input.agentConnectionId);
    if (!agentConnectionId)
      throw new BadRequestException('agentConnectionId is required');

    const loop = this.socialLoopMemory(task);
    const conversationId =
      this.string(input.conversationId) ?? loop.conversationId;
    if (!conversationId) {
      throw new BadRequestException('task memory has no bound conversationId');
    }

    const messages = this.messageArray(
      await this.messages.getAgentInboxMessages(
        conversationId,
        agentConnectionId,
        {
          limit: this.number(input.limit) ?? 50,
        },
      ),
    );
    const cursor =
      this.string(input.afterMessageId) ??
      loop.lastReadMessageId ??
      loop.lastMessageId;
    const newMessages = this.filterPendingCounterpartMessages(
      messages,
      cursor,
      loop,
      task.ownerUserId,
    );
    const latest = newMessages[newMessages.length - 1] ?? null;

    this.rememberConversation(task, {
      conversationId,
      targetUserId:
        this.number(latest?.senderId) ??
        this.number(input.targetUserId) ??
        loop.targetUserId ??
        null,
      lastReceivedMessageId: latest?.id ?? loop.lastReceivedMessageId ?? null,
      lastReadMessageId: latest?.id ?? loop.lastReadMessageId ?? null,
      pendingMessageId: null,
      latestReceivedMessage: latest,
      latestReceivedMessages: newMessages,
      processedMessageIds: newMessages.reduce(
        (ids, message) => this.appendValue(ids, message.id),
        loop.processedMessageIds ?? [],
      ),
      sourceTool: SocialAgentToolName.ReadTaskConversationMessages,
    });
    if (newMessages.length > 0) {
      this.rememberReceivedReplies(task, newMessages, stepId);
    }

    if (latest) {
      await this.createTaskEvent(task, AgentTaskEventType.FeedbackReceived, {
        summary: 'Received counterpart reply for social agent task',
        payload: {
          conversationId,
          messageId: latest.id,
          newMessageCount: newMessages.length,
        },
      });
      await this.writeSocialAgentInboxEvent(
        task,
        'social_agent.message.received',
        {
          conversationId,
          messageId: latest.id ?? null,
          fromUserId: this.number(latest.senderId) ?? loop.targetUserId ?? null,
          contentPreview: this.preview(latest.text),
          metadata: {
            agentTaskId: task.id,
            conversationId,
            latestMessage: latest,
            newMessages,
            newMessageCount: newMessages.length,
          },
        },
      );
    }

    return {
      conversationId,
      cursor,
      newMessageCount: newMessages.length,
      newMessages,
      latestMessage: latest,
    };
  }

  private async summarizeReply(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const loop = this.socialLoopMemory(task);
    const messages = this.messageArray(
      input.messages ?? loop.latestReceivedMessages,
    );
    if (messages.length === 0)
      throw new BadRequestException('messages are required');

    const summary = await this.callDeepSeekJson(
      'summarize_reply',
      this.replySummaryPrompt(task, messages),
      () => this.fallbackReplySummary(messages),
      task,
    );
    this.rememberConversation(task, {
      replySummary: summary,
      sourceTool: SocialAgentToolName.SummarizeReply,
    });
    rememberSocialAgentShortTerm(task, {
      replySummary: summary,
      currentStep: this.shortTermStep(
        'summarize_reply',
        '已总结对方回复',
        'done',
      ),
    });

    await this.writeSocialAgentInboxEvent(
      task,
      'social_agent.reply.summarized',
      {
        conversationId: loop.conversationId ?? null,
        messageId: loop.lastReceivedMessageId ?? null,
        fromUserId: loop.targetUserId ?? null,
        contentPreview: this.string(summary.summary) ?? 'Reply summarized',
        metadata: {
          agentTaskId: task.id,
          messages,
          summary,
        },
      },
    );

    return summary;
  }

  private async decideNextSocialAction(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const loop = this.socialLoopMemory(task);
    const messages = this.messageArray(
      input.messages ?? loop.latestReceivedMessages,
    );
    const summary = this.isRecord(input.summary)
      ? input.summary
      : (loop.replySummary ?? {});
    const decision = await this.callDeepSeekJson(
      'decide_next_social_action',
      this.nextActionPrompt(task, messages, summary),
      () => this.fallbackNextAction(task, messages, summary),
      task,
    );
    const safeDecision = this.normalizeNextActionDecision(task, decision);
    this.rememberConversation(task, {
      nextActionDecision: safeDecision,
      sourceTool: SocialAgentToolName.DecideNextSocialAction,
    });
    rememberSocialAgentShortTerm(task, {
      nextActionDecision: safeDecision,
      currentStep: this.shortTermStep(
        'decide_next_social_action',
        '已决定下一步社交动作',
        'done',
      ),
    });

    await this.writeSocialAgentInboxEvent(
      task,
      'social_agent.next_action.decided',
      {
        conversationId: loop.conversationId ?? null,
        messageId: loop.lastReceivedMessageId ?? null,
        fromUserId: loop.targetUserId ?? null,
        contentPreview:
          this.string(safeDecision.reason) ??
          `Next action: ${this.string(safeDecision.nextAction) ?? 'stop'}`,
        metadata: {
          agentTaskId: task.id,
          summary,
          decision: safeDecision,
        },
      },
    );

    return safeDecision;
  }

  private async replyMessage(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    if (!task.agentConnectionId)
      throw new BadRequestException('agentConnectionId is required');
    const conversationId = this.string(input.conversationId);
    const text = this.string(input.text ?? input.message ?? input.content);
    if (!conversationId)
      throw new BadRequestException('conversationId is required');
    if (!text) throw new BadRequestException('text is required');
    const targetForDedupe =
      this.number(input.targetUserId) ?? this.memoryTargetUserId(task);
    const duplicateKey = this.messageDedupeKey(targetForDedupe, text);
    if (this.hasSocialLoopKey(task, 'sentMessageKeys', duplicateKey)) {
      return {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_message_content',
        conversationId,
        targetUserId: targetForDedupe ?? null,
        textPreview: this.preview(text),
      };
    }
    const message = await this.messages.sendAgentReply(
      conversationId,
      task.agentConnectionId,
      text,
      {
        ownerUserId: task.ownerUserId,
        metadata: this.messageMetadata(task, stepId, input.metadata),
      },
    );
    const output = this.asRecord(message);
    const targetUserId =
      this.number(output.recipientUserId) ??
      this.number(input.targetUserId) ??
      this.memoryTargetUserId(task);
    this.rememberConversation(task, {
      conversationId,
      targetUserId,
      lastMessageId: this.string(output.id ?? output.messageId),
      lastAgentMessageId: this.string(output.id ?? output.messageId),
      sentMessageKeys: this.appendSocialLoopKey(
        task,
        'sentMessageKeys',
        duplicateKey,
      ),
      sourceTool: SocialAgentToolName.ReplyMessage,
    });
    this.rememberSentMessage(task, {
      id: this.string(output.id ?? output.messageId),
      conversationId,
      targetUserId,
      textPreview: this.preview(text),
      toolName: SocialAgentToolName.ReplyMessage,
      stepId,
    });
    await this.writeSocialAgentInboxEvent(task, 'social_agent.reply.sent', {
      conversationId,
      messageId: this.string(output.id ?? output.messageId) ?? null,
      fromUserId: targetUserId ?? null,
      contentPreview: this.preview(text),
      metadata: {
        agentTaskId: task.id,
        stepId,
        toolName: SocialAgentToolName.ReplyMessage,
        textPreview: this.preview(text),
        output,
      },
    });
    return message;
  }

  private async recordPaymentIntent(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<unknown> {
    const amount = this.positiveAmount(
      input.amount ?? input.total ?? input.value,
    );
    if (amount == null) throw new BadRequestException('amount is required');

    const currency = (this.string(input.currency) || 'CNY')
      .toUpperCase()
      .slice(0, 8);
    const targetUserId = this.number(
      input.targetUserId ?? input.payeeUserId ?? input.toUserId,
    );
    const description =
      this.string(input.description ?? input.summary ?? input.note) ||
      'Agent payment intent';
    const status =
      this.paymentIntentStatus(input.status) ?? PaymentIntentStatus.Created;
    const paymentDedupeKey = this.paymentIntentDedupeKey({
      targetUserId: targetUserId ?? null,
      amount,
      currency,
      description,
    });
    if (this.hasSocialLoopKey(task, 'paymentIntentKeys', paymentDedupeKey)) {
      return {
        skipped: true,
        duplicate: true,
        reason: 'duplicate_payment_intent',
        targetUserId: targetUserId ?? null,
        amount: amount.toFixed(2),
        currency,
        description,
      };
    }
    const paymentIntent = await this.paymentIntentRepo.save(
      this.paymentIntentRepo.create({
        ownerUserId: task.ownerUserId,
        agentConnectionId: task.agentConnectionId,
        agentTaskId: task.id,
        stepId,
        targetUserId: targetUserId ?? null,
        amount: amount.toFixed(2),
        currency,
        description,
        status,
        provider: this.string(input.provider) || 'manual_intent',
        providerReference: this.string(input.providerReference) ?? null,
        metadata: {
          ...(this.isRecord(input.metadata) ? input.metadata : {}),
          agentTaskId: task.id,
          stepId,
          userId: task.ownerUserId,
          targetUserId: targetUserId ?? null,
          source: 'social_agent_tool_executor',
          permissionMode: task.permissionMode,
          auditPolicy: 'payment_intent_only_no_silent_charge',
          reversible: true,
          gatewayStatus: 'not_integrated',
        },
      }),
    );
    this.rememberConversation(task, {
      paymentIntentKeys: this.appendSocialLoopKey(
        task,
        'paymentIntentKeys',
        paymentDedupeKey,
      ),
      sourceTool: SocialAgentToolName.Payment,
    });

    return {
      id: paymentIntent.id,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      description: paymentIntent.description,
      targetUserId: paymentIntent.targetUserId,
      userId: task.ownerUserId,
      agentTaskId: task.id,
      provider: paymentIntent.provider,
      gatewayStatus: 'not_integrated',
      auditPolicy: 'payment_intent_only_no_silent_charge',
      reversible: true,
      message:
        'Payment intent created; real payment gateway integration is pending.',
    };
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
    task.toolCalls = [...(task.toolCalls ?? []), call];
    task.result = {
      ...(task.result ?? {}),
      lastToolCall: call,
      updatedAt: new Date().toISOString(),
    };
    await this.taskRepo.save(task);
    return call;
  }

  private runNextResult(
    task: AgentTask,
    calls: SocialAgentToolCallRecord[],
    handledReply: boolean,
    decision: Record<string, unknown> | null,
  ): SocialAgentRunNextResult {
    return {
      taskId: task.id,
      executedSteps: calls.length,
      succeededSteps: calls.filter((call) => call.status === 'succeeded')
        .length,
      failedSteps: calls.filter((call) => call.status === 'failed').length,
      blockedSteps: calls.filter((call) => call.status === 'blocked').length,
      toolCalls: calls,
      status: task.status,
      handledReply,
      decision,
    };
  }

  private shouldWaitForReply(task: AgentTask): boolean {
    const loop = this.socialLoopMemory(task);
    return Boolean(loop.conversationId && loop.lastAgentMessageId);
  }

  private rememberConversation(
    task: AgentTask,
    updates: Partial<SocialLoopMemory>,
  ): void {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const previous = this.isRecord(memory.socialLoop)
      ? (memory.socialLoop as SocialLoopMemory)
      : {};
    const next: SocialLoopMemory = {
      ...previous,
      ...updates,
      taskId: task.id,
      updatedAt: new Date().toISOString(),
    };
    task.memory = {
      ...memory,
      socialLoop: next,
    };
    rememberSocialAgentShortTerm(task, {
      conversationId: next.conversationId ?? null,
      targetUserId: next.targetUserId ?? null,
      lastMessageId: next.lastMessageId ?? null,
      lastAgentMessageId: next.lastAgentMessageId ?? null,
      lastReceivedMessageId: next.lastReceivedMessageId ?? null,
      lastReadMessageId: next.lastReadMessageId ?? null,
    });
  }

  private rememberSentMessage(
    task: AgentTask,
    input: {
      id?: string | null;
      conversationId: string;
      targetUserId?: number | null;
      textPreview: string;
      toolName: SocialAgentToolName;
      stepId: string;
    },
  ): void {
    const message = {
      id: input.id ?? `${input.stepId}:${Date.now()}`,
      conversationId: input.conversationId,
      targetUserId: input.targetUserId ?? null,
      textPreview: input.textPreview,
      toolName: input.toolName,
      stepId: input.stepId,
      sentAt: new Date().toISOString(),
    };
    rememberSocialAgentShortTerm(task, {
      conversationId: input.conversationId,
      targetUserId: input.targetUserId ?? null,
      currentStep: this.shortTermStep(
        input.stepId,
        `已执行 ${input.toolName}`,
        'done',
      ),
      sentMessages: appendShortTermMemoryItem(
        task,
        'sentMessages',
        message,
        30,
      ),
    });
  }

  private rememberReceivedReplies(
    task: AgentTask,
    messages: AgentMessageRecord[],
    stepId: string,
  ): void {
    let receivedReplies = shortTermMemoryList<Record<string, unknown>>(
      task,
      'receivedReplies',
    );
    for (const message of messages) {
      const id =
        this.string(message.id) ?? `${stepId}:${receivedReplies.length}`;
      const reply = {
        id,
        conversationId:
          this.string(message.conversationId) ??
          this.socialLoopMemory(task).conversationId ??
          null,
        fromUserId: this.number(message.senderId) ?? null,
        textPreview: this.preview(message.text),
        receivedAt: new Date().toISOString(),
      };
      receivedReplies = [
        ...receivedReplies.filter((item) => item.id !== id),
        reply,
      ].slice(-30);
    }
    rememberSocialAgentShortTerm(task, {
      receivedReplies,
      currentStep: this.shortTermStep(stepId, '已读取对方回复', 'done'),
    });
  }

  private shortTermStep(id: string, label: string, status: string) {
    return {
      id,
      label,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  private socialLoopMemory(task: AgentTask): SocialLoopMemory {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    return this.isRecord(memory.socialLoop)
      ? (memory.socialLoop as SocialLoopMemory)
      : {};
  }

  private memoryTargetUserId(task: AgentTask): number | null {
    return this.socialLoopMemory(task).targetUserId ?? null;
  }

  private hasSocialLoopKey(
    task: AgentTask,
    field: 'sentMessageKeys' | 'activityInviteKeys' | 'paymentIntentKeys',
    key: string,
  ): boolean {
    const values = this.socialLoopStringArray(
      this.socialLoopMemory(task)[field],
    );
    return values.includes(key);
  }

  private appendSocialLoopKey(
    task: AgentTask,
    field: 'sentMessageKeys' | 'activityInviteKeys' | 'paymentIntentKeys',
    key: string,
  ): string[] {
    return this.appendValue(
      this.socialLoopStringArray(this.socialLoopMemory(task)[field]),
      key,
    );
  }

  private messageDedupeKey(
    targetUserId: number | null | undefined,
    text: string,
  ): string {
    return `message:${targetUserId ?? 'unknown'}:${this.normalizeDedupeText(text)}`;
  }

  private activityInviteDedupeKey(
    toolName: SocialAgentToolName,
    dto: CreateActivityDto,
  ): string {
    return [
      'activity',
      toolName,
      dto.invitedUserId ?? 'unknown',
      this.normalizeDedupeText(dto.title ?? ''),
      this.normalizeDedupeText(dto.startTime ?? ''),
      this.normalizeDedupeText(dto.city ?? ''),
      this.normalizeDedupeText(dto.locationName ?? ''),
    ].join(':');
  }

  private paymentIntentDedupeKey(input: {
    targetUserId: number | null;
    amount: number;
    currency: string;
    description: string;
  }): string {
    return [
      'payment',
      input.targetUserId ?? 'unknown',
      input.amount.toFixed(2),
      input.currency,
      this.normalizeDedupeText(input.description),
    ].join(':');
  }

  private normalizeDedupeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 180);
  }

  private socialLoopStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private appendValue(
    values: string[],
    value: string | null | undefined,
  ): string[] {
    if (!value) return values.slice(-100);
    if (values.includes(value)) return values.slice(-100);
    return [...values, value].slice(-100);
  }

  private messageArray(value: unknown): AgentMessageRecord[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isRecord(item))
      .map((item) => ({
        ...item,
        id: this.string(item.id ?? item.messageId),
        conversationId: this.string(item.conversationId),
        text: this.string(item.text ?? item.content),
        senderId: this.number(item.senderId),
        senderType: this.string(item.senderType),
      }));
  }

  private filterNewCounterpartMessages(
    messages: AgentMessageRecord[],
    cursor: string | null | undefined,
    ownerUserId: number,
  ): AgentMessageRecord[] {
    const cursorIndex = cursor
      ? messages.findIndex((message) => message.id === cursor)
      : -1;
    const afterCursor =
      cursorIndex >= 0 ? messages.slice(cursorIndex + 1) : messages;
    return afterCursor.filter((message) => {
      if (message.senderType === 'agent') return false;
      if (this.number(message.senderId) === ownerUserId) return false;
      return Boolean(message.id || message.text);
    });
  }

  private filterPendingCounterpartMessages(
    messages: AgentMessageRecord[],
    cursor: string | null | undefined,
    loop: SocialLoopMemory,
    ownerUserId: number,
  ): AgentMessageRecord[] {
    const processed = new Set(loop.processedMessageIds ?? []);
    let candidates = this.filterNewCounterpartMessages(
      messages,
      cursor,
      ownerUserId,
    ).filter((message) => !message.id || !processed.has(message.id));

    if (candidates.length === 0 && loop.pendingMessageId) {
      const pending = messages.find(
        (message) =>
          message.id === loop.pendingMessageId &&
          message.senderType !== 'agent' &&
          this.number(message.senderId) !== ownerUserId &&
          !processed.has(loop.pendingMessageId ?? ''),
      );
      if (pending) candidates = [pending];
    }

    return candidates;
  }

  private async writeSocialAgentInboxEvent(
    task: AgentTask,
    eventType: string,
    input: {
      conversationId?: string | null;
      messageId?: string | null;
      fromUserId?: number | null;
      contentPreview?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!task.agentConnectionId) return;
    const stable = input.messageId ?? input.conversationId ?? `task_${task.id}`;
    await this.messages.createAgentInboxEvent({
      agentConnectionId: task.agentConnectionId,
      ownerUserId: task.ownerUserId,
      eventType,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      fromUserId: input.fromUserId ?? null,
      contentPreview: this.preview(input.contentPreview),
      unread: true,
      dedupeKey: `${task.agentConnectionId}:${eventType}:${task.id}:${stable}`,
      metadata: {
        ...(input.metadata ?? {}),
        agentTaskId: task.id,
        eventType,
      },
    });
  }

  private async callDeepSeekJson(
    purpose: string,
    prompt: string,
    fallback: () => Record<string, unknown>,
    task?: AgentTask,
  ): Promise<Record<string, unknown>> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        JSON.stringify({
          event: 'deepseek.call_skipped',
          purpose,
          taskId: task?.id ?? null,
          reason: 'DEEPSEEK_API_KEY missing',
        }),
      );
      return fallback();
    }

    const useCase = this.modelUseCaseForPurpose(purpose);
    let model = this.modelFor(useCase);
    const startedAt = Date.now();
    try {
      const baseUrl =
        this.config.get<string>('DEEPSEEK_BASE_URL') ||
        'https://api.deepseek.com';
      const res = await fetch(
        `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: this.modelRouter?.getTemperature(useCase) ?? 0.2,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are FitMeet Social Agent reply loop. Return only one valid JSON object.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        },
      );
      if (!res.ok) {
        this.logModelCall({
          useCase,
          model,
          taskId: task?.id ?? null,
          intent: purpose,
          latencyMs: Date.now() - startedAt,
          success: false,
          reason: `DeepSeek HTTP ${res.status}`,
        });
        this.logger.warn(
          JSON.stringify({
            event: 'deepseek.call_failed',
            purpose,
            httpStatus: res.status,
            reason: 'http_error',
          }),
        );
        return fallback();
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const parsed = this.parseJsonObject(content);
      this.logModelCall({
        useCase,
        model,
        taskId: task?.id ?? null,
        intent: purpose,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return {
        ...parsed,
        source: 'deepseek',
        purpose,
      };
    } catch (error) {
      this.logModelCall({
        useCase,
        model,
        taskId: task?.id ?? null,
        intent: purpose,
        latencyMs: Date.now() - startedAt,
        success: false,
        reason: error instanceof Error ? error.message : String(error),
      });
      this.logger.warn(
        JSON.stringify({
          event: 'deepseek.call_failed',
          purpose,
          reason: 'exception',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return fallback();
    }
  }

  private modelUseCaseForPurpose(purpose: string): SocialAgentModelUseCase {
    if (/candidate|match|summary/i.test(purpose)) return 'candidate_summary';
    if (/card|social_request|request/i.test(purpose)) return 'card_generation';
    if (/safety|boundary|risk/i.test(purpose)) return 'safety_check';
    return 'planner';
  }

  private modelFor(useCase: SocialAgentModelUseCase): string {
    if (this.modelRouter) return this.modelRouter.getModel(useCase);
    const legacy = this.config.get<string>('DEEPSEEK_MODEL');
    if (useCase === 'candidate_summary' || useCase === 'card_generation') {
      return (
        this.config.get<string>('AGENT_CARD_MODEL') ||
        this.config.get<string>('DEEPSEEK_FAST_MODEL') ||
        legacy ||
        'deepseek-v4-flash'
      );
    }
    if (useCase === 'safety_check') {
      return (
        this.config.get<string>('DEEPSEEK_FAST_MODEL') ||
        legacy ||
        'deepseek-v4-flash'
      );
    }
    return (
      this.config.get<string>('AGENT_PLANNER_MODEL') ||
      this.config.get<string>('DEEPSEEK_FAST_MODEL') ||
      legacy ||
      'deepseek-v4-flash'
    );
  }

  private logModelCall(input: {
    useCase: string;
    model: string;
    taskId: number | null;
    intent?: unknown;
    latencyMs: number;
    success: boolean;
    reason?: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'social_agent.model_call',
        useCase: input.useCase,
        model: input.model,
        taskId: input.taskId,
        intent: typeof input.intent === 'string' ? input.intent : null,
        latencyMs: input.latencyMs,
        success: input.success,
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    );
  }

  private replySummaryPrompt(
    task: AgentTask,
    messages: AgentMessageRecord[],
  ): string {
    return JSON.stringify({
      taskId: task.id,
      goal: task.goal,
      permissionMode: task.permissionMode,
      messages: messages.map((message) => ({
        id: message.id,
        text: message.text,
        senderId: message.senderId,
        createdAt: message.createdAt,
      })),
      outputSchema: {
        summary: 'one sentence Chinese summary',
        intent:
          'accept | ask_question | decline | payment | schedule | smalltalk | unknown',
        sentiment: 'positive | neutral | negative',
        needsReply: true,
        keyFacts: ['time/place/request constraints'],
      },
    });
  }

  private nextActionPrompt(
    task: AgentTask,
    messages: AgentMessageRecord[],
    summary: Record<string, unknown>,
  ): string {
    const loop = this.socialLoopMemory(task);
    return JSON.stringify({
      taskId: task.id,
      goal: task.goal,
      permissionMode: task.permissionMode,
      allowedActions: this.permissions.getAllowedActions(task.permissionMode),
      socialLoop: {
        conversationId: loop.conversationId,
        targetUserId: loop.targetUserId,
        lastReceivedMessageId: loop.lastReceivedMessageId,
      },
      messages,
      summary,
      outputSchema: {
        nextAction:
          'reply_message | add_friend | invite_activity | offline_meeting | payment | stop',
        action: 'permission action name',
        toolName: 'reply_message or another executable tool name',
        input: {},
        reason: 'short Chinese reason',
        confidence: 0.8,
      },
    });
  }

  private fallbackReplySummary(
    messages: AgentMessageRecord[],
  ): Record<string, unknown> {
    const latestText = messages
      .map((message) => message.text)
      .filter(Boolean)
      .join(' / ');
    const intent = /(可以|好|行|约|见|ok|yes|sure)/i.test(latestText)
      ? 'accept'
      : /(多少钱|支付|付款|订金|费用|pay|price)/i.test(latestText)
        ? 'payment'
        : /(不|不了|改天|算了|decline|no)/i.test(latestText)
          ? 'decline'
          : /(哪里|几点|路线|怎么|吗|\?)/i.test(latestText)
            ? 'ask_question'
            : 'unknown';
    return {
      source: 'fallback',
      purpose: 'summarize_reply',
      summary: latestText
        ? `对方回复：${this.preview(latestText)}`
        : '对方有新回复。',
      intent,
      sentiment:
        intent === 'decline'
          ? 'negative'
          : intent === 'accept'
            ? 'positive'
            : 'neutral',
      needsReply: intent !== 'decline',
      keyFacts: [this.preview(latestText)].filter(Boolean),
    };
  }

  private fallbackNextAction(
    task: AgentTask,
    messages: AgentMessageRecord[],
    summary: Record<string, unknown>,
  ): Record<string, unknown> {
    const loop = this.socialLoopMemory(task);
    const latestText = messages
      .map((message) => message.text)
      .filter(Boolean)
      .join(' / ');
    const targetUserId =
      loop.targetUserId ??
      this.number(messages[messages.length - 1]?.senderId) ??
      null;
    const intent = this.string(summary.intent);

    if (intent === 'decline') {
      return {
        source: 'fallback',
        nextAction: 'stop',
        action: null,
        toolName: null,
        input: {},
        reason: '对方暂时拒绝，停止推进并等待新的上下文。',
        confidence: 0.72,
      };
    }

    if (
      intent === 'accept' &&
      targetUserId &&
      task.permissionMode === AgentTaskPermissionMode.LimitedAuto
    ) {
      return {
        source: 'fallback',
        nextAction: 'offline_meeting',
        action: SocialAgentAction.OfflineMeet,
        toolName: SocialAgentToolName.OfflineMeeting,
        input: {
          targetUserId,
          title: task.title || '线下见面安排',
          description: this.string(summary.summary) ?? this.preview(latestText),
        },
        reason: '对方接受邀约，Limited Auto Mode 可继续安排线下见面。',
        confidence: 0.76,
      };
    }

    if (
      intent === 'accept' &&
      targetUserId &&
      task.permissionMode === AgentTaskPermissionMode.Confirm
    ) {
      return {
        source: 'fallback',
        nextAction: 'invite_activity',
        action: SocialAgentAction.SendInvite,
        toolName: SocialAgentToolName.InviteActivity,
        input: {
          targetUserId,
          title: task.title || '约练邀请',
          description: this.string(summary.summary) ?? this.preview(latestText),
        },
        reason: '对方接受邀约，Confirm Mode 可生成活动邀请。',
        confidence: 0.72,
      };
    }

    return {
      source: 'fallback',
      nextAction: 'reply_message',
      action: SocialAgentAction.SendMessage,
      toolName: SocialAgentToolName.ReplyMessage,
      input: {
        conversationId: loop.conversationId,
        targetUserId,
        text: this.fallbackReplyText(latestText, summary),
      },
      reason: '继续用低压力回复确认细节。',
      confidence: 0.7,
    };
  }

  private normalizeNextActionDecision(
    task: AgentTask,
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const loop = this.socialLoopMemory(task);
    const rawNextAction =
      this.string(raw.nextAction ?? raw.actionType) ?? 'reply_message';
    let toolName =
      this.normalizeToolName(raw.toolName) ??
      this.toolForNextAction(rawNextAction);
    if (!toolName) toolName = SocialAgentToolName.ReplyMessage;

    let input = this.isRecord(raw.input) ? { ...raw.input } : {};
    if (toolName === SocialAgentToolName.ReplyMessage) {
      input = {
        conversationId:
          this.string(input.conversationId) ?? loop.conversationId,
        targetUserId:
          this.number(input.targetUserId) ?? loop.targetUserId ?? null,
        text:
          this.string(input.text ?? raw.replyText ?? raw.message) ??
          this.fallbackReplyText('', raw),
        ...input,
      };
    }
    if (
      [
        SocialAgentToolName.AddFriend,
        SocialAgentToolName.InviteActivity,
        SocialAgentToolName.OfflineMeeting,
        SocialAgentToolName.Payment,
      ].includes(toolName)
    ) {
      input = {
        targetUserId:
          this.number(input.targetUserId) ?? loop.targetUserId ?? null,
        ...input,
      };
    }
    if (
      toolName === SocialAgentToolName.Payment &&
      !this.positiveAmount(input.amount)
    ) {
      toolName = SocialAgentToolName.ReplyMessage;
      input = {
        conversationId: loop.conversationId,
        targetUserId: loop.targetUserId ?? null,
        text: '我可以继续帮你处理支付意图。你想确认一下具体金额吗？',
      };
    }

    const permissionAction = this.permissionActionForTool(
      task.permissionMode,
      toolName,
    );
    if (
      permissionAction &&
      !this.permissions.canExecute(task.permissionMode, permissionAction)
    ) {
      const fallbackTool = this.permissions.canExecute(
        task.permissionMode,
        SocialAgentAction.SendMessage,
      )
        ? SocialAgentToolName.ReplyMessage
        : null;
      if (!fallbackTool) {
        return {
          source: this.string(raw.source) ?? 'normalized',
          nextAction: 'stop',
          action: null,
          toolName: null,
          input: {},
          reason: `Permission mode ${task.permissionMode} blocks ${toolName}`,
          confidence: this.number(raw.confidence) ?? 0.5,
        };
      }
      toolName = fallbackTool;
      input = {
        conversationId: loop.conversationId,
        targetUserId: loop.targetUserId ?? null,
        text: this.fallbackReplyText('', raw),
      };
    }

    const nextAction =
      rawNextAction === 'stop' ? 'stop' : this.nextActionForTool(toolName);
    if (nextAction === 'stop') {
      return {
        source: this.string(raw.source) ?? 'normalized',
        nextAction: 'stop',
        action: null,
        toolName: null,
        input: {},
        reason:
          this.string(raw.reason) ?? 'No further social action is needed.',
        confidence: this.number(raw.confidence) ?? 0.6,
      };
    }

    return {
      ...raw,
      nextAction,
      action: this.permissionActionForTool(task.permissionMode, toolName),
      toolName,
      input,
      reason: this.string(raw.reason) ?? `Execute ${toolName}`,
      confidence: this.number(raw.confidence) ?? 0.65,
    };
  }

  private toolForNextAction(value: string): SocialAgentToolName | null {
    switch (value) {
      case 'reply_message':
      case 'send_message':
      case 'send_message_to_candidate':
        return SocialAgentToolName.ReplyMessage;
      case 'add_friend':
      case 'connect_candidate':
        return SocialAgentToolName.AddFriend;
      case 'invite_activity':
      case 'send_invite':
        return SocialAgentToolName.InviteActivity;
      case 'offline_meeting':
      case 'offline_meet':
        return SocialAgentToolName.OfflineMeeting;
      case 'payment':
        return SocialAgentToolName.Payment;
      case 'stop':
        return null;
      default:
        return this.normalizeToolName(value);
    }
  }

  private nextActionForTool(toolName: SocialAgentToolName | null): string {
    switch (toolName) {
      case SocialAgentToolName.ReplyMessage:
      case SocialAgentToolName.SendMessage:
      case SocialAgentToolName.SendMessageToCandidate:
        return 'reply_message';
      case SocialAgentToolName.AddFriend:
      case SocialAgentToolName.ConnectCandidate:
        return 'add_friend';
      case SocialAgentToolName.InviteActivity:
        return 'invite_activity';
      case SocialAgentToolName.OfflineMeeting:
        return 'offline_meeting';
      case SocialAgentToolName.Payment:
        return 'payment';
      default:
        return 'stop';
    }
  }

  private fallbackReplyText(
    latestText: string,
    summary: Record<string, unknown>,
  ): string {
    const summaryText =
      this.string(summary.summary) ?? this.preview(latestText);
    if (/(几点|时间|路线|哪里|地点)/i.test(latestText)) {
      return '可以，我们先把时间、地点和路线确认清楚。我倾向公开场地，节奏按你舒服的来。';
    }
    if (summaryText) {
      return `收到，我理解是：${summaryText}。我们可以继续按这个方向推进。`;
    }
    return '收到，我会继续帮你低压力推进这次约练。';
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    const parsed = JSON.parse(trimmed) as unknown;
    return this.isRecord(parsed) ? parsed : {};
  }

  private preview(value: unknown, max = 160): string {
    const text = this.string(value) ?? '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  private async recordActionSideEffects(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    call: SocialAgentToolCallRecord,
  ): Promise<void> {
    const policy = this.toolPolicyMetadata(task, toolName);
    const audit = this.buildToolAuditDetails(
      task,
      toolName,
      input,
      call,
      policy,
    );
    const actionLog = await this.actionLogs.logAgentAction({
      ownerUserId: task.ownerUserId,
      agentId: task.agentConnectionId,
      agentTaskId: task.id,
      actionType: this.actionTypeForTool(toolName),
      actionStatus: this.actionStatusForCall(call),
      eventType:
        call.status === 'succeeded'
          ? 'social_agent.tool.succeeded'
          : `social_agent.tool.${call.status}`,
      conversationId: this.string(call.output?.conversationId) ?? null,
      messageId:
        this.string(call.output?.messageId) ??
        this.string(call.output?.id) ??
        null,
      status: call.status,
      riskLevel: audit.riskLevel,
      targetUserId: this.targetUserIdFor(input, call.output),
      relatedSocialRequestId: this.relatedSocialRequestIdFor(
        input,
        call.output,
      ),
      relatedCandidateId: this.relatedCandidateIdFor(
        toolName,
        input,
        call.output,
      ),
      relatedActivityId: this.relatedActivityIdFor(
        toolName,
        input,
        call.output,
      ),
      inputSummary: audit.inputSummary,
      outputSummary: audit.outputSummary,
      payload: {
        ...audit,
        agentTaskId: task.id,
        stepId: call.stepId,
        toolCallId: call.id,
        toolName,
        permissionMode: task.permissionMode,
        policy,
        userId: task.ownerUserId,
        input,
        output: call.output,
        error: call.error,
      },
      reason: this.string(call.error?.message) ?? null,
    });

    if (!actionLog) {
      this.logger.warn(
        `Action completed without agent_action_logs entry for task=${task.id}, tool=${toolName}`,
      );
    }

    if (this.shouldWriteActionResultInbox(toolName) && task.agentConnectionId) {
      try {
        await this.writeActionResultInbox(task, toolName, call);
      } catch (error) {
        this.logger.warn(
          `Failed to write action result inbox for task=${task.id}, tool=${toolName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private buildToolAuditDetails(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    call: SocialAgentToolCallRecord,
    policy: Record<string, unknown>,
  ): ToolAuditDetails {
    return {
      userId: task.ownerUserId,
      agentTaskId: task.id,
      toolName,
      inputSummary: this.toolInputSummary(toolName, input),
      outputSummary: this.toolOutputSummary(toolName, call),
      riskLevel: this.riskLevelForTool(toolName),
      requiresApproval:
        typeof policy.requiresApproval === 'boolean'
          ? policy.requiresApproval
          : false,
      approvalId: this.approvalIdFor(toolName, input, call.output),
      status: call.status,
      error: call.error,
      createdAt: call.completedAt,
    };
  }

  private toolInputSummary(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): string {
    return this.preview(
      `${toolName} input=${this.auditValuePreview(input, 320)}`,
      500,
    );
  }

  private toolOutputSummary(
    toolName: SocialAgentToolName,
    call: SocialAgentToolCallRecord,
  ): string {
    if (call.status !== 'succeeded') {
      const errorText =
        this.string(call.error?.message) ??
        this.string(call.error?.code) ??
        'unknown_error';
      return this.preview(`${toolName} ${call.status}: ${errorText}`, 500);
    }

    return this.preview(
      `${toolName} succeeded output=${this.auditValuePreview(
        call.output ?? {},
        320,
      )}`,
      500,
    );
  }

  private approvalIdFor(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
  ): number | null {
    const outputApproval = this.isRecord(output?.approval)
      ? output.approval
      : null;
    return (
      this.number(input.approvalId) ??
      ([
        SocialAgentToolName.ApproveAction,
        SocialAgentToolName.RejectAction,
      ].includes(toolName)
        ? this.number(input.id)
        : undefined) ??
      this.number(output?.approvalId) ??
      this.number(outputApproval?.id) ??
      ([
        SocialAgentToolName.ApproveAction,
        SocialAgentToolName.RejectAction,
      ].includes(toolName)
        ? this.number(output?.id)
        : undefined) ??
      null
    );
  }

  private auditValuePreview(value: unknown, max: number): string {
    const compactValue = this.compactAuditValue(value);
    const text =
      typeof compactValue === 'string'
        ? compactValue
        : JSON.stringify(compactValue);
    return this.preview(text ?? this.safeUnknownText(value), max);
  }

  private compactAuditValue(value: unknown, depth = 0): unknown {
    if (value == null) return value;
    if (typeof value === 'string') return this.preview(value, 160);
    if (typeof value !== 'object') return value;
    if (depth >= 2) return Array.isArray(value) ? '[Array]' : '[Object]';
    if (Array.isArray(value)) {
      return value
        .slice(0, 6)
        .map((item) => this.compactAuditValue(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 12)) {
      result[key] = this.compactAuditValue(item, depth + 1);
    }
    return result;
  }

  private async writeActionResultInbox(
    task: AgentTask,
    toolName: SocialAgentToolName,
    call: SocialAgentToolCallRecord,
  ): Promise<void> {
    if (!task.agentConnectionId) {
      throw new BadRequestException(
        'agentConnectionId is required for action result inbox',
      );
    }

    await this.messages.createAgentInboxEvent({
      agentConnectionId: task.agentConnectionId,
      ownerUserId: task.ownerUserId,
      eventType: `agent.action.${call.status}`,
      conversationId: this.string(call.output?.conversationId) || null,
      messageId:
        this.string(call.output?.messageId) ||
        this.string(call.output?.id) ||
        null,
      requestId:
        this.relatedSocialRequestIdFor(call.input, call.output) ?? null,
      candidateRecordId:
        this.relatedCandidateIdFor(toolName, call.input, call.output) ?? null,
      fromUserId: this.targetUserIdFor(call.input, call.output) ?? null,
      contentPreview:
        call.status === 'succeeded'
          ? `${toolName} completed`
          : `${toolName} ${call.status}: ${this.string(call.error?.message) ?? ''}`,
      unread: true,
      dedupeKey: `${task.agentConnectionId}:agent.action:${task.id}:${call.id}`,
      metadata: {
        agentTaskId: task.id,
        stepId: call.stepId,
        toolCallId: call.id,
        toolName,
        permissionMode: task.permissionMode,
        policy: this.toolPolicyMetadata(task, toolName),
        status: call.status,
        output: call.output,
        error: call.error,
      },
    });
  }

  private assertAgentConnectionBound(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): void {
    const requiresAgentConnection = [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.ReplyMessage,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.ConnectCandidate,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.CreateActivity,
      SocialAgentToolName.OfflineMeeting,
      SocialAgentToolName.Payment,
    ].includes(toolName);
    if (!requiresAgentConnection || task.agentConnectionId) return;
    if (this.canRunAsConfirmedUserAction(toolName, input)) return;
    throw new BadRequestException(
      `agentConnectionId is required for ${toolName}`,
    );
  }

  private canRunAsConfirmedUserAction(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): boolean {
    const userConfirmedCandidateActions = [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.ConnectCandidate,
    ];
    if (!userConfirmedCandidateActions.includes(toolName)) return false;
    const metadata = this.isRecord(input.metadata) ? input.metadata : {};
    return this.string(metadata.confirmationSource) === 'social_agent_chat';
  }

  private withAdhocConfirmationMetadata(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    ownerUserId?: number,
  ): Record<string, unknown> {
    if (!ownerUserId) return input;
    if (!this.isUserConfirmedCandidateAction(toolName)) return input;
    const metadata = this.isRecord(input.metadata) ? input.metadata : {};
    if (this.string(metadata.confirmationSource)) return input;
    return {
      ...input,
      metadata: {
        ...metadata,
        confirmationSource: 'social_agent_chat',
      },
    };
  }

  private isUserConfirmedCandidateAction(toolName: SocialAgentToolName): boolean {
    return [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.ConnectCandidate,
    ].includes(toolName);
  }

  private shouldWriteActionResultInbox(toolName: SocialAgentToolName): boolean {
    return [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.ConnectCandidate,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.CreateActivity,
      SocialAgentToolName.JoinActivity,
      SocialAgentToolName.OfflineMeeting,
      SocialAgentToolName.ReplyMessage,
      SocialAgentToolName.SaveCandidate,
      SocialAgentToolName.PublishSocialRequest,
      SocialAgentToolName.ApproveAction,
      SocialAgentToolName.RejectAction,
      SocialAgentToolName.Payment,
    ].includes(toolName);
  }

  private actionTypeForTool(toolName: SocialAgentToolName): AgentActionType {
    switch (toolName) {
      case SocialAgentToolName.PublishSocialRequest:
      case SocialAgentToolName.CreateSocialRequest:
        return AgentActionType.CreateSocialRequest;
      case SocialAgentToolName.SearchPublicIntents:
      case SocialAgentToolName.SearchActivities:
      case SocialAgentToolName.SearchMatches:
      case SocialAgentToolName.ExplainMatches:
        return AgentActionType.RunMatch;
      case SocialAgentToolName.DraftOpener:
        return AgentActionType.GenerateInvite;
      case SocialAgentToolName.SendMessageToCandidate:
      case SocialAgentToolName.SendMessage:
      case SocialAgentToolName.ReplyMessage:
        return AgentActionType.SendMessage;
      case SocialAgentToolName.ConnectCandidate:
      case SocialAgentToolName.AddFriend:
        return AgentActionType.AddFriend;
      case SocialAgentToolName.CreateActivity:
        return AgentActionType.CreateActivity;
      case SocialAgentToolName.InviteActivity:
        return AgentActionType.InviteActivity;
      case SocialAgentToolName.OfflineMeeting:
        return AgentActionType.OfflineMeeting;
      case SocialAgentToolName.JoinActivity:
        return AgentActionType.JoinActivity;
      case SocialAgentToolName.SaveCandidate:
        return AgentActionType.ApproveAction;
      case SocialAgentToolName.GenerateProfileQuestions:
        return AgentActionType.GenerateProfileQuestion;
      case SocialAgentToolName.UpdateAiProfileFromAnswers:
      case SocialAgentToolName.UpdateProfileFromAgentContext:
        return AgentActionType.UpdateProfile;
      case SocialAgentToolName.GetMyProfile:
      case SocialAgentToolName.GetAiProfile:
        return AgentActionType.ReadProfile;
      case SocialAgentToolName.ApproveAction:
        return AgentActionType.ApproveAction;
      case SocialAgentToolName.RejectAction:
        return AgentActionType.RejectAction;
      case SocialAgentToolName.Payment:
        return AgentActionType.Payment;
      case SocialAgentToolName.GetCurrentTaskMemory:
      case SocialAgentToolName.GetConversations:
      case SocialAgentToolName.GetAgentInbox:
      case SocialAgentToolName.GetPendingApprovals:
      case SocialAgentToolName.ReadLongTermMemory:
      case SocialAgentToolName.SummarizeCurrentTask:
      case SocialAgentToolName.GetCandidatePoolDebug:
      case SocialAgentToolName.WriteInbox:
      case SocialAgentToolName.ReadInbox:
      case SocialAgentToolName.ReadTaskConversationMessages:
      case SocialAgentToolName.SummarizeReply:
      case SocialAgentToolName.DecideNextSocialAction:
        return AgentActionType.AgentEvent;
    }
  }

  private actionStatusForCall(
    call: SocialAgentToolCallRecord,
  ): AgentActionStatus {
    return call.status === 'succeeded'
      ? AgentActionStatus.Executed
      : AgentActionStatus.Failed;
  }

  private riskLevelForTool(
    toolName: SocialAgentToolName,
  ): AgentActionRiskLevel {
    if (
      toolName === SocialAgentToolName.Payment ||
      toolName === SocialAgentToolName.OfflineMeeting ||
      toolName === SocialAgentToolName.CreateActivity ||
      toolName === SocialAgentToolName.JoinActivity ||
      toolName === SocialAgentToolName.ApproveAction
    ) {
      return AgentActionRiskLevel.High;
    }
    if (
      [
        SocialAgentToolName.SendMessage,
        SocialAgentToolName.SendMessageToCandidate,
        SocialAgentToolName.ReplyMessage,
        SocialAgentToolName.AddFriend,
        SocialAgentToolName.ConnectCandidate,
        SocialAgentToolName.InviteActivity,
        SocialAgentToolName.SaveCandidate,
        SocialAgentToolName.PublishSocialRequest,
        SocialAgentToolName.RejectAction,
      ].includes(toolName)
    ) {
      return AgentActionRiskLevel.Medium;
    }
    return AgentActionRiskLevel.Low;
  }

  private targetUserIdFor(
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
  ): number | null {
    const candidate = this.isRecord(input.candidate) ? input.candidate : {};
    return (
      this.number(
        input.candidateUserId ??
          input.targetUserId ??
          input.toUserId ??
          input.recipientUserId ??
          input.recipientId ??
          input.receiverId ??
          input.payeeUserId ??
          input.userId ??
          input.followingId ??
          input.invitedUserId ??
          candidate.candidateUserId ??
          candidate.targetUserId ??
          candidate.toUserId ??
          candidate.recipientUserId ??
          candidate.recipientId ??
          candidate.receiverId ??
          candidate.userId,
      ) ??
      this.number(output?.targetUserId) ??
      this.number(output?.candidateUserId) ??
      this.number(output?.recipientUserId) ??
      null
    );
  }

  private relatedSocialRequestIdFor(
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
  ): number | null {
    return (
      this.number(input.socialRequestId ?? input.requestId) ??
      this.number(output?.socialRequestId) ??
      null
    );
  }

  private relatedCandidateIdFor(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
  ): number | null {
    return (
      this.number(input.candidateRecordId ?? input.candidateId) ??
      this.number(output?.candidateRecordId) ??
      (toolName === SocialAgentToolName.SaveCandidate
        ? this.number(output?.id)
        : undefined) ??
      null
    );
  }

  private relatedActivityIdFor(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
  ): number | null {
    return (
      this.number(input.activityId) ??
      this.number(output?.activityId) ??
      ([
        SocialAgentToolName.InviteActivity,
        SocialAgentToolName.CreateActivity,
        SocialAgentToolName.JoinActivity,
        SocialAgentToolName.OfflineMeeting,
      ].includes(toolName)
        ? this.number(output?.id)
        : undefined) ??
      null
    );
  }

  private assertToolAllowed(
    mode: AgentTaskPermissionMode,
    step: StepRecord,
    toolName: SocialAgentToolName,
  ): void {
    const registeredTool = this.toolRegistry.getToolByExecutorName(toolName);
    if (registeredTool && !registeredTool.permissionMode.includes(mode)) {
      throw new ForbiddenException(
        `Tool ${toolName} is not registered for permission mode ${mode}`,
      );
    }

    const action =
      this.permissionActionForTool(mode, toolName) ??
      this.permissions.normalizeAction(
        this.string(step.action ?? step.actionType) ?? '',
      );
    if (!action) return;
    if (!this.permissions.canExecute(mode, action)) {
      throw new ForbiddenException(
        `Tool ${toolName} requires action ${action}, not allowed in mode ${mode}`,
      );
    }
  }

  private assertHighRiskFrequencyLimit(
    task: AgentTask,
    toolName: SocialAgentToolName,
  ): void {
    const limit = HIGH_RISK_TOOL_DAILY_LIMITS[toolName];
    if (!limit) return;

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recentSucceededCalls = (task.toolCalls ?? []).filter((call) => {
      if (call.toolName !== toolName || call.status !== 'succeeded') {
        return false;
      }
      const startedAt =
        typeof call.startedAt === 'string' ? Date.parse(call.startedAt) : NaN;
      return Number.isFinite(startedAt) && startedAt >= since;
    });

    if (recentSucceededCalls.length >= limit) {
      throw new ForbiddenException(
        `daily_high_risk_tool_limit_exceeded: ${toolName} limit=${limit}`,
      );
    }
  }

  private toolPolicyMetadata(
    task: AgentTask,
    toolName: SocialAgentToolName,
  ): Record<string, unknown> {
    const limit = HIGH_RISK_TOOL_DAILY_LIMITS[toolName] ?? null;
    const registeredTool = this.toolRegistry.getToolByExecutorName(toolName);
    const highRisk =
      toolName === SocialAgentToolName.OfflineMeeting ||
      toolName === SocialAgentToolName.CreateActivity ||
      toolName === SocialAgentToolName.JoinActivity ||
      toolName === SocialAgentToolName.ApproveAction ||
      toolName === SocialAgentToolName.Payment;
    return {
      permissionMode: task.permissionMode,
      registryToolName: registeredTool?.name ?? null,
      category: registeredTool?.category ?? null,
      requiresApproval: registeredTool?.requiresApproval ?? null,
      riskLevel: this.riskLevelForTool(toolName),
      highRisk,
      dailyLimit: limit,
      idempotency:
        toolName === SocialAgentToolName.Payment
          ? 'paymentIntentKeys'
          : toolName === SocialAgentToolName.OfflineMeeting ||
              toolName === SocialAgentToolName.InviteActivity ||
              toolName === SocialAgentToolName.CreateActivity ||
              toolName === SocialAgentToolName.JoinActivity
            ? 'activityInviteKeys'
            : toolName === SocialAgentToolName.SendMessage ||
                toolName === SocialAgentToolName.SendMessageToCandidate ||
                toolName === SocialAgentToolName.ReplyMessage
              ? 'sentMessageKeys'
              : null,
      executionContract:
        toolName === SocialAgentToolName.Payment
          ? 'create_payment_intent_only'
          : highRisk
            ? 'audit_required'
            : 'mode_gated',
    };
  }

  private permissionActionForTool(
    mode: AgentTaskPermissionMode,
    toolName: SocialAgentToolName,
  ): SocialAgentAction | null {
    switch (toolName) {
      case SocialAgentToolName.GenerateProfileQuestions:
      case SocialAgentToolName.UpdateAiProfileFromAnswers:
      case SocialAgentToolName.UpdateProfileFromAgentContext:
      case SocialAgentToolName.ExplainMatches:
        return SocialAgentAction.GenerateContent;
      case SocialAgentToolName.PublishSocialRequest:
      case SocialAgentToolName.CreateSocialRequest:
        return SocialAgentAction.SendInvite;
      case SocialAgentToolName.SearchPublicIntents:
      case SocialAgentToolName.SearchActivities:
      case SocialAgentToolName.SearchMatches:
        return SocialAgentAction.SearchProfiles;
      case SocialAgentToolName.DraftOpener:
        return SocialAgentAction.DraftMessage;
      case SocialAgentToolName.SendMessageToCandidate:
      case SocialAgentToolName.SendMessage:
      case SocialAgentToolName.ReplyMessage:
        return SocialAgentAction.SendMessage;
      case SocialAgentToolName.ConnectCandidate:
      case SocialAgentToolName.AddFriend:
        return SocialAgentAction.AddFriend;
      case SocialAgentToolName.InviteActivity:
        return mode === AgentTaskPermissionMode.LimitedAuto
          ? SocialAgentAction.OfflineMeet
          : SocialAgentAction.SendInvite;
      case SocialAgentToolName.CreateActivity:
      case SocialAgentToolName.JoinActivity:
        return SocialAgentAction.OfflineMeet;
      case SocialAgentToolName.SaveCandidate:
        return SocialAgentAction.FavoriteCandidate;
      case SocialAgentToolName.WriteInbox:
        return SocialAgentAction.WriteInbox;
      case SocialAgentToolName.OfflineMeeting:
        return SocialAgentAction.OfflineMeet;
      case SocialAgentToolName.Payment:
        return SocialAgentAction.Payment;
      case SocialAgentToolName.GetMyProfile:
      case SocialAgentToolName.GetAiProfile:
      case SocialAgentToolName.GetCurrentTaskMemory:
      case SocialAgentToolName.GetConversations:
      case SocialAgentToolName.GetAgentInbox:
      case SocialAgentToolName.GetPendingApprovals:
      case SocialAgentToolName.ApproveAction:
      case SocialAgentToolName.RejectAction:
      case SocialAgentToolName.ReadLongTermMemory:
      case SocialAgentToolName.SummarizeCurrentTask:
      case SocialAgentToolName.GetCandidatePoolDebug:
      case SocialAgentToolName.ReadInbox:
      case SocialAgentToolName.ReadTaskConversationMessages:
      case SocialAgentToolName.SummarizeReply:
      case SocialAgentToolName.DecideNextSocialAction:
        return null;
    }
  }

  private resolveToolName(step: StepRecord): SocialAgentToolName {
    const explicit = this.normalizeToolName(step.toolName ?? step.tool);
    if (explicit) return explicit;

    const action = this.permissions.normalizeAction(
      this.string(step.action ?? step.actionType) ?? '',
    );
    switch (action) {
      case SocialAgentAction.SearchProfiles:
        return SocialAgentToolName.SearchMatches;
      case SocialAgentAction.GenerateContent:
        return SocialAgentToolName.ExplainMatches;
      case SocialAgentAction.DraftMessage:
        return SocialAgentToolName.DraftOpener;
      case SocialAgentAction.SendMessage:
        return SocialAgentToolName.SendMessage;
      case SocialAgentAction.AddFriend:
        return SocialAgentToolName.AddFriend;
      case SocialAgentAction.SendInvite:
        return SocialAgentToolName.InviteActivity;
      case SocialAgentAction.FavoriteCandidate:
        return SocialAgentToolName.SaveCandidate;
      case SocialAgentAction.WriteInbox:
        return SocialAgentToolName.WriteInbox;
      case SocialAgentAction.OfflineMeet:
        return SocialAgentToolName.OfflineMeeting;
      case SocialAgentAction.Payment:
        return SocialAgentToolName.Payment;
      default:
        throw new BadRequestException(
          'step.toolName or step.action is required',
        );
    }
  }

  private normalizeToolName(value: unknown): SocialAgentToolName | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (
      Object.values(SocialAgentToolName).includes(
        normalized as SocialAgentToolName,
      )
    ) {
      return normalized as SocialAgentToolName;
    }

    const executorToolName =
      this.toolRegistry.resolveExecutorToolName(normalized);
    return Object.values(SocialAgentToolName).includes(
      executorToolName as SocialAgentToolName,
    )
      ? (executorToolName as SocialAgentToolName)
      : null;
  }

  private shouldExecuteStep(step: StepRecord): boolean {
    const status = this.string(step.status);
    return !['succeeded', 'failed', 'blocked', 'cancelled', 'skipped'].includes(
      status ?? '',
    );
  }

  private hasNoRemainingExecutableSteps(
    plan: Record<string, unknown>[],
  ): boolean {
    return plan.every((step) => !this.shouldExecuteStep(step));
  }

  private withStepResult(
    step: StepRecord,
    call: SocialAgentToolCallRecord,
  ): StepRecord {
    return {
      ...step,
      status: call.status,
      toolCallId: call.id,
      output: call.output,
      error: call.error,
      completedAt: call.completedAt,
    };
  }

  private buildToolCall(input: {
    id: string;
    stepId: string;
    toolName: SocialAgentToolName;
    status: SocialAgentToolCallStatus;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
    startedAt: Date;
  }): SocialAgentToolCallRecord {
    const completedAt = new Date();
    return {
      id: input.id,
      stepId: input.stepId,
      toolName: input.toolName,
      status: input.status,
      input: input.input,
      output: input.output,
      error: input.error,
      startedAt: input.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - input.startedAt.getTime(),
    };
  }

  private async createTaskEvent(
    task: AgentTask,
    type: AgentTaskEventType,
    input: {
      summary: string;
      payload?: Record<string, unknown>;
      stepId?: string | null;
      toolCallId?: string | null;
    },
  ): Promise<void> {
    try {
      const actor =
        type === AgentTaskEventType.ToolReturned ||
        type === AgentTaskEventType.ToolFailed
          ? AgentTaskEventActor.Tool
          : AgentTaskEventActor.Agent;
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType: this.safeVarchar(type, 80) as AgentTaskEventType,
          actor: this.safeVarchar(actor, 80) as AgentTaskEventActor,
          summary: this.safeVarchar(input.summary, 500),
          payload: input.payload ?? {},
          stepId:
            input.stepId == null ? null : this.safeVarchar(input.stepId, 80),
          toolCallId:
            input.toolCallId == null
              ? null
              : this.safeVarchar(input.toolCallId, 80),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `[SocialAgentToolExecutor] failed to write task event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private safeVarchar(value: unknown, max = 80): string {
    let text: string;
    if (value == null) {
      text = '';
    } else if (typeof value === 'string') {
      text = value;
    } else if (typeof value === 'object') {
      try {
        text = JSON.stringify(value) ?? '';
      } catch {
        text = '[unserializable]';
      }
    } else {
      text = String(value);
    }

    if (max <= 0) return '';
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
  }

  private safeToolCallId(
    taskId: number,
    toolName: SocialAgentToolName,
    startedAt: Date,
  ): string {
    this.toolCallSequence = (this.toolCallSequence + 1) % 1_000_000;
    const alias = toolName
      .split('_')
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 12);
    return this.safeVarchar(
      `${alias || 'tool'}_${taskId}_${startedAt.getTime().toString(36)}_${this.toolCallSequence.toString(36)}`,
      80,
    );
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
    return {
      agentConnectionId: task.agentConnectionId,
      ownerUserId: task.ownerUserId,
      actorUserId: task.ownerUserId,
      metadata: {
        ...metadata,
        agentTaskId: task.id,
        stepId,
        userId: task.ownerUserId,
        source: 'social_agent_tool_executor',
      },
    };
  }

  private messageSendOptions(
    task: AgentTask,
    stepId: string,
    input: Record<string, unknown>,
  ) {
    const metadata = this.messageMetadata(task, stepId, input.metadata);
    if (
      !task.agentConnectionId &&
      this.canRunAsConfirmedUserAction(SocialAgentToolName.SendMessage, input)
    ) {
      return {
        senderType: 'user' as const,
        senderAgentId: null,
        agentConnectionId: null,
        ownerUserId: task.ownerUserId,
        actorUserId: task.ownerUserId,
        source: 'user' as const,
        metadata,
      };
    }
    return {
      senderType: 'agent' as const,
      senderAgentId: task.agentConnectionId,
      agentConnectionId: task.agentConnectionId,
      ownerUserId: task.ownerUserId,
      actorUserId: task.ownerUserId,
      source: 'ai_delegate' as const,
      metadata,
    };
  }

  private messageMetadata(
    task: AgentTask,
    stepId: string,
    raw: unknown,
  ): Record<string, unknown> {
    return {
      ...(this.isRecord(raw) ? raw : {}),
      agentTaskId: task.id,
      stepId,
      userId: task.ownerUserId,
      source: 'social_agent_tool_executor',
    };
  }

  private stepId(step: StepRecord): string {
    return this.string(step.id) || '';
  }

  private stepInput(step: StepRecord): Record<string, unknown> {
    return this.isRecord(step.input) ? step.input : {};
  }

  private activityTitle(toolName: SocialAgentToolName): string {
    if (toolName === SocialAgentToolName.OfflineMeeting) return '线下见面安排';
    if (toolName === SocialAgentToolName.CreateActivity) return '约练活动';
    return '约练邀请';
  }

  private offlineMeetingInviteText(
    input: Record<string, unknown>,
    activity: SocialActivity,
  ): string {
    const explicit = this.string(
      input.text ?? input.message ?? input.content ?? input.inviteMessage,
    );
    if (explicit) return explicit;

    const parts = [`我已为你发起线下见面安排：${activity.title || '线下见面'}`];
    if (activity.city || activity.locationName) {
      parts.push(
        `地点：${[activity.city, activity.locationName].filter(Boolean).join(' ')}`,
      );
    }
    if (activity.startTime) {
      parts.push(
        `时间：${activity.startTime.toLocaleString('zh-CN', { hour12: false })}`,
      );
    }
    parts.push('请在 FitMeet 中确认是否参加。');
    return parts.join('\n');
  }

  private asRecord(output: unknown): Record<string, unknown> {
    if (this.isRecord(output)) return output;
    return { value: output };
  }

  private errorPayload(error: unknown): Record<string, unknown> {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const responseRecord = this.isRecord(response) ? response : {};
      return {
        code:
          this.string(responseRecord.code) ??
          (error instanceof ForbiddenException
            ? 'tool_permission_blocked'
            : 'TOOL_EXECUTION_FAILED'),
        message:
          this.string(responseRecord.message) ??
          (error instanceof Error ? error.message : String(error)),
        statusCode: error.getStatus(),
      };
    }
    return {
      code:
        error instanceof ForbiddenException
          ? 'tool_permission_blocked'
          : 'tool_execution_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private logToolFailure(
    task: AgentTask,
    toolName: SocialAgentToolName,
    stepId: string,
    call: SocialAgentToolCallRecord,
    error: unknown,
  ): void {
    this.logger.error(
      JSON.stringify({
        event: 'agent.task.tool_failed',
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        agentConnectionId: task.agentConnectionId,
        permissionMode: task.permissionMode,
        stepId,
        toolCallId: call.id,
        toolName,
        status: call.status,
        error: call.error,
      }),
      error instanceof Error ? error.stack : undefined,
    );
  }

  private logTaskFailure(
    task: AgentTask,
    call: SocialAgentToolCallRecord,
  ): void {
    this.logger.error(
      JSON.stringify({
        event: 'agent.task.failed',
        taskId: task.id,
        ownerUserId: task.ownerUserId,
        agentConnectionId: task.agentConnectionId,
        permissionMode: task.permissionMode,
        statusReason: task.statusReason,
        failedToolCallId: call.id,
        failedStepId: call.stepId,
        failedToolName: call.toolName,
        failedStatus: call.status,
        error: call.error,
      }),
    );
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private stringList(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    return raw
      .map((item) => this.string(item))
      .filter((item): item is string => Boolean(item));
  }

  private safeUnknownText(value: unknown): string {
    if (value == null) return 'null';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint' ||
      typeof value === 'symbol'
    ) {
      return String(value);
    }
    try {
      return JSON.stringify(value) ?? '[unserializable]';
    } catch {
      return '[unserializable]';
    }
  }

  private number(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private positiveAmount(value: unknown): number | undefined {
    const amount = this.number(value);
    if (amount == null || amount <= 0) return undefined;
    return Math.round(amount * 100) / 100;
  }

  private paymentIntentStatus(value: unknown): PaymentIntentStatus | undefined {
    return typeof value === 'string' &&
      Object.values(PaymentIntentStatus).includes(value as PaymentIntentStatus)
      ? (value as PaymentIntentStatus)
      : undefined;
  }

  private bool(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', '是'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', '否'].includes(normalized)) return false;
    }
    return undefined;
  }

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private socialRequestType(value: unknown): SocialRequestType | undefined {
    return typeof value === 'string' &&
      Object.values(SocialRequestType).includes(value as SocialRequestType)
      ? (value as SocialRequestType)
      : undefined;
  }

  private activityType(value: unknown): ActivityType | undefined {
    return typeof value === 'string' &&
      Object.values(ActivityType).includes(value as ActivityType)
      ? (value as ActivityType)
      : undefined;
  }
}
