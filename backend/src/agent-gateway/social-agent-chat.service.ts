import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
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
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
  recordSocialAgentRecommendedCandidates,
  recordSocialAgentSearchMemory,
  recordSocialAgentShortTermAction,
  rememberSocialAgentCurrentTask,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { AgentApprovalService } from './agent-approval.service';
import { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import {
  productHelpFallbackReply,
  workflowHelpReply,
} from './social-agent-chat-replies';
import { buildSocialAgentRequestDraft } from './social-agent-chat-result.presenter';
import {
  appendSocialAgentConversationTurn,
  buildSocialAgentLlmConversationHistory,
  readSocialAgentConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentCurrentAgentState,
  rememberSocialAgentConversationBrainDecision,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';
import {
  buildSocialAgentTimelineSnapshot,
  readSocialAgentRestorableResult,
  readSocialAgentStoredCandidateSummaries,
} from './social-agent-chat-session.presenter';
import { createSocialAgentRunId } from './social-agent-chat-run.presenter';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import { SocialAgentRecommendationResultService } from './social-agent-recommendation-result.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentRagService } from './social-agent-rag.service';
import {
  SocialAgentMemoryContext,
  SocialAgentMemoryContextService,
} from './social-agent-memory-context.service';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { LifeGraphService } from '../life-graph/life-graph.service';
import {
  FitMeetAgentRunStatus,
  FitMeetAgentStepStatus,
  FitMeetAgentToolStatus,
} from './entities/fitmeet-agent-runtime.entity';
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import { TonePolicyService } from './response-quality/tone-policy.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import type {
  CandidateTargetBody,
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
import { messageForSocialAgentSchemaAction } from './social-agent-card-action.presenter';
import {
  applySocialAgentTaskMemoryForIntent,
  profileKeyForSocialAgentIntent,
} from './social-agent-intent-memory.presenter';
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
    private readonly replanProgress: SocialAgentReplanProgressService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly meetLoop: SocialAgentMeetLoopService,
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly draftPublication: SocialAgentDraftPublicationService,
    private readonly draftSearch: SocialAgentDraftSearchService,
    private readonly recommendationResults: SocialAgentRecommendationResultService,
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
    private readonly sessionAssembler?: AgentSessionAssemblerService,
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
        this.profileEnrichment.recordProfileMisunderstanding(
          task,
          brainDecision.reason || 'user_correction',
        );
      }
    }
    this.profileEnrichment.rememberCurrentTaskFromBrain(task, route);
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
    applySocialAgentTaskMemoryForIntent(task, message, route);
    await this.applyRagContext(task, route, message, longTermSnapshot);
    const brainToolResults =
      await this.profileEnrichment.executeConversationBrainReadTools(
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
      await this.candidateActions.confirmPendingCandidateMessageIfRequested(
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
      const handled = await this.profileEnrichment.handleTurn({
        ownerUserId,
        task,
        message,
        intent: route.intent,
        buildMemoryContext: (currentTask) =>
          this.buildMemoryContext(currentTask, null),
      });
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
          assistantMessage =
            this.profileEnrichment.lifeGraphProposalReply(proposal);
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
      const lifeGraphClarification =
        await this.profileEnrichment.lifeGraphSearchClarification(
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
      pendingApproval = await this.candidateActions.createActionApproval({
        ownerUserId,
        task,
        message,
        route,
      });
      if (pendingApproval) {
        const draft = this.candidateActions.candidateMessageDraft(task);
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
      return this.candidateActions.createOpenerDraftFromCardAction(
        ownerUserId,
        taskId,
        body,
      );
    }

    if (action === 'activity.confirm_create') {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, body);
    }

    if (action === 'activity.check_in') {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, body);
    }

    if (action === 'activity.complete') {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, body);
    }

    if (action === 'review.submit') {
      return this.meetLoop.performActivityAction(ownerUserId, taskId, body);
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
    const queuedRun = await this.runState.queueChatRun({
      task,
      runId,
      goal,
    });

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
    const queuedRun = await this.runState.queueReplanRun({
      task,
      runId,
      followUp,
    });

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

    let visibleSteps: SocialAgentVisibleStep[] = [];
    const done = async (
      id: string,
      label: string,
      eventType: AgentTaskEventType,
      payload: Record<string, unknown> = {},
    ) => {
      const progress = await this.replanProgress.completeStep({
        task,
        ownerUserId,
        taskId,
        runId,
        visibleSteps,
        id,
        label,
        eventType,
        payload,
      });
      task = progress.task;
      visibleSteps = progress.visibleSteps;
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
    return this.draftPublication.publishDraft(ownerUserId, taskId, draft);
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
    return this.candidateActions.saveCandidate(ownerUserId, taskId, body);
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
    return this.candidateActions.sendCandidateMessage(
      ownerUserId,
      taskId,
      body,
    );
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
    return this.candidateActions.connectCandidate(ownerUserId, taskId, body);
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
    const key = profileKeyForSocialAgentIntent(intent, message);
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
    return this.draftSearch.generateDraftWithTool(task, goal);
  }

  private async createPrivateDraftRequest(
    task: AgentTask,
    draft: SocialAgentRequestDraft,
  ): Promise<number> {
    return this.draftSearch.createPrivateDraftRequest(task, draft);
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
    return this.draftSearch.searchCandidates(task, draft);
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
    return this.recommendationResults.completeRecommendationResult({
      ownerUserId,
      task,
      visibleSteps,
      draft,
      candidates,
      searchResult,
      statusReason,
      emit,
      alphaTurn,
      buildMemoryContext: (currentTask) =>
        this.buildMemoryContext(currentTask, null),
      toEventDto: (event) => this.toEventDto(event),
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
