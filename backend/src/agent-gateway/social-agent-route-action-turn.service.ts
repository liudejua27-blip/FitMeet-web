import { Injectable } from '@nestjs/common';

import type { AgentTask } from './entities/agent-task.entity';
import {
  SocialRequestSafety,
  SocialRequestType,
  SocialRequestVisibility,
} from '../social-requests/social-request.entity';
import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import type { SocialAgentPendingApprovalSnapshot } from './social-agent-chat.types';
import type { SocialAgentIntentRouterResult } from './social-agent-intent-router.service';
import {
  readSocialAgentTaskMemory,
  recordSocialAgentPendingAction,
} from './social-agent-memory.util';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import type { SocialAgentActionApprovalRuntimeContext } from './social-agent-candidate-action-approval.presenter';
import { cleanDisplayText } from '../common/display-text.util';

type HandleRouteActionTurnInput = {
  ownerUserId: number;
  task: AgentTask;
  route: SocialAgentIntentRouterResult;
  message: string;
  assistantMessage: string;
  runtimeContext?: SocialAgentActionApprovalRuntimeContext | null;
  signal?: AbortSignal | null;
};

type HandleRouteActionTurnResult = {
  handled: boolean;
  assistantMessage: string;
  pendingApproval: SocialAgentPendingApprovalSnapshot | null;
  cards?: FitMeetAlphaCard[];
};

@Injectable()
export class SocialAgentRouteActionTurnService {
  constructor(
    private readonly candidateActions: SocialAgentCandidateActionService,
    private readonly metrics: SocialAgentMetricsService,
  ) {}

  async handle(
    input: HandleRouteActionTurnInput,
  ): Promise<HandleRouteActionTurnResult> {
    this.assertNotAborted(input.signal);
    if (input.route.intent !== 'action_request') {
      return {
        handled: false,
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      };
    }

    if (this.isPublishToDiscoverIntent(input.message)) {
      const publishDraft = this.publishDraftFromTask(input.task, input.message);
      if (!publishDraft.ready) {
        return {
          handled: true,
          assistantMessage: publishDraft.assistantMessage,
          pendingApproval: null,
          cards: [],
        };
      }
      return {
        handled: true,
        assistantMessage:
          '我已经把这次约练整理成发布确认卡。你点确认前不会公开到发现页。',
        pendingApproval: null,
        cards: [this.publishConfirmationCard(input.task, publishDraft.draft)],
      };
    }

    this.assertNotAborted(input.signal);
    const pendingApproval = await this.candidateActions.createActionApproval({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      route: input.route,
      runtimeContext: input.runtimeContext ?? null,
    });
    this.assertNotAborted(input.signal);
    if (!pendingApproval) {
      return {
        handled: true,
        assistantMessage: input.assistantMessage,
        pendingApproval: null,
      };
    }

    const assistantMessage = this.withApprovalCopy({
      task: input.task,
      assistantMessage: input.assistantMessage,
      pendingApproval,
    });
    this.metrics.recordApproval(pendingApproval.type);
    recordSocialAgentPendingAction(input.task, {
      id: pendingApproval.id,
      type: pendingApproval.type,
      actionType: pendingApproval.actionType,
      summary: pendingApproval.summary,
      riskLevel: pendingApproval.riskLevel,
      at: new Date().toISOString(),
      ...(input.runtimeContext
        ? { runtimeContext: this.runtimeContextTelemetry(input.runtimeContext) }
        : {}),
    });
    return {
      handled: true,
      assistantMessage,
      pendingApproval,
    };
  }

  private assertNotAborted(signal?: AbortSignal | null): void {
    if (signal?.aborted) throw new Error('Subagent worker job cancelled.');
  }

  private isPublishToDiscoverIntent(message: string): boolean {
    const text = cleanDisplayText(message, '').toLowerCase();
    if (!text) return false;
    if (/(不|别|先不|暂不|不要|不用|无需).{0,12}(发布|公开|发现)/i.test(text)) {
      return false;
    }
    return /(帮我发布|帮我发到发现|发布到发现|发布约练|发布卡片|公开发布|确认发布|发到发现|同步到发现)/i.test(
      text,
    );
  }

  private publishDraftFromTask(
    task: AgentTask,
    message: string,
  ):
    | { ready: true; draft: Record<string, unknown>; assistantMessage?: never }
    | { ready: false; draft?: never; assistantMessage: string } {
    const taskMemory = readSocialAgentTaskMemory(task);
    const slots = taskMemory.taskSlots ?? {};
    const activity =
      this.slotValue(slots, 'activity') ||
      this.text(taskMemory.activeEntities.activityType) ||
      this.inferActivity(task.goal) ||
      this.inferActivity(message);
    const time =
      this.slotValue(slots, 'time_window') ||
      this.text(taskMemory.activeEntities.timePreference) ||
      this.inferTime(task.goal) ||
      this.inferTime(message);
    const location =
      this.slotValue(slots, 'location_text') ||
      this.slotValue(slots, 'geo_area') ||
      this.text(taskMemory.activeEntities.locationPreference) ||
      this.inferLocation(task.goal) ||
      this.inferLocation(message);
    const city =
      this.text(taskMemory.activeEntities.city) ||
      this.inferCity(location) ||
      this.inferCity(task.goal) ||
      this.inferCity(message);
    const missing = [
      activity ? null : '活动',
      time ? null : '时间',
      location ? null : '地点',
    ].filter(Boolean);
    if (missing.length > 0) {
      return {
        ready: false,
        assistantMessage: `发布到发现前还差 ${missing.join('、')}。你补充后，我会生成可确认的约练卡；确认前不会公开。`,
      };
    }
    const candidatePreference = this.slotValue(slots, 'candidate_preference');
    const safetyBoundary =
      this.slotValue(slots, 'safety_boundary') ||
      '首次见面优先公共场所，先站内沟通，不公开精确位置或联系方式';
    const title = `${city || '同城'}${time}${activity}约练`;
    const description = [
      `${time}在${location}进行${activity}约练。`,
      candidatePreference ? `候选偏好：${candidatePreference}。` : null,
      safetyBoundary,
    ]
      .filter(Boolean)
      .join(' ');
    return {
      ready: true,
      draft: {
        type: this.socialRequestType(activity),
        title,
        description,
        rawText: task.goal,
        city: city || '青岛',
        radiusKm: 5,
        activityType: activity,
        timePreference: time,
        locationName: location,
        location,
        interestTags: this.uniqueStrings([activity, candidatePreference]),
        safetyRequirement: SocialRequestSafety.LowRiskOnly,
        visibility: SocialRequestVisibility.Public,
        agentAllowed: true,
        requireUserConfirmation: true,
        metadata: {
          agentTaskId: task.id,
          source: 'social_agent_natural_language_publish',
          visibilityConsent: true,
          publishPolicy: 'confirm_before_public_publish',
          safetyBoundary,
          candidatePreference: candidatePreference || null,
        },
      },
    };
  }

  private publishConfirmationCard(
    task: AgentTask,
    draft: Record<string, unknown>,
  ): FitMeetAlphaCard {
    const activityType = this.text(draft.activityType) || '约练';
    const time = this.text(draft.timePreference) || '时间待确认';
    const location = this.text(draft.locationName ?? draft.location) || '公共场所';
    const city = this.text(draft.city) || '同城';
    const safetyBoundary =
      this.text(this.record(draft.metadata).safetyBoundary) ||
      '不会公开精确位置、联系方式或私密画像。';
    return {
      id: `activity_plan:${task.id}:publish_confirmation`,
      type: 'activity_plan',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.activity',
      title: '约练卡待发布',
      body: `${city} · ${time} · ${activityType}。确认后会同步到发现页，附近公开可发现用户可以看到这张卡。${safetyBoundary}`,
      status: 'waiting_confirmation',
      data: {
        taskId: task.id,
        schemaName: 'OpportunityCard',
        schemaVersion: 'fitmeet.tool-ui.v1',
        schemaType: 'social_match.activity',
        opportunityCard: true,
        opportunityType: 'activity',
        opportunityTitle: this.text(draft.title) || `${activityType}约练`,
        city,
        time,
        locationName: location,
        activityType,
        safetyBoundary,
        publishPolicy: 'confirm_before_public_publish',
        approvalPolicy: '发布到发现前必须由你确认',
        confirmedContext: [
          `城市：${city}`,
          `时间：${time}`,
          `活动：${activityType}`,
          `地点：${location}`,
        ],
        opportunity: {
          id: `opportunity:${task.id}:activity`,
          type: 'activity',
          title: this.text(draft.title) || `${activityType}约练`,
          subtitle: `${city} · ${time}`,
          summary: this.text(draft.description),
          city,
          location,
          time,
          activityType,
          safetyBoundary,
          recommendedNextAction: '确认发布后，我会同步到发现页。',
        },
      },
      actions: [
        {
          id: `publish_to_discover:${task.id}`,
          label: '发布到发现',
          action: 'publish_to_discover',
          schemaAction: 'publish_to_discover',
          loopStage: 'activity_draft_created',
          requiresConfirmation: true,
          payload: {
            taskId: task.id,
            socialRequestDraft: draft,
            actionType: 'publish_social_request',
            sideEffect: 'publish_social_request',
            approvalRequired: true,
            checkpointRequired: true,
            resumeMode: 'resume_after_approval',
            idempotencyKey: `publish-to-discover:${task.id}`,
            riskLevel: 'medium',
            riskReasons: [
              '这张约练卡会公开到发现页',
              '不会公开精确位置、联系方式或私密画像',
            ],
          },
        },
        {
          id: `modify_activity_plan:${task.id}`,
          label: '修改',
          action: 'reschedule_meet_loop',
          schemaAction: 'activity.modify_time',
          loopStage: 'activity_draft_created',
          requiresConfirmation: false,
          payload: {
            taskId: task.id,
            socialRequestDraft: draft,
            sideEffect: 'edit_draft_only',
          },
        },
        {
          id: `skip_publish_activity:${task.id}`,
          label: '暂不发布',
          action: 'activity.skip_publish',
          schemaAction: 'activity.skip_publish',
          loopStage: 'activity_draft_created',
          requiresConfirmation: false,
          payload: {
            taskId: task.id,
            sideEffect: 'local_dismiss',
          },
        },
      ],
    };
  }

  private slotValue(slots: Record<string, unknown>, key: string): string {
    const slot = this.record(slots[key]);
    return this.text(slot.value ?? slots[key]);
  }

  private inferActivity(text: string): string {
    const value = cleanDisplayText(text, '');
    const match = value.match(
      /(健身|散步|跑步|慢跑|羽毛球|篮球|徒步|爬山|骑行|游泳|瑜伽|飞盘|网球|乒乓|咖啡|city\s*walk|citywalk)/i,
    );
    return match?.[1] ? cleanDisplayText(match[1], '') : '';
  }

  private inferTime(text: string): string {
    const value = cleanDisplayText(text, '');
    const match = value.match(
      /(今天晚上|今晚|今天上午|今天下午|明天上午|明天下午|明天晚上|周末上午|周末下午|周末晚上|周末|工作日晚间|上午|下午|晚上|中午|[0-9一二三四五六七八九十]+点)/i,
    );
    return match?.[1] ? cleanDisplayText(match[1], '') : '';
  }

  private inferLocation(text: string): string {
    const value = cleanDisplayText(text, '');
    const match = value.match(
      /((?:青岛大学|崂山区|市南区|市北区|李沧区|黄岛区|朝阳公园|奥帆中心|五四广场|大学|公园|体育馆|健身房|校区|商场|书店|咖啡店)(?:附近|周边)?)/i,
    );
    return match?.[1] ? cleanDisplayText(match[1], '') : '';
  }

  private inferCity(...texts: string[]): string {
    const joined = texts.map((item) => cleanDisplayText(item, '')).join(' ');
    const match = joined.match(/(青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)/);
    return match?.[1] ?? '';
  }

  private socialRequestType(activity: string): SocialRequestType {
    const text = activity.toLowerCase();
    if (/跑|run/.test(text)) return SocialRequestType.RunningPartner;
    if (/健身|训练|gym|fitness/.test(text)) return SocialRequestType.FitnessPartner;
    if (/咖啡/.test(text)) return SocialRequestType.CoffeeChat;
    if (/散步|city/.test(text)) return SocialRequestType.CityWalk;
    return SocialRequestType.Custom;
  }

  private uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(
      new Set(values.map((value) => this.text(value)).filter(Boolean)),
    ).slice(0, 20);
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }

  private withApprovalCopy(input: {
    task: AgentTask;
    assistantMessage: string;
    pendingApproval: SocialAgentPendingApprovalSnapshot;
  }): string {
    const draft = this.candidateActions.candidateMessageDraft(input.task);
    return draft
      ? `${input.assistantMessage}\n我先给你拟一条开场白：${draft}\n已放进确认卡片。你确认前我不会发送，取消也不会联系对方。`
      : `${input.assistantMessage}\n这个动作需要你确认。我已经放进确认卡片；你确认前不会执行。`;
  }

  private runtimeContextTelemetry(
    context: SocialAgentActionApprovalRuntimeContext,
  ): Record<string, unknown> {
    return {
      hasTaskContext: Boolean(context.taskContext),
      hasHydratedContext: Boolean(context.hydratedContext),
      hasProfileContext: Boolean(context.profile),
      hasLongTermMemoryContext: Boolean(context.longTermSnapshot),
      brainToolResultCount: Array.isArray(context.brainToolResults)
        ? context.brainToolResults.length
        : 0,
      hasResumeContext: Boolean(context.resumeContext),
      pendingApprovalCount: Array.isArray(
        context.hydratedContext?.pendingApprovals,
      )
        ? context.hydratedContext.pendingApprovals.length
        : 0,
    };
  }
}
