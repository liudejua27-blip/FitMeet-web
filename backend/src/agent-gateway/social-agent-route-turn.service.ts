import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { sanitizeCity } from '../common/city.util';
import { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import { SocialProfileService } from '../users/social-profile.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskStatus,
} from './entities/agent-task.entity';
import { SocialAgentBrainService } from './social-agent-brain.service';
import { rememberSocialAgentConversationBrainDecision } from './social-agent-chat-brain-memory.presenter';
import {
  appendSocialAgentConversationTurn,
  readSocialAgentConversationHistory,
} from './social-agent-chat-memory.presenter';
import type {
  SocialAgentActivityResult,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import {
  hasSocialAgentSearchContext,
  socialAgentCandidateFollowupReply,
} from './social-agent-candidate-context.presenter';
import {
  appendSocialAgentUserMemo,
  recordSocialAgentPendingAction,
  rememberSocialAgentCurrentTask,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import {
  SocialAgentIntentRouterService,
  type SocialAgentIntentType,
} from './social-agent-intent-router.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import {
  shouldUseSocialAgentLlmDirectReply,
  socialAgentAssistantMessageForRoute,
  socialAgentRouteAction,
} from './social-agent-route-response.presenter';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { LifeGraphService } from '../life-graph/life-graph.service';
import {
  applySocialAgentTaskMemoryForIntent,
  profileKeyForSocialAgentIntent,
} from './social-agent-intent-memory.presenter';

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

@Injectable()
export class SocialAgentRouteTurnService {
  private readonly logger = new Logger(SocialAgentRouteTurnService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly intentRouter: SocialAgentIntentRouterService,
    private readonly socialProfiles: SocialProfileService,
    private readonly metrics: SocialAgentMetricsService,
    private readonly longTermMemory: SocialAgentLongTermMemoryService,
    private readonly chatLlm: SocialAgentChatLlmService,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly activitySearch: SocialAgentActivitySearchService,
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
    @Optional() private readonly brain?: SocialAgentBrainService,
    @Optional()
    private readonly lifeGraph?: LifeGraphService,
  ) {}

  async handleMessage(input: {
    ownerUserId: number;
    body: SocialAgentRouteMessageBody;
    replanAndRefresh: ReplanAndRefresh;
    queueInitialSearchForTask: QueueInitialSearchForTask;
  }): Promise<SocialAgentIntentRouteResult> {
    const { ownerUserId, body } = input;
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
        queuedRun = await input.replanAndRefresh(ownerUserId, task.id, {
          userMessage: message,
          reason: 'user_follow_up',
        });
        runMode = 'follow_up';
      } else {
        queuedRun = await input.queueInitialSearchForTask(
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
          queuedRun = await input.replanAndRefresh(ownerUserId, task.id, {
            userMessage: message,
            reason: 'user_follow_up',
          });
          runMode = 'follow_up';
        } else {
          queuedRun = await input.queueInitialSearchForTask(
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
          event: 'social_agent.route_turn.event_write_failed',
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

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
