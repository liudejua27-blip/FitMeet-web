import { Injectable, Optional } from '@nestjs/common';

import type { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from './fitmeet-alpha-agent.types';
import type {
  SocialAgentActivityResult,
  SocialAgentAssistantMessageSource,
  SocialAgentAsyncRunSnapshot,
  SocialAgentIntentRouteResult,
  SocialAgentPendingApprovalSnapshot,
  SocialAgentRuntimeResumeMetadata,
} from './social-agent-chat.types';
import type { AgentLoopRun, SubagentHandoffResult } from './agent-loop.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { socialAgentRouteAction } from './social-agent-route-response.presenter';
import { shouldStreamFallbackAssistantText } from './social-agent-chat-stream.presenter';
import { AgentSelfImproveService } from './agent-self-improve.service';
import { SocialAgentEventStore } from './social-agent-event-store.service';
import { SocialAgentEventV2Service } from './social-agent-event-v2.service';
import type {
  SocialAgentEventV2,
  SocialAgentEventV2DisplayState,
  SocialAgentEventV2Stage,
  SocialAgentEventV2Type,
} from './social-agent-event-v2.types';
import { summarizeSocialCodexRun } from './social-codex-run-summary';

type CompleteRouteTurnInput = {
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  assistantMessage: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  savedContext: boolean;
  profileUpdated: boolean;
  queuedRun: SocialAgentAsyncRunSnapshot | null;
  runMode: SocialAgentIntentRouteResult['runMode'];
  pendingApproval: SocialAgentPendingApprovalSnapshot | null;
  activityResults: SocialAgentActivityResult[];
  profileUpdateProposal: LifeGraphProposalDto | null;
  assistantStreamed?: boolean;
  agentLoop?: AgentLoopRun | null;
  subagentHandoffs?: SubagentHandoffResult[];
  runtime?: SocialAgentRuntimeResumeMetadata | null;
  startedAt: number;
  deferAssistantMessageLog?: boolean;
};

@Injectable()
export class SocialAgentRouteCompletionService {
  constructor(
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional() private readonly selfImprove?: AgentSelfImproveService,
    @Optional() private readonly eventV2?: SocialAgentEventV2Service,
    @Optional() private readonly eventStore?: SocialAgentEventStore,
  ) {}

  async complete(
    input: CompleteRouteTurnInput,
  ): Promise<SocialAgentIntentRouteResult> {
    const result: SocialAgentIntentRouteResult = {
      ...input.route,
      shouldReplan: input.queuedRun
        ? input.runMode === 'follow_up'
        : input.route.shouldReplan,
      action: socialAgentRouteAction(
        input.route,
        input.queuedRun,
        input.runMode,
      ),
      taskId: input.task.id,
      assistantMessage: input.assistantMessage,
      ...(input.assistantMessageSource
        ? { assistantMessageSource: input.assistantMessageSource }
        : {}),
      savedContext: input.savedContext,
      profileUpdated: input.profileUpdated,
      shouldQueueRun: Boolean(input.queuedRun),
      runMode: input.runMode,
      queuedRun: input.queuedRun,
      pendingApproval: input.pendingApproval,
      activityResults: input.activityResults,
      cards: this.cardsForActivityResults(input.task.id, input.activityResults),
      profileUpdateProposal: input.profileUpdateProposal,
      permissionMode: input.task.permissionMode,
      assistantStreamed: input.assistantStreamed ?? false,
      agentLoop: input.agentLoop ?? undefined,
      subagentHandoffs: input.subagentHandoffs ?? [],
      runtime: input.runtime ?? undefined,
    };

    if (input.queuedRun && input.runMode) {
      this.metrics.recordQueuedRun(input.runMode);
    }
    this.metrics.recordAction(result.action);
    if (!input.deferAssistantMessageLog) {
      await this.messageLog.recordAssistantMessage(
        input.task,
        input.assistantMessage,
        result,
      );
    }
    if (!input.deferAssistantMessageLog) {
      await this.recordNonStreamingRunTrace(input, result);
    }
    if (
      !input.deferAssistantMessageLog &&
      this.shouldRecordOnlineReplay(input.assistantMessage)
    ) {
      await this.selfImprove?.recordOnlineReplayFromRoute({
        ownerUserId: input.task.ownerUserId,
        taskId: input.task.id,
        userMessage: input.task.goal,
        assistantMessage: input.assistantMessage,
        route: input.route as unknown as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
      });
    }
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);
    return result;
  }

  private async recordNonStreamingRunTrace(
    input: CompleteRouteTurnInput,
    result: SocialAgentIntentRouteResult,
  ) {
    if (!this.eventStore) return;
    const eventV2 = this.eventV2 ?? new SocialAgentEventV2Service();
    const runId = [
      'social-codex',
      'route',
      input.task.ownerUserId,
      input.task.id,
      Date.now(),
      Math.random().toString(36).slice(2, 8),
    ].join(':');
    const events: SocialAgentEventV2[] = [];
    const append = async (
      type: SocialAgentEventV2Type,
      stage: SocialAgentEventV2Stage,
      title: string,
      state: SocialAgentEventV2DisplayState,
      payload?: Record<string, unknown>,
    ) => {
      let event = eventV2.envelope({
        type,
        userId: input.task.ownerUserId,
        taskId: input.task.id,
        threadId: `agent-task:${input.task.id}`,
        runId,
        stage,
        visibility: 'user_visible',
        display: { title, state },
        payload,
      });
      if (event.type === 'run.completed' || event.type === 'run.failed') {
        event = {
          ...event,
          payload: {
            ...(event.payload ?? {}),
            summary: summarizeSocialCodexRun([...events, event]),
          },
        };
      }
      await this.eventStore?.appendEvent(input.task, event);
      events.push(event);
      return event;
    };

    await append(
      'run.started',
      'detect_social_intent',
      '正在理解你的需求',
      'done',
      {
        source: 'non_streaming_route',
        intent: result.intent,
      },
    );
    await append(
      'visible_process.delta',
      'hydrate_context',
      '已读取当前对话和任务记忆',
      'done',
      {
        savedContext: result.savedContext,
        profileUpdated: result.profileUpdated,
      },
    );
    if (this.shouldRecordAssistantPreview(input.assistantMessage)) {
      await append(
        'assistant.delta',
        'detect_social_intent',
        '已生成回复',
        'done',
        {
          messagePreview: input.assistantMessage.slice(0, 240),
        },
      );
    }
    if (input.pendingApproval) {
      const pendingPayload = this.isRecord(input.pendingApproval.payload)
        ? input.pendingApproval.payload
        : {};
      const checkpointId = this.checkpointIdForPendingApproval(
        pendingPayload,
        input.runtime,
      );
      const resumeCursor = this.publicResumeCursor(
        input.runtime,
        checkpointId,
        input.task,
      );
      await append(
        'approval.required',
        'approval',
        '这一步需要你确认',
        'waiting',
        {
          ...pendingPayload,
          approvalId: input.pendingApproval.id,
          checkpointId,
          resumeCursor,
          actionType: input.pendingApproval.actionType,
          riskLevel: input.pendingApproval.riskLevel,
          resumePolicy: 'confirm_then_resume_same_run',
          sideEffectPolicy:
            input.runtime?.sideEffectPolicy ?? {
              sideEffectsBeforeResume: 'idempotent_only',
            },
        },
      );
    }
    const completedState: SocialAgentEventV2DisplayState = input.pendingApproval
      ? 'waiting'
      : 'done';
    const completedStage = this.completionStageFor(input);
    await append(
      'run.completed',
      completedStage,
      input.pendingApproval
        ? '发送邀请前需要你确认'
        : input.queuedRun
          ? '已接上候选搜索任务'
          : '这一步处理完成',
      completedState,
      {
        action: result.action,
        shouldQueueRun: result.shouldQueueRun,
        cardCount: result.cards?.length ?? 0,
        ...(input.pendingApproval
          ? {
              checkpointId: this.checkpointIdForPendingApproval(
                this.isRecord(input.pendingApproval.payload)
                  ? input.pendingApproval.payload
                  : {},
                input.runtime,
              ),
              resumeCursor: this.publicResumeCursor(
                input.runtime,
                this.checkpointIdForPendingApproval(
                  this.isRecord(input.pendingApproval.payload)
                    ? input.pendingApproval.payload
                    : {},
                  input.runtime,
                ),
                input.task,
              ),
              approvalId: input.pendingApproval.id,
              actionType: input.pendingApproval.actionType,
            }
          : {}),
      },
    );
    if (input.queuedRun) {
      const confirmedContext = this.confirmedTaskContext(input.task);
      await append(
        'candidate_search.started',
        'search_candidates',
        input.runMode === 'follow_up'
          ? '正在按最新偏好重新筛选候选人'
          : '正在筛选公开可发现的人',
        'running',
        {
          queuedRunId: input.queuedRun.runId,
          runMode: input.runMode,
          action: result.action,
          confirmedContext,
          instruction:
            confirmedContext.length > 0
              ? '基于已确认信息继续，不重复追问。'
              : '只会使用公开可发现资料和用户授权信息。',
        },
      );
    }
  }

  private completionStageFor(
    input: CompleteRouteTurnInput,
  ): SocialAgentEventV2Stage {
    if (input.pendingApproval) return 'approval';
    if (input.queuedRun) return 'search_candidates';
    if (input.profileUpdated || input.profileUpdateProposal) {
      return 'life_graph_writeback';
    }
    return 'detect_social_intent';
  }

  private shouldRecordAssistantPreview(message: string): boolean {
    return shouldStreamFallbackAssistantText(message);
  }

  private shouldRecordOnlineReplay(message: string): boolean {
    return shouldStreamFallbackAssistantText(message);
  }

  private cardsForActivityResults(
    taskId: number,
    activityResults: SocialAgentActivityResult[],
  ): FitMeetAlphaCard[] {
    if (activityResults.length === 0) return [];
    return activityResults
      .slice(0, 3)
      .map((activity) => this.activityOpportunityCard(taskId, activity));
  }

  private activityOpportunityCard(
    taskId: number,
    activity: SocialAgentActivityResult,
  ): FitMeetAlphaCard {
    const title = this.display(activity.title, '活动机会');
    const city = this.display(activity.city, '同城');
    const time = this.display(activity.timePreference, '时间待确认');
    const location = this.display(activity.loc, `${city}的公共场所`);
    const activityType =
      this.display(activity.requestType, '') ||
      this.display(activity.interestTags[0], '活动');
    const summary =
      this.display(activity.description, '') ||
      `${title} 是一个公开活动/约练机会，确认前不会向对方发送任何消息。`;
    const matchScore =
      typeof activity.matchScore === 'number'
        ? Math.round(activity.matchScore)
        : null;
    const safetyBoundary =
      '先查看公开详情，再由你确认是否联系或参加；不会共享精确位置。';
    const confirmedContext = this.confirmedContext([
      city,
      time,
      activityType,
      location,
      safetyBoundary,
    ]);
    const explanationSteps = this.activityExplanationSteps({
      source: activity.source,
      city,
      time,
      activityType,
      location,
      matchReasons: activity.matchReasons ?? [],
      safetyBoundary,
      isRealData: activity.isRealData ?? true,
    });
    return {
      id: `activity_opportunity:${taskId}:${activity.id}`,
      type: 'activity_plan',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title,
      body: summary,
      status: 'ready',
      data: {
        taskId,
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        opportunityCard: true,
        opportunity: {
          id: `opportunity:${taskId}:${activity.id}`,
          type: 'activity',
          title,
          subtitle: `${city} · ${time}`,
          summary,
          city,
          location,
          time,
          activityType,
          score: matchScore,
          matchScore,
          reasons: explanationSteps.slice(0, 4),
          explanationSteps,
          interests: activity.interestTags?.slice(0, 5) ?? [],
          safetyBadges: ['公开活动', '先看详情', '联系前确认'],
          recommendedNextAction: '先查看详情，确认后再联系或参加。',
          safetyBoundary,
          confirmedContext,
        },
        opportunityType: 'activity',
        opportunityTitle: title,
        opportunitySubtitle: `${city} · ${time}`,
        confirmedContext,
        activityId: activity.activityId ?? null,
        publicIntentId: activity.publicIntentId ?? null,
        source: activity.source,
        isRealData: activity.isRealData ?? true,
        city,
        locationName: location,
        activityType,
        time,
        interestTags: activity.interestTags ?? [],
        matchScore,
        fitReasons: explanationSteps.slice(0, 6),
        explanationSteps,
        safetyBoundary,
        loopStage: 'activity_draft_created',
      },
      actions: this.activityOpportunityActions(taskId, activity),
    };
  }

  private activityOpportunityActions(
    taskId: number,
    activity: SocialAgentActivityResult,
  ): FitMeetAlphaCardAction[] {
    return [
      {
        id: 'view_activity',
        label: '查看详情',
        action: 'activity.view_detail',
        schemaAction: 'activity.view_detail',
        loopStage: 'activity_draft_created',
        requiresConfirmation: false,
        payload: {
          taskId,
          activityId: activity.activityId ?? null,
          publicIntentId: activity.publicIntentId ?? null,
          activity,
        },
      },
      {
        id: 'confirm_create_activity',
        label: '发起约练',
        action: 'activity.confirm_create',
        schemaAction: 'activity.confirm_create',
        loopStage: 'activity_draft_created',
        requiresConfirmation: true,
        payload: {
          taskId,
          activity,
          sourceActivityId: activity.activityId ?? null,
          publicIntentId: activity.publicIntentId ?? null,
          approvalRequired: true,
          checkpointRequired: true,
          resumeMode: 'resume_after_approval',
          riskLevel: 'medium',
          riskReasons: [
            '这一步会发起真实约练或联系活动发起人',
            '确认前不会创建、公开发布或通知其他用户',
          ],
        },
      },
    ];
  }

  private confirmedContext(values: unknown[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
      const text = this.display(value, '');
      if (!text || this.isPlaceholderContext(text)) continue;
      const compact = text.length <= 18 ? text : `${text.slice(0, 17)}…`;
      const key = compact.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(compact);
    }
    return output.slice(0, 5);
  }

  private confirmedTaskContext(task: AgentTask): string[] {
    const memory = this.isRecord(task.memory) ? task.memory : {};
    const taskSlots = this.isRecord(memory.taskSlots) ? memory.taskSlots : {};
    const labels: Array<[string, string]> = [
      ['time_window', '时间'],
      ['activity', '活动'],
      ['location_text', '地点'],
      ['geo_area', '区域'],
      ['candidate_preference', '候选偏好'],
      ['safety_boundary', '安全边界'],
    ];
    return labels
      .map(([key, label]) => {
        const raw = taskSlots[key];
        if (!this.isRecord(raw)) return '';
        const state = this.display(raw.state, '');
        if (
          !['answered', 'confirmed', 'completed', 'modified'].includes(state)
        ) {
          return '';
        }
        const value = this.display(raw.value, '');
        return value ? `${label}：${value}` : '';
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  private activityExplanationSteps(input: {
    source: string;
    city: string;
    time: string;
    activityType: string;
    location: string;
    matchReasons: string[];
    safetyBoundary: string;
    isRealData: boolean;
  }): string[] {
    const sourceLabel =
      input.source === 'activity'
        ? '来自公开活动'
        : input.source === 'public_intent'
          ? '来自公开可发现需求'
          : '来自公开机会池';
    const matchReason = input.matchReasons.find((reason) => reason.trim());
    return [
      `来源：${sourceLabel}${input.isRealData ? '，已通过公开可发现筛选' : ''}`,
      matchReason
        ? `匹配：${matchReason}`
        : `匹配：${input.city} · ${input.time} · ${input.activityType}`,
      `地点：${input.location}，先看公开详情`,
      `安全：${input.safetyBoundary}`,
      '确认：联系、参加或发起约练前都需要你确认',
    ].filter((step, index, list) => list.indexOf(step) === index);
  }

  private isPlaceholderContext(value: string): boolean {
    return ['同城', '活动', '待确认时间', '时间待确认'].includes(value);
  }

  private display(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private checkpointIdForPendingApproval(
    payload: Record<string, unknown>,
    runtime?: SocialAgentRuntimeResumeMetadata | null,
  ): number | null {
    return (
      this.positiveNumber(payload.checkpointId) ??
      this.positiveNumber(payload.resumeCheckpointId) ??
      this.positiveNumber(runtime?.checkpointId) ??
      this.positiveNumber(runtime?.resumeCursor?.checkpointId)
    );
  }

  private publicResumeCursor(
    runtime: SocialAgentRuntimeResumeMetadata | null | undefined,
    checkpointId: number | null,
    task: AgentTask,
  ): Record<string, unknown> | null {
    const cursor = runtime?.resumeCursor;
    const cursorCheckpointId =
      this.positiveNumber(cursor?.checkpointId) ?? checkpointId;
    if (!cursorCheckpointId) return null;
    return {
      threadId:
        this.display(cursor?.threadId, '') ||
        runtime?.threadId ||
        `agent-task:${task.id}`,
      checkpointId: cursorCheckpointId,
      parentCheckpointId:
        this.positiveNumber(cursor?.parentCheckpointId) ??
        this.positiveNumber(runtime?.parentCheckpointId),
      action: cursor?.action ?? runtime?.checkpointAction ?? 'resume',
      stepId: this.display(cursor?.stepId, '') || null,
    };
  }

  private positiveNumber(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }
}
