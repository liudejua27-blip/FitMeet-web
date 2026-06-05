import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
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
import { RealtimeEventService } from '../realtime/realtime-event.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
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
import { SocialAgentPlannerService } from './social-agent-planner.service';
import {
  SocialAgentIntentRouterService,
  type SocialAgentIntentEntities,
  type SocialAgentIntentRouterResult,
  type SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { SocialAgentBrainService } from './social-agent-brain.service';
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
  SocialAgentToolName,
} from './social-agent-tool-executor.service';
import {
  appendSocialAgentShortTermTurn,
  appendShortTermMemoryItem,
  appendSocialAgentUserMemo,
  mergeSocialAgentStableProfileFacts,
  mergeSocialAgentActiveEntities,
  mergeSocialAgentBoundaries,
  mergeSocialAgentPreferences,
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
  recordSocialAgentRecommendedCandidates,
  recordSocialAgentSearchMemory,
  recordSocialAgentMisunderstanding,
  recordSocialAgentShortTermAction,
  rememberSocialAgentCurrentTask,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
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
import {
  productHelpFallbackReply,
  workflowHelpReply,
} from './social-agent-chat-replies';
import {
  buildApprovalActions,
  buildRecommendationAssistantMessage,
  buildSocialAgentRequestDraft,
  toSocialAgentChatCandidate,
  toSocialAgentDraftDto,
  toSocialAgentPublishDto,
} from './social-agent-chat-result.presenter';
import {
  appendSocialAgentConversationTurn,
  buildSocialAgentLlmConversationHistory,
  readSocialAgentConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentConversationBrainLastToolResult,
  readSocialAgentConversationBrainMode,
  readSocialAgentConversationBrainToolArguments,
  readSocialAgentConversationBrainToolNames,
  readSocialAgentCurrentAgentState,
  rememberSocialAgentConversationBrainDecision,
  rememberSocialAgentConversationBrainToolResult,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';
import {
  buildSocialAgentTimelineSnapshot,
  readSocialAgentRestorableResult,
  readSocialAgentStoredCandidateSummaries,
} from './social-agent-chat-session.presenter';
import {
  createSocialAgentRunId,
  withSocialAgentStoredRun,
} from './social-agent-chat-run.presenter';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentRagService } from './social-agent-rag.service';
import {
  SocialAgentMemoryContext,
  SocialAgentMemoryContextService,
} from './social-agent-memory-context.service';
import {
  LifeGraphProposalDto,
  RecordLifeGraphBehaviorEventDto,
} from '../life-graph/dto/life-graph.dto';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { LifeGraphBehaviorEventType } from '../life-graph/life-graph.enums';
import { ActivitiesService } from '../activities/activities.service';
import type { CheckinActivityDto } from '../activities/dto/activity.dto';
import {
  FitMeetAgentRunStatus,
  FitMeetAgentStepStatus,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import type {
  FitMeetAlphaCard,
  FitMeetAlphaTurnDecision,
} from './fitmeet-alpha-agent.types';
import { TonePolicyService } from './response-quality/tone-policy.service';
import { AgentQualityEvaluatorService } from './agent-quality/agent-quality-evaluator.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import type {
  CandidateTargetBody,
  ExtractedProfileFields,
  SocialAgentActivityResult,
  SocialAgentAppendContextResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentCandidateSearchResult,
  SocialAgentCardActionBody,
  SocialAgentChatCandidate,
  SocialAgentChatReplanRunBody,
  SocialAgentChatReplanRunResult,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentCurrentTaskSnapshot,
  SocialAgentFollowUpContext,
  SocialAgentIntentAction,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentRequestDraft,
  SocialAgentRouteMessageBody,
  SocialAgentSessionSnapshot,
  SocialAgentTaskTimelineSnapshot,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import {
  buildSocialAgentActivityCompletionCard,
  buildSocialAgentActivityPlanCard,
  buildSocialAgentCardActionRouteResult,
  buildSocialAgentCheckinCard,
  buildSocialAgentLifeGraphUpdateCard,
  buildSocialAgentOpenerApprovalCard,
  buildSocialAgentReviewCard,
  createSocialAgentActivityDtoFromPayload,
  mergeSocialAgentActivityPayload,
  messageForSocialAgentSchemaAction,
  readSocialAgentCardActionCandidate,
  readSocialAgentMeetLoopState,
} from './social-agent-card-action.presenter';
export type * from './social-agent-chat.types';

@Injectable()
export class SocialAgentChatService {
  private readonly logger = new Logger(SocialAgentChatService.name);
  private readonly fallbackSessionAssembler =
    new AgentSessionAssemblerService();

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
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly runState: SocialAgentRunStateService,
    private readonly followUpContext: SocialAgentFollowUpContextService,
    @Optional() private readonly brain?: SocialAgentBrainService,
    @Optional()
    private readonly memoryContext?: SocialAgentMemoryContextService,
    @Optional()
    private readonly finalResponses?: SocialAgentFinalResponseService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
    @Optional()
    private readonly fitMeetRuntime?: FitMeetAgentRuntimeService,
    @Optional()
    private readonly alphaAgent?: FitMeetAlphaAgentSdkService,
    @Optional()
    private readonly tonePolicy?: TonePolicyService,
    @Optional()
    private readonly agentQuality?: AgentQualityEvaluatorService,
    @Optional()
    private readonly sessionAssembler?: AgentSessionAssemblerService,
    @Optional()
    @Inject(forwardRef(() => ActivitiesService))
    private readonly activities?: ActivitiesService,
  ) {}

  private sessions(): AgentSessionAssemblerService {
    return this.sessionAssembler ?? this.fallbackSessionAssembler;
  }

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

    const alphaTurn = await this.alphaAgent?.prepareTurn({
      ownerUserId,
      taskId: task.id,
      message,
      permissionMode: task.permissionMode,
      context: { hasCandidates: body.hasCandidates === true },
    });
    if (alphaTurn?.safety.blocked) {
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
      await this.writeEvent(
        task,
        AgentTaskEventType.TaskFailed,
        'Main Agent 已拦截不安全请求',
        {
          traceId: alphaTurn.traceId,
          safety: alphaTurn.safety,
          agentTrace: alphaTurn.agentTrace,
        },
        AgentTaskEventActor.Agent,
      );
      await this.recordAssistantMessage(task, assistantMessage, result);
      this.metrics.observeRouteLatency(Date.now() - startedAt);
      return result;
    }
    if (this.alphaNeedsClarification(alphaTurn)) {
      const assistantMessage = this.alphaClarifyingMessage(alphaTurn);
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
        entities: {
          city: '',
          activityType: '',
          targetGender: '',
          timePreference: '',
          locationPreference: '',
        },
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
      await this.writeEvent(
        task,
        AgentTaskEventType.Note,
        'Main Agent 正在等待用户补充需求',
        { structuredIntent: alphaTurn?.structuredIntent },
        AgentTaskEventActor.Agent,
      );
      await this.recordAssistantMessage(task, assistantMessage, result);
      this.metrics.recordAction(result.action);
      this.metrics.observeRouteLatency(Date.now() - startedAt);
      return result;
    }

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
    let memoryContext = this.buildMemoryContext(task, longTermSnapshot);
    let route = await this.intentRouter.route({
      message,
      taskContext: this.buildTaskContext(
        task,
        body,
        longTermSnapshot,
        memoryContext,
      ),
      profile: profile ?? {},
      conversationHistory: readSocialAgentConversationHistory(task),
    });
    const brainDecision = await this.brain?.planTurn({
      message,
      route,
      profile: profile ?? {},
      taskContext: this.buildTaskContext(
        task,
        body,
        longTermSnapshot,
        memoryContext,
      ),
      conversationHistory: readSocialAgentConversationHistory(task),
      memoryContext: memoryContext ?? undefined,
    });
    if (brainDecision) {
      route = brainDecision.route;
      rememberSocialAgentConversationBrainDecision(task, brainDecision);
      if (brainDecision.conversationMode === 'profile_correction') {
        recordSocialAgentMisunderstanding(
          task,
          brainDecision.reason || 'user_correction',
        );
        transitionSocialAgentState(task, 'user_correction', {
          objective: 'profile_enrichment',
          nextStep: '重新理解上一段画像信息并继续补齐',
          shouldSearchNow: false,
          waitingFor: 'profile_repair',
        });
      }
    }
    this.rememberCurrentTaskFromBrain(task, route);
    memoryContext = this.buildMemoryContext(task, longTermSnapshot);
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
    const brainToolResults = await this.executeConversationBrainReadTools(
      ownerUserId,
      task,
      brainDecision,
    );

    let savedContext = false;
    let profileUpdated = false;
    let queuedRun: SocialAgentAsyncRunSnapshot | null = null;
    let runMode: SocialAgentIntentRouteResult['runMode'] = null;
    let assistantMessage = this.assistantMessageForRoute(route, task, message);
    let activityResults: SocialAgentActivityResult[] = [];
    let profileUpdateProposal: LifeGraphProposalDto | null = null;

    const confirmedCandidateMessage =
      await this.confirmPendingCandidateMessageIfRequested(
        ownerUserId,
        task,
        message,
      );
    if (confirmedCandidateMessage) {
      task = confirmedCandidateMessage.task;
      assistantMessage = confirmedCandidateMessage.assistantMessage;
      const result: SocialAgentIntentRouteResult = {
        ...route,
        intent: 'action_request',
        action: 'reply',
        taskId: task.id,
        assistantMessage,
        savedContext: false,
        profileUpdated: false,
        shouldExecuteAction: true,
        shouldQueueRun: false,
        runMode: null,
        queuedRun: null,
        pendingApproval: null,
        activityResults: [],
        permissionMode: task.permissionMode,
      };
      this.metrics.recordAction(result.action);
      await this.recordAssistantMessage(task, assistantMessage, result);
      this.metrics.observeRouteLatency(Date.now() - startedAt);
      return result;
    }

    if (
      route.intent === 'profile_enrichment' ||
      route.intent === 'profile_enrichment_request' ||
      route.intent === 'correction_or_clarification'
    ) {
      const handled = await this.handleProfileEnrichmentTurn(
        ownerUserId,
        task,
        message,
        route.intent,
      );
      assistantMessage = handled.assistantMessage;
      savedContext = handled.savedContext;
      profileUpdated = handled.profileUpdated;
      profileUpdateProposal = handled.profileUpdateProposal ?? null;
      task = handled.task;
    } else if (this.shouldUseLlmDirectReply(route)) {
      assistantMessage = await this.chatLlm.generateConversationalAnswer({
        message,
        route,
        profile,
        task,
        longTermSnapshot,
        memoryContext: this.buildMemoryContext(task, longTermSnapshot),
        toolResults: brainToolResults,
      });
    }

    if (
      route.intent === 'profile_update' ||
      route.intent === 'safety_or_boundary'
    ) {
      if (this.lifeGraph) {
        const proposal = await this.lifeGraph.extractFromChat(ownerUserId, {
          message,
          taskId: task.id,
          context: { intent: route.intent },
        });
        if (proposal.proposedFields.length > 0) {
          profileUpdateProposal = proposal;
          assistantMessage = this.lifeGraphProposalReply(proposal);
          savedContext = true;
          profileUpdated = false;
          rememberSocialAgentCurrentTask(task, {
            objective: 'profile_enrichment',
            nextStep: '等待用户确认是否保存 Life Graph 画像提案',
            shouldSearchNow: false,
            profileSaved: false,
            waitingFor: 'life_graph_profile_confirmation',
            lastCompletedStep: 'life_graph_profile_proposed',
          });
          await this.taskRepo.save(task);
        }
      }
      if (!profileUpdateProposal) {
        await this.rememberRoutedMessage(task, message, route.intent);
        savedContext = true;
        profileUpdated = await this.saveIntentToProfile(
          ownerUserId,
          route.intent,
          message,
        );
        task = await this.assertTaskOwner(task.id, ownerUserId);
      }
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
      recordSocialAgentSearchMemory(task, {
        intent: 'activity_search',
        candidates: activityResults.map((activity) => ({
          id: activity.id,
          title: activity.title,
          city: activity.city,
          requestType: activity.requestType,
          matchScore: activity.matchScore,
        })),
        candidateCount: activityResults.length,
      });
      transitionSocialAgentState(task, 'activity_search_returned', {
        objective: 'activity_search',
        nextStep:
          activityResults.length > 0
            ? '等待用户选择活动或继续筛选'
            : '等待用户调整活动条件',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor:
          activityResults.length > 0
            ? 'activity_selection'
            : 'search_refinement',
        lastCompletedStep: 'activity_search_completed',
      });
      if (activityResults.length > 0) {
        this.rememberActivityResultsInTaskMemory(task, activityResults);
        assistantMessage = `已为你找到 ${activityResults.length} 条公开约练/活动意向，先放在下方卡片里。如果都不合适，告诉我"再找几条"或换个时间/活动，我再补搜候选人。`;
      } else {
        assistantMessage =
          '当前没有找到符合条件的真实活动或公开约练卡片，可以换个城市、时间或活动类型再试。';
      }
      assistantMessage = await this.generateActivitySearchAssistantMessage({
        task,
        message,
        route,
        activityResults,
        fallbackReply: assistantMessage,
      });
    } else if (route.intent === 'social_search') {
      const lifeGraphClarification = await this.lifeGraphSearchClarification(
        ownerUserId,
        message,
      );
      if (lifeGraphClarification) {
        assistantMessage = lifeGraphClarification;
        savedContext = true;
        runMode = null;
        queuedRun = null;
      } else if (route.shouldReplan && this.hasSearchContext(task)) {
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
        const draft = this.candidateMessageDraft(task);
        assistantMessage = draft
          ? `${assistantMessage}\n我先给你拟一条开场白：${draft}\n确认后我再发送。待确认动作 #${pendingApproval.id} 已创建。`
          : `${assistantMessage}\n（已创建待确认动作 #${pendingApproval.id}，请在卡片上点击“批准/拒绝”。）`;
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
      profileUpdateProposal,
      permissionMode: task.permissionMode,
    };
    if (queuedRun && runMode) this.metrics.recordQueuedRun(runMode);
    this.metrics.recordAction(result.action);
    await this.recordAssistantMessage(task, assistantMessage, result);
    this.metrics.observeRouteLatency(Date.now() - startedAt);
    return result;
  }

  async performCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const action = body.action;
    if (!action) throw new BadRequestException('Missing agent action');

    if (action === 'opener.confirm_send') {
      return this.handleMessage(ownerUserId, {
        taskId,
        message: '确认发送',
        hasCandidates: true,
      });
    }

    if (
      action === 'candidate.more_like_this' ||
      action === 'candidate.skip' ||
      action === 'candidate.like'
    ) {
      return this.handleMessage(ownerUserId, {
        taskId,
        message:
          action === 'candidate.skip'
            ? '不喜欢这个推荐，换一个低压力的人'
            : action === 'candidate.like'
              ? '我喜欢这个推荐，继续下一步'
              : '看看更多类似的人',
        hasCandidates: true,
      });
    }

    if (action === 'candidate.generate_opener') {
      return this.createOpenerDraftFromCardAction(ownerUserId, taskId, body);
    }

    if (action === 'activity.confirm_create') {
      if (this.number(body.payload?.approvalId)) {
        return this.confirmActivityFromCardAction(ownerUserId, taskId, body);
      }
      return this.createActivityApprovalFromCardAction(
        ownerUserId,
        taskId,
        body,
      );
    }

    if (action === 'activity.check_in') {
      return this.checkInActivityFromCardAction(ownerUserId, taskId, body);
    }

    if (action === 'activity.complete') {
      return this.completeActivityFromCardAction(ownerUserId, taskId, body);
    }

    if (action === 'review.submit') {
      return this.submitReviewFromCardAction(ownerUserId, taskId, body);
    }

    return this.handleMessage(ownerUserId, {
      taskId,
      message: messageForSocialAgentSchemaAction(action),
      hasCandidates: true,
    });
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
    const runId = createSocialAgentRunId();
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
    task.result = withSocialAgentStoredRun(task.result, queuedRun);
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

    const runId = createSocialAgentRunId();
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
    task.result = withSocialAgentStoredRun(task.result, queuedRun);
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
    const taskMemory = readSocialAgentTaskMemory(task);
    return {
      taskId: task.id,
      status: task.status,
      agentState: taskMemory.currentTask.state,
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
    const draft = buildSocialAgentRequestDraft({
      agentTaskId: task.id,
      draft: draftResult.draft,
      card: draftResult.card,
      profileUsed: draftResult.profileUsed,
    });
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
    this.realtime?.emitAgentEvent(ownerUserId, 'agent:approval_required', {
      taskId: task.id,
      reason: 'recommendations_ready_waiting_user_confirmation',
      candidateCount: candidates.length,
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
      undefined,
      undefined,
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
    let runtimeStepOrder = 0;
    const runtimeRun = await this.fitMeetRuntime?.startRun({
      userId: ownerUserId,
      userMessage: goal,
      permissionMode,
    });

    let task = await this.createOrReuseTask({
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

    const alphaTurn = await this.alphaAgent?.prepareTurn({
      ownerUserId,
      taskId: task.id,
      message: goal,
      permissionMode,
      context: { flow: 'run_stream' },
    });
    if (alphaTurn?.safety.blocked) {
      const blockedStep: SocialAgentVisibleStep = {
        id: 'main_agent_safety',
        label: 'Main Agent 已拦截不安全请求',
        status: 'failed',
      };
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
      await this.writeEvent(
        task,
        AgentTaskEventType.TaskFailed,
        blockedStep.label,
        {
          traceId: alphaTurn.traceId,
          safety: alphaTurn.safety,
          agentTrace: alphaTurn.agentTrace,
        },
        AgentTaskEventActor.Agent,
      );
      await emit?.({ type: 'step', step: blockedStep });
      const events = await this.eventRepo.find({
        where: { taskId: task.id, ownerUserId },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 500,
      });
      const result: SocialAgentChatRunResult = {
        taskId: task.id,
        status: task.status,
        visibleSteps,
        assistantMessage:
          alphaTurn.assistantMessage ||
          '这个请求不符合 FitMeet 的安全边界，我不能继续执行。',
        emptyReason: null,
        message: null,
        debugReasons: null,
        socialRequestDraft: null,
        candidates: [],
        approvalRequiredActions: [],
        events: events.map((event) => this.toEventDto(event)),
        cards: alphaTurn.cards,
        safety: alphaTurn.safety,
        traceId: alphaTurn.traceId,
        agentTrace: alphaTurn.agentTrace,
        structuredIntent: alphaTurn.structuredIntent,
      };
      await emit?.({ type: 'result', result });
      return result;
    }
    if (this.alphaNeedsClarification(alphaTurn)) {
      const clarifyStep: SocialAgentVisibleStep = {
        id: 'clarify',
        label: this.userVisibleStepLabel('clarify', '正在等待你补充需求'),
        status: 'done',
      };
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
      await this.writeEvent(
        task,
        AgentTaskEventType.Note,
        'Main Agent 正在等待用户补充需求',
        { structuredIntent: alphaTurn?.structuredIntent },
        AgentTaskEventActor.Agent,
      );
      await emit?.({ type: 'step', step: clarifyStep });
      const events = await this.eventRepo.find({
        where: { taskId: task.id, ownerUserId },
        order: { createdAt: 'ASC', id: 'ASC' },
        take: 500,
      });
      const result: SocialAgentChatRunResult = {
        taskId: task.id,
        status: task.status,
        visibleSteps,
        assistantMessage: this.alphaClarifyingMessage(alphaTurn),
        emptyReason: null,
        message: null,
        debugReasons: null,
        socialRequestDraft: null,
        candidates: [],
        approvalRequiredActions: [],
        events: events.map((event) => this.toEventDto(event)),
        cards: alphaTurn?.cards ?? [],
        safety: alphaTurn?.safety,
        traceId: alphaTurn?.traceId,
        agentTrace: alphaTurn?.agentTrace,
        structuredIntent: alphaTurn?.structuredIntent,
      };
      await this.fitMeetRuntime?.completeRun({
        runId: runtimeRun?.id,
        userId: ownerUserId,
        status: FitMeetAgentRunStatus.WaitingConfirmation,
        assistantMessage: result.assistantMessage,
        resultPayload: { taskId: task.id, awaitingClarification: true },
      });
      await emit?.({ type: 'result', result });
      return result;
    }

    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      const publicLabel = this.userVisibleStepLabel(id, label);
      await emit?.({
        type: 'step',
        step: { id, label: publicLabel, status: 'running' },
      });
      this.rememberShortTermStep(task, id, publicLabel, 'running');
      const step: SocialAgentVisibleStep = {
        id,
        label: publicLabel,
        status: 'done',
      };
      visibleSteps.push(step);
      this.rememberShortTermStep(task, id, publicLabel, 'done');
      await this.writeEvent(task, eventType, label, payload);
      await this.fitMeetRuntime?.recordStep({
        runId: runtimeRun?.id,
        userId: ownerUserId,
        stepOrder: ++runtimeStepOrder,
        stepKey: id,
        title: publicLabel,
        status: FitMeetAgentStepStatus.Completed,
        safePayload: payload,
      });
      await emit?.({ type: 'step', step });
    };

    const recordTool = async (
      toolName: string,
      status: FitMeetAgentToolStatus,
      safeInput: Record<string, unknown> = {},
      safeOutput: Record<string, unknown> = {},
    ) => {
      await this.fitMeetRuntime?.recordToolCall({
        runId: runtimeRun?.id,
        userId: ownerUserId,
        toolName,
        status,
        safeInput,
        safeOutput,
      });
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

    await recordTool('fitmeet_get_my_profile', FitMeetAgentToolStatus.Running, {
      taskId: task.id,
    });
    const profileSummary = await this.readProfileSummary(ownerUserId);
    await recordTool(
      'fitmeet_get_my_profile',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      { hasProfileSummary: Boolean(profileSummary) },
    );
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

    this.realtime?.emitAgentEvent(ownerUserId, 'agent:tool_call', {
      taskId: task.id,
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'started',
    });
    await recordTool(
      'fitmeet_create_social_intent',
      FitMeetAgentToolStatus.Running,
      {
        taskId: task.id,
      },
    );
    const draftResult = await this.generateDraftWithTool(task, goal);
    await recordTool(
      'fitmeet_create_social_intent',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      { draftReady: true },
    );
    this.realtime?.emitAgentEvent(ownerUserId, 'agent:tool_result', {
      taskId: task.id,
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'draft_ready',
    });
    task = await this.assertTaskOwner(task.id, ownerUserId);
    const draft = buildSocialAgentRequestDraft({
      agentTaskId: task.id,
      draft: draftResult.draft,
      card: draftResult.card,
      profileUsed: draftResult.profileUsed,
    });

    draft.socialRequestId = await this.createPrivateDraftRequest(task, draft);
    task = await this.assertTaskOwner(task.id, ownerUserId);
    await recordTool(
      'fitmeet_create_social_intent',
      FitMeetAgentToolStatus.WaitingConfirmation,
      { taskId: task.id, mode: 'private_draft' },
      {
        socialRequestId: draft.socialRequestId ?? null,
        publishPolicy: 'requires_user_confirmation',
      },
    );

    this.realtime?.emitAgentEvent(ownerUserId, 'agent:tool_call', {
      taskId: task.id,
      toolName: SocialAgentToolName.SearchMatches,
      status: 'started',
    });
    await recordTool(
      'fitmeet_search_candidates',
      FitMeetAgentToolStatus.Running,
      {
        taskId: task.id,
        socialRequestId: draft.socialRequestId ?? null,
      },
    );
    const searchResult = await this.searchCandidates(task, draft);
    const candidates = searchResult.candidates;
    await recordTool(
      'fitmeet_search_candidates',
      FitMeetAgentToolStatus.Succeeded,
      {
        taskId: task.id,
        socialRequestId: draft.socialRequestId ?? null,
      },
      { candidateCount: candidates.length },
    );
    await recordTool(
      'fitmeet_score_candidates',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      {
        candidateCount: candidates.length,
        scoringInputs: [
          'life_graph',
          'time_overlap',
          'interest',
          'safety_boundary',
        ],
      },
    );
    this.realtime?.emitAgentEvent(ownerUserId, 'agent:candidates', {
      taskId: task.id,
      candidateCount: candidates.length,
      candidates,
    });
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

    await done(
      'safety_filter',
      '正在进行隐私、骚扰、诈骗和线下见面风险过滤',
      AgentTaskEventType.StepCompleted,
      {
        candidateCount: candidates.length,
        policy: 'critical_actions_require_user_confirmation',
      },
    );

    await done('draft', '正在生成约练草稿', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.CreateSocialRequest,
      draft: this.safeDraftForEvent(draft),
    });

    await done('reason', '正在生成推荐理由', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.ExplainMatches,
      topCandidateUserId: candidates[0]?.userId ?? null,
    });
    await done(
      'icebreaker',
      '正在生成高情商开场白',
      AgentTaskEventType.ToolReturned,
      {
        toolName: 'fitmeet_generate_icebreaker',
        candidateCount: candidates.length,
      },
    );
    await recordTool(
      'fitmeet_generate_icebreaker',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      {
        candidateCount: candidates.length,
        requiresUserConfirmationBeforeSend: true,
      },
    );

    await done('done', '已完成', AgentTaskEventType.TaskSucceeded, {
      candidateCount: candidates.length,
      requiresConfirmation: true,
    });

    const result = await this.completeRecommendationResult(
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      searchResult,
      'recommendations_ready_waiting_user_confirmation',
      emit,
      alphaTurn,
    );
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

  async publishDraft(
    ownerUserId: number,
    taskId: number,
    draft: CreateSocialRequestDto & { socialRequestId?: number | null },
  ) {
    let task = await this.assertTaskOwner(taskId, ownerUserId);
    const requestId = this.number(
      draft.socialRequestId ?? draft.metadata?.socialRequestId,
    );
    const dto = toSocialAgentPublishDto(task.id, draft);
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
    transitionSocialAgentState(
      task,
      requiresApproval ? 'confirmation_required' : 'message_action',
      {
        objective: 'candidate_messaging',
        nextStep: requiresApproval ? '等待用户确认发送消息' : '等待候选人回复',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: requiresApproval
          ? 'message_confirmation'
          : 'candidate_reply',
        lastCompletedStep: requiresApproval
          ? 'message_approval_created'
          : 'message_sent',
      },
    );
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
    transitionSocialAgentState(task, 'message_action', {
      objective: 'candidate_messaging',
      nextStep: '进入候选人会话，等待继续沟通',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'candidate_conversation',
      lastCompletedStep: 'candidate_connected',
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
    appendSocialAgentConversationTurn(task, {
      role: 'user',
      text: message,
      at: now,
    });
    appendSocialAgentShortTermTurn(task, {
      role: 'user',
      text: message,
      at: now,
    });
    transitionSocialAgentState(task, 'user_message');
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
    appendSocialAgentConversationTurn(task, {
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
    appendSocialAgentShortTermTurn(task, {
      role: 'assistant',
      text: message,
      intent: route.intent,
      action: route.action,
      at: now,
    });
    recordSocialAgentShortTermAction(task, {
      action: route.action,
      intent: route.intent,
      status: route.shouldQueueRun ? 'queued' : 'completed',
      at: now,
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
    memoryContext?: SocialAgentMemoryContext | null,
  ): Record<string, unknown> {
    const candidates = readSocialAgentStoredCandidateSummaries(task);
    const result = this.isRecord(task.result) ? task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    const hasSearchContext = this.hasSearchContext(task);
    const taskMemory = readSocialAgentTaskMemory(task);
    return {
      taskId: task.id,
      taskType: task.taskType,
      status: task.status,
      agentState: taskMemory.currentTask.state,
      currentTask: taskMemory.currentTask,
      goal: task.goal,
      hasSearchContext,
      hasCandidates: body.hasCandidates === true || candidates.length > 0,
      candidateCount:
        candidates.length || this.number(chatRun.candidateCount) || 0,
      socialRequestId: this.number(chatRun.socialRequestId) ?? null,
      longTermSignals: longTermSnapshot
        ? {
            taskCount: longTermSnapshot.taskCount,
            profileFacts: longTermSnapshot.profileFacts,
            preferences: longTermSnapshot.preferences,
            boundaries: longTermSnapshot.boundaries,
            socialGoals: longTermSnapshot.socialGoals,
            availability: longTermSnapshot.availability,
            activityPreferences: longTermSnapshot.activityPreferences,
            matchSignals: longTermSnapshot.matchSignals,
          }
        : null,
      memoryContext: memoryContext ?? null,
    };
  }

  private emptyIntentEntities(): SocialAgentIntentEntities {
    return {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    };
  }

  private buildMemoryContext(
    task: AgentTask,
    longTermSnapshot:
      | import('./social-agent-long-term-memory.service').LongTermMemorySnapshot
      | null,
  ): SocialAgentMemoryContext | null {
    return (
      this.memoryContext?.build({
        task,
        conversationHistory: readSocialAgentConversationHistory(task),
        longTermSnapshot,
      }) ?? null
    );
  }

  private toRouteAction(
    route: SocialAgentIntentRouterResult,
    queuedRun: SocialAgentAsyncRunSnapshot | null,
    runMode: SocialAgentIntentRouteResult['runMode'],
  ): SocialAgentIntentAction {
    if (queuedRun)
      return runMode === 'follow_up' ? 'queue_replan' : 'queue_search';
    if (route.replyStrategy === 'conversational_answer') return 'answer';
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
    if (route.intent === 'product_help') {
      return productHelpFallbackReply(message);
    }
    if (route.intent === 'workflow_help') {
      return workflowHelpReply();
    }
    if (
      route.intent === 'profile_enrichment' ||
      route.intent === 'profile_enrichment_request' ||
      route.intent === 'correction_or_clarification'
    ) {
      return '我先按你的画像信息来理解，不会直接搜索候选人。';
    }
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

  private shouldUseLlmDirectReply(
    route: SocialAgentIntentRouterResult,
  ): boolean {
    return (
      route.intent === 'product_help' ||
      route.intent === 'workflow_help' ||
      route.intent === 'casual_chat' ||
      route.intent === 'unknown'
    );
  }

  private async handleProfileEnrichmentTurn(
    ownerUserId: number,
    task: AgentTask,
    message: string,
    intent: SocialAgentIntentType,
  ): Promise<{
    assistantMessage: string;
    savedContext: boolean;
    profileUpdated: boolean;
    profileUpdateProposal?: LifeGraphProposalDto | null;
    task: AgentTask;
  }> {
    if (this.isProfileMissingFieldsQuestion(message)) {
      return {
        assistantMessage: this.profileMissingFieldsReply(task),
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: null,
        task,
      };
    }

    const sourceMessage =
      intent === 'profile_enrichment'
        ? message
        : this.findRecentProfileSourceMessage(task, message) || message;
    const extractedProfile = this.extractProfileFieldsFromConversation([
      sourceMessage,
    ]);
    const llmExtractedProfile = await this.chatLlm.extractProfileFieldsWithLlm(
      task,
      sourceMessage,
    );
    const plannedProfile = this.chatLlm.profileFieldsFromRecord(
      readSocialAgentConversationBrainToolArguments(
        task,
        SocialAgentToolName.UpdateProfileFromAgentContext,
      ),
    );
    const mergedProfile: ExtractedProfileFields = {
      ...plannedProfile,
      ...extractedProfile,
      ...llmExtractedProfile,
    };
    this.rememberExtractedProfileInTaskMemory(
      task,
      mergedProfile,
      sourceMessage,
    );
    await this.taskRepo.save(task);

    if (this.lifeGraph && Object.keys(mergedProfile).length > 0) {
      const proposal = await this.lifeGraph.extractFromChat(ownerUserId, {
        message: sourceMessage,
        taskId: task.id,
        context: { intent, extractedProfile: mergedProfile },
      });
      if (proposal.proposedFields.length > 0) {
        rememberSocialAgentCurrentTask(task, {
          objective: 'profile_enrichment',
          nextStep: '等待用户确认是否保存 Life Graph 画像提案',
          shouldSearchNow: false,
          profileSaved: false,
          waitingFor: 'life_graph_profile_confirmation',
          lastCompletedStep: 'life_graph_profile_proposed',
        });
        transitionSocialAgentState(task, 'profile_detected');
        await this.taskRepo.save(task);
        return {
          assistantMessage: this.lifeGraphProposalReply(proposal),
          savedContext: true,
          profileUpdated: false,
          profileUpdateProposal: proposal,
          task,
        };
      }
    }

    const shouldSave = this.shouldSaveProfileFromMessage(message);
    const brainMode = readSocialAgentConversationBrainMode(task);
    const brainWantsProfileTool = readSocialAgentConversationBrainToolNames(
      task,
    ).includes(SocialAgentToolName.UpdateProfileFromAgentContext);
    if (
      (shouldSave ||
        brainMode === 'profile_update_tool' ||
        brainWantsProfileTool) &&
      Object.keys(mergedProfile).length > 0
    ) {
      const call = await this.executor.executeToolAction(
        task.id,
        SocialAgentToolName.UpdateProfileFromAgentContext,
        {
          extractedProfile: mergedProfile,
          sourceMessage,
          taskId: task.id,
        },
        ownerUserId,
      );
      const output = this.isRecord(call.output) ? call.output : {};
      rememberSocialAgentConversationBrainToolResult(task, {
        name: SocialAgentToolName.UpdateProfileFromAgentContext,
        status: call.status,
        input: {
          extractedProfile: mergedProfile,
          sourceMessage,
        },
        output,
        error: call.error ?? null,
      });
      mergeSocialAgentStableProfileFacts(task, mergedProfile);
      transitionSocialAgentState(task, 'profile_saved', {
        objective: 'profile_enrichment',
        nextStep: '询问可约时间、边界要求，或等待用户确认开始搜索',
        shouldSearchNow: false,
        profileSaved: call.status === 'succeeded',
        awaitingSearchConfirmation: true,
        waitingFor: 'availability_boundaries_or_search_confirmation',
        lastCompletedStep: 'profile_saved',
      });
      await this.taskRepo.save(task);
      const fallbackReply = this.profileUpdatedReply(mergedProfile, output);
      return {
        assistantMessage: await this.chatLlm.generateAgentBrainReply({
          message,
          task,
          intent,
          mode: 'profile_updated',
          extractedProfile: mergedProfile,
          sourceMessage,
          toolOutput: output,
          fallbackReply,
          memoryContext: this.buildMemoryContext(task, null),
        }),
        savedContext: true,
        profileUpdated: call.status === 'succeeded',
        profileUpdateProposal: null,
        task,
      };
    }

    const fallbackReply = this.profileExtractionReply(
      mergedProfile,
      intent === 'correction_or_clarification',
    );
    rememberSocialAgentCurrentTask(task, {
      objective: 'profile_enrichment',
      nextStep: '询问是否保存画像，或继续补齐可约时间和边界',
      shouldSearchNow: false,
      profileSaved: false,
      awaitingSearchConfirmation: true,
      waitingFor: 'profile_save_or_more_profile_facts',
      lastCompletedStep: 'profile_extracted',
    });
    transitionSocialAgentState(task, 'profile_detected');
    return {
      assistantMessage: await this.chatLlm.generateAgentBrainReply({
        message,
        task,
        intent,
        mode:
          intent === 'correction_or_clarification'
            ? 'profile_correction'
            : 'profile_extraction',
        extractedProfile: mergedProfile,
        sourceMessage,
        fallbackReply,
        memoryContext: this.buildMemoryContext(task, null),
      }),
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: null,
      task,
    };
  }

  private lifeGraphProposalReply(proposal: LifeGraphProposalDto): string {
    const lines = proposal.proposedFields.slice(0, 8).map((field) => {
      const value = Array.isArray(field.fieldValue)
        ? field.fieldValue.join('、')
        : safeUnknownText(field.fieldValue);
      return `- ${this.lifeGraphFieldLabel(field.fieldKey)}：${value}`;
    });
    return [
      '我识别到以下画像信息：',
      ...lines,
      '是否保存到你的 Life Graph？保存后我会用它提升匹配准确度；不保存也不会影响当前聊天。',
    ].join('\n');
  }

  private lifeGraphFieldLabel(fieldKey: string): string {
    const labels: Record<string, string> = {
      city: '城市',
      nearbyArea: '常活动区域',
      availableTimes: '可约时间',
      weekendAvailability: '周末可用时间',
      sportsPreferences: '运动偏好',
      currentSocialGoal: '当前目标',
      preferredSocialStyle: '社交方式',
      acceptsNightMeet: '是否接受晚上见面',
      publicPlaceOnly: '公开地点偏好',
    };
    return labels[fieldKey] ?? fieldKey;
  }

  private async lifeGraphSearchClarification(
    ownerUserId: number,
    message: string,
  ): Promise<string | null> {
    if (
      !this.lifeGraph ||
      !/找|匹配|推荐|搭子|candidate|match|find/i.test(message)
    ) {
      return null;
    }
    const signals = await this.lifeGraph.getUnifiedMatchSignals(ownerUserId);
    const missing: string[] = [];
    if (
      !signals.lifestyleSignals.availableTimes &&
      !signals.lifestyleSignals.weekendAvailability
    ) {
      missing.push('你一般什么时候有空');
    }
    if (
      signals.fitnessSignals.publicPlaceOnly !== true &&
      signals.safetySignals.publicPlaceOnly !== true
    ) {
      missing.push('第一次见面是否只接受公共场所');
    }
    if (missing.length === 0) return null;
    return `我可以帮你找合适的人，但还缺 ${missing.length} 个会明显影响匹配的信息：${missing.join('？')}？补充后我再开始搜索，会更准也更安全。`;
  }

  private alphaNeedsClarification(
    alphaTurn?: FitMeetAlphaTurnDecision,
  ): boolean {
    const intent = this.isRecord(alphaTurn?.structuredIntent)
      ? alphaTurn?.structuredIntent
      : {};
    return (
      intent.requiresSearch === false &&
      cleanDisplayText(intent.readiness, '') === 'clarify'
    );
  }

  private alphaClarifyingMessage(alphaTurn?: FitMeetAlphaTurnDecision): string {
    const intent = this.isRecord(alphaTurn?.structuredIntent)
      ? alphaTurn?.structuredIntent
      : {};
    const question = cleanDisplayText(intent.clarifyingQuestion, '');
    const fallback =
      '可以。我先帮你找轻松一点、不需要太强社交压力的人。你更想今晚附近试试，还是周末下午找个时间？';
    return (
      this.tonePolicy?.safeAssistantMessage(question, fallback) ||
      question ||
      fallback
    );
  }

  private userVisibleStepLabel(id: string, label: string): string {
    return this.tonePolicy?.userStatus(id, label) ?? label;
  }

  private shouldSaveProfileFromMessage(message: string): boolean {
    return /(调用工具|保存|写入|存到|完善ai画像|完善AI画像|对，|对,|确认|可以保存)/i.test(
      message,
    );
  }

  private isProfileMissingFieldsQuestion(message: string): boolean {
    return /(\u8fd8\u7f3a\u4ec0\u4e48|\u8fd8\u5dee\u4ec0\u4e48|\u7f3a\u54ea\u4e9b|\u7f3a\u5c11\u54ea\u4e9b|\u753b\u50cf.*\u7f3a|\u8d44\u6599.*\u7f3a|\u8fd8\u9700\u8981\u8865\u5145\u4ec0\u4e48)/i.test(
      message,
    );
  }

  private findRecentProfileSourceMessage(
    task: AgentTask,
    currentMessage: string,
  ): string | null {
    const current = cleanDisplayText(currentMessage, '');
    const userTurns = readSocialAgentConversationHistory(task)
      .filter((turn) => cleanDisplayText(turn.role, '') === 'user')
      .map((turn) => cleanDisplayText(turn.text ?? turn.content, ''))
      .filter((text) => text && text !== current)
      .slice(-5)
      .reverse();
    return (
      userTurns.find(
        (text) =>
          Object.keys(this.extractProfileFieldsFromConversation([text]))
            .length >= 2,
      ) ??
      userTurns[0] ??
      null
    );
  }

  private extractProfileFieldsFromConversation(
    messages: string[],
  ): ExtractedProfileFields {
    const text = messages.map((item) => cleanDisplayText(item, '')).join('。');
    const fields: ExtractedProfileFields = {};
    const genderMatch = text.match(/(男生|女生|男|女)/);
    if (genderMatch)
      fields.gender = genderMatch[1].includes('女') ? '女' : '男';
    const ageMatch = text.match(
      /(?:^|[，。,.\s])(\d{1,2})\s*(?:岁)?(?:[，。,.\s]|$)/,
    );
    if (ageMatch) fields.ageRange = ageMatch[1];
    const heightMatch = text.match(/身高\s*(\d{2,3})\s*(?:cm|厘米)?/i);
    if (heightMatch) fields.height = `${heightMatch[1]}cm`;
    const weightMatch = text.match(/体重\s*(\d{2,3})\s*(?:kg|公斤|斤)?/i);
    if (weightMatch) fields.weight = `${weightMatch[1]}kg`;
    const zodiacMatch = text.match(
      /(白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)(?:座)?/,
    );
    if (zodiacMatch) fields.zodiac = `${zodiacMatch[1]}座`;
    const mbtiMatch = text.match(
      /\b(infp|enfp|intj|entj|intp|entp|isfp|istp|isfj|istj|esfp|estp|esfj|estj|infj|enfj)\b/i,
    );
    if (mbtiMatch) fields.mbti = mbtiMatch[1].toUpperCase();
    const cityMatch = text.match(
      /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|合肥)/,
    );
    if (cityMatch) fields.city = sanitizeCity(cityMatch[1]);
    const schoolMatch = text.match(/([\u4e00-\u9fa5]{2,20}大学)/);
    if (schoolMatch) {
      fields.school = schoolMatch[1].replace(
        /^.*?(?=[\u4e00-\u9fa5]{2,8}大学$)/,
        '',
      );
      if (schoolMatch[1].includes('青岛大学')) fields.school = '青岛大学';
    }
    const nearbyMatch = text.match(
      /(?:常住在|住在|在)([^，。,.]{2,30}(?:区|大学|校区|附近))/,
    );
    if (nearbyMatch) fields.nearbyArea = nearbyMatch[1];
    const personalityMatch = text.match(/性格([^，。,.]{1,30})/);
    const personalityParts = [
      personalityMatch?.[1],
      typeof fields.mbti === 'string' ? fields.mbti : '',
    ].filter((item): item is string => Boolean(item));
    if (personalityParts.length > 0) {
      fields.personality = personalityParts.join('，');
      fields.traits = personalityParts;
    }
    const interestMatches = Array.from(
      text.matchAll(
        /(跑步|咖啡|健身|羽毛球|瑜伽|徒步|骑行|游泳|拍照|篮球|足球|网球)/g,
      ),
    ).map((match) => match[1]);
    if (interestMatches.length > 0)
      fields.interestTags = Array.from(new Set(interestMatches));
    const timeMatch = text.match(
      /(周末[^，。,.]{0,12}|下午|晚上|工作日[^，。,.]{0,12})/,
    );
    if (timeMatch) fields.availableTimes = [timeMatch[1]];
    const targetMatch = text.match(/想(?:找|认识)([^，。,.]{1,30})/);
    if (targetMatch) {
      const target = targetMatch[1].trim().replace(/^(一个|个|一位|位)/, '');
      fields.socialGoal = `想认识${target}`;
      fields.targetPreference = target;
      fields.wantToMeet = [target];
      fields.preferredTraits = [target];
    }
    const rejectMatch = text.match(
      /(?:不喜欢|不接受|不想|拒绝|避免)([^，。,.]{1,40})/,
    );
    if (rejectMatch) fields.rejectRules = rejectMatch[0];
    const privacyMatch = text.match(/(?:隐私|不公开|不透露)([^，。,.]{1,60})/);
    if (privacyMatch) fields.privacyBoundary = privacyMatch[0];
    return fields;
  }

  private rememberExtractedProfileInTaskMemory(
    task: AgentTask,
    extractedProfile: ExtractedProfileFields,
    sourceMessage: string,
  ): void {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    task.memory = {
      ...memory,
      pendingProfileEnrichment: {
        extractedProfile,
        sourceMessage,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  private async executeConversationBrainReadTools(
    ownerUserId: number,
    task: AgentTask,
    decision?: SocialAgentBrainTurnDecision,
  ): Promise<Array<Record<string, unknown>>> {
    if (!decision?.shouldExecuteTool) return [];
    const readTools = decision.tools.filter((tool) =>
      this.isConversationBrainReadTool(tool.name),
    );
    const results: Array<Record<string, unknown>> = [];
    for (const tool of readTools) {
      const toolName = this.executorToolForConversationBrainRead(tool.name);
      if (!toolName) continue;
      try {
        const call = await this.executor.executeToolAction(
          task.id,
          toolName,
          {
            ...tool.arguments,
            userId: ownerUserId,
          },
          ownerUserId,
        );
        const result = {
          name: tool.name,
          executorToolName: toolName,
          status: call.status,
          output: call.output,
          error: call.error,
        };
        results.push(result);
        rememberSocialAgentConversationBrainToolResult(task, result);
      } catch (error) {
        this.metrics.recordError('conversation_brain_read_tool_failed');
        const result = {
          name: tool.name,
          executorToolName: toolName,
          status: 'failed',
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
        results.push(result);
        rememberSocialAgentConversationBrainToolResult(task, result);
      }
    }
    return results;
  }

  private isConversationBrainReadTool(toolName: string): boolean {
    return [
      'get_user_profile',
      'get_conversation_messages',
      'get_candidate_detail',
    ].includes(cleanDisplayText(toolName, ''));
  }

  private executorToolForConversationBrainRead(
    toolName: string,
  ): SocialAgentToolName | null {
    switch (cleanDisplayText(toolName, '')) {
      case 'get_user_profile':
        return SocialAgentToolName.GetMyProfile;
      case 'get_conversation_messages':
        return SocialAgentToolName.ReadTaskConversationMessages;
      case 'get_candidate_detail':
        return SocialAgentToolName.ExplainMatches;
      default:
        return null;
    }
  }

  private rememberCurrentTaskFromBrain(
    task: AgentTask,
    route: SocialAgentIntentRouterResult,
  ): void {
    const brainMode = readSocialAgentConversationBrainMode(task);
    if (
      route.intent === 'profile_enrichment' ||
      route.intent === 'profile_enrichment_request' ||
      route.intent === 'correction_or_clarification' ||
      brainMode === 'profile_enrichment' ||
      brainMode === 'profile_correction' ||
      brainMode === 'profile_update_tool'
    ) {
      rememberSocialAgentCurrentTask(task, {
        objective: 'profile_enrichment',
        nextStep:
          brainMode === 'profile_update_tool'
            ? '保存画像后询问可约时间和边界要求'
            : '提取画像信息，询问是否保存或继续补齐',
        shouldSearchNow: false,
        awaitingSearchConfirmation: true,
        waitingFor:
          brainMode === 'profile_update_tool'
            ? 'profile_save'
            : 'profile_save_or_search_confirmation',
      });
      transitionSocialAgentState(
        task,
        route.intent === 'correction_or_clarification'
          ? 'user_correction'
          : 'profile_detected',
      );
      return;
    }
    if (route.intent === 'workflow_help') {
      rememberSocialAgentCurrentTask(task, {
        objective: 'workflow_help',
        nextStep: '解释直接发布需求和先完善画像两种路径',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'user_choice',
      });
      transitionSocialAgentState(task, 'workflow_help');
      return;
    }
    if (
      route.intent === 'social_search' ||
      route.intent === 'activity_search'
    ) {
      rememberSocialAgentCurrentTask(task, {
        objective: 'search',
        nextStep: '调用搜索工具并基于真实结果回复',
        shouldSearchNow: true,
        awaitingSearchConfirmation: false,
        waitingFor: 'search_results',
      });
      transitionSocialAgentState(task, 'search_started');
    }
  }

  private profileMissingFieldsReply(task: AgentTask): string {
    const lastToolResult =
      readSocialAgentConversationBrainLastToolResult(task) ?? {};
    const output = this.isRecord(lastToolResult.output)
      ? lastToolResult.output
      : {};
    const missingFields = Array.isArray(output.missingFields)
      ? output.missingFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    const knownMissing =
      missingFields.length > 0
        ? `工具返回还缺：${missingFields.join('、')}。`
        : '目前画像主干已经有了，但关键约练条件还不够完整。';

    return [
      knownMissing,
      '建议再补：可约时间、具体活动类型、边界要求，以及是否只接受校内/公共场所。',
      '你可以直接按“时间 + 活动 + 边界”补一句，比如：周末下午，校园内咖啡或散步，只在公共场所。',
    ].join('\n');
  }

  private profileExtractionReply(
    extractedProfile: ExtractedProfileFields,
    corrected: boolean,
  ): string {
    const lines = this.profileFieldLines(extractedProfile);
    const intro = corrected
      ? '我理解了，刚才那段是你的画像信息，不是立即搜索需求。我先不搜索。'
      : '我已提取到这些画像信息，先不直接搜索候选人。';
    return [
      intro,
      lines.length > 0
        ? `已提取：${lines.join('；')}`
        : '我还没有提取到足够明确的画像字段。',
      '你要我把这些信息保存到 AI 画像里吗？保存后，我也可以继续问你可约时间、边界要求，再基于画像开始搜索。',
      '你也可以直接补充：城市/区域、兴趣、可约时间、想认识的人和边界。',
    ].join('\n');
  }

  private profileUpdatedReply(
    extractedProfile: ExtractedProfileFields,
    output: Record<string, unknown>,
  ): string {
    const updatedFields = Array.isArray(output.updatedFields)
      ? output.updatedFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    const memoryFields = Array.isArray(output.memoryFields)
      ? output.memoryFields
          .map((item) => cleanDisplayText(item, ''))
          .filter(Boolean)
      : [];
    const lines = this.profileFieldLines(extractedProfile);
    return [
      '已帮你把刚才的信息写入 AI 画像。',
      updatedFields.length > 0
        ? `已保存到画像字段：${updatedFields.join('、')}`
        : '',
      memoryFields.length > 0
        ? `作为补充偏好记录：${memoryFields.join('、')}`
        : '',
      lines.length > 0 ? `本次识别：${lines.join('；')}` : '',
      '还缺少可约时间、明确边界和具体约练偏好。你可以继续补充，或者告诉我“现在开始搜索”。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private profileFieldLines(fields: ExtractedProfileFields): string[] {
    return Object.entries(fields).map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join('、') : value;
      return `${key}: ${rendered}`;
    });
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
    transitionSocialAgentState(task, 'search_started', {
      objective: 'search',
      nextStep: '搜索真实候选人并展示结果',
      shouldSearchNow: true,
      awaitingSearchConfirmation: false,
      waitingFor: 'search_results',
    });
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

  private async generateActivitySearchAssistantMessage(input: {
    task: AgentTask;
    message: string;
    route: SocialAgentIntentRouterResult;
    activityResults: SocialAgentActivityResult[];
    fallbackReply: string;
  }): Promise<string> {
    if (!this.finalResponses) return input.fallbackReply;
    return this.finalResponses.generate({
      userMessage: input.message,
      intent: input.route.intent,
      route: input.route as unknown as Record<string, unknown>,
      agentState: readSocialAgentCurrentAgentState(input.task),
      conversationHistory: buildSocialAgentLlmConversationHistory(input.task),
      memoryContext: this.buildMemoryContext(
        input.task,
        null,
      ) as unknown as Record<string, unknown>,
      taskContext: summarizeSocialAgentTaskMemoryForLlm(input.task),
      plannerDecision: readSocialAgentConversationBrainDecision(input.task),
      toolResults: [
        {
          tool: 'search_public_intents',
          success: true,
          resultCount: input.activityResults.length,
        },
      ],
      searchResults: {
        activityResults: input.activityResults,
        emptyReason:
          input.activityResults.length === 0 ? 'no_real_candidates' : null,
      },
      safetyRules: socialAgentFinalResponseSafetyRules(),
      responseGoal:
        input.activityResults.length > 0
          ? '自然说明已找到真实活动或公开意向，并引导用户选择或继续筛选。'
          : '自然说明没有找到真实活动或公开意向，并建议调整城市、时间或活动类型。',
      fallbackReply: input.fallbackReply,
    });
  }

  private async createActionApproval(
    ownerUserId: number,
    task: AgentTask,
    message: string,
    route: SocialAgentIntentRouterResult,
  ): Promise<SocialAgentPendingApprovalSnapshot | null> {
    try {
      const inferred = this.inferApprovalTypeFromMessage(message);
      const candidates = readSocialAgentStoredCandidateSummaries(task);
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
      transitionSocialAgentState(task, 'confirmation_required', {
        objective: 'candidate_action',
        nextStep: '等待用户确认候选人动作',
        shouldSearchNow: false,
        awaitingSearchConfirmation: false,
        waitingFor: 'action_confirmation',
        lastCompletedStep: 'approval_created',
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

  private async createOpenerDraftFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const candidate = readSocialAgentCardActionCandidate({
      payload,
      task,
      isRecord: (value) => this.isRecord(value),
    });
    const targetUserId =
      this.number(payload.targetUserId) ??
      this.number(candidate.targetUserId) ??
      this.number(candidate.candidateUserId) ??
      this.number(candidate.userId);
    const draft =
      cleanDisplayText(
        payload.message ??
          payload.suggestedOpener ??
          candidate.suggestedOpener ??
          candidate.suggestedMessage,
        '',
      ).trim() || this.candidateMessageDraft(task);

    const approval = await this.approvals.create({
      userId: ownerUserId,
      agentConnectionId: null,
      agentTaskId: task.id,
      type: ApprovalType.SendMessage,
      actionType: 'send_candidate_message',
      skillName: 'send_candidate_message',
      payload: {
        source: 'agent_card_action',
        schemaAction: body.action,
        agentTaskId: task.id,
        candidateUserId: targetUserId,
        targetUserId,
        candidate,
        message: draft,
        suggestedOpener: draft,
      },
      summary: targetUserId
        ? `发送开场白给候选人 #${targetUserId}`
        : '发送开场白给候选人',
      riskLevel: ApprovalRiskLevel.Medium,
      reason: 'FitMeet Agent 已生成开场白草稿，等待用户确认后再发送。',
      createdBy: 'agent',
      relatedCandidateId: this.number(candidate.candidateRecordId) ?? null,
    });
    const pendingApproval = this.toPendingApprovalSnapshot(approval);
    recordSocialAgentPendingAction(task, {
      id: pendingApproval.id,
      type: pendingApproval.type,
      actionType: pendingApproval.actionType,
      summary: pendingApproval.summary,
      riskLevel: pendingApproval.riskLevel,
      at: new Date().toISOString(),
    });
    task.result = {
      ...(task.result ?? {}),
      cardActionDraft: {
        action: body.action,
        targetUserId,
        candidate,
        message: draft,
        approvalId: approval.id,
      },
    };
    transitionSocialAgentState(task, 'confirmation_required', {
      objective: 'candidate_messaging',
      nextStep: '等待你确认是否发送开场白',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'message_confirmation',
      lastCompletedStep: 'opener_draft_created',
    });
    await this.taskRepo.save(task);

    const displayName =
      cleanDisplayText(candidate.displayName ?? candidate.nickname, '') ||
      '对方';
    const card = buildSocialAgentOpenerApprovalCard({
      taskId: task.id,
      targetUserId,
      approvalId: approval.id,
      candidate,
      displayName,
      draft,
      regeneratePayload: payload,
    });

    const assistantMessage =
      '我先帮你写了一条低压力的开场白。你确认前，我不会替你发送。';
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action created opener approval',
      { action: body.action, approvalId: approval.id },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async createActivityApprovalFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = body.payload ?? {};
    const approval = await this.approvals.create({
      userId: ownerUserId,
      agentConnectionId: null,
      agentTaskId: task.id,
      type: ApprovalType.CreateActivity,
      actionType: 'create_activity',
      skillName: 'create_activity',
      payload: {
        source: 'agent_card_action',
        schemaAction: body.action,
        agentTaskId: task.id,
        ...payload,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
      summary: '创建线下约练计划',
      riskLevel: ApprovalRiskLevel.Medium,
      reason: '线下活动必须由用户确认后才能创建。',
      createdBy: 'agent',
      relatedSocialRequestId: this.number(payload.socialRequestId) ?? null,
      relatedCandidateId: this.number(payload.candidateRecordId) ?? null,
    });
    const pendingApproval = this.toPendingApprovalSnapshot(approval);
    recordSocialAgentPendingAction(task, {
      id: pendingApproval.id,
      type: pendingApproval.type,
      actionType: pendingApproval.actionType,
      summary: pendingApproval.summary,
      riskLevel: pendingApproval.riskLevel,
      at: new Date().toISOString(),
    });
    task.result = {
      ...(task.result ?? {}),
      activityDraft: {
        action: body.action,
        approvalId: approval.id,
        ...payload,
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
    };
    transitionSocialAgentState(task, 'confirmation_required', {
      objective: 'activity_creation',
      nextStep: '等待你确认是否创建约练计划',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_confirmation',
      lastCompletedStep: 'activity_draft_created',
    });
    await this.taskRepo.save(task);

    const card = buildSocialAgentActivityPlanCard({
      taskId: task.id,
      approvalId: approval.id,
      payload,
    });

    const assistantMessage =
      '我整理好了约练计划草稿。你确认前，我不会创建线下活动，也不会共享精确位置。';
    const result = this.cardActionRouteResult(
      task,
      assistantMessage,
      [card],
      pendingApproval,
    );
    await this.writeEvent(
      task,
      AgentTaskEventType.ConfirmationRequested,
      'Agent card action created activity approval',
      { action: body.action, approvalId: approval.id },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async confirmActivityFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const realActivity = await this.createOrConfirmRealActivity(
      ownerUserId,
      payload,
      activityId,
      candidateUserId,
    );
    const resolvedActivityId = this.number(realActivity?.id) ?? activityId;
    const resolvedCandidateUserId =
      this.number(realActivity?.invitedUserId) ??
      candidateUserId ??
      this.number(payload.invitedUserId);
    await this.recordLifeGraphBehaviorEvent(ownerUserId, {
      eventType: LifeGraphBehaviorEventType.ActivityCreated,
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId: resolvedCandidateUserId,
      metadata: {
        sourceAction: body.action,
        activityType: cleanDisplayText(payload.activityType, 'running'),
        publicPlaceOnly: true,
        noPreciseLocation: true,
      },
      naturalSummary:
        '你确认创建了一次线下约练计划，后续推荐会更重视真实履约和公共场所边界。',
      weight: 1,
    });

    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId: resolvedActivityId,
        candidateUserId: resolvedCandidateUserId,
        publicPlaceOnly: true,
        noPreciseLocation: true,
        realActivityPersisted: Boolean(realActivity),
        status: 'activity_confirmed',
        loopStage: 'activity_confirmed',
        confirmedAt: now,
      },
    };
    transitionSocialAgentState(task, 'activity_confirmed', {
      objective: 'meet_loop',
      nextStep: '活动开始前等待你签到',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_check_in',
      lastCompletedStep: 'activity_confirmed',
    });
    await this.taskRepo.save(task);

    const card = buildSocialAgentCheckinCard({
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId: resolvedCandidateUserId,
      realActivityPersisted: Boolean(realActivity),
    });

    const assistantMessage =
      '约练计划已经创建好了。等你到达公共场所后，再点签到；我不会共享你的精确位置。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop activity confirmed',
      {
        action: body.action,
        activityId: resolvedActivityId,
        candidateUserId: resolvedCandidateUserId,
        realActivityPersisted: Boolean(realActivity),
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async checkInActivityFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const checkinResult =
      activityId && this.activities
        ? await this.activities.checkin(activityId, ownerUserId, {
            locationApprox: cleanDisplayText(
              payload.locationApprox ?? payload.locationName,
              '公共场所',
            ),
          } satisfies CheckinActivityDto)
        : null;
    const resolvedActivityId =
      this.number(checkinResult?.activity?.id) ?? activityId;
    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(checkinResult),
        status: 'activity_checked_in',
        loopStage: 'activity_checked_in',
        checkedInAt: now,
      },
    };
    transitionSocialAgentState(task, 'activity_checked_in', {
      objective: 'meet_loop',
      nextStep: '活动结束后确认是否完成',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'activity_completion',
      lastCompletedStep: 'activity_checked_in',
    });
    await this.taskRepo.save(task);

    const card = buildSocialAgentActivityCompletionCard({
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId,
      realActivityPersisted: Boolean(checkinResult),
      checkedInAt: now,
    });

    const assistantMessage =
      '签到已记录。活动结束后你确认完成，我再帮你生成评价卡，并说明 Life Graph 会更新什么。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop activity checked in',
      {
        action: body.action,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(checkinResult),
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async completeActivityFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const completedActivity =
      activityId && this.activities
        ? await this.activities.complete(activityId, ownerUserId)
        : null;
    const resolvedActivityId = this.number(completedActivity?.id) ?? activityId;
    if (!completedActivity) {
      await this.recordLifeGraphBehaviorEvent(ownerUserId, {
        eventType: LifeGraphBehaviorEventType.ActivityCompleted,
        taskId: task.id,
        activityId: resolvedActivityId,
        candidateUserId,
        metadata: {
          sourceAction: body.action,
          activityType: cleanDisplayText(payload.activityType, 'running'),
          publicPlaceOnly: true,
        },
        naturalSummary:
          '你完成了一次线下约练，我会把这次履约记录用于后续推荐。',
        weight: 1.5,
      });
    }

    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(completedActivity),
        status: 'activity_completed',
        loopStage: 'activity_completed',
        completedAt: now,
      },
    };
    transitionSocialAgentState(task, 'activity_completed', {
      objective: 'meet_loop',
      nextStep: '等待你提交活动评价',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'review',
      lastCompletedStep: 'activity_completed',
    });
    await this.taskRepo.save(task);

    const card = buildSocialAgentReviewCard({
      taskId: task.id,
      activityId: resolvedActivityId,
      candidateUserId,
      realActivityPersisted: Boolean(completedActivity),
    });

    const assistantMessage =
      '太好了，这次约练我先标记为完成。你可以提交一个简短评价，我再把 Life Graph 和 trust score 更新说明给你看。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop activity completed',
      {
        action: body.action,
        activityId: resolvedActivityId,
        candidateUserId,
        realActivityPersisted: Boolean(completedActivity),
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private async submitReviewFromCardAction(
    ownerUserId: number,
    taskId: number,
    body: SocialAgentCardActionBody,
  ): Promise<SocialAgentIntentRouteResult> {
    const task = await this.assertTaskOwner(taskId, ownerUserId);
    const payload = this.mergeActivityPayload(task, body.payload ?? {});
    const activityId = this.number(payload.activityId) ?? null;
    const candidateUserId = this.number(
      payload.candidateUserId ?? payload.targetUserId,
    );
    const rating = Math.max(1, Math.min(5, this.number(payload.rating) ?? 5));
    const positive = rating >= 4;
    const comment = cleanDisplayText(
      payload.comment,
      positive ? '这次约练体验不错。' : '这次约练有些地方不太合适。',
    );
    const reviewResult =
      activityId && this.activities
        ? await this.activities.review(activityId, ownerUserId, rating, comment)
        : null;
    if (!reviewResult) {
      await this.recordLifeGraphBehaviorEvent(ownerUserId, {
        eventType: positive
          ? LifeGraphBehaviorEventType.ActivityReviewedPositive
          : LifeGraphBehaviorEventType.ActivityReviewedNegative,
        taskId: task.id,
        activityId,
        candidateUserId,
        metadata: {
          sourceAction: body.action,
          rating,
          comment,
          activityType: cleanDisplayText(payload.activityType, 'running'),
        },
        naturalSummary: positive
          ? '你对这次约练给出了正向评价，后续会提高相似推荐的权重。'
          : '你对这次约练反馈一般，后续会降低相似推荐的权重。',
        weight: positive ? 1.2 : 1,
      });
    }

    const trustScoreDelta = positive ? 2 : 1;
    const now = new Date().toISOString();
    task.result = {
      ...(task.result ?? {}),
      meetLoop: {
        ...readSocialAgentMeetLoopState(task, (value) => this.isRecord(value)),
        ...payload,
        activityId,
        candidateUserId,
        status: 'review_submitted',
        loopStage: 'trust_score_updated',
        review: { rating, comment, submittedAt: now },
        lifeGraphUpdated: true,
        realActivityPersisted: Boolean(reviewResult),
        trustScoreDelta,
      },
    };
    transitionSocialAgentState(task, 'life_graph_updated', {
      objective: 'meet_loop',
      nextStep: '本次约练闭环已完成',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: '',
      lastCompletedStep: 'trust_score_updated',
    });
    await this.taskRepo.save(task);

    const card = buildSocialAgentLifeGraphUpdateCard({
      taskId: task.id,
      activityId,
      candidateUserId,
      realActivityPersisted: Boolean(reviewResult),
      rating,
      comment,
      positive,
      trustScoreDelta,
    });

    const assistantMessage =
      '评价已提交。这次完成记录已经用于更新你的 Life Graph，并生成了 trust score 更新说明；你之后仍然可以查看、纠正或撤回这次画像影响。';
    const result = this.cardActionRouteResult(task, assistantMessage, [card]);
    await this.writeEvent(
      task,
      AgentTaskEventType.Note,
      'Agent meet loop review submitted and life graph updated',
      {
        action: body.action,
        activityId,
        candidateUserId,
        rating,
        trustScoreDelta,
      },
      AgentTaskEventActor.Agent,
    );
    await this.recordAssistantMessage(task, assistantMessage, result);
    return result;
  }

  private cardActionRouteResult(
    task: AgentTask,
    assistantMessage: string,
    cards: FitMeetAlphaCard[],
    pendingApproval: SocialAgentPendingApprovalSnapshot | null = null,
  ): SocialAgentIntentRouteResult {
    return buildSocialAgentCardActionRouteResult({
      task,
      assistantMessage,
      cards,
      emptyIntentEntities: this.emptyIntentEntities(),
      pendingApproval,
    });
  }

  private async createOrConfirmRealActivity(
    ownerUserId: number,
    payload: Record<string, unknown>,
    activityId: number | null,
    candidateUserId?: number | null,
  ): Promise<Record<string, unknown> | null> {
    if (!this.activities) return null;
    if (activityId) {
      return (await this.activities.confirm(
        activityId,
        ownerUserId,
      )) as unknown as Record<string, unknown>;
    }

    const dto = createSocialAgentActivityDtoFromPayload({
      payload,
      candidateUserId,
      number: (value) => this.number(value),
    });
    const created = await this.activities.create(ownerUserId, dto);
    let confirmed = created;
    try {
      confirmed = await this.activities.confirm(created.id, ownerUserId);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.meet_loop.activity_owner_confirm_failed',
          ownerUserId,
          activityId: created.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return {
      ...(confirmed as unknown as Record<string, unknown>),
      invitedUserId: dto.invitedUserId ?? null,
    };
  }

  private mergeActivityPayload(
    task: AgentTask,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return mergeSocialAgentActivityPayload({
      task,
      payload,
      isRecord: (value) => this.isRecord(value),
    });
  }

  private async recordLifeGraphBehaviorEvent(
    ownerUserId: number,
    input: RecordLifeGraphBehaviorEventDto,
  ): Promise<void> {
    if (!this.lifeGraph) return;
    try {
      await this.lifeGraph.recordBehaviorEvent(ownerUserId, input);
    } catch (error) {
      this.metrics.recordError('life_graph_behavior_event_failed');
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.meet_loop.life_graph_event_failed',
          ownerUserId,
          eventType: input.eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async confirmPendingCandidateMessageIfRequested(
    ownerUserId: number,
    task: AgentTask,
    message: string,
  ): Promise<{ task: AgentTask; assistantMessage: string } | null> {
    if (!this.looksLikeMessageSendConfirmation(message)) return null;
    const pendingMessageAction = readSocialAgentTaskMemory(task)
      .pendingActions.slice()
      .reverse()
      .find((action) => action.actionType === 'send_candidate_message');
    if (!pendingMessageAction) return null;

    const candidate =
      readSocialAgentStoredCandidateSummaries(task)[0] ??
      this.cardActionDraftCandidate(task);
    if (!candidate) return null;
    const targetUserId =
      this.number(candidate.candidateUserId) ?? this.number(candidate.userId);
    const text = this.candidateMessageDraft(task);
    if (!targetUserId || !text) return null;

    const candidateRecordId = this.number(candidate.candidateRecordId);
    const socialRequestId = this.number(candidate.socialRequestId);
    const action = await this.executor.executeToolAction(
      task.id,
      SocialAgentToolName.SendMessageToCandidate,
      {
        candidateUserId: targetUserId,
        targetUserId,
        message: text,
        text,
        suggestedOpener: text,
        candidateRecordId,
        socialRequestId,
        candidate,
        metadata: {
          confirmationSource: 'social_agent_chat',
          pendingApprovalId: pendingMessageAction.id,
          userConfirmationText: message,
        },
      },
      ownerUserId,
    );
    this.assertToolActionSucceeded(action, '发送消息失败，请稍后再试');

    const output = this.isRecord(action.output) ? action.output : {};
    const messageId =
      cleanDisplayText(output.id ?? output.messageId, '') || null;
    const conversationId = cleanDisplayText(output.conversationId, '') || null;
    this.rememberCandidateAction(task, targetUserId, {
      send: 'sent',
      conversationId,
      messageId,
      candidateRecordId,
      socialRequestId,
      toolCallId: action.id,
    });
    transitionSocialAgentState(task, 'message_action', {
      objective: 'candidate_messaging',
      nextStep: '等待候选人回复',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'candidate_reply',
      lastCompletedStep: 'message_sent',
    });
    await this.taskRepo.save(task);

    const name = cleanDisplayText(candidate.nickname, `用户 #${targetUserId}`);
    return {
      task,
      assistantMessage: `已确认发送给${name}：${text}`,
    };
  }

  private looksLikeMessageSendConfirmation(message: string): boolean {
    if (
      /^(确认发送|确认发出|发送吧|可以发送|发吧|帮我发送|就发这条|确认)[。.!！\s]*$/i.test(
        message.trim(),
      )
    ) {
      return true;
    }
    return /^(确认发送|确认发出|发送吧|可以发送|发吧|帮我发送|就发这条|确认)$/i.test(
      message.trim(),
    );
  }

  private candidateMessageDraft(task: AgentTask): string {
    const draft = this.cardActionDraft(task);
    const draftMessage = cleanDisplayText(
      draft.message ?? draft.suggestedOpener,
      '',
    ).trim();
    if (draftMessage) return draftMessage;
    const candidate = readSocialAgentStoredCandidateSummaries(task)[0];
    const suggested = cleanDisplayText(candidate?.suggestedMessage, '').trim();
    if (suggested) return suggested;
    return '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。';
  }

  private cardActionDraft(task: AgentTask): Record<string, unknown> {
    const result = this.isRecord(task.result) ? task.result : {};
    return this.isRecord(result.cardActionDraft) ? result.cardActionDraft : {};
  }

  private cardActionDraftCandidate(task: AgentTask): Record<string, unknown> {
    const draft = this.cardActionDraft(task);
    return this.isRecord(draft.candidate) ? draft.candidate : {};
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
    if (readSocialAgentStoredCandidateSummaries(task).length > 0) return true;
    const result = this.isRecord(task.result) ? task.result : {};
    const chatRun = this.isRecord(result.chatRun) ? result.chatRun : {};
    return Boolean(
      this.number(chatRun.socialRequestId) ||
      this.number(chatRun.candidateCount) ||
      this.isRecord(chatRun.socialRequestDraft),
    );
  }

  private candidateFollowupReply(task: AgentTask, message: string): string {
    const candidates = readSocialAgentStoredCandidateSummaries(task);
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
          /(换一批|再来几个|不喜欢这些|换人|不合适|不喜欢这个类型|不想要这个类型|这个类型不行)/.test(
            message,
          )
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
      case 'product_help':
      case 'workflow_help':
      case 'profile_enrichment':
      case 'profile_enrichment_request':
      case 'correction_or_clarification':
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
    appendSocialAgentConversationTurn(task, {
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
        ...toSocialAgentDraftDto(draft),
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
        toSocialAgentChatCandidate(
          draft.agentTaskId,
          socialRequestId,
          candidate,
        ),
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
    alphaTurn?: FitMeetAlphaTurnDecision,
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
      candidates.length > 0
        ? 'Social Agent 返回候选卡片'
        : 'Social Agent 返回空候选结果',
      {
        candidates,
        activityResults: candidates.filter(
          (candidate) =>
            candidate.source === 'public_intent' ||
            candidate.source === 'activity',
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
    const lifeGraphSignals = this.lifeGraph
      ? await this.lifeGraph
          .getUnifiedMatchSignals(ownerUserId)
          .catch(() => null)
      : null;
    const fallbackAssistantMessage =
      searchResult.message || buildRecommendationAssistantMessage(candidates);
    const assistantMessage =
      this.tonePolicy?.safeAssistantMessage(
        await this.generateRecommendationAssistantMessage({
          task,
          draft,
          candidates,
          searchResult,
          fallbackReply: fallbackAssistantMessage,
        }),
        fallbackAssistantMessage,
      ) ?? fallbackAssistantMessage;

    const result = {
      taskId: task.id,
      status: task.status,
      visibleSteps,
      assistantMessage,
      emptyReason: searchResult.emptyReason,
      message: searchResult.message,
      debugReasons: searchResult.debugReasons,
      socialRequestDraft: draft,
      candidates,
      approvalRequiredActions: buildApprovalActions(task.id, draft, candidates),
      events: events.map((event) => this.toEventDto(event)),
      cards: this.alphaAgent?.buildResultCards({
        taskId: task.id,
        socialRequestDraft: draft as unknown as Record<string, unknown>,
        candidates: candidates as unknown as Array<Record<string, unknown>>,
        approvalRequiredActions: buildApprovalActions(
          task.id,
          draft,
          candidates,
        ),
        safety: alphaTurn?.safety,
        traceId: alphaTurn?.traceId,
        lifeGraphSignals: lifeGraphSignals as Record<string, unknown> | null,
      }),
      safety: alphaTurn?.safety,
      traceId: alphaTurn?.traceId,
      agentTrace: alphaTurn?.agentTrace,
      structuredIntent: alphaTurn?.structuredIntent,
    };
    this.evaluateAgentQuality(result);
    await emit?.({ type: 'result', result });
    return result;
  }

  private evaluateAgentQuality(result: SocialAgentChatRunResult): void {
    const report = this.agentQuality?.evaluate({
      assistantMessage: result.assistantMessage,
      cards: result.cards,
      safety: result.safety,
      structuredIntent: result.structuredIntent,
      approvalRequiredActions: result.approvalRequiredActions,
      visibleSteps: result.visibleSteps,
      candidates: result.candidates as unknown as Array<
        Record<string, unknown>
      >,
      socialRequestDraft: result.socialRequestDraft as unknown as Record<
        string,
        unknown
      > | null,
    });
    if (!report || report.passed) return;
    this.logger.warn(
      JSON.stringify({
        event: 'fitmeet_agent.quality.failed',
        taskId: result.taskId,
        score: report.score,
        failedChecks: report.checks
          .filter((check) => check.status === 'fail')
          .map((check) => check.id),
      }),
    );
  }

  private async generateRecommendationAssistantMessage(input: {
    task: AgentTask;
    draft: SocialAgentRequestDraft;
    candidates: SocialAgentChatCandidate[];
    searchResult: SocialAgentCandidateSearchResult;
    fallbackReply: string;
  }): Promise<string> {
    if (!this.finalResponses) return input.fallbackReply;
    return this.finalResponses.generate({
      userMessage: cleanDisplayText(input.draft.rawText, input.task.goal),
      intent: 'candidate_search',
      agentState: readSocialAgentCurrentAgentState(input.task),
      conversationHistory: buildSocialAgentLlmConversationHistory(input.task),
      memoryContext: this.buildMemoryContext(
        input.task,
        null,
      ) as unknown as Record<string, unknown>,
      taskContext: summarizeSocialAgentTaskMemoryForLlm(input.task),
      plannerDecision: readSocialAgentConversationBrainDecision(input.task),
      toolResults: [
        {
          tool: 'search_real_candidates',
          success: true,
          candidateCount: input.candidates.length,
          emptyReason: input.searchResult.emptyReason,
          message: input.searchResult.message,
          debugReasons: input.searchResult.debugReasons,
        },
      ],
      searchResults: {
        socialRequestDraft: this.safeDraftForEvent(input.draft),
        candidates: input.candidates.map((candidate) => ({
          userId: candidate.userId,
          candidateUserId: candidate.candidateUserId ?? candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
          commonTags: candidate.commonTags,
          risk: candidate.risk,
          source: candidate.source,
        })),
        emptyReason: input.searchResult.emptyReason,
      },
      safetyRules: socialAgentFinalResponseSafetyRules(),
      responseGoal:
        input.candidates.length > 0
          ? '自然说明搜索结果，突出最相关候选人，并提醒下一步动作需要用户确认。'
          : '自然说明当前没有找到真实候选人，并给出放宽条件、补充信息或发布需求的下一步。',
      fallbackReply: input.fallbackReply,
    });
  }

  private async appendFollowUpContext(
    task: AgentTask,
    userMessage: string,
  ): Promise<SocialAgentFollowUpContext> {
    return this.followUpContext.appendFollowUpContext(task, userMessage);
  }

  private readLatestFollowUpContext(
    task: AgentTask,
    expectedMessage?: string,
  ): SocialAgentFollowUpContext | null {
    return this.followUpContext.readLatestFollowUpContext(
      task,
      expectedMessage,
    );
  }

  private async updateRunSnapshot(
    ownerUserId: number,
    taskId: number,
    runId: string,
    patch: Partial<SocialAgentAsyncRunSnapshot>,
  ): Promise<AgentTask> {
    return this.runState.updateRunSnapshot(
      ownerUserId,
      taskId,
      runId,
      patch,
      (id, label) => this.userVisibleStepLabel(id, label),
    );
  }

  private async markRunFailed(
    ownerUserId: number,
    taskId: number,
    runId: string,
    error: unknown,
    options: { message?: string; statusReason?: string } = {},
  ): Promise<void> {
    await this.runState.markRunFailed(
      ownerUserId,
      taskId,
      runId,
      error,
      (id, label) => this.userVisibleStepLabel(id, label),
      options,
    );
  }

  private readStoredRun(
    task: AgentTask,
    runId: string,
  ): SocialAgentAsyncRunSnapshot | null {
    return this.runState.readStoredRun(task, runId, (id, label) =>
      this.userVisibleStepLabel(id, label),
    );
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
    if (!task) return this.sessions().emptySession(restoredAt);

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
    const result = readSocialAgentRestorableResult({
      task,
      latestRun,
      events: eventDtos,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });

    return this.sessions().buildSessionSnapshot({
      task,
      events: eventDtos,
      result,
      latestRun,
      pendingApprovals,
      conversationHistory: readSocialAgentConversationHistory(task),
      restoredAt,
    });
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
    const result = readSocialAgentRestorableResult({
      task,
      latestRun,
      events: eventDtos,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });

    return buildSocialAgentTimelineSnapshot({
      task,
      taskSummary: this.sessions().toSessionTaskSummary(task),
      sessionMessages: this.sessions().buildSessionMessages({
        task,
        result,
        pendingApprovals,
        conversationHistory: readSocialAgentConversationHistory(task),
      }),
      memory: sanitizeForDisplay(task.memory) as Record<string, unknown>,
      result,
      events: eventDtos,
      latestRun,
      pendingApprovals,
      candidateActions: this.readCandidateActions(task),
      restoredAt,
    });
  }

  private readCandidateActions(
    task: AgentTask,
  ): Record<string, Record<string, unknown>> {
    return this.sessions().readCandidateActions(task);
  }

  private rememberCandidateAction(
    task: AgentTask,
    targetUserId: number,
    patch: Record<string, unknown>,
  ): void {
    this.sessions().rememberCandidateAction(task, targetUserId, patch);
  }

  private readLatestStoredRun(
    task: AgentTask,
  ): SocialAgentAsyncRunSnapshot | null {
    return this.runState.readLatestStoredRun(task, (id, label) =>
      this.userVisibleStepLabel(id, label),
    );
  }

  private toPendingApprovalSnapshot(
    approval: AgentApprovalRequest,
  ): SocialAgentPendingApprovalSnapshot {
    return this.sessions().toPendingApprovalSnapshot(approval);
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
        candidateExplanation: candidate.candidateExplanation ?? null,
        emotionalInsight: candidate.emotionalInsight ?? null,
        status: candidate.status ?? null,
      })),
    });
    recordSocialAgentSearchMemory(task, {
      intent: 'social_search',
      candidates: candidates.map((candidate) => ({
        targetUserId: candidate.targetUserId,
        candidateUserId: candidate.candidateUserId ?? candidate.userId,
        nickname: candidate.nickname,
        score: candidate.score,
        reasons: candidate.reasons,
        status: candidate.status ?? null,
      })),
      candidateCount: candidates.length,
    });
    transitionSocialAgentState(task, 'candidates_returned', {
      objective: 'search',
      nextStep:
        candidates.length > 0
          ? '等待用户选择候选人或确认下一步动作'
          : '等待用户放宽条件或补充偏好',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor:
        candidates.length > 0 ? 'candidate_selection' : 'search_refinement',
      lastCompletedStep: 'search_completed',
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
