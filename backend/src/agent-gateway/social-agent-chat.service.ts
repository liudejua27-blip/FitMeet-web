import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import type { MatchedCandidateView } from '../match/match.service';
import { MessagesService } from '../messages/messages.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { UpdateSocialRequestDto } from '../social-requests/dto/update-social-request.dto';
import {
  SocialRequestSafety,
  SocialRequestSource,
  SocialRequestType,
  SocialRequestVisibility,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { SocialProfileService } from '../users/social-profile.service';
import {
  AgentConnection,
  ConnectionStatus,
} from './entities/agent-connection.entity';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskRiskLevel,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  SocialAgentPlanFailureContext,
  SocialAgentPlanReason,
  SocialAgentPlannerResult,
  SocialAgentPlannerService,
} from './social-agent-planner.service';
import {
  SocialAgentIntentRouterService,
  type SocialAgentIntentEntities,
  type SocialAgentIntentRouterResult,
  type SocialAgentIntentType,
  type SocialAgentReplyStrategy,
} from './social-agent-intent-router.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import {
  appendShortTermMemoryItem,
  appendSocialAgentUserMemo,
  mergeSocialAgentActiveEntities,
  mergeSocialAgentBoundaries,
  mergeSocialAgentPreferences,
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
  recordSocialAgentRecommendedCandidates,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';
import { AgentApprovalService } from './agent-approval.service';
import {
  AgentApprovalRequest,
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  CandidatePoolDebugReasons,
  SocialAgentCandidatePoolService,
} from './social-agent-candidate-pool.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentRagService } from './social-agent-rag.service';

export interface SocialAgentVisibleStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

export interface SocialAgentChatCandidate {
  agentTaskId: number;
  source?: 'profile_candidate' | 'public_intent' | 'activity';
  isRealData?: boolean;
  socialRequestId: number | null;
  targetUserId: number;
  userId: number;
  candidateUserId?: number;
  publicIntentId?: string | null;
  activityId?: number | null;
  displayName?: string;
  candidateRecordId: number | null;
  nickname: string;
  avatar: string;
  color: string;
  city: string;
  score: number;
  level: string;
  distanceKm: number | null;
  commonTags: string[];
  reasons: string[];
  interestTags?: string[];
  profileCompleteness?: number;
  dataQuality?: 'complete' | 'partial' | 'incomplete';
  matchScore?: number;
  matchReasons?: string[];
  riskWarnings?: string[];
  risk: { level: string; warnings: string[] };
  suggestedOpener?: string;
  suggestedMessage: string;
  status?: string;
}

export interface SocialAgentChatRunResult {
  taskId: number;
  status: AgentTaskStatus;
  visibleSteps: SocialAgentVisibleStep[];
  assistantMessage: string;
  emptyReason?: 'no_real_candidates' | null;
  message?: string | null;
  debugReasons?: CandidatePoolDebugReasons | null;
  socialRequestDraft:
    | (CreateSocialRequestDto & {
        agentTaskId: number;
        socialRequestId?: number | null;
        mode: 'draft';
        card?: Record<string, unknown>;
        profileUsed?: Record<string, unknown>;
      })
    | null;
  candidates: SocialAgentChatCandidate[];
  approvalRequiredActions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

type CandidateTargetBody = {
  targetUserId?: unknown;
  candidateUserId?: unknown;
  toUserId?: unknown;
  recipientUserId?: unknown;
  recipientId?: unknown;
  receiverId?: unknown;
  userId?: unknown;
  followingId?: unknown;
  publicIntentId?: unknown;
  socialRequestId?: unknown;
  candidateRecordId?: unknown;
  candidate?: Record<string, unknown> | null;
};

export type SocialAgentChatStreamEvent =
  | { type: 'task'; taskId: number; status: AgentTaskStatus }
  | { type: 'step'; step: SocialAgentVisibleStep }
  | { type: 'result'; result: SocialAgentChatRunResult }
  | { type: 'error'; message: string };

type SocialAgentRequestDraft = NonNullable<
  SocialAgentChatRunResult['socialRequestDraft']
>;
type SocialAgentChatRunBody = {
  goal?: string;
  permissionMode?: AgentTaskPermissionMode;
  idempotencyKey?: string | null;
};
type SocialAgentChatReplanRunBody = {
  userMessage?: string | null;
  reason?: SocialAgentPlanReason;
  failure?: SocialAgentPlanFailureContext | null;
};
type SocialAgentRouteMessageBody = {
  message?: string | null;
  taskId?: number | null;
  hasCandidates?: boolean;
};
type StreamEmit = (event: SocialAgentChatStreamEvent) => void | Promise<void>;

export type SocialAgentIntentAction =
  | 'reply'
  | 'save_context'
  | 'queue_search'
  | 'queue_replan'
  | 'await_confirmation'
  | 'clarify';

export interface SocialAgentIntentRouteResult {
  intent: SocialAgentIntentType;
  confidence: number;
  entities: SocialAgentIntentEntities;
  shouldSearch: boolean;
  shouldReplan: boolean;
  shouldUpdateProfile: boolean;
  shouldExecuteAction: boolean;
  replyStrategy: SocialAgentReplyStrategy;
  source: 'rules' | 'deepseek';
  action: SocialAgentIntentAction;
  taskId: number | null;
  assistantMessage: string;
  savedContext: boolean;
  profileUpdated: boolean;
  shouldQueueRun: boolean;
  runMode: 'initial' | 'follow_up' | null;
  queuedRun?: SocialAgentAsyncRunSnapshot | null;
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
  activityResults?: SocialAgentActivityResult[];
}

export interface SocialAgentPendingApprovalSnapshot {
  id: number;
  type: ApprovalType;
  actionType: string;
  summary: string;
  riskLevel: ApprovalRiskLevel;
  payload: Record<string, unknown>;
  expiresAt: string | null;
}

export interface SocialAgentActivityResult {
  id: string;
  source: 'public_intent' | 'activity';
  isRealData?: boolean;
  activityId?: number | null;
  publicIntentId?: string | null;
  title: string;
  description: string;
  city: string;
  loc: string;
  requestType: string;
  interestTags: string[];
  timePreference: string;
  ownerUserId: number | null;
  status: string;
  createdAt: string | null;
  matchScore?: number;
  matchReasons?: string[];
}

export interface SocialAgentSessionMessage {
  id: string;
  role: 'user' | 'assistant';
  kind?: 'text' | 'risk' | 'approval';
  content: string;
  createdAt: string | null;
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApprovalSnapshot;
}

export interface SocialAgentSessionTaskSummary {
  id: number;
  status: AgentTaskStatus;
  title: string;
  goal: string;
  permissionMode: AgentTaskPermissionMode;
  statusReason: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SocialAgentSessionSnapshot {
  hasSession: boolean;
  activeTaskId: number | null;
  task: SocialAgentSessionTaskSummary | null;
  messages: SocialAgentSessionMessage[];
  events: Array<Record<string, unknown>>;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  pendingApprovals: SocialAgentPendingApprovalSnapshot[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}

export interface SocialAgentCurrentTaskSnapshot {
  taskId: number;
  status: AgentTaskStatus;
  taskType: string;
  title: string;
  goal: string;
  memory: Record<string, unknown>;
  result: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
}

export interface SocialAgentTimelineMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  kind:
    | 'text'
    | 'status'
    | 'candidates'
    | 'activityResults'
    | 'approval'
    | 'risk'
    | 'tool';
  text: string;
  createdAt: string | null;
  candidates?: SocialAgentChatCandidate[];
  activityResults?: SocialAgentActivityResult[];
  pendingApproval?: SocialAgentPendingApprovalSnapshot | null;
  toolCalls?: Array<Record<string, unknown>>;
}

export interface SocialAgentTaskTimelineSnapshot {
  taskId: number;
  messages: SocialAgentTimelineMessage[];
  task: SocialAgentSessionTaskSummary;
  memory: Record<string, unknown>;
  result: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
  events: Array<Record<string, unknown>>;
  latestRun: SocialAgentAsyncRunSnapshot | null;
  pendingApprovals: SocialAgentPendingApprovalSnapshot[];
  candidateActions: Record<string, Record<string, unknown>>;
  restoredAt: string;
}

type SocialAgentCandidateSearchResult = {
  candidates: SocialAgentChatCandidate[];
  emptyReason: 'no_real_candidates' | null;
  message: string | null;
  debugReasons: CandidatePoolDebugReasons | null;
};

export interface SocialAgentChatReplanRunResult extends SocialAgentChatRunResult {
  replan: SocialAgentPlannerResult;
}

export type SocialAgentAsyncRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export interface SocialAgentAsyncRunSnapshot {
  taskId: number;
  runId: string;
  status: SocialAgentAsyncRunStatus;
  phase: string;
  message: string;
  visibleSteps: SocialAgentVisibleStep[];
  queuedAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  pollAfterMs: number;
  taskStatus?: AgentTaskStatus;
  error?: Record<string, unknown> | null;
  replan?: SocialAgentPlannerResult | null;
  result?: SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null;
}

export interface SocialAgentAppendContextResult {
  taskId: number;
  saved: true;
  eventType: AgentTaskEventType.SocialAgentContextAppended;
  userMessage: string;
  previousGoal: string;
  refreshedGoal: string;
  appendedAt: string;
}

type SocialAgentFollowUpContext = {
  task: AgentTask;
  userMessage: string;
  previousGoal: string;
  refreshedGoal: string;
  appendedAt: string;
  alreadyAppended: boolean;
};

@Injectable()
export class SocialAgentChatService {
  private readonly logger = new Logger(SocialAgentChatService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    private readonly planner: SocialAgentPlannerService,
    private readonly intentRouter: SocialAgentIntentRouterService,
    private readonly executor: SocialAgentToolExecutorService,
    private readonly socialProfiles: SocialProfileService,
    private readonly messages: MessagesService,
    private readonly approvals: AgentApprovalService,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    private readonly candidatePool: SocialAgentCandidatePoolService,
    private readonly metrics: SocialAgentMetricsService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
    private readonly rag: SocialAgentRagService,
  ) {}

  run(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentChatRunResult> {
    return this.runInternal(ownerUserId, body);
  }

  async routeMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    return this.handleMessage(ownerUserId, body);
  }

  async handleMessage(
    ownerUserId: number,
    body: SocialAgentRouteMessageBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const startedAt = Date.now();
    const message = cleanDisplayText(body.message, '').trim();
    if (!message) throw new BadRequestException('请输入消息');
    const taskId = this.number(body.taskId);
    let task = await this.ensureConversationTask(ownerUserId, taskId, message);
    await this.recordUserMessage(task, message);

    const [profile, freshTask, longTermSnapshot] = await Promise.all([
      this.readProfileSummary(ownerUserId),
      this.assertTaskOwner(task.id, ownerUserId),
      this.longTermMemory.readSnapshot(ownerUserId).catch((error) => {
        this.metrics.recordError('long_term_memory_read_failed');
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.long_term_memory.read_failed',
            ownerUserId,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return null;
      }),
    ]);
    task = freshTask;
    const route = await this.intentRouter.route({
      message,
      taskContext: this.buildTaskContext(task, body, longTermSnapshot),
      profile: profile ?? {},
      conversationHistory: this.readConversationHistory(task),
    });
    await this.recordIntentRoute(task, route).catch((error) => {
      this.metrics.recordError('intent_route_event_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.intent_route.event_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
    this.metrics.recordIntent(route.intent, route.source);
    appendSocialAgentUserMemo(task, message, route.intent);
    this.applyTaskMemoryForIntent(task, message, route);
    await this.applyRagContext(task, route, message, longTermSnapshot);

    let savedContext = false;
    let profileUpdated = false;
    let queuedRun: SocialAgentAsyncRunSnapshot | null = null;
    let runMode: SocialAgentIntentRouteResult['runMode'] = null;
    let assistantMessage = this.assistantMessageForRoute(route, task, message);
    let activityResults: SocialAgentActivityResult[] = [];

    if (
      route.intent === 'profile_update' ||
      route.intent === 'safety_or_boundary'
    ) {
      await this.rememberRoutedMessage(task, message, route.intent);
      savedContext = true;
      profileUpdated = await this.saveIntentToProfile(
        ownerUserId,
        route.intent,
        message,
      );
      task = await this.assertTaskOwner(task.id, ownerUserId);
    }

    if (route.intent === 'activity_search') {
      activityResults = await this.searchActivityResults(
        ownerUserId,
        route.entities,
        message,
      );
      this.metrics.recordActivitySearch(
        activityResults.length > 0,
        activityResults.length,
      );
      if (activityResults.length > 0) {
        this.rememberActivityResultsInTaskMemory(task, activityResults);
        assistantMessage = `已为你找到 ${activityResults.length} 条公开约练/活动意向，先放在下方卡片里。如果都不合适，告诉我"再找几条"或换个时间/活动，我再补搜候选人。`;
      } else {
        assistantMessage =
          '当前没有找到符合条件的真实活动或公开约练卡片，可以换个城市、时间或活动类型再试。';
      }
    } else if (route.intent === 'social_search') {
      if (route.shouldReplan && this.hasSearchContext(task)) {
        queuedRun = await this.replanAndRefresh(ownerUserId, task.id, {
          userMessage: message,
          reason: 'user_follow_up',
        });
        runMode = 'follow_up';
      } else {
        queuedRun = await this.queueInitialSearchForTask(
          ownerUserId,
          task,
          message,
        );
        runMode = 'initial';
      }
    }

    if (route.intent === 'candidate_followup') {
      if (route.shouldSearch || route.shouldReplan) {
        if (this.hasSearchContext(task)) {
          queuedRun = await this.replanAndRefresh(ownerUserId, task.id, {
            userMessage: message,
            reason: 'user_follow_up',
          });
          runMode = 'follow_up';
        } else {
          queuedRun = await this.queueInitialSearchForTask(
            ownerUserId,
            task,
            message,
          );
          runMode = 'initial';
        }
      } else {
        assistantMessage = this.candidateFollowupReply(task, message);
      }
    }

    if (queuedRun) {
      task = await this.assertTaskOwner(task.id, ownerUserId);
    }

    let pendingApproval: SocialAgentPendingApprovalSnapshot | null = null;
    if (route.intent === 'action_request') {
      pendingApproval = await this.createActionApproval(
        ownerUserId,
        task,
        message,
        route,
      );
      if (pendingApproval) {
        assistantMessage = `${assistantMessage}\n（已创建待确认动作 #${pendingApproval.id}，请在卡片上点击“批准/拒绝”。）`;
        this.metrics.recordApproval(pendingApproval.type);
        recordSocialAgentPendingAction(task, {
          id: pendingApproval.id,
          type: pendingApproval.type,
          actionType: pendingApproval.actionType,
          summary: pendingApproval.summary,
          riskLevel: pendingApproval.riskLevel,
          at: new Date().toISOString(),
        });
      }
    }

    const result: SocialAgentIntentRouteResult = {
      ...route,
      shouldReplan: queuedRun ? runMode === 'follow_up' : route.shouldReplan,
      action: this.toRouteAction(route, queuedRun, runMode),
      taskId: task.id,
      assistantMessage,
      savedContext,
      profileUpdated,
      shouldQueueRun: Boolean(queuedRun),
      runMode,
      queuedRun,
      pendingApproval,
      activityResults,
    };
    if (queuedRun && runMode) this.metrics.recordQueuedRun(runMode);
    this.metrics.recordAction(result.action);
    await this.recordAssistantMessage(task, assistantMessage, result);
    this.metrics.observeRouteLatency(Date.now() - startedAt);
    return result;
  }

  async runQueued(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    const goal = cleanDisplayText(body.goal, '').trim();
    if (!goal) throw new BadRequestException('请输入你的社交需求');
    const permissionMode = this.normalizePermissionMode(body.permissionMode);
    const idempotencyKey =
      cleanDisplayText(body.idempotencyKey, '') ||
      `social-agent-chat:${ownerUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const task = await this.createOrReuseTask({
      ownerUserId,
      goal,
      permissionMode,
      idempotencyKey,
    });
    const runId = this.createRunId();
    const now = new Date().toISOString();
    const queuedRun: SocialAgentAsyncRunSnapshot = {
      taskId: task.id,
      runId,
      status: 'queued',
      phase: 'queued',
      message: '已收到需求，正在后台搜索候选人。',
      visibleSteps: [
        {
          id: 'task.created',
          label: '已创建 Social Agent 任务',
          status: 'done',
        },
      ],
      queuedAt: now,
      startedAt: null,
      updatedAt: now,
      completedAt: null,
      failedAt: null,
      pollAfterMs: 1500,
      taskStatus: task.status,
      error: null,
      replan: null,
      result: null,
    };
    task.status = AgentTaskStatus.Planning;
    task.statusReason = 'chat_run_queued';
    task.result = this.withStoredRun(task.result, queuedRun);
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Social Agent 任务已进入后台队列',
      {
        runId,
        goal,
      },
    );

    void this.executeQueuedRun(
      ownerUserId,
      task.id,
      {
        ...body,
        goal,
        permissionMode,
        idempotencyKey,
      },
      runId,
    ).catch((error) => {
      this.logger.error(
        JSON.stringify({
          event: 'social_agent.chat_run.background_failed',
          taskId: task.id,
          runId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      void this.markRunFailed(ownerUserId, task.id, runId, error, {
        message: '搜索失败，请稍后重试。',
        statusReason: 'chat_run_failed',
      }).catch((markError) => {
        this.logger.error(
          JSON.stringify({
            event: 'social_agent.chat_run.mark_failed_failed',
            taskId: task.id,
            runId,
            message:
              markError instanceof Error
                ? markError.message
                : String(markError),
          }),
        );
      });
    });

    return queuedRun;
  }

  runStream(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    return this.runInternal(ownerUserId, body, emit);
  }

  private async executeQueuedRun(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatRunBody,
    runId: string,
  ): Promise<SocialAgentChatRunResult> {
    const visibleSteps: SocialAgentVisibleStep[] = [];
    await this.updateRunSnapshot(ownerUserId, taskId, runId, {
      status: 'running',
      phase: 'understand',
      startedAt: new Date().toISOString(),
      message: '正在理解需求',
    });
    const result = await this.runInternal(ownerUserId, body, async (event) => {
      if (event.type !== 'step') return;
      const existingIndex = visibleSteps.findIndex(
        (step) => step.id === event.step.id,
      );
      if (existingIndex >= 0) {
        visibleSteps[existingIndex] = event.step;
      } else {
        visibleSteps.push(event.step);
      }
      await this.updateRunSnapshot(ownerUserId, taskId, runId, {
        status: 'running',
        phase: event.step.id,
        message: event.step.label,
        visibleSteps: [...visibleSteps],
      });
    });
    const task = await this.updateRunSnapshot(ownerUserId, taskId, runId, {
      status: 'completed',
      phase: 'completed',
      completedAt: new Date().toISOString(),
      message: '已完成搜索并刷新候选人',
      visibleSteps: result.visibleSteps,
      result,
      error: null,
    });
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Social Agent 后台搜索已完成',
      {
        runId,
        candidateCount: result.candidates.length,
      },
    );
    return result;
  }

  async replanAndRefresh(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    const followUp = userMessage
      ? await this.appendFollowUpContext(task, userMessage)
      : this.readLatestFollowUpContext(task);
    if (!followUp) throw new BadRequestException('请输入补充要求');
    task = followUp.task;

    const runId = this.createRunId();
    const now = new Date().toISOString();
    const queuedRun: SocialAgentAsyncRunSnapshot = {
      taskId,
      runId,
      status: 'queued',
      phase: 'queued',
      message: '已收到补充，正在后台重新规划。',
      visibleSteps: [
        {
          id: 'append_context',
          label: '已写入当前任务上下文',
          status: 'done',
        },
      ],
      queuedAt: now,
      startedAt: null,
      updatedAt: now,
      completedAt: null,
      failedAt: null,
      pollAfterMs: 1500,
      error: null,
      replan: null,
      result: null,
    };
    task.status = AgentTaskStatus.Planning;
    task.statusReason = 'follow_up_replan_queued';
    task.result = this.withStoredRun(task.result, queuedRun);
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanQueued,
      '已进入后台重新规划队列',
      {
        runId,
        userMessage: followUp.userMessage,
        refreshedGoal: followUp.refreshedGoal,
      },
      AgentTaskEventActor.System,
    );

    void this.executeReplanAndRefresh(
      ownerUserId,
      taskId,
      {
        ...body,
        userMessage: followUp.userMessage,
      },
      runId,
    ).catch((error) => {
      this.logger.error(
        JSON.stringify({
          event: 'social_agent.replan.background_failed',
          taskId,
          runId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      void this.markRunFailed(ownerUserId, taskId, runId, error).catch(
        (markError) => {
          this.logger.error(
            JSON.stringify({
              event: 'social_agent.replan.mark_failed_failed',
              taskId,
              runId,
              message:
                markError instanceof Error
                  ? markError.message
                  : String(markError),
            }),
          );
        },
      );
    });

    return queuedRun;
  }

  async appendContext(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
  ): Promise<SocialAgentAppendContextResult> {
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    if (!userMessage) throw new BadRequestException('请输入补充要求');
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const context = await this.appendFollowUpContext(task, userMessage);
    return {
      taskId,
      saved: true,
      eventType: AgentTaskEventType.SocialAgentContextAppended,
      userMessage: context.userMessage,
      previousGoal: context.previousGoal,
      refreshedGoal: context.refreshedGoal,
      appendedAt: context.appendedAt,
    };
  }

  async getRunStatus(
    ownerUserId: number,
    taskId: number,
    runId: string,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const run = this.readStoredRun(task, runId);
    if (!run)
      throw new NotFoundException(`Social agent run ${runId} not found`);
    return {
      ...run,
      taskStatus: task.status,
      pollAfterMs: run.pollAfterMs ?? 1500,
    };
  }

  async getLatestSession(
    ownerUserId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    const task = await this.findLatestRestorableTask(ownerUserId);
    return this.buildSessionSnapshot(ownerUserId, task);
  }

  async getTaskSession(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    return this.buildSessionSnapshot(ownerUserId, task);
  }

  async getCurrentTask(
    ownerUserId: number,
  ): Promise<SocialAgentCurrentTaskSnapshot | null> {
    const task = await this.findLatestRestorableTask(ownerUserId);
    if (!task) return null;
    return {
      taskId: task.id,
      status: task.status,
      taskType: cleanDisplayText(task.taskType, 'social_agent_chat'),
      title: cleanDisplayText(task.title, 'FitMeet Social Agent 聊天'),
      goal: cleanDisplayText(task.goal, ''),
      memory: sanitizeForDisplay(task.memory) as Record<string, unknown>,
      result: sanitizeForDisplay(task.result) as Record<string, unknown>,
      updatedAt: this.isoDate(task.updatedAt),
      createdAt: this.isoDate(task.createdAt),
    };
  }

  async getTaskTimeline(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentTaskTimelineSnapshot> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    return this.buildTaskTimeline(ownerUserId, task);
  }

  private async executeReplanAndRefresh(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentChatReplanRunBody,
    runId: string,
  ): Promise<SocialAgentChatReplanRunResult> {
    let task = await this.updateRunSnapshot(ownerUserId, taskId, runId, {
      status: 'running',
      phase: 'understand',
      startedAt: new Date().toISOString(),
      message: '正在理解补充需求',
    });
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    if (!userMessage) throw new BadRequestException('请输入补充要求');
    const followUp =
      this.readLatestFollowUpContext(task) ??
      (await this.appendFollowUpContext(task, userMessage));
    task = followUp.task;
    const refreshedGoal = followUp.refreshedGoal;

    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanStarted,
      '开始异步重新规划 Social Agent 任务',
      { runId, userMessage, refreshedGoal: followUp.refreshedGoal },
      AgentTaskEventActor.System,
    );

    const visibleSteps: SocialAgentVisibleStep[] = [];
    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      this.rememberShortTermStep(task, id, label, 'running');
      const step: SocialAgentVisibleStep = { id, label, status: 'done' };
      visibleSteps.push(step);
      this.rememberShortTermStep(task, id, label, 'done');
      await this.writeEvent(task, eventType, label, payload);
      task = await this.updateRunSnapshot(ownerUserId, taskId, runId, {
        status: 'running',
        phase: id,
        message: label,
        visibleSteps: [...visibleSteps],
      });
    };

    await done(
      'follow_up_understand',
      '正在理解你的补充要求',
      AgentTaskEventType.GoalUnderstood,
      { userMessage, refreshedGoal },
    );

    const replan = await this.planner.replanTask(taskId, {
      reason: body.reason ?? 'user_follow_up',
      userMessage,
      failure: body.failure ?? null,
    });
    task = await this.assertTaskOwner(taskId, ownerUserId);
    const usedTimeoutFallback = replan.fallbackReason === 'deepseek_timeout';
    await done(
      'follow_up_replan',
      usedTimeoutFallback
        ? 'AI 分析超时，已使用规则匹配继续执行'
        : replan.source === 'fallback'
          ? '已使用本地策略更新 Agent 计划'
          : '已调用 DeepSeek 更新 Agent 计划',
      AgentTaskEventType.PlanUpdated,
      {
        planSource: replan.source,
        fallbackReason: replan.fallbackReason,
        replanAttempt: replan.replanAttempt,
        planStepCount: replan.plan.length,
      },
    );
    await this.updateRunSnapshot(ownerUserId, taskId, runId, {
      replan,
      message: usedTimeoutFallback
        ? '已收到补充信息，当前先基于规则匹配继续搜索。'
        : '已更新 Agent 计划，正在刷新候选人。',
    });

    const draftResult = await this.generateDraftWithTool(task, refreshedGoal);
    task = await this.assertTaskOwner(taskId, ownerUserId);
    const draft = this.buildDraft(
      task.id,
      draftResult.draft,
      draftResult.card,
      draftResult.profileUsed,
    );
    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft);
    task = await this.assertTaskOwner(taskId, ownerUserId);
    await done('draft', '已重新生成约练草稿', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.CreateSocialRequest,
      draft: this.safeDraftForEvent(draft),
    });

    const searchResult = await this.searchCandidates(task, draft);
    const candidates = searchResult.candidates;
    task = await this.assertTaskOwner(taskId, ownerUserId);
    await done(
      'search',
      '已重新检索附近候选人',
      AgentTaskEventType.ToolReturned,
      {
        toolName: SocialAgentToolName.SearchMatches,
        socialRequestId: draft.socialRequestId,
        candidateCount: candidates.length,
      },
    );
    await done(
      'rank',
      '已根据新的时间、地点、兴趣和安全边界排序',
      AgentTaskEventType.StepCompleted,
      { candidateCount: candidates.length },
    );
    await done('reason', '已刷新推荐理由', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.ExplainMatches,
      topCandidateUserId: candidates[0]?.userId ?? null,
    });
    await done(
      'done',
      '已根据补充要求刷新结果',
      AgentTaskEventType.TaskSucceeded,
      {
        candidateCount: candidates.length,
        requiresConfirmation: true,
        replanAttempt: replan.replanAttempt,
      },
    );

    const result = await this.completeRecommendationResult(
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      searchResult,
      'follow_up_replan_refreshed',
    );
    const finalResult = { ...result, replan };
    task = await this.updateRunSnapshot(ownerUserId, taskId, runId, {
      status: 'completed',
      phase: 'completed',
      completedAt: new Date().toISOString(),
      message: '已根据补充要求刷新计划和候选人',
      visibleSteps: [...visibleSteps],
      replan,
      result: finalResult,
      error: null,
    });
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanCompleted,
      '异步重新规划已完成',
      {
        runId,
        candidateCount: result.candidates.length,
        replanAttempt: replan.replanAttempt,
      },
      AgentTaskEventActor.System,
    );
    await this.writeInboxEventBestEffort(
      task,
      'social_agent.replan.completed',
      {
        runId,
        candidateCount: result.candidates.length,
      },
    );
    return finalResult;
  }

  private async runInternal(
    ownerUserId: number,
    body: SocialAgentChatRunBody,
    emit?: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    const goal = cleanDisplayText(body.goal, '').trim();
    if (!goal) throw new BadRequestException('请输入你的社交需求');

    const permissionMode = this.normalizePermissionMode(body.permissionMode);
    const idempotencyKey = cleanDisplayText(body.idempotencyKey, '');
    const visibleSteps: SocialAgentVisibleStep[] = [];

    let task = await this.createOrReuseTask({
      ownerUserId,
      goal,
      permissionMode,
      idempotencyKey: idempotencyKey || null,
    });
    this.rememberShortTermStep(
      task,
      'task.created',
      '已创建 Social Agent 任务',
      'done',
    );
    await emit?.({ type: 'task', taskId: task.id, status: task.status });

    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      await emit?.({ type: 'step', step: { id, label, status: 'running' } });
      this.rememberShortTermStep(task, id, label, 'running');
      const step: SocialAgentVisibleStep = { id, label, status: 'done' };
      visibleSteps.push(step);
      this.rememberShortTermStep(task, id, label, 'done');
      await this.writeEvent(task, eventType, label, payload);
      await emit?.({ type: 'step', step });
    };

    await done(
      'understand',
      '正在理解你的社交需求',
      AgentTaskEventType.GoalUnderstood,
      {
        goal,
        permissionMode,
      },
    );

    await done(
      'permission',
      `正在检查权限模式：${this.modeLabel(permissionMode)}`,
      AgentTaskEventType.Note,
      {
        permissionMode,
        policy: 'recommendation_plus_confirmation',
      },
    );

    const profileSummary = await this.readProfileSummary(ownerUserId);
    const planResult = await this.planner.planExistingTask(task);
    await done(
      'deepseek',
      planResult.source === 'fallback'
        ? '正在使用本地策略生成匹配意图'
        : '正在调用 DeepSeek 生成匹配意图',
      AgentTaskEventType.PlanGenerated,
      {
        planSource: planResult.source,
        fallbackReason: planResult.fallbackReason,
        planStepCount: Array.isArray(task.plan) ? task.plan.length : 0,
        profileSummary,
      },
    );

    const draftResult = await this.generateDraftWithTool(task, goal);
    task = await this.assertTaskOwner(task.id, ownerUserId);
    const draft = this.buildDraft(
      task.id,
      draftResult.draft,
      draftResult.card,
      draftResult.profileUsed,
    );

    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft);
    task = await this.assertTaskOwner(task.id, ownerUserId);

    const searchResult = await this.searchCandidates(task, draft);
    const candidates = searchResult.candidates;
    task = await this.assertTaskOwner(task.id, ownerUserId);
    await done(
      'search',
      '正在检索附近候选人',
      AgentTaskEventType.ToolReturned,
      {
        toolName: SocialAgentToolName.SearchMatches,
        socialRequestId: draft.socialRequestId,
        candidateCount: candidates.length,
      },
    );

    await done(
      'rank',
      '正在根据时间、地点、兴趣和安全边界排序',
      AgentTaskEventType.StepCompleted,
      { candidateCount: candidates.length },
    );

    await done('draft', '正在生成约练草稿', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.CreateSocialRequest,
      draft: this.safeDraftForEvent(draft),
    });

    await done('reason', '正在生成推荐理由', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.ExplainMatches,
      topCandidateUserId: candidates[0]?.userId ?? null,
    });

    await done('done', '已完成', AgentTaskEventType.TaskSucceeded, {
      candidateCount: candidates.length,
      requiresConfirmation: true,
    });

    return this.completeRecommendationResult(
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      searchResult,
      'recommendations_ready_waiting_user_confirmation',
      emit,
    );
  }

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const requestId = this.number(
      draft.socialRequestId ?? draft.metadata?.socialRequestId,
    );
    const dto = this.toPublishDto(task, draft);
    const publishAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...dto,
        socialRequestId: requestId,
        mode: 'publish',
        publish: true,
        syncPublicIntent: true,
        metadata: {
          ...(dto.metadata ?? {}),
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    if (publishAction.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(publishAction.error?.message, '发布约练失败'),
      );
    }

    task = await this.assertTaskOwner(taskId, ownerUserId);
    const output = this.isRecord(publishAction.output)
      ? publishAction.output
      : {};
    const socialRequestId = this.number(
      output.socialRequestId ?? output.id ?? requestId,
    );
    if (!socialRequestId)
      throw new BadRequestException('发布约练缺少 socialRequestId');
    const publicIntent = this.isRecord(output.publicIntent)
      ? output.publicIntent
      : {};
    const publicIntentId =
      cleanDisplayText(output.publicIntentId ?? publicIntent.id, '') || null;
    const socialRequest = this.isRecord(output.socialRequest)
      ? output.socialRequest
      : output;

    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      '用户确认发布约练',
      {
        socialRequestId,
        publicIntentId,
        status: 'published',
        toolName: SocialAgentToolName.CreateSocialRequest,
        toolCallId: publishAction.id,
      },
    );
    this.rememberShortTermStep(
      task,
      'publish_social_request',
      '用户确认发布约练',
      'done',
    );
    rememberSocialAgentShortTerm(task, {
      publishedSocialRequestId: socialRequestId,
      publicIntentId,
      socialRequestId,
      publishStatus: 'published',
    });
    task.status = AgentTaskStatus.Succeeded;
    task.statusReason = 'social_request_published_and_synced';
    task.completedAt = new Date();
    task.result = {
      ...(task.result ?? {}),
      publishSocialRequest: {
        socialRequestId,
        publicIntentId,
        status: 'published',
        synced: true,
        toolCallId: publishAction.id,
      },
    };
    await this.taskRepo.save(task);
    void this.longTermMemory.summarizeTask(task).catch(() => undefined);

    return {
      success: true,
      taskId,
      socialRequestId,
      publicIntentId,
      status: 'published',
      taskStatus: task.status,
      synced: true,
      toolCallId: publishAction.id,
      socialRequest: sanitizeForDisplay(socialRequest),
    };
  }

  async saveCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<SocialAgentToolCallRecord> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const candidateRecordId = this.number(body.candidateRecordId);
    const socialRequestId = this.number(body.socialRequestId);
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );
    if (!candidateRecordId && (!socialRequestId || !targetUserId)) {
      throw new BadRequestException('候选人缺少可收藏的持久化记录');
    }

    const action = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SaveCandidate,
      {
        candidateRecordId,
        socialRequestId,
        targetUserId,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    if (action.status === 'succeeded') {
      task = await this.assertTaskOwner(taskId, ownerUserId);
      this.rememberCandidateAction(task, targetUserId, {
        save: 'saved',
        candidateRecordId,
        socialRequestId,
        toolCallId: action.id,
      });
      await this.taskRepo.save(task);
    }
    return action;
  }

  async sendCandidateMessage(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number;
      candidateUserId?: number;
      message?: string;
      suggestedOpener?: string;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    await this.assertTaskOwner(taskId, ownerUserId);
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );
    const text = cleanDisplayText(
      body.message ?? body.suggestedOpener,
      '',
    ).trim();
    if (!targetUserId || !text) {
      throw new BadRequestException('请选择候选人并填写要发送的消息');
    }
    const candidateRecordId = this.number(
      body.candidateRecordId ?? body.candidate?.candidateRecordId,
    );
    const socialRequestId = this.number(
      body.socialRequestId ?? body.candidate?.socialRequestId,
    );

    const messageAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.SendMessage,
      {
        targetUserId,
        candidateUserId: targetUserId,
        text,
        message: text,
        suggestedOpener: text,
        candidateRecordId,
        socialRequestId,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    this.assertToolActionSucceeded(messageAction, '发送消息失败，请稍后再试');
    const output = this.isRecord(messageAction.output)
      ? messageAction.output
      : {};
    const messageId =
      cleanDisplayText(output.id ?? output.messageId, '') || null;
    const conversationId = cleanDisplayText(output.conversationId, '') || null;
    const candidate = this.isRecord(output.candidate) ? output.candidate : null;
    const outputStatus = cleanDisplayText(output.status, '') || null;
    const requiresApproval =
      outputStatus === 'pending_approval' ||
      outputStatus === 'pending' ||
      output.requiresApproval === true;

    const task = await this.assertTaskOwner(taskId, ownerUserId);
    this.rememberCandidateAction(task, targetUserId, {
      send: requiresApproval ? 'pendingApproval' : 'sent',
      conversationId,
      messageId,
      candidateRecordId,
      socialRequestId,
      toolCallId: messageAction.id,
    });
    await this.taskRepo.save(task);

    return {
      success: messageAction.status === 'succeeded' || requiresApproval,
      taskId,
      targetUserId,
      candidateUserId: targetUserId,
      status: requiresApproval
        ? 'pending_approval'
        : messageAction.status === 'succeeded'
          ? 'sent'
          : 'failed',
      messageId,
      conversationId,
      approvalId: this.number(output.approvalId),
      requiresApproval: requiresApproval || undefined,
      message: requiresApproval ? '发送消息需要你确认' : undefined,
      candidateStatus: cleanDisplayText(candidate?.status, '') || null,
      messageAction: {
        status: requiresApproval ? 'pending_approval' : 'sent',
        conversationId,
        messageId,
      },
      toolCall: messageAction,
    };
  }

  async connectCandidate(
    ownerUserId: number,
    taskId: number,
    body: CandidateTargetBody & {
      targetUserId?: number | null;
      candidateUserId?: number | null;
      candidateRecordId?: number | null;
      socialRequestId?: number | null;
      candidate?: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const targetUserId = await this.executor.resolveCandidateTargetUser(
      body as Record<string, unknown>,
      ownerUserId,
    );

    const friendAction = await this.executor.executeToolAction(
      taskId,
      SocialAgentToolName.AddFriend,
      {
        targetUserId,
        candidateRecordId: this.number(body.candidateRecordId),
        socialRequestId: this.number(body.socialRequestId),
        openConversation: true,
        candidate: body.candidate ?? {},
        metadata: {
          confirmationSource: 'social_agent_chat',
        },
      },
      ownerUserId,
    );
    this.assertToolActionSucceeded(friendAction, '加好友失败，请稍后再试');

    const friendOutput = this.isRecord(friendAction.output)
      ? friendAction.output
      : {};
    const friendRequestId =
      cleanDisplayText(
        friendOutput.friendRequestId ??
          friendOutput.followId ??
          friendOutput.id,
        '',
      ) || null;
    task = await this.assertTaskOwner(taskId, ownerUserId);
    const conversationId =
      cleanDisplayText(friendOutput.conversationId, '') || null;

    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationReceived,
      '用户确认加好友并进入聊天',
      {
        targetUserId,
        conversationId,
        friendActionId: friendAction.id,
      },
    );
    this.rememberShortTermStep(
      task,
      'connect_candidate',
      '用户确认加好友并进入聊天',
      'done',
    );
    rememberSocialAgentShortTerm(task, {
      conversationId,
      targetUserId,
      connectedCandidate: {
        targetUserId,
        candidateRecordId: this.number(body.candidateRecordId),
        socialRequestId: this.number(body.socialRequestId),
      },
    });
    this.rememberCandidateAction(task, targetUserId, {
      connect: 'connected',
      conversationId,
      friendRequestId,
      candidateRecordId: this.number(body.candidateRecordId),
      socialRequestId: this.number(body.socialRequestId),
      toolCallId: friendAction.id,
    });
    await this.taskRepo.save(task);
    void this.longTermMemory.summarizeTask(task).catch(() => undefined);

    return {
      taskId,
      targetUserId,
      candidateUserId: targetUserId,
      success: true,
      status: 'connected',
      following: true,
      friendRequestId,
      conversationId,
      friendAction: {
        success: true,
        status: 'connected',
        targetUserId,
        candidateUserId: targetUserId,
        following: true,
        conversationId,
        friendRequestId,
      },
      toolCall: friendAction,
    };
  }

  private assertToolActionSucceeded(
    action: SocialAgentToolCallRecord,
    fallback: string,
  ): void {
    if (action.status === 'succeeded') return;

    const message = this.toolActionErrorMessage(action, fallback);
    const error = this.isRecord(action.error) ? action.error : {};
    const code = cleanDisplayText(error.code, '') || 'TOOL_EXECUTION_FAILED';
    const statusCode = this.number(error.statusCode);
    if (action.status === 'blocked' || statusCode === 403) {
      throw new ForbiddenException({
        success: false,
        code: code === 'tool_permission_blocked' ? 'TARGET_BLOCKED' : code,
        message,
      });
    }
    if (
      statusCode === 400 ||
      code === 'MISSING_TARGET_USER' ||
      code === 'TARGET_IS_SELF'
    ) {
      throw new BadRequestException({ success: false, code, message });
    }
    throw new InternalServerErrorException({
      success: false,
      code: 'TOOL_EXECUTION_FAILED',
      message,
    });
  }

  private toolActionErrorMessage(
    action: SocialAgentToolCallRecord,
    fallback: string,
  ): string {
    const error = this.isRecord(action.error) ? action.error : {};
    return cleanDisplayText(error.message, '') || fallback;
  }

  private async createOrReuseTask(input: {
    ownerUserId: number;
    goal: string;
    permissionMode: AgentTaskPermissionMode;
    idempotencyKey: string | null;
  }): Promise<AgentTask> {
    if (input.idempotencyKey) {
      const existing = await this.taskRepo.findOne({
        where: {
          ownerUserId: input.ownerUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return existing;
    }

    const agent = await this.resolveAgentConnection(input.ownerUserId, null);
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId: input.ownerUserId,
        agentConnectionId: agent?.id ?? null,
        taskType: 'social_agent_chat',
        title: 'FitMeet Social Agent 聊天任务',
        goal: input.goal,
        input: {
          source: 'social_agent_chat',
          executionBoundary: 'recommendation_plus_confirmation',
        },
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.Pending,
        permissionMode: input.permissionMode,
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey: input.idempotencyKey,
      }),
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.TaskCreated,
      '已创建 Social Agent 聊天任务',
      {
        permissionMode: input.permissionMode,
      },
    );
    return task;
  }

  private async ensureConversationTask(
    ownerUserId: number,
    taskId: number | null,
    message: string,
  ): Promise<AgentTask> {
    if (taskId) return this.assertTaskOwner(taskId, ownerUserId);
    const agent = await this.resolveAgentConnection(ownerUserId, null);
    const idempotencyKey = `social-agent-message:${ownerUserId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const task = await this.taskRepo.save(
      this.taskRepo.create({
        ownerUserId,
        agentConnectionId: agent?.id ?? null,
        taskType: 'social_agent_chat',
        title: 'FitMeet Social Agent 聊天',
        goal: message,
        input: {
          source: 'social_agent_chat',
          executionBoundary: 'conversation_then_tools',
          firstMessage: message,
        },
        plan: [],
        toolCalls: [],
        result: {},
        memory: {},
        status: AgentTaskStatus.AwaitingFeedback,
        permissionMode: AgentTaskPermissionMode.Confirm,
        riskLevel: AgentTaskRiskLevel.Low,
        idempotencyKey,
      }),
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.TaskCreated,
      '已创建 Social Agent 聊天上下文',
      {
        permissionMode: task.permissionMode,
        idempotencyKey,
      },
    );
    return task;
  }

  private async recordUserMessage(
    task: AgentTask,
    message: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.appendConversationTurn(task, {
      role: 'user',
      text: message,
      at: now,
    });
    task.status =
      task.status === AgentTaskStatus.Pending
        ? AgentTaskStatus.AwaitingFeedback
        : task.status;
    task.statusReason = 'user_message_received';
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentMessageUser,
      '用户发送 Social Agent 消息',
      { message, createdAt: now },
      AgentTaskEventActor.User,
    );
  }

  private async recordIntentRoute(
    task: AgentTask,
    route: SocialAgentIntentRouterResult,
  ): Promise<void> {
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Social Agent 已完成意图路由',
      {
        intent: route.intent,
        confidence: route.confidence,
        entities: route.entities,
        shouldSearch: route.shouldSearch,
        shouldReplan: route.shouldReplan,
        shouldUpdateProfile: route.shouldUpdateProfile,
        shouldExecuteAction: route.shouldExecuteAction,
        replyStrategy: route.replyStrategy,
        source: route.source,
      },
      AgentTaskEventActor.System,
    );
  }

  private async recordAssistantMessage(
    task: AgentTask,
    message: string,
    route: SocialAgentIntentRouteResult,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.appendConversationTurn(task, {
      role: 'assistant',
      text: message,
      intent: route.intent,
      at: now,
      ...(route.activityResults?.length
        ? { activityResults: sanitizeForDisplay(route.activityResults) }
        : {}),
      ...(route.pendingApproval
        ? {
            kind: 'approval',
            pendingApproval: sanitizeForDisplay(route.pendingApproval),
          }
        : {}),
    });
    task.result = {
      ...(task.result ?? {}),
      latestMessageRoute: {
        intent: route.intent,
        confidence: route.confidence,
        action: route.action,
        replyStrategy: route.replyStrategy,
        shouldQueueRun: route.shouldQueueRun,
        runId: route.queuedRun?.runId ?? null,
        at: now,
      },
    };
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentMessageAssistant,
      'Social Agent 回复消息',
      {
        message,
        intent: route.intent,
        action: route.action,
        activityResults: route.activityResults ?? [],
        pendingApproval: route.pendingApproval ?? null,
        riskAdvice:
          route.intent === 'safety_or_boundary'
            ? '首次线下见面建议选择公开场所，并保留平台内沟通记录。'
            : null,
        queuedRunId: route.queuedRun?.runId ?? null,
        createdAt: now,
      },
      AgentTaskEventActor.Agent,
    );
  }

  private buildTaskContext(
    task: AgentTask,
    body: SocialAgentRouteMessageBody,
    longTermSnapshot?:
      | import('./social-agent-long-term-memory.service').LongTermMemorySnapshot
      | null,
  ): Record<string, unknown> {
    const candidates = this.readStoredCandidateSummaries(task);
    const result = this.isRecord(task.result) ? task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    const hasSearchContext = this.hasSearchContext(task);
    return {
      taskId: task.id,
      taskType: task.taskType,
      status: task.status,
      goal: task.goal,
      hasSearchContext,
      hasCandidates: body.hasCandidates === true || candidates.length > 0,
      candidateCount:
        candidates.length || this.number(chatRun.candidateCount) || 0,
      socialRequestId: this.number(chatRun.socialRequestId) ?? null,
      longTermSignals: longTermSnapshot
        ? {
            taskCount: longTermSnapshot.taskCount,
            preferences: longTermSnapshot.preferences,
            boundaries: longTermSnapshot.boundaries,
            activityPreferences: longTermSnapshot.activityPreferences,
            matchSignals: longTermSnapshot.matchSignals,
          }
        : null,
    };
  }

  private readConversationHistory(
    task: AgentTask,
  ): Array<Record<string, unknown>> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const conversation = this.isRecord(memory.socialAgentConversation)
      ? memory.socialAgentConversation
      : {};
    return Array.isArray(conversation.turns)
      ? conversation.turns
          .filter((turn): turn is Record<string, unknown> =>
            this.isRecord(turn),
          )
          .slice(-20)
      : [];
  }

  private appendConversationTurn(
    task: AgentTask,
    turn: Record<string, unknown>,
  ): void {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const conversation = this.isRecord(memory.socialAgentConversation)
      ? memory.socialAgentConversation
      : {};
    const turns = Array.isArray(conversation.turns)
      ? conversation.turns.filter((turn): turn is Record<string, unknown> =>
          this.isRecord(turn),
        )
      : [];
    const last = turns.at(-1);
    const isDuplicate =
      cleanDisplayText(last?.role, '') === cleanDisplayText(turn.role, '') &&
      cleanDisplayText(last?.text, '') === cleanDisplayText(turn.text, '');
    task.memory = {
      ...memory,
      socialAgentConversation: {
        ...conversation,
        turns: (isDuplicate ? turns : [...turns, turn]).slice(-60),
        updatedAt: cleanDisplayText(turn.at, new Date().toISOString()),
      },
    };
  }

  private toRouteAction(
    route: SocialAgentIntentRouterResult,
    queuedRun: SocialAgentAsyncRunSnapshot | null,
    runMode: SocialAgentIntentRouteResult['runMode'],
  ): SocialAgentIntentAction {
    if (queuedRun)
      return runMode === 'follow_up' ? 'queue_replan' : 'queue_search';
    if (route.replyStrategy === 'append_context') return 'save_context';
    if (route.replyStrategy === 'execute_action') return 'await_confirmation';
    if (route.replyStrategy === 'ask_clarifying_question') return 'clarify';
    return 'reply';
  }

  private assistantMessageForRoute(
    route: SocialAgentIntentRouterResult,
    task: AgentTask,
    message: string,
  ): string {
    if (route.intent === 'casual_chat') return this.casualChatReply(message);
    if (route.intent === 'profile_update') {
      return '已记住你的偏好，并写入当前上下文。等你明确说要找人、找活动或找搭子时，我再开始匹配。';
    }
    if (route.intent === 'safety_or_boundary') {
      return '已记住这条安全边界。后续推荐会按这个限制处理，也不会自动发送消息、加好友或发布约练。';
    }
    if (route.intent === 'social_search') {
      const city = route.entities.city ? `${route.entities.city} ` : '';
      const activity = route.entities.activityType
        ? `${route.entities.activityType} `
        : '';
      return `明白，你是在找${city}${activity}搭子或候选人。我会在后台搜索，结果好了会直接插入聊天流。`;
    }
    if (route.intent === 'activity_search') {
      return '明白，你是在找活动或约练。我会先按活动/公开意图方向搜索，必要时再补充候选人推荐。';
    }
    if (route.intent === 'candidate_followup') {
      return this.hasSearchContext(task)
        ? '我会基于现有候选继续处理，不会同步阻塞当前聊天。'
        : '我还没有候选人上下文。你可以先说清楚想找什么样的人，我再帮你匹配。';
    }
    if (route.intent === 'action_request') {
      return this.hasSearchContext(task)
        ? '可以，但我不会自动执行。请在候选卡片上确认发送、收藏或加好友，我会按你的确认执行并记录审批/动作日志。'
        : '可以，不过现在还没有候选人。你可以先说想找什么样的人，我找到候选后再由你确认发送、收藏或加好友。';
    }
    return '我还不确定你是想继续聊天、补充偏好，还是开始找人/活动。你可以直接说“帮我找青岛拍照搭子”或“记住我不喜欢夜间见面”。';
  }

  private async queueInitialSearchForTask(
    ownerUserId: number,
    task: AgentTask,
    goal: string,
  ): Promise<SocialAgentAsyncRunSnapshot> {
    const idempotencyKey =
      cleanDisplayText(task.idempotencyKey, '') ||
      `social-agent-chat:${task.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    task.goal = goal;
    task.taskType = 'social_agent_chat';
    task.idempotencyKey = idempotencyKey;
    task.input = {
      ...(task.input ?? {}),
      source: 'social_agent_chat',
      executionBoundary: 'conversation_then_tools',
      latestSearchMessage: goal,
    };
    await this.taskRepo.save(task);
    return this.runQueued(ownerUserId, {
      goal,
      permissionMode: task.permissionMode ?? AgentTaskPermissionMode.Confirm,
      idempotencyKey,
    });
  }

  private async searchActivityResults(
    ownerUserId: number,
    entities: SocialAgentIntentEntities,
    message: string,
  ): Promise<SocialAgentActivityResult[]> {
    try {
      const result = await this.candidatePool.searchActivity({
        ownerUserId,
        city: entities.city,
        activityType: entities.activityType,
        locationPreference: entities.locationPreference,
        timePreference: entities.timePreference,
        rawText: message,
        limit: 5,
      });
      return result.activityResults.map((activity) => ({
        id: activity.id,
        source: activity.source === 'activity' ? 'activity' : 'public_intent',
        isRealData: activity.isRealData,
        activityId: activity.activityId,
        publicIntentId: activity.publicIntentId,
        title: activity.title,
        description: activity.description,
        city: activity.city,
        loc: activity.loc,
        requestType: activity.requestType,
        interestTags: activity.interestTags,
        timePreference: activity.timePreference,
        ownerUserId: activity.ownerUserId,
        status: activity.status,
        createdAt: activity.createdAt,
        matchScore: activity.matchScore,
        matchReasons: activity.matchReasons,
      }));
    } catch (error) {
      this.metrics.recordError('activity_search_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.activity_search.failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return [];
    }
  }

  private async createActionApproval(
    ownerUserId: number,
    task: AgentTask,
    message: string,
    route: SocialAgentIntentRouterResult,
  ): Promise<SocialAgentPendingApprovalSnapshot | null> {
    try {
      const inferred = this.inferApprovalTypeFromMessage(message);
      const candidates = this.readStoredCandidateSummaries(task);
      const firstCandidate = candidates[0] as
        | Record<string, unknown>
        | undefined;
      const targetUserId =
        this.number(firstCandidate?.candidateUserId) ??
        this.number(firstCandidate?.userId);
      const payload: Record<string, unknown> = {
        source: 'social_agent_chat',
        userMessage: message,
        intent: route.intent,
        entities: route.entities,
        candidateUserId: targetUserId,
        agentTaskId: task.id,
      };
      const approval = await this.approvals.create({
        userId: ownerUserId,
        agentConnectionId: null,
        agentTaskId: task.id,
        type: inferred.type,
        actionType: inferred.actionType,
        skillName: inferred.actionType,
        payload,
        summary: inferred.summary(message, firstCandidate),
        riskLevel: inferred.riskLevel,
        reason: '由 Social Agent 聊天意图路由生成，待用户在前端确认。',
        createdBy: 'agent',
        relatedCandidateId:
          this.number(firstCandidate?.candidateRecordId) ?? null,
      });
      return {
        id: approval.id,
        type: approval.type,
        actionType: approval.actionType ?? inferred.actionType,
        summary: approval.summary,
        riskLevel: approval.riskLevel,
        payload: approval.payload,
        expiresAt: approval.expiresAt ? approval.expiresAt.toISOString() : null,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.handle_message.create_approval_failed',
          taskId: task.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  private inferApprovalTypeFromMessage(message: string): {
    type: ApprovalType;
    actionType: string;
    riskLevel: ApprovalRiskLevel;
    summary: (msg: string, candidate?: Record<string, unknown>) => string;
  } {
    if (/(加好友|关注|加微信|加联系方式)/.test(message)) {
      return {
        type: ApprovalType.ContactRequest,
        actionType: 'connect_candidate',
        riskLevel: ApprovalRiskLevel.Medium,
        summary: (_msg, candidate) =>
          `用户请求添加${candidate ? `候选人 #${cleanDisplayText(candidate.userId, '')}` : '候选人'}为好友/关注`,
      };
    }
    if (/(发消息|打招呼|私信|联系)/.test(message)) {
      return {
        type: ApprovalType.SendMessage,
        actionType: 'send_candidate_message',
        riskLevel: ApprovalRiskLevel.Medium,
        summary: (_msg, candidate) =>
          `用户请求向${candidate ? `候选人 #${cleanDisplayText(candidate.userId, '')}` : '候选人'}发送消息`,
      };
    }
    if (/(邀请|约|约练|约局)/.test(message)) {
      return {
        type: ApprovalType.JoinActivity,
        actionType: 'invite_candidate',
        riskLevel: ApprovalRiskLevel.Medium,
        summary: (_msg, candidate) =>
          `用户请求邀请${candidate ? `候选人 #${cleanDisplayText(candidate.userId, '')}` : '候选人'}参加活动`,
      };
    }
    return {
      type: ApprovalType.Custom,
      actionType: 'social_agent_action',
      riskLevel: ApprovalRiskLevel.Low,
      summary: (msg) => `用户请求执行动作：${msg.slice(0, 80)}`,
    };
  }

  private hasSearchContext(task: AgentTask): boolean {
    if (this.readStoredCandidateSummaries(task).length > 0) return true;
    const result = this.isRecord(task.result) ? task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    return Boolean(
      this.number(chatRun.socialRequestId) ||
      this.number(chatRun.candidateCount) ||
      this.isRecord(chatRun.socialRequestDraft),
    );
  }

  private candidateFollowupReply(task: AgentTask, message: string): string {
    const candidates = this.readStoredCandidateSummaries(task);
    if (candidates.length === 0) {
      return '我还没有可参考的候选人。你可以先告诉我想找谁或找什么活动，我再开始匹配。';
    }
    const index = /第二个|第二/.test(message)
      ? 1
      : /第三个|第三/.test(message)
        ? 2
        : 0;
    const candidate =
      candidates[Math.min(index, candidates.length - 1)] ?? candidates[0];
    const name = cleanDisplayText(
      candidate.nickname,
      `用户 #${cleanDisplayText(candidate.userId, '')}`,
    );
    const reasons = Array.isArray(candidate.reasons)
      ? candidate.reasons
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    const risk = this.isRecord(candidate.risk) ? candidate.risk : {};
    const rawWarnings = Array.isArray(candidate.riskWarnings)
      ? candidate.riskWarnings
      : Array.isArray(risk.warnings)
        ? risk.warnings
        : [];
    const warnings = rawWarnings
      .map((item) => cleanDisplayText(item, ''))
      .filter(Boolean);
    if (/(为什么|推荐理由|匹配)/.test(message)) {
      return reasons.length > 0
        ? `${name} 的主要匹配点是：${reasons.slice(0, 3).join('；')}。是否联系仍需要你确认。`
        : `${name} 与你的时间、地点或兴趣边界较接近。是否联系仍需要你确认。`;
    }
    if (/(靠谱吗|安全|风险)/.test(message)) {
      return warnings.length > 0
        ? `${name} 有这些需要注意的点：${warnings.slice(0, 2).join('；')}。建议先站内聊，并选择公开地点。`
        : `${name} 当前没有明显风险提示，但我仍建议先站内聊、公开地点见面，发送消息或加好友都需要你手动确认。`;
    }
    return `${name} 当前是我优先参考的候选。你可以问“为什么匹配”，也可以点击候选卡片上的确认按钮执行收藏、发送或加好友。`;
  }

  private readStoredCandidateSummaries(
    task: AgentTask,
  ): Array<Record<string, unknown>> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const shortTerm = this.isRecord(memory.shortTerm) ? memory.shortTerm : {};
    const candidates = Array.isArray(shortTerm.candidates)
      ? shortTerm.candidates
      : [];
    if (candidates.length > 0) {
      return candidates.filter(
        (candidate): candidate is Record<string, unknown> =>
          this.isRecord(candidate),
      );
    }
    const chat = this.isRecord(memory.socialAgentChat)
      ? memory.socialAgentChat
      : {};
    return Array.isArray(chat.candidates)
      ? chat.candidates.filter(
          (candidate): candidate is Record<string, unknown> =>
            this.isRecord(candidate),
        )
      : [];
  }

  private applyTaskMemoryForIntent(
    task: AgentTask,
    message: string,
    route: SocialAgentIntentRouterResult,
  ): void {
    const entities = route.entities ?? {};
    switch (route.intent) {
      case 'profile_update':
        mergeSocialAgentPreferences(task, message);
        break;
      case 'safety_or_boundary':
        mergeSocialAgentBoundaries(task, message);
        break;
      case 'social_search':
      case 'activity_search':
        mergeSocialAgentActiveEntities(task, entities, message);
        break;
      case 'candidate_followup': {
        // If user asks for a fresh batch, mark current recommendations as rejected so the
        // next replan does not surface the same people again.
        if (
          route.shouldReplan ||
          /(换一批|再来几个|不喜欢这些|换人|不合适)/.test(message)
        ) {
          const memory = readSocialAgentTaskMemory(task);
          const recommended = memory.candidateState.recommendedIds;
          if (recommended.length > 0) {
            memory.candidateState.rejectedIds = Array.from(
              new Set([...memory.candidateState.rejectedIds, ...recommended]),
            ).slice(-80);
            memory.candidateState.recommendedIds = [];
            // direct write so we don't lose the just-rejected ids
            const root =
              task.memory &&
              typeof task.memory === 'object' &&
              !Array.isArray(task.memory)
                ? (task.memory as Record<string, unknown>)
                : {};
            task.memory = {
              ...root,
              taskMemory: { ...memory, updatedAt: new Date().toISOString() },
            };
          }
        }
        break;
      }
      case 'action_request':
      case 'casual_chat':
      case 'unknown':
      default:
        // No structured memory change beyond appendSocialAgentUserMemo above.
        break;
    }
  }

  private async applyRagContext(
    task: AgentTask,
    route: SocialAgentIntentRouterResult,
    message: string,
    longTermSnapshot:
      | import('./social-agent-long-term-memory.service').LongTermMemorySnapshot
      | null,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      const context = await this.rag.retrieve({
        intent: route.intent,
        ownerUserId: task.ownerUserId,
        message,
        activityType: route.entities?.activityType,
        longTermSnapshot,
      });
      this.metrics.recordLatency('rag_retrieve', Date.now() - startedAt);
      if (context.retrievedKinds.length === 0) return;
      const root =
        task.memory &&
        typeof task.memory === 'object' &&
        !Array.isArray(task.memory)
          ? (task.memory as Record<string, unknown>)
          : {};
      task.memory = {
        ...root,
        lastRagContext: {
          intent: context.intent,
          retrievedKinds: context.retrievedKinds,
          safetySop: context.safetySop,
          openingTemplates: context.openingTemplates,
          activitySop: context.activitySop,
          successfulMatchCases: context.successfulMatchCases,
          userMemorySummary: context.userMemorySummary,
          retrievedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.metrics.recordError('rag_retrieve_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.rag.retrieve_failed',
          intent: route.intent,
          ownerUserId: task.ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private rememberActivityResultsInTaskMemory(
    task: AgentTask,
    results: SocialAgentActivityResult[],
  ): void {
    const ids = results
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) return;
    const memory = readSocialAgentTaskMemory(task);
    const merged: string[] = [];
    for (const value of [...memory.activityState.recommendedIds, ...ids]) {
      if (!merged.includes(value)) merged.push(value);
    }
    memory.activityState.recommendedIds = merged.slice(-40);
    const ownerIds = results
      .map((item) => item.ownerUserId)
      .filter(
        (id): id is number =>
          typeof id === 'number' && Number.isFinite(id) && id > 0,
      );
    if (ownerIds.length > 0) {
      recordSocialAgentRecommendedCandidates(task, ownerIds);
    }
    const root =
      task.memory &&
      typeof task.memory === 'object' &&
      !Array.isArray(task.memory)
        ? (task.memory as Record<string, unknown>)
        : {};
    task.memory = {
      ...root,
      taskMemory: { ...memory, updatedAt: new Date().toISOString() },
    };
  }

  private async rememberRoutedMessage(
    task: AgentTask,
    message: string,
    intent: SocialAgentIntentType,
  ): Promise<void> {
    const now = new Date().toISOString();
    this.appendConversationTurn(task, {
      role: 'user',
      text: message,
      intent,
      at: now,
    });
    task.result = {
      ...(task.result ?? {}),
      latestIntent: {
        intent,
        message,
        at: now,
      },
    };
    task.status = AgentTaskStatus.AwaitingFeedback;
    task.statusReason = `intent_${intent}_saved`;
    rememberSocialAgentShortTerm(task, {
      latestUserFollowUp: message,
      currentStep: {
        id: `intent.${intent}`,
        label: '已写入当前对话上下文',
        status: 'done',
        updatedAt: now,
      },
    });
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentContextAppended,
      '已写入 Social Agent 对话上下文',
      { intent, message, at: now },
      AgentTaskEventActor.User,
    ).catch((error) => {
      this.metrics.recordError('context_append_event_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.context_append.event_failed',
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  }

  private async saveIntentToProfile(
    ownerUserId: number,
    intent: SocialAgentIntentType,
    message: string,
  ): Promise<boolean> {
    const key = this.profileKeyForIntent(intent, message);
    if (!key) return false;
    try {
      await this.socialProfiles.saveAnswer(ownerUserId, key, message);
      return true;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.profile_update_failed',
          ownerUserId,
          intent,
          key,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  }

  private profileKeyForIntent(
    intent: SocialAgentIntentType,
    message: string,
  ): string | null {
    if (intent === 'safety_or_boundary') {
      if (
        /(隐私|手机号|微信|地址|住址|单位|自动发|自动联系|夜间|晚上|男生|女生|不要|别|不想|不喜欢)/i.test(
          message,
        )
      ) {
        return 'avoidTraits';
      }
      return 'privacyBoundary';
    }
    if (intent !== 'profile_update') return null;
    if (
      /(慢热|外向|内向|主动|被动|真诚|社恐|话少|话多|安静|活泼)/i.test(message)
    ) {
      return 'traits';
    }
    if (/(时间|周末|工作日|晚上|白天|早上|下午|今晚|明天)/i.test(message)) {
      return 'availableTimes';
    }
    if (/(想认识|希望认识|偏好|更看重|喜欢.*的人)/i.test(message)) {
      return 'preferredTraits';
    }
    if (/(不喜欢|不接受|不要|拒绝|避开)/i.test(message)) {
      return 'avoidTraits';
    }
    return 'interestTags';
  }

  private casualChatReply(message: string): string {
    if (/(你能做什么|你可以做什么)/i.test(message)) {
      return '我可以先和你正常聊天，也可以记住你的偏好和安全边界。只有当你明确说要找人、找活动或找搭子时，我才会开始匹配；发送消息、加好友、发布约练都需要你确认。';
    }
    if (/(怎么找搭子|该怎么找|建议)/i.test(message)) {
      return '可以先说场景、城市、时间和边界，比如“青岛周末拍照搭子，不要夜间见面”。我会先记住你的偏好，等你明确要搜索时再匹配候选人。';
    }
    return '你好，我在。你可以随便聊，也可以补充偏好；等你明确说要找人、找活动或找搭子时，我再开始搜索。';
  }

  private async generateDraftWithTool(
    task: AgentTask,
    goal: string,
  ): Promise<{
    draft: CreateSocialRequestDto;
    card: unknown;
    profileUsed: unknown;
  }> {
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        mode: 'ai_draft',
        rawText: goal,
        goal,
        metadata: {
          agentTaskId: task.id,
          source: 'social_agent_chat',
        },
      },
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '生成约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    if (!this.isRecord(output.draft)) {
      throw new BadRequestException('生成约练草稿失败：缺少 draft');
    }
    return {
      draft: output.draft as unknown as CreateSocialRequestDto,
      card: output.card,
      profileUsed: output.profileUsed,
    };
  }

  private async createPrivateDraftRequest(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<number> {
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.CreateSocialRequest,
      {
        ...this.toDraftDto(draft),
        mode: 'private_draft',
        metadata: {
          ...(draft.metadata ?? {}),
          agentTaskId: task.id,
          source: 'social_agent_chat',
          publishPolicy: 'requires_user_confirmation',
        },
      },
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '创建私有约练草稿失败'),
      );
    }
    const output = this.isRecord(call.output) ? call.output : {};
    const socialRequestId = this.number(output.socialRequestId ?? output.id);
    if (!socialRequestId) {
      throw new BadRequestException(
        '创建私有约练草稿失败：缺少 socialRequestId',
      );
    }
    return socialRequestId;
  }

  private async readProfileSummary(
    ownerUserId: number,
  ): Promise<Record<string, unknown> | null> {
    try {
      const profile = await this.socialProfiles.get(ownerUserId);
      return {
        city: sanitizeCity(profile.city),
        interestTags: profile.interestTags ?? [],
        availableTimes: profile.availableTimes ?? [],
        profileDiscoverable: profile.profileDiscoverable,
        agentCanRecommendMe: profile.agentCanRecommendMe,
      };
    } catch {
      return null;
    }
  }

  private async searchCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<SocialAgentCandidateSearchResult> {
    const input = draft.socialRequestId
      ? {
          socialRequestId: draft.socialRequestId,
          rawText: draft.rawText,
          limit: 10,
        }
      : {
          city: sanitizeCity(draft.city),
          activityType: cleanDisplayText(draft.activityType, ''),
          interestTags: Array.isArray(draft.interestTags)
            ? draft.interestTags
            : [],
          radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
          safetyRequirement: draft.safetyRequirement,
          rawText: draft.rawText,
          limit: 10,
        };
    const call = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SearchMatches,
      input,
      task.ownerUserId,
    );
    if (call.status !== 'succeeded') {
      throw new BadRequestException(
        cleanDisplayText(call.error?.message, '检索候选人失败'),
      );
    }
    const matchedCandidates = this.readMatchedCandidates(call.output);
    const output = this.isRecord(call.output) ? call.output : {};
    const emptyReason =
      cleanDisplayText(output.emptyReason, '') === 'no_real_candidates'
        ? 'no_real_candidates'
        : null;
    const message = cleanDisplayText(output.message, '') || null;
    const debugReasons = this.isRecord(output.debugReasons)
      ? (output.debugReasons as CandidatePoolDebugReasons)
      : null;
    const socialRequestId = draft.socialRequestId ?? null;
    return {
      candidates: matchedCandidates.map((candidate) =>
        this.toChatCandidate(draft.agentTaskId, socialRequestId, candidate),
      ),
      emptyReason,
      message,
      debugReasons,
    };
  }

  private readMatchedCandidates(output: unknown): MatchedCandidateView[] {
    const record = this.isRecord(output) ? output : {};
    const candidates = Array.isArray(record.candidates)
      ? record.candidates
      : Array.isArray(record.value)
        ? record.value
        : [];
    return candidates.filter((candidate): candidate is MatchedCandidateView =>
      this.isRecord(candidate),
    );
  }

  private async completeRecommendationResult(
    ownerUserId: number,
    task: AgentTask,
    visibleSteps: SocialAgentVisibleStep[],
    draft: SocialAgentRequestDraft,
    candidates: SocialAgentChatCandidate[],
    searchResult: SocialAgentCandidateSearchResult,
    statusReason: string,
    emit?: StreamEmit,
  ): Promise<SocialAgentChatRunResult> {
    task.status = AgentTaskStatus.AwaitingConfirmation;
    task.statusReason = statusReason;
    this.rememberShortTermCandidates(task, draft, candidates);
    this.rememberShortTermStep(
      task,
      'awaiting_confirmation',
      '等待用户确认下一步动作',
      'awaiting_confirmation',
    );
    task.result = {
      ...(task.result ?? {}),
      chatRun: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidateCount: candidates.length,
        topCandidateUserId:
          candidates[0]?.candidateUserId ?? candidates[0]?.userId ?? null,
        emptyReason: searchResult.emptyReason,
        message: searchResult.message,
        debugReasons: searchResult.debugReasons,
        refreshedAt: new Date().toISOString(),
        statusReason,
      },
    };
    task.memory = {
      ...(task.memory ?? {}),
      socialAgentChat: {
        socialRequestId: draft.socialRequestId ?? null,
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidates: candidates.map((candidate) => ({
          userId: candidate.userId,
          candidateUserId: candidate.candidateUserId ?? candidate.userId,
          socialRequestId: candidate.socialRequestId,
          candidateRecordId: candidate.candidateRecordId,
          score: candidate.score,
        })),
      },
    };
    await this.taskRepo.save(task);

    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentCandidatesReturned,
      candidates.length > 0 ? 'Social Agent 返回候选卡片' : 'Social Agent 返回空候选结果',
      {
        candidates,
        activityResults: candidates.filter(
          (candidate) =>
            candidate.source === 'public_intent' || candidate.source === 'activity',
        ),
        socialRequestDraft: this.safeDraftForEvent(draft),
        candidateCount: candidates.length,
        emptyReason: searchResult.emptyReason,
        message: searchResult.message,
        createdAt: new Date().toISOString(),
      },
      AgentTaskEventActor.Agent,
    );

    const events = await this.eventRepo.find({
      where: { taskId: task.id, ownerUserId },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: 500,
    });

    const result = {
      taskId: task.id,
      status: task.status,
      visibleSteps,
      assistantMessage:
        searchResult.message || this.assistantMessage(candidates),
      emptyReason: searchResult.emptyReason,
      message: searchResult.message,
      debugReasons: searchResult.debugReasons,
      socialRequestDraft: draft,
      candidates,
      approvalRequiredActions: this.approvalActions(task.id, draft, candidates),
      events: events.map((event) => this.toEventDto(event)),
    };
    await emit?.({ type: 'result', result });
    return result;
  }

  private toChatCandidate(
    agentTaskId: number,
    socialRequestId: number | null,
    candidate: MatchedCandidateView,
  ): SocialAgentChatCandidate {
    const record = candidate as MatchedCandidateView & Record<string, unknown>;
    const candidateSource = cleanDisplayText(
      record.source,
      'profile_candidate',
    );
    const displayName = cleanDisplayText(
      record.displayName ?? candidate.nickname,
      '用户',
    );
    const matchScore =
      this.number(record.matchScore) ?? Math.round(candidate.score);
    const matchReasons = Array.isArray(record.matchReasons)
      ? record.matchReasons
          .map((reason) => cleanDisplayText(reason, ''))
          .filter(Boolean)
      : (candidate.reasons ?? [])
          .map((reason) => cleanDisplayText(reason, ''))
          .filter(Boolean);
    const riskWarnings = Array.isArray(record.riskWarnings)
      ? record.riskWarnings
          .map((warning) => cleanDisplayText(warning, ''))
          .filter(Boolean)
      : (candidate.risk?.warnings ?? [])
          .map((warning) => cleanDisplayText(warning, ''))
          .filter(Boolean);
    const targetUserId =
      this.number(record.targetUserId) ??
      this.number(record.candidateUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId) ??
      candidate.userId;
    return {
      agentTaskId,
      source:
        candidateSource === 'public_intent' || candidateSource === 'activity'
          ? candidateSource
          : 'profile_candidate',
      isRealData: record.isRealData === true,
      socialRequestId: this.number(record.socialRequestId) ?? socialRequestId,
      targetUserId,
      userId: targetUserId,
      candidateUserId: targetUserId,
      publicIntentId: cleanDisplayText(record.publicIntentId, '') || null,
      activityId: this.number(record.activityId),
      displayName,
      candidateRecordId: candidate.candidateRecordId ?? null,
      nickname: displayName,
      avatar: cleanDisplayText(candidate.avatar, ''),
      color: cleanDisplayText(candidate.color, '#202124'),
      city: cleanDisplayText(record.city, ''),
      score: matchScore,
      level: String(candidate.level),
      distanceKm: candidate.distanceKm,
      commonTags: (candidate.commonTags ?? [])
        .map((tag) => cleanDisplayText(tag, ''))
        .filter(Boolean),
      reasons: matchReasons,
      interestTags: Array.isArray(record.interestTags)
        ? record.interestTags
            .map((tag) => cleanDisplayText(tag, ''))
            .filter(Boolean)
        : [],
      profileCompleteness: this.number(record.profileCompleteness) ?? undefined,
      dataQuality:
        record.dataQuality === 'complete' ||
        record.dataQuality === 'partial' ||
        record.dataQuality === 'incomplete'
          ? record.dataQuality
          : undefined,
      matchScore,
      matchReasons,
      riskWarnings,
      risk: {
        level: String(candidate.risk?.level ?? 'low'),
        warnings: riskWarnings,
      },
      suggestedOpener: cleanDisplayText(record.suggestedOpener, ''),
      suggestedMessage: cleanDisplayText(
        candidate.suggestedMessage ?? record.suggestedOpener,
        '',
      ),
      status: candidate.status ? String(candidate.status) : undefined,
    };
  }

  private buildDraft(
    agentTaskId: number,
    draft: CreateSocialRequestDto,
    card: unknown,
    profileUsed: unknown,
  ): SocialAgentRequestDraft {
    return {
      ...draft,
      type: this.normalizeSocialRequestType(draft.type),
      rawText: cleanDisplayText(draft.rawText, ''),
      title: cleanDisplayText(draft.title, '约练草稿'),
      description: cleanDisplayText(
        draft.description,
        cleanDisplayText(draft.rawText, ''),
      ),
      city: sanitizeCity(draft.city),
      radiusKm: typeof draft.radiusKm === 'number' ? draft.radiusKm : 5,
      interestTags: Array.isArray(draft.interestTags) ? draft.interestTags : [],
      activityType: cleanDisplayText(draft.activityType, ''),
      safetyRequirement:
        draft.safetyRequirement ?? SocialRequestSafety.LowRiskOnly,
      visibility: SocialRequestVisibility.Private,
      status: UserSocialRequestStatus.Draft,
      requireUserConfirmation: true,
      agentAllowed: true,
      metadata: {
        ...(draft.metadata ?? {}),
        agentTaskId,
        source: 'social_agent_chat',
        publishPolicy: 'requires_user_confirmation',
      },
      agentTaskId,
      socialRequestId: null,
      mode: 'draft',
      card: this.isRecord(card) ? card : undefined,
      profileUsed: this.isRecord(profileUsed) ? profileUsed : undefined,
    };
  }

  private toDraftDto(draft: SocialAgentRequestDraft): CreateSocialRequestDto {
    return {
      ...draft,
      type: this.normalizeSocialRequestType(draft.type),
      city: sanitizeCity(draft.city),
      status: UserSocialRequestStatus.Draft,
      visibility: SocialRequestVisibility.Private,
      requireUserConfirmation: true,
      source: SocialRequestSource.CustomAgent,
      metadata: {
        ...(draft.metadata ?? {}),
        socialRequestId: draft.socialRequestId ?? null,
      },
    };
  }

  private toPublishDto(
    task: AgentTask,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ): UpdateSocialRequestDto & CreateSocialRequestDto {
    return {
      ...draft,
      type: this.normalizeSocialRequestType(draft.type),
      status: UserSocialRequestStatus.Matching,
      visibility: SocialRequestVisibility.Public,
      requireUserConfirmation: true,
      source: SocialRequestSource.CustomAgent,
      metadata: {
        ...(draft.metadata ?? {}),
        agentTaskId: task.id,
        socialRequestId: this.number(
          draft.socialRequestId ?? draft.metadata?.socialRequestId,
        ),
        confirmationSource: 'social_agent_chat',
      },
    };
  }

  private approvalActions(
    taskId: number,
    draft: SocialAgentChatRunResult['socialRequestDraft'],
    candidates: SocialAgentChatCandidate[],
  ): Array<Record<string, unknown>> {
    const actions: Array<Record<string, unknown>> = [];
    if (draft) {
      actions.push({
        type: 'publish_social_request',
        label: '确认发布约练',
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: draft.socialRequestId ?? null,
      });
    }
    for (const candidate of candidates.slice(0, 3)) {
      const targetUserId = candidate.candidateUserId ?? candidate.userId;
      actions.push({
        type: 'save_candidate',
        label: `收藏 ${candidate.nickname}`,
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        targetUserId,
      });
      actions.push({
        type: 'send_message',
        label: `确认发送给 ${candidate.nickname}`,
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        targetUserId,
      });
      actions.push({
        type: 'add_friend',
        label: `加好友并聊天：${candidate.nickname}`,
        riskLevel: 'medium',
        requiresConfirmation: true,
        agentTaskId: taskId,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        targetUserId,
      });
    }
    return actions;
  }

  private assistantMessage(candidates: SocialAgentChatCandidate[]): string {
    if (candidates.length === 0) {
      return '当前没有找到符合条件的真实用户，我可以帮你发布一个约练需求，或者你可以放宽城市、时间、兴趣条件。';
    }
    const first = candidates[0];
    const reason = first.reasons.slice(0, 2).join('；') || '画像和需求较匹配';
    return `我找到了 ${candidates.length} 位真实候选人。优先推荐 ${first.nickname}，匹配度 ${first.score}%，原因是 ${reason}。`;
  }

  private async appendFollowUpContext(
    task: AgentTask,
    userMessage: string,
  ): Promise<SocialAgentFollowUpContext> {
    const existing = this.readLatestFollowUpContext(task, userMessage);
    if (existing && this.isRecentIsoTime(existing.appendedAt, 10_000)) {
      return { ...existing, alreadyAppended: true };
    }

    const previousGoal = cleanDisplayText(task.goal, '');
    const refreshedGoal = this.composeFollowUpGoal(previousGoal, userMessage);
    const appendedAt = new Date().toISOString();
    const followUpRecord = {
      userMessage,
      previousGoal,
      refreshedGoal,
      appendedAt,
      receivedAt: appendedAt,
    };
    task.goal = refreshedGoal;
    task.result = {
      ...(task.result ?? {}),
      latestFollowUp: followUpRecord,
      followUps: this.appendRecordList(
        task.result?.followUps,
        followUpRecord,
        20,
      ),
    };
    const memory = this.isRecord(task.memory?.shortTerm)
      ? task.memory.shortTerm
      : {};
    rememberSocialAgentShortTerm(task, {
      latestUserFollowUp: userMessage,
      previousGoal,
      currentGoal: refreshedGoal,
      followUps: this.appendRecordList(memory.followUps, followUpRecord, 20),
    });
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentContextAppended,
      '用户补充已写入当前任务上下文',
      { userMessage, previousGoal, refreshedGoal, appendedAt },
      AgentTaskEventActor.User,
    );
    return {
      task,
      userMessage,
      previousGoal,
      refreshedGoal,
      appendedAt,
      alreadyAppended: false,
    };
  }

  private readLatestFollowUpContext(
    task: AgentTask,
    expectedMessage?: string,
  ): SocialAgentFollowUpContext | null {
    const latest = this.isRecord(task.result?.latestFollowUp)
      ? task.result.latestFollowUp
      : null;
    if (!latest) return null;
    const userMessage = cleanDisplayText(latest.userMessage, '').trim();
    if (!userMessage) return null;
    if (expectedMessage && userMessage !== expectedMessage) return null;
    const refreshedGoal = cleanDisplayText(latest.refreshedGoal, '').trim();
    if (!refreshedGoal) return null;
    return {
      task,
      userMessage,
      previousGoal: cleanDisplayText(latest.previousGoal, ''),
      refreshedGoal,
      appendedAt:
        cleanDisplayText(latest.appendedAt ?? latest.receivedAt, '') ||
        new Date().toISOString(),
      alreadyAppended: true,
    };
  }

  private async updateRunSnapshot(
    ownerUserId: number,
    taskId: number,
    runId: string,
    patch: Partial<SocialAgentAsyncRunSnapshot>,
  ): Promise<AgentTask> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const existing = this.readStoredRun(task, runId);
    if (!existing)
      throw new NotFoundException(`Social agent run ${runId} not found`);
    const now = new Date().toISOString();
    const next: SocialAgentAsyncRunSnapshot = {
      ...existing,
      ...patch,
      taskId,
      runId,
      updatedAt: now,
      pollAfterMs: patch.pollAfterMs ?? existing.pollAfterMs ?? 1500,
      visibleSteps: patch.visibleSteps ?? existing.visibleSteps ?? [],
    };
    if (next.status === 'running' && !next.startedAt) next.startedAt = now;
    if (next.status === 'failed' && !next.failedAt) next.failedAt = now;
    if (next.status === 'completed' && !next.completedAt)
      next.completedAt = now;
    task.result = this.withStoredRun(task.result, next);
    if (next.status === 'running' || next.status === 'queued') {
      task.status = AgentTaskStatus.Planning;
      task.statusReason = `follow_up_replan_${next.phase}`;
    }
    if (next.status === 'failed') {
      task.status = AgentTaskStatus.AwaitingFeedback;
      task.statusReason = 'follow_up_replan_failed_context_saved';
      task.error = this.errorPayload(next.error ?? '重新规划失败');
    }
    return this.taskRepo.save(task);
  }

  private async markRunFailed(
    ownerUserId: number,
    taskId: number,
    runId: string,
    error: unknown,
    options: { message?: string; statusReason?: string } = {},
  ): Promise<void> {
    const errorPayload = this.errorPayload(error);
    const task = await this.updateRunSnapshot(ownerUserId, taskId, runId, {
      status: 'failed',
      phase: 'failed',
      message:
        options.message ?? '重新规划失败，已保留你的补充信息。你可以重试。',
      error: errorPayload,
    });
    if (options.statusReason) {
      task.statusReason = options.statusReason;
      await this.taskRepo.save(task);
    }
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanFailed,
      '异步重新规划失败，补充信息已保留',
      { runId, error: errorPayload },
      AgentTaskEventActor.System,
    );
    await this.writeInboxEventBestEffort(task, 'social_agent.replan.failed', {
      runId,
      error: errorPayload,
    });
  }

  private withStoredRun(
    result: Record<string, unknown> | null | undefined,
    run: SocialAgentAsyncRunSnapshot,
  ): Record<string, unknown> {
    const base = this.isRecord(result) ? result : {};
    return {
      ...base,
      latestRunId: run.runId,
      chatRuns: {
        ...this.storedRunMap(base),
        [run.runId]: sanitizeForDisplay(run),
      },
    };
  }

  private readStoredRun(
    task: AgentTask,
    runId: string,
  ): SocialAgentAsyncRunSnapshot | null {
    const raw = this.storedRunMap(task.result)[runId];
    if (!this.isRecord(raw)) return null;
    const status = this.normalizeRunStatus(raw.status);
    return {
      taskId: this.number(raw.taskId) ?? task.id,
      runId,
      status,
      phase: cleanDisplayText(raw.phase, status),
      message: cleanDisplayText(raw.message, ''),
      visibleSteps: this.readVisibleSteps(raw.visibleSteps),
      queuedAt: cleanDisplayText(raw.queuedAt, '') || new Date().toISOString(),
      startedAt: cleanDisplayText(raw.startedAt, '') || null,
      updatedAt:
        cleanDisplayText(raw.updatedAt, '') || new Date().toISOString(),
      completedAt: cleanDisplayText(raw.completedAt, '') || null,
      failedAt: cleanDisplayText(raw.failedAt, '') || null,
      pollAfterMs: this.number(raw.pollAfterMs) ?? 1500,
      error: this.isRecord(raw.error) ? raw.error : null,
      replan: this.isRecord(raw.replan)
        ? (raw.replan as unknown as SocialAgentPlannerResult)
        : null,
      result: this.isRecord(raw.result)
        ? (raw.result as unknown as
            | SocialAgentChatRunResult
            | SocialAgentChatReplanRunResult)
        : null,
    };
  }

  private storedRunMap(result: unknown): Record<string, unknown> {
    const base = this.isRecord(result) ? result : {};
    return this.isRecord(base.chatRuns) ? base.chatRuns : {};
  }

  private readVisibleSteps(value: unknown): SocialAgentVisibleStep[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((step) => this.isRecord(step))
      .map((step) => ({
        id: cleanDisplayText(step.id, ''),
        label: cleanDisplayText(step.label, '正在处理任务'),
        status: this.normalizeStepStatus(step.status),
      }))
      .filter((step) => step.id);
  }

  private async writeInboxEventBestEffort(
    task: AgentTask,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!task.agentConnectionId) return;
    try {
      await this.messages.createAgentInboxEvent({
        agentConnectionId: task.agentConnectionId,
        ownerUserId: task.ownerUserId,
        eventType,
        contentPreview:
          cleanDisplayText(metadata.error, '') || 'Social Agent 任务已更新',
        unread: true,
        dedupeKey: `${task.agentConnectionId}:${eventType}:${task.id}:${cleanDisplayText(metadata.runId, 'run')}`,
        metadata: {
          ...metadata,
          agentTaskId: task.id,
        },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.inbox_event_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private appendRecordList(
    value: unknown,
    item: Record<string, unknown>,
    limit: number,
  ): Record<string, unknown>[] {
    const previous = Array.isArray(value)
      ? value.filter((entry) => this.isRecord(entry))
      : [];
    return [...previous, item].slice(-limit);
  }

  private errorPayload(error: unknown): Record<string, unknown> {
    const rawMessage = this.isRecord(error)
      ? cleanDisplayText(error.message, '')
      : error instanceof Error
        ? error.message
        : safeUnknownText(error);
    return {
      code: this.isRecord(error)
        ? cleanDisplayText(error.code, 'social_agent_replan_failed')
        : 'social_agent_replan_failed',
      message: cleanDisplayText(rawMessage, '重新规划失败'),
    };
  }

  private createRunId(): string {
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    return `sar_${Date.now()}_${randomSuffix}`;
  }

  private normalizeRunStatus(value: unknown): SocialAgentAsyncRunStatus {
    if (value === 'running' || value === 'completed' || value === 'failed') {
      return value;
    }
    return 'queued';
  }

  private normalizeStepStatus(
    value: unknown,
  ): SocialAgentVisibleStep['status'] {
    if (value === 'running' || value === 'done' || value === 'failed')
      return value;
    return 'pending';
  }

  private isRecentIsoTime(value: string, maxAgeMs: number): boolean {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
  }

  private composeFollowUpGoal(
    previousGoal: string,
    userMessage: string,
  ): string {
    const prior = cleanDisplayText(previousGoal, '').trim();
    const followUp = cleanDisplayText(userMessage, '').trim();
    if (!prior) return followUp;
    return [
      '当前社交需求如下。用户补充拥有最高优先级；如果补充里出现“改成、换成、不要、先、明天、城市、活动类型”等约束，请覆盖原需求中的冲突字段。',
      `原需求：${prior}`,
      `用户补充：${followUp}`,
    ].join('\n');
  }

  private async findLatestRestorableTask(
    ownerUserId: number,
  ): Promise<AgentTask | null> {
    return this.taskRepo.findOne({
      where: {
        ownerUserId,
        taskType: In([
          'social_agent',
          'social_agent_chat',
          'social_agent_demo',
          'social_search',
          'activity_search',
        ]),
        status: Not(AgentTaskStatus.Cancelled),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  private async buildSessionSnapshot(
    ownerUserId: number,
    task: AgentTask | null,
  ): Promise<SocialAgentSessionSnapshot> {
    const restoredAt = new Date().toISOString();
    if (!task) {
      return {
        hasSession: false,
        activeTaskId: null,
        task: null,
        messages: [],
        events: [],
        result: null,
        latestRun: null,
        pendingApprovals: [],
        candidateActions: {},
        restoredAt,
      };
    }

    const [events, approvalRows] = await Promise.all([
      this.eventRepo.find({
        where: { taskId: task.id, ownerUserId },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 500,
      }),
      this.approvals.getPendingForTask(ownerUserId, task.id).catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.session.pending_approvals_failed',
            taskId: task.id,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return [] as AgentApprovalRequest[];
      }),
    ]);
    const eventDtos = events.map((event) => this.toEventDto(event));
    const pendingApprovals = approvalRows.map((approval) =>
      this.toPendingApprovalSnapshot(approval),
    );
    const latestRun = this.readLatestStoredRun(task);
    const result = this.readRestorableResult(task, latestRun, eventDtos);

    return {
      hasSession: true,
      activeTaskId: task.id,
      task: this.toSessionTaskSummary(task),
      messages: this.buildSessionMessages(task, result, pendingApprovals),
      events: eventDtos,
      result,
      latestRun,
      pendingApprovals,
      candidateActions: this.readCandidateActions(task),
      restoredAt,
    };
  }

  private async buildTaskTimeline(
    ownerUserId: number,
    task: AgentTask,
  ): Promise<SocialAgentTaskTimelineSnapshot> {
    const restoredAt = new Date().toISOString();
    const [events, approvalRows] = await Promise.all([
      this.eventRepo.find({
        where: { taskId: task.id, ownerUserId },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 500,
      }),
      this.approvals.getPendingForTask(ownerUserId, task.id).catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'social_agent.timeline.pending_approvals_failed',
            taskId: task.id,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
        return [] as AgentApprovalRequest[];
      }),
    ]);
    const eventDtos = events.map((event) => this.toEventDto(event));
    const pendingApprovals = approvalRows.map((approval) =>
      this.toPendingApprovalSnapshot(approval),
    );
    const latestRun = this.readLatestStoredRun(task);
    const result = this.readRestorableResult(task, latestRun, eventDtos);

    return {
      taskId: task.id,
      messages: this.buildTimelineMessages(
        task,
        result,
        pendingApprovals,
        eventDtos,
      ),
      task: this.toSessionTaskSummary(task),
      memory: sanitizeForDisplay(task.memory) as Record<string, unknown>,
      result,
      events: eventDtos,
      latestRun,
      pendingApprovals,
      candidateActions: this.readCandidateActions(task),
      restoredAt,
    };
  }

  private buildTimelineMessages(
    task: AgentTask,
    result:
      | SocialAgentChatRunResult
      | SocialAgentChatReplanRunResult
      | null,
    pendingApprovals: SocialAgentPendingApprovalSnapshot[],
    events: Array<Record<string, unknown>>,
  ): SocialAgentTimelineMessage[] {
    const memoryMessages = this.buildSessionMessages(
      task,
      result,
      pendingApprovals,
    ).map((message): SocialAgentTimelineMessage => ({
      id: cleanDisplayText(message.id, `task_${task.id}_memory_message`),
      role: message.role,
      kind: message.kind === 'approval' || message.kind === 'risk' ? message.kind : 'text',
      text: cleanDisplayText(message.content, ''),
      createdAt: message.createdAt,
      ...(message.activityResults?.length
        ? { activityResults: message.activityResults }
        : {}),
      ...(message.pendingApproval
        ? { pendingApproval: message.pendingApproval }
        : {}),
    }));
    const eventMessages = events
      .map((event) => this.timelineMessageFromEvent(task, event))
      .filter((message): message is SocialAgentTimelineMessage => !!message);

    return this.dedupeTimelineMessages([...memoryMessages, ...eventMessages])
      .sort(
        (a, b) =>
          Date.parse(a.createdAt ?? '') - Date.parse(b.createdAt ?? ''),
      )
      .slice(-120);
  }

  private timelineMessageFromEvent(
    task: AgentTask,
    event: Record<string, unknown>,
  ): SocialAgentTimelineMessage | null {
    const eventType = cleanDisplayText(event.eventType, '');
    const payload = this.isRecord(event.payload) ? event.payload : {};
    const id = `event_${this.number(event.id) ?? eventType}_${this.timelineCreatedAt(
      payload,
      event,
    ) ?? 'unknown'}`;
    const createdAt = this.timelineCreatedAt(payload, event);
    const summary = cleanDisplayText(event.summary, '');

    if (eventType === AgentTaskEventType.SocialAgentMessageUser) {
      const text = cleanDisplayText(payload.message, summary);
      if (!text) return null;
      return { id, role: 'user', kind: 'text', text, createdAt };
    }

    if (eventType === AgentTaskEventType.SocialAgentMessageAssistant) {
      const text = cleanDisplayText(payload.message, summary);
      if (!text) return null;
      const pendingApproval = this.normalizePendingApprovalSnapshot(
        payload.pendingApproval,
      );
      const activityResults = this.readActivityResults(payload.activityResults);
      return {
        id,
        role: 'assistant',
        kind: pendingApproval
          ? 'approval'
          : activityResults.length > 0
            ? 'activityResults'
            : cleanDisplayText(payload.riskAdvice, '')
              ? 'risk'
              : 'text',
        text,
        createdAt,
        ...(activityResults.length > 0 ? { activityResults } : {}),
        ...(pendingApproval ? { pendingApproval } : {}),
      };
    }

    if (eventType === AgentTaskEventType.SocialAgentCandidatesReturned) {
      const candidates = this.readTimelineCandidates(task, payload.candidates);
      const activityResults = this.readActivityResults(payload.activityResults);
      const text =
        cleanDisplayText(payload.message, '') ||
        summary ||
        (candidates.length > 0 ? '已返回候选卡片' : '没有找到候选卡片');
      return {
        id,
        role: 'assistant',
        kind:
          candidates.length === 0 && activityResults.length > 0
            ? 'activityResults'
            : 'candidates',
        text,
        createdAt,
        candidates,
        activityResults,
      };
    }

    if (
      eventType === AgentTaskEventType.ToolCalled ||
      eventType === AgentTaskEventType.ToolReturned ||
      eventType === AgentTaskEventType.ToolFailed
    ) {
      const toolName = cleanDisplayText(payload.toolName ?? payload.tool, '');
      return {
        id,
        role: 'system',
        kind: 'tool',
        text: summary || toolName || eventType,
        createdAt,
        toolCalls: [
          sanitizeForDisplay({
            id: cleanDisplayText(event.toolCallId, '') || id,
            stepId: cleanDisplayText(event.stepId, '') || null,
            toolName,
            status:
              cleanDisplayText(payload.status, '') ||
              (eventType === AgentTaskEventType.ToolCalled
                ? 'running'
                : eventType === AgentTaskEventType.ToolFailed
                  ? 'failed'
                  : 'succeeded'),
            output: this.isRecord(payload.output) ? payload.output : null,
            error: this.isRecord(payload.error) ? payload.error : null,
            createdAt,
          }) as Record<string, unknown>,
        ],
      };
    }

    if (
      eventType === AgentTaskEventType.GoalUnderstood ||
      eventType === AgentTaskEventType.PlanGenerated ||
      eventType === AgentTaskEventType.PlanUpdated ||
      eventType === AgentTaskEventType.StepStarted ||
      eventType === AgentTaskEventType.StepCompleted ||
      eventType === AgentTaskEventType.SocialAgentContextAppended ||
      eventType === AgentTaskEventType.SocialAgentReplanQueued ||
      eventType === AgentTaskEventType.SocialAgentReplanStarted ||
      eventType === AgentTaskEventType.SocialAgentReplanCompleted ||
      eventType === AgentTaskEventType.SocialAgentReplanFailed ||
      eventType === AgentTaskEventType.SocialAgentLlmTimeout
    ) {
      return {
        id,
        role: 'system',
        kind: 'status',
        text: summary || eventType,
        createdAt,
      };
    }

    return null;
  }

  private readTimelineCandidates(
    task: AgentTask,
    value: unknown,
  ): SocialAgentChatCandidate[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isRecord(item))
      .map((item) => this.candidateFromStoredSummary(task, item))
      .filter((candidate): candidate is SocialAgentChatCandidate => !!candidate);
  }

  private timelineCreatedAt(
    payload: Record<string, unknown>,
    event: Record<string, unknown>,
  ): string | null {
    return (
      cleanDisplayText(payload.createdAt ?? payload.at ?? event.createdAt, '') ||
      null
    );
  }

  private dedupeTimelineMessages(
    messages: SocialAgentTimelineMessage[],
  ): SocialAgentTimelineMessage[] {
    const seen = new Set<string>();
    const out: SocialAgentTimelineMessage[] = [];
    for (const message of messages) {
      const textKey = `${message.role}:${message.kind}:${
        message.createdAt ?? ''
      }:${cleanDisplayText(message.text, '').slice(0, 50)}`;
      const key = message.kind === 'tool' || message.kind === 'status' ? message.id : textKey;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(message);
    }
    return out;
  }

  private toSessionTaskSummary(task: AgentTask): SocialAgentSessionTaskSummary {
    return {
      id: task.id,
      status: task.status,
      title: cleanDisplayText(task.title, 'FitMeet Social Agent 聊天'),
      goal: cleanDisplayText(task.goal, ''),
      permissionMode: task.permissionMode,
      statusReason: cleanDisplayText(task.statusReason, '') || null,
      updatedAt: this.isoDate(task.updatedAt),
      createdAt: this.isoDate(task.createdAt),
    };
  }

  private buildSessionMessages(
    task: AgentTask,
    result:
      | SocialAgentChatRunResult
      | SocialAgentChatReplanRunResult
      | null,
    pendingApprovals: SocialAgentPendingApprovalSnapshot[],
  ): SocialAgentSessionMessage[] {
    const messages = this.readConversationHistory(task)
      .map((turn, index) => this.toSessionMessage(turn, index))
      .filter((message): message is SocialAgentSessionMessage => !!message);

    const goal = cleanDisplayText(task.goal, '');
    if (goal && !messages.some((message) => message.role === 'user')) {
      messages.unshift({
        id: `task_${task.id}_goal`,
        role: 'user',
        content: goal,
        createdAt: this.isoDate(task.createdAt),
      });
    }

    const finalAssistantMessage = result
      ? cleanDisplayText(result.assistantMessage, '')
      : '';
    if (
      finalAssistantMessage &&
      !messages.some(
        (message) =>
          message.role === 'assistant' &&
          cleanDisplayText(message.content, '') === finalAssistantMessage,
      )
    ) {
      messages.push({
        id: `task_${task.id}_latest_result`,
        role: 'assistant',
        content: finalAssistantMessage,
        createdAt: this.isoDate(task.updatedAt),
      });
    }

    for (const approval of pendingApprovals) {
      const exists = messages.some(
        (message) => message.pendingApproval?.id === approval.id,
      );
      if (exists) continue;
      messages.push({
        id: `task_${task.id}_approval_${approval.id}`,
        role: 'assistant',
        kind: 'approval',
        content: approval.summary,
        createdAt: approval.expiresAt,
        pendingApproval: approval,
      });
    }

    return messages.slice(-80);
  }

  private toSessionMessage(
    turn: Record<string, unknown>,
    index: number,
  ): SocialAgentSessionMessage | null {
    const role = cleanDisplayText(turn.role, '');
    if (role !== 'user' && role !== 'assistant') return null;
    const content = cleanDisplayText(
      turn.text ?? turn.content ?? turn.message,
      '',
    );
    if (!content) return null;
    const pendingApproval = this.normalizePendingApprovalSnapshot(
      turn.pendingApproval,
    );
    const activityResults = this.readActivityResults(turn.activityResults);
    const kindRaw = cleanDisplayText(turn.kind, '');
    const kind = pendingApproval
      ? 'approval'
      : kindRaw === 'risk'
        ? 'risk'
        : undefined;
    return {
      id:
        cleanDisplayText(turn.id, '') ||
        `turn_${index}_${cleanDisplayText(turn.at ?? turn.createdAt, '') || 'memory'}`,
      role,
      kind,
      content,
      createdAt: cleanDisplayText(turn.at ?? turn.createdAt, '') || null,
      ...(activityResults.length > 0 ? { activityResults } : {}),
      ...(pendingApproval ? { pendingApproval } : {}),
    };
  }

  private readRestorableResult(
    task: AgentTask,
    latestRun: SocialAgentAsyncRunSnapshot | null,
    events: Array<Record<string, unknown>>,
  ): SocialAgentChatRunResult | SocialAgentChatReplanRunResult | null {
    if (latestRun?.result && this.isRecord(latestRun.result)) {
      const runResult = latestRun.result as SocialAgentChatRunResult | SocialAgentChatReplanRunResult;
      return sanitizeForDisplay({
        ...runResult,
        taskId: task.id,
        status: task.status,
        visibleSteps:
          runResult.visibleSteps?.length > 0
            ? runResult.visibleSteps
            : latestRun.visibleSteps,
        events,
      }) as SocialAgentChatRunResult | SocialAgentChatReplanRunResult;
    }

    return this.readResultFromTaskMemory(task, events);
  }

  private readResultFromTaskMemory(
    task: AgentTask,
    events: Array<Record<string, unknown>>,
  ): SocialAgentChatRunResult | null {
    const result = this.isRecord(task.result) ? task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const chat = this.isRecord(memory.socialAgentChat)
      ? memory.socialAgentChat
      : {};
    const eventResult = this.readCandidateResultFromEvents(task, events);
    const rawDraft = this.isRecord(chatRun.socialRequestDraft)
      ? chatRun.socialRequestDraft
      : this.isRecord(chat.socialRequestDraft)
        ? chat.socialRequestDraft
        : this.isRecord(eventResult?.socialRequestDraft)
          ? eventResult.socialRequestDraft
          : null;
    const storedCandidates = this.readStoredCandidateSummaries(task)
      .map((candidate) => this.candidateFromStoredSummary(task, candidate))
      .filter((candidate): candidate is SocialAgentChatCandidate => !!candidate);
    const candidates =
      storedCandidates.length > 0
        ? storedCandidates
        : eventResult?.candidates ?? [];

    if (!rawDraft && candidates.length === 0) return null;
    const socialRequestDraft = rawDraft
      ? ({
          ...rawDraft,
          agentTaskId: task.id,
          socialRequestId:
            this.number(rawDraft.socialRequestId) ??
            this.number(chatRun.socialRequestId) ??
            this.number(chat.socialRequestId) ??
            null,
          mode: 'draft',
        } as SocialAgentRequestDraft)
      : null;
    return {
      taskId: task.id,
      status: task.status,
      visibleSteps: this.readStoredVisibleSteps(task),
      assistantMessage:
        cleanDisplayText(chatRun.message, '') ||
        cleanDisplayText(eventResult?.message, '') ||
        this.assistantMessage(candidates),
      emptyReason:
        cleanDisplayText(chatRun.emptyReason, '') === 'no_real_candidates'
          ? 'no_real_candidates'
          : cleanDisplayText(eventResult?.emptyReason, '') === 'no_real_candidates'
          ? 'no_real_candidates'
          : null,
      message:
        cleanDisplayText(chatRun.message, '') ||
        cleanDisplayText(eventResult?.message, '') ||
        null,
      debugReasons: this.isRecord(chatRun.debugReasons)
        ? (chatRun.debugReasons as CandidatePoolDebugReasons)
        : null,
      socialRequestDraft,
      candidates,
      approvalRequiredActions: socialRequestDraft
        ? this.approvalActions(task.id, socialRequestDraft, candidates)
        : [],
      events,
    };
  }

  private readCandidateResultFromEvents(
    task: AgentTask,
    events: Array<Record<string, unknown>>,
  ):
    | {
        candidates: SocialAgentChatCandidate[];
        socialRequestDraft: Record<string, unknown> | null;
        message: string | null;
        emptyReason: string | null;
      }
    | null {
    const event = [...events]
      .reverse()
      .find(
        (item) =>
          cleanDisplayText(item.eventType, '') ===
          AgentTaskEventType.SocialAgentCandidatesReturned,
      );
    if (!event || !this.isRecord(event.payload)) return null;
    const payload = event.payload;
    return {
      candidates: this.readTimelineCandidates(task, payload.candidates),
      socialRequestDraft: this.isRecord(payload.socialRequestDraft)
        ? (payload.socialRequestDraft as Record<string, unknown>)
        : null,
      message: cleanDisplayText(payload.message, '') || null,
      emptyReason: cleanDisplayText(payload.emptyReason, '') || null,
    };
  }

  private candidateFromStoredSummary(
    task: AgentTask,
    candidate: Record<string, unknown>,
  ): SocialAgentChatCandidate | null {
    const targetUserId =
      this.number(candidate.targetUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId);
    if (!targetUserId) return null;
    const warnings = this.stringList(candidate.riskWarnings);
    const risk = this.isRecord(candidate.risk) ? candidate.risk : {};
    const riskWarnings =
      warnings.length > 0 ? warnings : this.stringList(risk.warnings);
    const nickname = cleanDisplayText(
      candidate.displayName ?? candidate.nickname,
      `用户 #${targetUserId}`,
    );
    return {
      agentTaskId: task.id,
      source:
        cleanDisplayText(candidate.source, '') === 'public_intent' ||
        cleanDisplayText(candidate.source, '') === 'activity'
          ? (cleanDisplayText(candidate.source, '') as 'public_intent' | 'activity')
          : 'profile_candidate',
      isRealData: candidate.isRealData === true,
      socialRequestId: this.number(candidate.socialRequestId),
      targetUserId,
      userId: targetUserId,
      candidateUserId: targetUserId,
      publicIntentId: cleanDisplayText(candidate.publicIntentId, '') || null,
      activityId: this.number(candidate.activityId),
      displayName: nickname,
      candidateRecordId: this.number(candidate.candidateRecordId),
      nickname,
      avatar: cleanDisplayText(candidate.avatar, ''),
      color: cleanDisplayText(candidate.color, '#202124'),
      city: cleanDisplayText(candidate.city, ''),
      score: this.number(candidate.score) ?? this.number(candidate.matchScore) ?? 0,
      level: cleanDisplayText(candidate.level, 'medium'),
      distanceKm: this.number(candidate.distanceKm),
      commonTags: this.stringList(candidate.commonTags),
      reasons: this.stringList(candidate.reasons ?? candidate.matchReasons),
      interestTags: this.stringList(candidate.interestTags),
      profileCompleteness: this.number(candidate.profileCompleteness) ?? undefined,
      dataQuality:
        candidate.dataQuality === 'complete' ||
        candidate.dataQuality === 'partial' ||
        candidate.dataQuality === 'incomplete'
          ? candidate.dataQuality
          : undefined,
      matchScore: this.number(candidate.matchScore) ?? undefined,
      matchReasons: this.stringList(candidate.matchReasons),
      riskWarnings,
      risk: {
        level: cleanDisplayText(risk.level ?? candidate.riskLevel, 'low'),
        warnings: riskWarnings,
      },
      suggestedOpener: cleanDisplayText(candidate.suggestedOpener, ''),
      suggestedMessage: cleanDisplayText(candidate.suggestedMessage, ''),
      status: cleanDisplayText(candidate.status, '') || undefined,
    };
  }

  private readStoredVisibleSteps(task: AgentTask): SocialAgentVisibleStep[] {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const shortTerm = this.isRecord(memory.shortTerm) ? memory.shortTerm : {};
    const steps = Array.isArray(shortTerm.steps) ? shortTerm.steps : [];
    return steps
      .filter((step): step is Record<string, unknown> => this.isRecord(step))
      .map((step) => ({
        id: cleanDisplayText(step.id, ''),
        label: cleanDisplayText(step.label, '正在处理任务'),
        status: this.normalizeStepStatus(step.status),
      }))
      .filter((step) => step.id);
  }

  private readCandidateActions(
    task: AgentTask,
  ): Record<string, Record<string, unknown>> {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const shortTerm = this.isRecord(memory.shortTerm) ? memory.shortTerm : {};
    const actions = this.isRecord(shortTerm.candidateActions)
      ? shortTerm.candidateActions
      : {};
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(actions)) {
      if (!this.isRecord(value)) continue;
      out[key] = sanitizeForDisplay(value) as Record<string, unknown>;
    }
    return out;
  }

  private rememberCandidateAction(
    task: AgentTask,
    targetUserId: number,
    patch: Record<string, unknown>,
  ): void {
    const previous = this.readCandidateActions(task);
    const key = String(targetUserId);
    const sanitizedPatch = sanitizeForDisplay(patch) as Record<string, unknown>;
    rememberSocialAgentShortTerm(task, {
      candidateActions: {
        ...previous,
        [key]: {
          ...(previous[key] ?? {}),
          ...sanitizedPatch,
          targetUserId,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private readLatestStoredRun(
    task: AgentTask,
  ): SocialAgentAsyncRunSnapshot | null {
    const result = this.isRecord(task.result) ? task.result : {};
    const latestRunId = cleanDisplayText(result.latestRunId, '');
    if (latestRunId) {
      const latest = this.readStoredRun(task, latestRunId);
      if (latest) return latest;
    }
    return Object.keys(this.storedRunMap(task.result))
      .map((runId) => this.readStoredRun(task, runId))
      .filter((run): run is SocialAgentAsyncRunSnapshot => !!run)
      .sort(
        (a, b) =>
          Date.parse(b.updatedAt || b.queuedAt) - Date.parse(a.updatedAt || a.queuedAt),
      )[0] ?? null;
  }

  private toPendingApprovalSnapshot(
    approval: AgentApprovalRequest,
  ): SocialAgentPendingApprovalSnapshot {
    return {
      id: approval.id,
      type: approval.type,
      actionType: cleanDisplayText(approval.actionType, approval.type),
      summary: cleanDisplayText(approval.summary, '待确认动作'),
      riskLevel: approval.riskLevel,
      payload: sanitizeForDisplay(approval.payload) as Record<string, unknown>,
      expiresAt: approval.expiresAt ? approval.expiresAt.toISOString() : null,
    };
  }

  private normalizePendingApprovalSnapshot(
    value: unknown,
  ): SocialAgentPendingApprovalSnapshot | undefined {
    if (!this.isRecord(value)) return undefined;
    const id = this.number(value.id);
    if (!id) return undefined;
    const type = Object.values(ApprovalType).includes(value.type as ApprovalType)
      ? (value.type as ApprovalType)
      : ApprovalType.Custom;
    const riskLevel = Object.values(ApprovalRiskLevel).includes(
      value.riskLevel as ApprovalRiskLevel,
    )
      ? (value.riskLevel as ApprovalRiskLevel)
      : ApprovalRiskLevel.Low;
    return {
      id,
      type,
      actionType: cleanDisplayText(value.actionType, type),
      summary: cleanDisplayText(value.summary, '待确认动作'),
      riskLevel,
      payload: this.isRecord(value.payload)
        ? (sanitizeForDisplay(value.payload) as Record<string, unknown>)
        : {},
      expiresAt: cleanDisplayText(value.expiresAt, '') || null,
    };
  }

  private readActivityResults(value: unknown): SocialAgentActivityResult[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isRecord(item))
      .map((item) => sanitizeForDisplay(item) as SocialAgentActivityResult);
  }

  private stringList(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
          .slice(0, 20)
      : [];
  }

  private isoDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    const text = cleanDisplayText(value, '');
    return text || new Date().toISOString();
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ) {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.task_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
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

  private rememberShortTermCandidates(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
    candidates: SocialAgentChatCandidate[],
  ) {
    rememberSocialAgentShortTerm(task, {
      socialRequestId: draft.socialRequestId ?? null,
      socialRequestDraft: this.safeDraftForEvent(draft),
      candidates: candidates.map((candidate) => ({
        targetUserId: candidate.targetUserId,
        userId: candidate.userId,
        candidateUserId: candidate.candidateUserId ?? candidate.userId,
        nickname: candidate.nickname,
        score: candidate.score,
        socialRequestId: candidate.socialRequestId,
        candidateRecordId: candidate.candidateRecordId,
        commonTags: candidate.commonTags,
        reasons: candidate.reasons,
        suggestedMessage: candidate.suggestedMessage,
        status: candidate.status ?? null,
      })),
    });
  }

  private toEventDto(event: AgentTaskEvent): Record<string, unknown> {
    return sanitizeForDisplay({
      id: event.id,
      taskId: event.taskId,
      eventType: event.eventType,
      actor: event.actor,
      summary: event.summary,
      payload: event.payload,
      stepId: event.stepId,
      toolCallId: event.toolCallId,
      createdAt: event.createdAt,
    }) as Record<string, unknown>;
  }

  private async assertTaskOwner(
    taskId: number,
    ownerUserId: number,
  ): Promise<AgentTask> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId, ownerUserId },
    });
    if (!task)
      throw new NotFoundException(`Social agent task ${taskId} not found`);
    return task;
  }

  private async resolveAgentConnection(
    ownerUserId: number,
    preferredId: number | null,
  ): Promise<AgentConnection | null> {
    if (preferredId) {
      const explicit = await this.connectionRepo.findOne({
        where: {
          id: preferredId,
          userId: ownerUserId,
          status: ConnectionStatus.Active,
        },
      });
      if (explicit) return explicit;
    }
    return (
      (await this.connectionRepo.findOne({
        where: { userId: ownerUserId, status: ConnectionStatus.Active },
        order: { updatedAt: 'DESC' },
      })) ?? null
    );
  }

  private normalizePermissionMode(
    mode: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return mode && Object.values(AgentTaskPermissionMode).includes(mode)
      ? mode
      : AgentTaskPermissionMode.Confirm;
  }

  private normalizeSocialRequestType(value: unknown): SocialRequestType {
    return Object.values(SocialRequestType).includes(value as SocialRequestType)
      ? (value as SocialRequestType)
      : SocialRequestType.Custom;
  }

  private modeLabel(mode: AgentTaskPermissionMode): string {
    if (mode === AgentTaskPermissionMode.Assist) return 'Assist Mode';
    if (mode === AgentTaskPermissionMode.LimitedAuto)
      return 'Limited Auto Mode';
    return 'Confirm Mode';
  }

  private safeDraftForEvent(value: unknown): Record<string, unknown> {
    return sanitizeForDisplay(value) as Record<string, unknown>;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}

function safeUnknownText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}
