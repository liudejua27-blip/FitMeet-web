import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { sanitizeCity } from '../common/city.util';
import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { RealtimeEventService } from '../realtime/realtime-event.service';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
  AgentTaskPermissionMode,
} from './entities/agent-task.entity';
import { FitMeetAgentToolStatus } from './entities/fitmeet-agent-runtime.entity';
import type { FitMeetAlphaTurnDecision } from './fitmeet-alpha-agent.types';
import { SocialAgentPlannerService } from './social-agent-planner.service';
import { SocialProfileService } from '../users/social-profile.service';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import { SocialAgentRecommendationResultService } from './social-agent-recommendation-result.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { buildSocialAgentRequestDraft } from './social-agent-chat-result.presenter';
import type {
  SocialAgentChatRunResult,
  SocialAgentVisibleStep,
  StreamEmit,
} from './social-agent-chat.types';
import { SocialAgentRunProgressTracker } from './social-agent-run-progress.tracker';
import type {
  RuntimeStepRecord,
  RuntimeToolRecord,
} from './social-agent-run-progress.tracker';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import {
  appendShortTermMemoryItem,
  rememberSocialAgentShortTerm,
} from './social-agent-memory.util';

@Injectable()
export class SocialAgentRunRecommendationService {
  private readonly logger = new Logger(
    SocialAgentRunRecommendationService.name,
  );

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly planner: SocialAgentPlannerService,
    private readonly socialProfiles: SocialProfileService,
    private readonly draftSearch: SocialAgentDraftSearchService,
    private readonly recommendationResults: SocialAgentRecommendationResultService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly routeContext: SocialAgentRouteContextService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
  ) {}

  async run(input: {
    ownerUserId: number;
    task: AgentTask;
    goal: string;
    permissionMode: AgentTaskPermissionMode;
    visibleSteps: SocialAgentVisibleStep[];
    emit?: StreamEmit;
    alphaTurn?: FitMeetAlphaTurnDecision;
    visibleStepLabel: (id: string, label: string) => string;
    recordRuntimeStep?: (input: RuntimeStepRecord) => Promise<void> | void;
    recordRuntimeTool?: (input: RuntimeToolRecord) => Promise<void> | void;
  }): Promise<{ task: AgentTask; result: SocialAgentChatRunResult }> {
    let task = input.task;
    const progress = new SocialAgentRunProgressTracker({
      visibleSteps: input.visibleSteps,
      emit: input.emit,
      visibleStepLabel: input.visibleStepLabel,
      rememberStep: (id, label, status) =>
        this.rememberShortTermStep(task, id, label, status),
      writeEvent: (eventType, summary, payload) =>
        this.writeEvent(task, eventType, summary, payload),
      recordRuntimeStep: input.recordRuntimeStep,
      recordRuntimeTool: input.recordRuntimeTool,
    });

    await progress.completeStep(
      'understand',
      '正在理解你的社交需求',
      AgentTaskEventType.GoalUnderstood,
      {
        goal: input.goal,
        permissionMode: input.permissionMode,
      },
    );

    await progress.completeStep(
      'permission',
      `正在检查权限模式：${this.modeLabel(input.permissionMode)}`,
      AgentTaskEventType.Note,
      {
        permissionMode: input.permissionMode,
        policy: 'recommendation_plus_confirmation',
      },
    );

    await progress.recordTool(
      'fitmeet_get_my_profile',
      FitMeetAgentToolStatus.Running,
      {
        taskId: task.id,
      },
    );
    const profileSummary = await this.readProfileSummary(input.ownerUserId);
    await progress.recordTool(
      'fitmeet_get_my_profile',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      { hasProfileSummary: Boolean(profileSummary) },
    );

    const planResult = await this.planner.planExistingTask(task);
    await progress.completeStep(
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

    this.realtime?.emitAgentEvent(input.ownerUserId, 'agent:tool_call', {
      taskId: task.id,
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'started',
    });
    await progress.recordTool(
      'fitmeet_create_social_intent',
      FitMeetAgentToolStatus.Running,
      {
        taskId: task.id,
      },
    );
    const draftResult = await this.draftSearch.generateDraftWithTool(
      task,
      input.goal,
    );
    await progress.recordTool(
      'fitmeet_create_social_intent',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      { draftReady: true },
    );
    this.realtime?.emitAgentEvent(input.ownerUserId, 'agent:tool_result', {
      taskId: task.id,
      toolName: SocialAgentToolName.CreateSocialRequest,
      status: 'draft_ready',
    });

    task = await this.taskLifecycle.assertTaskOwner(task.id, input.ownerUserId);
    const draft = buildSocialAgentRequestDraft({
      agentTaskId: task.id,
      draft: draftResult.draft,
      card: draftResult.card,
      profileUsed: draftResult.profileUsed,
    });

    draft.socialRequestId = await this.draftSearch.createPrivateDraftRequest(
      task,
      draft,
    );
    task = await this.taskLifecycle.assertTaskOwner(task.id, input.ownerUserId);
    await progress.recordTool(
      'fitmeet_create_social_intent',
      FitMeetAgentToolStatus.WaitingConfirmation,
      { taskId: task.id, mode: 'private_draft' },
      {
        socialRequestId: draft.socialRequestId ?? null,
        publishPolicy: 'requires_user_confirmation',
      },
    );

    this.realtime?.emitAgentEvent(input.ownerUserId, 'agent:tool_call', {
      taskId: task.id,
      toolName: SocialAgentToolName.SearchMatches,
      status: 'started',
    });
    await progress.recordTool(
      'fitmeet_search_candidates',
      FitMeetAgentToolStatus.Running,
      {
        taskId: task.id,
        socialRequestId: draft.socialRequestId ?? null,
      },
    );
    const searchResult = await this.draftSearch.searchCandidates(task, draft);
    const candidates = searchResult.candidates;
    await progress.recordTool(
      'fitmeet_search_candidates',
      FitMeetAgentToolStatus.Succeeded,
      {
        taskId: task.id,
        socialRequestId: draft.socialRequestId ?? null,
      },
      { candidateCount: candidates.length },
    );
    await progress.recordTool(
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
    this.realtime?.emitAgentEvent(input.ownerUserId, 'agent:candidates', {
      taskId: task.id,
      candidateCount: candidates.length,
      candidates,
    });

    task = await this.taskLifecycle.assertTaskOwner(task.id, input.ownerUserId);
    await progress.completeStep(
      'search',
      '正在检索附近候选人',
      AgentTaskEventType.ToolReturned,
      {
        toolName: SocialAgentToolName.SearchMatches,
        socialRequestId: draft.socialRequestId,
        candidateCount: candidates.length,
      },
    );

    await progress.completeStep(
      'rank',
      '正在根据时间、地点、兴趣和安全边界排序',
      AgentTaskEventType.StepCompleted,
      { candidateCount: candidates.length },
    );

    await progress.completeStep(
      'safety_filter',
      '正在进行隐私、骚扰、诈骗和线下见面风险过滤',
      AgentTaskEventType.StepCompleted,
      {
        candidateCount: candidates.length,
        policy: 'critical_actions_require_user_confirmation',
      },
    );

    await progress.completeStep(
      'draft',
      '正在生成约练草稿',
      AgentTaskEventType.ToolReturned,
      {
        toolName: SocialAgentToolName.CreateSocialRequest,
        draft: this.safeDraftForEvent(draft),
      },
    );

    await progress.completeStep(
      'reason',
      '正在生成推荐理由',
      AgentTaskEventType.ToolReturned,
      {
        toolName: SocialAgentToolName.ExplainMatches,
        topCandidateUserId: candidates[0]?.userId ?? null,
      },
    );
    await progress.completeStep(
      'icebreaker',
      '正在生成高情商开场白',
      AgentTaskEventType.ToolReturned,
      {
        toolName: 'fitmeet_generate_icebreaker',
        candidateCount: candidates.length,
      },
    );
    await progress.recordTool(
      'fitmeet_generate_icebreaker',
      FitMeetAgentToolStatus.Succeeded,
      { taskId: task.id },
      {
        candidateCount: candidates.length,
        requiresUserConfirmationBeforeSend: true,
      },
    );

    await progress.completeStep(
      'done',
      '已完成',
      AgentTaskEventType.TaskSucceeded,
      {
        candidateCount: candidates.length,
        requiresConfirmation: true,
      },
    );

    const result =
      await this.recommendationResults.completeRecommendationResult({
        ownerUserId: input.ownerUserId,
        task,
        visibleSteps: input.visibleSteps,
        draft,
        candidates,
        searchResult,
        statusReason: 'recommendations_ready_waiting_user_confirmation',
        emit: input.emit,
        alphaTurn: input.alphaTurn,
        buildMemoryContext: (currentTask) =>
          this.routeContext.buildMemoryContext(currentTask, null),
        toEventDto: (event) => this.toEventDto(event),
      });

    return { task, result };
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
  ): Promise<void> {
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
          event: 'social_agent.recommendation_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
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

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
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
}
