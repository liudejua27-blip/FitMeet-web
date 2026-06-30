import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { cleanDisplayText } from '../common/display-text.util';
import { AgentTask } from './entities/agent-task.entity';
import {
  hasSocialAgentSearchResultContext,
  socialAgentCandidateFollowupReply,
} from './social-agent-candidate-context.presenter';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import type {
  SocialAgentActivityResult,
  SocialAgentAssistantMessageSource,
  SocialAgentAsyncRunSnapshot,
  SocialAgentChatReplanRunBody,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import {
  evaluateSocialOpportunityClarification,
  resolveSocialOpportunitySearchGoal,
} from './social-agent-opportunity-clarification';
import { readSocialAgentTaskMemory } from './social-agent-memory.util';
import { SocialAgentProfileGateService } from './social-agent-profile-gate.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import {
  buildSocialAgentOpportunityDraftFromTask,
  buildSocialAgentPublishConfirmationCard,
  shouldCreateOpportunityCardBeforeCandidates,
} from './social-agent-opportunity-card-draft';
import { rememberSocialAgentOpportunityDraft } from './social-agent-opportunity-draft-memory';

/**
 * @deprecated Legacy fallback search flow only.
 *
 * New Workout/Friend/Travel loop flows must route through
 * AgentEntryOrchestratorService and their loop services. Do not add new
 * loop-mainline behavior or profile-blocking gates here.
 */
type QueueInitialSearchForTask = (
  ownerUserId: number,
  task: AgentTask,
  goal: string,
  options?: { signal?: AbortSignal | null; waitForCompletionMs?: number },
) => Promise<SocialAgentAsyncRunSnapshot>;

type ReplanAndRefresh = (
  ownerUserId: number,
  taskId: number,
  body: SocialAgentChatReplanRunBody,
  options?: { signal?: AbortSignal | null },
) => Promise<SocialAgentAsyncRunSnapshot>;

type HandleRouteSearchTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
  taskContext?: Record<string, unknown>;
  signal?: AbortSignal | null;
  replanAndRefresh: ReplanAndRefresh;
  queueInitialSearchForTask: QueueInitialSearchForTask;
  buildMemoryContext: (task: AgentTask) => unknown;
};

type HandleRouteSearchTurnResult = {
  handled: boolean;
  assistantMessage?: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  savedContext: boolean;
  activityResults: SocialAgentActivityResult[];
  cards: FitMeetAlphaCard[];
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
};

@Injectable()
export class SocialAgentRouteSearchTurnService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly profileEnrichment: SocialAgentProfileEnrichmentService,
    private readonly activitySearch: SocialAgentActivitySearchService,
    private readonly profileGate: SocialAgentProfileGateService,
  ) {}

  async handle(
    input: HandleRouteSearchTurnInput,
  ): Promise<HandleRouteSearchTurnResult> {
    this.assertNotAborted(input.signal);
    if (input.route.intent === 'activity_search') {
      const clarification = evaluateSocialOpportunityClarification({
        task: input.task,
        route: input.route,
        message: input.message,
        taskContext: input.taskContext,
      });
      if (!clarification.complete) {
        return {
          ...this.emptyResult(true),
          assistantMessage: clarification.assistantMessage,
          assistantMessageSource: 'deterministic_route',
          savedContext: true,
        };
      }
      this.assertNotAborted(input.signal);
      const gate = await this.profileGate.evaluateForSocialExecution({
        ownerUserId: input.ownerUserId,
        task: input.task,
        route: input.route,
        message: clarification.searchGoal,
      });
      if (!gate.passed) {
        return {
          ...this.emptyResult(true),
          assistantMessage: gate.assistantMessage,
          assistantMessageSource: 'deterministic_route',
          savedContext: true,
        };
      }
      const emptySearchReply = this.emptySearchFollowupReply(input);
      if (emptySearchReply) {
        return {
          ...this.emptyResult(true),
          assistantMessage: emptySearchReply,
          assistantMessageSource: 'deterministic_route',
          savedContext: true,
        };
      }
      this.assertNotAborted(input.signal);
      const handled = await this.activitySearch.handleActivitySearch({
        ownerUserId: input.ownerUserId,
        task: input.task,
        route: input.route,
        message: clarification.searchGoal,
        buildMemoryContext: input.buildMemoryContext,
        taskContext: input.taskContext,
      });
      this.assertNotAborted(input.signal);
      return {
        handled: true,
        assistantMessage: handled.assistantMessage,
        assistantMessageSource: handled.assistantMessageSource,
        savedContext: false,
        activityResults: handled.activityResults,
        cards: [],
        queuedRun: null,
        runMode: null,
      };
    }

    if (input.route.intent === 'social_search') {
      return this.handleSocialSearch(input);
    }

    if (input.route.intent === 'candidate_followup') {
      return this.handleCandidateFollowup(input);
    }

    return this.emptyResult(false);
  }

  private async handleSocialSearch(
    input: HandleRouteSearchTurnInput,
  ): Promise<HandleRouteSearchTurnResult> {
    this.assertNotAborted(input.signal);
    const clarification = evaluateSocialOpportunityClarification({
      task: input.task,
      route: input.route,
      message: input.message,
      taskContext: input.taskContext,
    });
    if (!clarification.complete) {
      return {
        ...this.emptyResult(true),
        assistantMessage: clarification.assistantMessage,
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
      };
    }
    if (
      shouldCreateOpportunityCardBeforeCandidates(clarification.searchGoal) &&
      !this.hasPublishedOpportunityContext(input.task)
    ) {
      const draft = buildSocialAgentOpportunityDraftFromTask(
        input.task,
        clarification.searchGoal,
      );
      if (!draft.ready) {
        return {
          ...this.emptyResult(true),
          assistantMessage: draft.assistantMessage,
          assistantMessageSource: 'deterministic_route',
          savedContext: true,
        };
      }
      rememberSocialAgentOpportunityDraft(input.task, draft.draft);
      await this.taskRepo.save(input.task);
      return {
        ...this.emptyResult(true),
        assistantMessage:
          '我先帮你整理成一张约练卡片，你确认后再发布。发布前不会公开，也不会直接推荐候选。',
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
        cards: [
          buildSocialAgentPublishConfirmationCard({
            task: input.task,
            draft: draft.draft,
          }),
        ],
      };
    }
    this.assertNotAborted(input.signal);
    const gate = await this.profileGate.evaluateForSocialExecution({
      ownerUserId: input.ownerUserId,
      task: input.task,
      route: input.route,
      message: clarification.searchGoal,
    });
    if (!gate.passed) {
      return {
        ...this.emptyResult(true),
        assistantMessage: gate.assistantMessage,
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
      };
    }
    this.assertNotAborted(input.signal);
    const lifeGraphClarification =
      await this.profileEnrichment.lifeGraphSearchClarification(
        input.ownerUserId,
        clarification.searchGoal,
      );
    this.assertNotAborted(input.signal);
    if (lifeGraphClarification) {
      if (
        this.shouldUseLifeGraphSearchClarification(
          clarification.searchGoal,
          lifeGraphClarification,
        )
      ) {
        return {
          ...this.emptyResult(true),
          assistantMessage: lifeGraphClarification,
          assistantMessageSource: 'deterministic_route',
          savedContext: true,
        };
      }
    }
    return this.queueSearch(input, clarification.searchGoal);
  }

  private hasPublishedOpportunityContext(task: AgentTask): boolean {
    const memory = this.recordValue(task.memory);
    const shortTerm = this.recordValue(memory?.shortTerm);
    const result = this.recordValue(task.result);
    const publishResult = this.recordValue(result?.publishSocialRequest);
    const taskMemory = readSocialAgentTaskMemory(task);
    const publishedStatus =
      cleanDisplayText(shortTerm?.publishStatus, '') === 'published' ||
      cleanDisplayText(publishResult?.status, '') === 'published';
    const hasPublishedId = Boolean(
      cleanDisplayText(shortTerm?.publicIntentId, '') ||
      cleanDisplayText(publishResult?.publicIntentId, ''),
    );
    const hasPublishedTaskState =
      taskMemory.currentTask.lastCompletedStep === 'published_to_discover' ||
      taskMemory.currentTask.waitingFor === 'post_publish_candidate_search';
    return (publishedStatus && hasPublishedId) || hasPublishedTaskState;
  }

  private emptySearchFollowupReply(
    input: HandleRouteSearchTurnInput,
  ): string | null {
    const lastSearch = this.readLastSearch(input);
    if (!lastSearch) return null;
    if (this.lastSearchCandidateCount(lastSearch) !== 0) return null;
    if (cleanDisplayText(lastSearch.emptyReason, '') !== 'no_real_candidates') {
      return null;
    }
    if (this.hasEmptySearchRecoveryIntent(input.message)) return null;
    const nextStep =
      cleanDisplayText(lastSearch.nextStep, '') ||
      '放宽条件、换时间范围，或确认发布约练卡到发现';
    const target =
      cleanDisplayText(lastSearch.intent, '') === 'activity_search'
        ? '活动或公开约练卡片'
        : '人';
    return `上一轮我已经按当前条件查过，没有找到真实、公开可发现且符合安全边界的${target}。为了避免重复空搜，建议下一步先${nextStep}。你可以直接说“扩大到 10 公里”“放宽舞蹈相关偏好”“改到周末下午”，或“发布到发现”。`;
  }

  private readLastSearch(
    input: HandleRouteSearchTurnInput,
  ): Record<string, unknown> | null {
    const fromContext = this.recordValue(input.taskContext?.lastSearch);
    if (fromContext) return fromContext;
    const taskMemory = this.recordValue(input.taskContext?.taskMemory);
    const fromTaskContext = this.recordValue(taskMemory?.lastSearch);
    if (fromTaskContext) return fromTaskContext;
    const root = this.recordValue(input.task.memory);
    const shortTerm = this.recordValue(root?.shortTerm);
    if (!shortTerm || shortTerm.hasSearched !== true) return null;
    return {
      intent: cleanDisplayText(shortTerm.lastSearchIntent, ''),
      candidateCount:
        typeof shortTerm.lastSearchCandidateCount === 'number'
          ? shortTerm.lastSearchCandidateCount
          : 0,
      emptyReason: cleanDisplayText(shortTerm.lastSearchEmptyReason, ''),
      nextStep: cleanDisplayText(shortTerm.lastSearchNextStep, ''),
    };
  }

  private lastSearchCandidateCount(
    lastSearch: Record<string, unknown>,
  ): number {
    const value = Number(lastSearch.candidateCount);
    return Number.isFinite(value) ? value : 0;
  }

  private hasEmptySearchRecoveryIntent(message: string): boolean {
    const text = cleanDisplayText(message, '');
    return /(放宽|扩大|范围|半径|更远|不限|都可以|降低要求|换时间|改时间|改到|换地点|换区域|换城市|换活动|换成|改成|发布|发现|公开)/.test(
      text,
    );
  }

  private shouldUseLifeGraphSearchClarification(
    searchGoal: string,
    clarification: string,
  ): boolean {
    const goal = cleanDisplayText(searchGoal, '');
    const copy = cleanDisplayText(clarification, '');
    if (!copy) return false;
    if (this.asksKnownTime(copy, goal)) return false;
    if (this.asksKnownCityOrArea(copy, goal)) return false;
    if (this.asksKnownActivity(copy, goal)) return false;
    return true;
  }

  private asksKnownTime(copy: string, goal: string): boolean {
    return (
      /(方便的时间|可约时间|时间|什么时候|今晚|今天晚上|周末|下午|晚上)/.test(
        copy,
      ) &&
      /(今晚|今天晚上|今天(?:上午|中午|下午|晚上)?|明天(?:上午|下午|晚上)?|周末(?:上午|中午|下午|晚上)?|周[一二三四五六日天](?:上午|下午|晚上)?|工作日晚上|上午|中午|下午|晚上)/.test(
        goal,
      )
    );
  }

  private asksKnownCityOrArea(copy: string, goal: string): boolean {
    return (
      /(城市|大致区域|常活动区域|区域|在哪里|在哪个城市|哪个区|哪一带|哪里跑|活动地点|大概位置|常去哪里)/.test(
        copy,
      ) &&
      /(青岛|北京|上海|深圳|广州|杭州|南京|成都|武汉|西安|重庆|苏州|厦门|天津|长沙|郑州|济南|宁波|崂山区|市南区|市北区|李沧区|黄岛区|青岛大学|五四广场|奥帆中心|大学城|附近)/.test(
        goal,
      )
    );
  }

  private asksKnownActivity(copy: string, goal: string): boolean {
    return (
      /(活动|运动|约练类型|场景|做什么)/.test(copy) &&
      /(羽毛球|篮球|跑步|慢跑|散步|爬山|徒步|骑行|健身|瑜伽|游泳|咖啡|聊天|city\s*walk|citywalk|约练|认识新朋友)/i.test(
        goal,
      )
    );
  }

  private async handleCandidateFollowup(
    input: HandleRouteSearchTurnInput,
  ): Promise<HandleRouteSearchTurnResult> {
    this.assertNotAborted(input.signal);
    if (input.route.shouldSearch || input.route.shouldReplan) {
      return this.queueSearch(input, this.resolveCandidateFollowupGoal(input));
    }
    return {
      ...this.emptyResult(true),
      assistantMessage: socialAgentCandidateFollowupReply(
        input.task,
        input.message,
      ),
    };
  }

  private resolveCandidateFollowupGoal(
    input: HandleRouteSearchTurnInput,
  ): string {
    return resolveSocialOpportunitySearchGoal({
      task: input.task,
      route: input.route,
      message: input.message,
      taskContext: input.taskContext,
    });
  }

  private async queueSearch(
    input: HandleRouteSearchTurnInput,
    searchGoal = input.message,
  ): Promise<HandleRouteSearchTurnResult> {
    this.assertNotAborted(input.signal);
    const emptySearchReply = this.emptySearchFollowupReply(input);
    if (emptySearchReply) {
      return {
        ...this.emptyResult(true),
        assistantMessage: emptySearchReply,
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
      };
    }
    if (
      input.route.intent === 'candidate_followup' &&
      !input.route.shouldSearch &&
      !input.route.shouldReplan
    ) {
      return this.emptyResult(true);
    }
    if (
      (input.route.intent === 'social_search' && input.route.shouldReplan) ||
      input.route.intent === 'candidate_followup'
    ) {
      if (hasSocialAgentSearchResultContext(input.task)) {
        const queuedRun = await input.replanAndRefresh(
          input.ownerUserId,
          input.task.id,
          {
            userMessage: searchGoal,
            reason: 'user_follow_up',
          },
          { signal: input.signal ?? null },
        );
        return {
          ...this.emptyResult(true),
          queuedRun,
          runMode: 'follow_up',
        };
      }
    }
    const queuedRun = await input.queueInitialSearchForTask(
      input.ownerUserId,
      input.task,
      searchGoal,
      {
        signal: input.signal ?? null,
        waitForCompletionMs: this.shouldWaitForInitialSearch(input)
          ? 45_000
          : 0,
      },
    );
    const completedResult = this.completedQueuedRunResult(queuedRun);
    const assistantMessage = cleanDisplayText(
      completedResult?.assistantMessage,
      '',
    );
    return {
      ...this.emptyResult(true),
      assistantMessage: assistantMessage || undefined,
      assistantMessageSource: assistantMessage
        ? this.assistantSourceFromQueuedRunResult(completedResult)
        : undefined,
      cards: this.cardsFromQueuedRun(queuedRun),
      queuedRun,
      runMode: 'initial',
    };
  }

  private shouldWaitForInitialSearch(
    input: HandleRouteSearchTurnInput,
  ): boolean {
    return (
      input.route.intent === 'social_search' &&
      input.route.shouldSearch === true &&
      !input.route.shouldReplan
    );
  }

  private completedQueuedRunResult(
    queuedRun: SocialAgentAsyncRunSnapshot,
  ): Record<string, unknown> | null {
    if (queuedRun.status !== 'completed') return null;
    return this.recordValue(queuedRun.result);
  }

  private cardsFromQueuedRun(
    queuedRun: SocialAgentAsyncRunSnapshot,
  ): FitMeetAlphaCard[] {
    const result = this.completedQueuedRunResult(queuedRun);
    const cards = Array.isArray(result?.cards) ? result.cards : [];
    return cards.filter(
      (card): card is FitMeetAlphaCard => this.recordValue(card) !== null,
    );
  }

  private assistantSourceFromQueuedRunResult(
    result: Record<string, unknown> | null,
  ): SocialAgentAssistantMessageSource {
    const source = cleanDisplayText(result?.assistantMessageSource, '');
    return source === 'llm' ||
      source === 'fallback' ||
      source === 'deterministic_action' ||
      source === 'deterministic_route'
      ? source
      : 'deterministic_route';
  }

  private emptyResult(handled: boolean): HandleRouteSearchTurnResult {
    return {
      handled,
      savedContext: false,
      activityResults: [],
      cards: [],
      queuedRun: null,
      runMode: null,
    };
  }

  private recordValue(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }
}
