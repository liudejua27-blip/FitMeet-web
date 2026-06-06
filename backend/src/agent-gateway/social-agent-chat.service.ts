import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { SocialProfileService } from '../users/social-profile.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import {
  SocialAgentIntentRouterService,
  type SocialAgentIntentEntities,
  type SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { SocialAgentBrainService } from './social-agent-brain.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolExecutorService,
} from './social-agent-tool-executor.service';
import {
  appendShortTermMemoryItem,
  appendSocialAgentUserMemo,
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
  rememberSocialAgentCurrentTask,
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { AgentApprovalService } from './agent-approval.service';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import {
  hasSocialAgentSearchContext,
  socialAgentCandidateFollowupReply,
} from './social-agent-candidate-context.presenter';
import {
  appendSocialAgentConversationTurn,
  readSocialAgentConversationHistory,
} from './social-agent-chat-memory.presenter';
import { rememberSocialAgentConversationBrainDecision } from './social-agent-chat-brain-memory.presenter';
import { createSocialAgentRunId } from './social-agent-chat-run.presenter';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { LifeGraphService } from '../life-graph/life-graph.service';
import { FitMeetAgentRunStatus } from './entities/fitmeet-agent-runtime.entity';
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import { TonePolicyService } from './response-quality/tone-policy.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import type {
  CandidateTargetBody,
  SocialAgentActivityResult,
  SocialAgentAppendContextResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentCardActionBody,
  SocialAgentChatReplanRunBody,
  SocialAgentChatRunBody,
  SocialAgentChatRunResult,
  SocialAgentCurrentTaskSnapshot,
  SocialAgentFollowUpContext,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentRouteMessageBody,
  SocialAgentSessionSnapshot,
  SocialAgentTaskTimelineSnapshot,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { messageForSocialAgentSchemaAction } from './social-agent-card-action.presenter';
import { SocialAgentSessionRestoreService } from './social-agent-session-restore.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentRunRecommendationService } from './social-agent-run-recommendation.service';
import { SocialAgentReplanRunService } from './social-agent-replan-run.service';
import {
  applySocialAgentTaskMemoryForIntent,
  profileKeyForSocialAgentIntent,
} from './social-agent-intent-memory.presenter';
import {
  shouldUseSocialAgentLlmDirectReply,
  socialAgentAssistantMessageForRoute,
  socialAgentRouteAction,
} from './social-agent-route-response.presenter';
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
    private readonly intentRouter: SocialAgentIntentRouterService,
    private readonly executor: SocialAgentToolExecutorService,
    private readonly socialProfiles: SocialProfileService,
    private readonly approvals: AgentApprovalService,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    private readonly metrics: SocialAgentMetricsService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly runState: SocialAgentRunStateService,
    private readonly followUpContext: SocialAgentFollowUpContextService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly meetLoop: SocialAgentMeetLoopService,
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly draftPublication: SocialAgentDraftPublicationService,
    private readonly activitySearch: SocialAgentActivitySearchService,
    private readonly sessionRestore: SocialAgentSessionRestoreService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
    private readonly runRecommendations: SocialAgentRunRecommendationService,
    private readonly replanRuns: SocialAgentReplanRunService,
    @Optional() private readonly brain?: SocialAgentBrainService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
    @Optional()
    private readonly fitMeetRuntime?: FitMeetAgentRuntimeService,
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
    let task = await this.taskLifecycle.ensureConversationTask(
      ownerUserId,
      taskId,
      message,
    );
    await this.messageLog.recordUserMessage(task, message);

    const mainAgentTurn = await this.mainAgentTurn.handleRouteTurn({
      ownerUserId,
      task,
      message,
      hasCandidates: body.hasCandidates === true,
      startedAt,
    });
    task = mainAgentTurn.task;
    if (mainAgentTurn.result) return mainAgentTurn.result;

    const [profile, freshTask, longTermSnapshot] = await Promise.all([
      this.readProfileSummary(ownerUserId),
      this.taskLifecycle.assertTaskOwner(task.id, ownerUserId),
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
    let memoryContext = this.routeContext.buildMemoryContext(
      task,
      longTermSnapshot,
    );
    let route = await this.intentRouter.route({
      message,
      taskContext: this.routeContext.buildTaskContext({
        task,
        body,
        longTermSnapshot,
        memoryContext,
      }),
      profile: profile ?? {},
      conversationHistory: readSocialAgentConversationHistory(task),
    });
    const brainDecision = await this.brain?.planTurn({
      message,
      route,
      profile: profile ?? {},
      taskContext: this.routeContext.buildTaskContext({
        task,
        body,
        longTermSnapshot,
        memoryContext,
      }),
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
    memoryContext = this.routeContext.buildMemoryContext(
      task,
      longTermSnapshot,
    );
    await this.messageLog.recordIntentRoute(task, route).catch((error) => {
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
    await this.routeContext.applyRagContext({
      task,
      route,
      message,
      longTermSnapshot,
    });
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
    let assistantMessage = socialAgentAssistantMessageForRoute({
      route,
      task,
      message,
    });
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
      await this.messageLog.recordAssistantMessage(
        task,
        assistantMessage,
        result,
      );
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
          this.routeContext.buildMemoryContext(currentTask, null),
      });
      assistantMessage = handled.assistantMessage;
      savedContext = handled.savedContext;
      profileUpdated = handled.profileUpdated;
      profileUpdateProposal = handled.profileUpdateProposal ?? null;
      task = handled.task;
    } else if (shouldUseSocialAgentLlmDirectReply(route)) {
      assistantMessage = await this.chatLlm.generateConversationalAnswer({
        message,
        route,
        profile,
        task,
        longTermSnapshot,
        memoryContext: this.routeContext.buildMemoryContext(
          task,
          longTermSnapshot,
        ),
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
        task = await this.taskLifecycle.assertTaskOwner(task.id, ownerUserId);
      }
    }

    if (route.intent === 'activity_search') {
      const handledActivitySearch =
        await this.activitySearch.handleActivitySearch({
          ownerUserId,
          task,
          route,
          message,
          buildMemoryContext: (currentTask) =>
            this.routeContext.buildMemoryContext(currentTask, null),
        });
      activityResults = handledActivitySearch.activityResults;
      assistantMessage = handledActivitySearch.assistantMessage;
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
      } else if (route.shouldReplan && hasSocialAgentSearchContext(task)) {
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
        if (hasSocialAgentSearchContext(task)) {
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
        assistantMessage = socialAgentCandidateFollowupReply(task, message);
      }
    }

    if (queuedRun) {
      task = await this.taskLifecycle.assertTaskOwner(task.id, ownerUserId);
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
      action: socialAgentRouteAction(route, queuedRun, runMode),
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
    await this.messageLog.recordAssistantMessage(
      task,
      assistantMessage,
      result,
    );
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
    const task = await this.taskLifecycle.createOrReuseTask({
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
    let task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
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

    void this.replanRuns
      .execute({
        ownerUserId,
        taskId,
        body: {
          ...body,
          userMessage: followUp.userMessage,
        },
        runId,
        visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
      })
      .catch((error) => {
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
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
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
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
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
    const task =
      await this.sessionRestore.findLatestRestorableTask(ownerUserId);
    return this.sessionRestore.buildSessionSnapshot({
      ownerUserId,
      task,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  async getTaskSession(
    ownerUserId: number,
    taskId: number,
  ): Promise<SocialAgentSessionSnapshot> {
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    return this.sessionRestore.buildSessionSnapshot({
      ownerUserId,
      task,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
  }

  async getCurrentTask(
    ownerUserId: number,
  ): Promise<SocialAgentCurrentTaskSnapshot | null> {
    const task =
      await this.sessionRestore.findLatestRestorableTask(ownerUserId);
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
    const task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
    return this.sessionRestore.buildTaskTimeline({
      ownerUserId,
      task,
      visibleStepLabel: (id, label) => this.userVisibleStepLabel(id, label),
    });
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

  private emptyIntentEntities(): SocialAgentIntentEntities {
    return {
      city: '',
      activityType: '',
      targetGender: '',
      timePreference: '',
      locationPreference: '',
    };
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

  private normalizePermissionMode(
    mode: AgentTaskPermissionMode | undefined,
  ): AgentTaskPermissionMode {
    return mode && Object.values(AgentTaskPermissionMode).includes(mode)
      ? mode
      : AgentTaskPermissionMode.Confirm;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
