import { Injectable, Optional } from '@nestjs/common';

import type { LifeGraphProposalDto } from '../life-graph/dto/life-graph.dto';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from './fitmeet-alpha-agent.types';
import type {
  SocialAgentActivityResult,
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
import { AgentSelfImproveService } from './agent-self-improve.service';

type CompleteRouteTurnInput = {
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  assistantMessage: string;
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
};

@Injectable()
export class SocialAgentRouteCompletionService {
  constructor(
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly metrics: SocialAgentMetricsService,
    @Optional() private readonly selfImprove?: AgentSelfImproveService,
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
    await this.messageLog.recordAssistantMessage(
      input.task,
      input.assistantMessage,
      result,
    );
    await this.selfImprove?.recordOnlineReplayFromRoute({
      ownerUserId: input.task.ownerUserId,
      taskId: input.task.id,
      userMessage: input.task.goal,
      assistantMessage: input.assistantMessage,
      route: input.route as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
    });
    this.metrics.observeRouteLatency(Date.now() - input.startedAt);
    return result;
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
}
