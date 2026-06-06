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
import { RealtimeEventService } from '../realtime/realtime-event.service';
import {
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentPlannerService } from './social-agent-planner.service';
import { SocialAgentRecommendationResultService } from './social-agent-recommendation-result.service';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentToolName } from './social-agent-tool-executor.service';
import type {
  SocialAgentChatReplanRunBody,
  SocialAgentChatReplanRunResult,
  SocialAgentVisibleStep,
} from './social-agent-chat.types';

@Injectable()
export class SocialAgentReplanRunService {
  private readonly logger = new Logger(SocialAgentReplanRunService.name);

  constructor(
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
    private readonly runState: SocialAgentRunStateService,
    private readonly followUpContext: SocialAgentFollowUpContextService,
    private readonly replanProgress: SocialAgentReplanProgressService,
    private readonly planner: SocialAgentPlannerService,
    private readonly draftSearch: SocialAgentDraftSearchService,
    private readonly recommendationResults: SocialAgentRecommendationResultService,
    private readonly routeContext: SocialAgentRouteContextService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    @Optional()
    private readonly realtime?: RealtimeEventService,
  ) {}

  async execute(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentChatReplanRunBody;
    runId: string;
    visibleStepLabel: (id: string, label: string) => string;
  }): Promise<SocialAgentChatReplanRunResult> {
    const { ownerUserId, taskId, body, runId, visibleStepLabel } = input;
    let task = await this.runState.updateRunSnapshot(
      ownerUserId,
      taskId,
      runId,
      {
        status: 'running',
        phase: 'understand',
        startedAt: new Date().toISOString(),
        message: '正在理解补充需求',
      },
      visibleStepLabel,
    );
    const userMessage = cleanDisplayText(body.userMessage, '').trim();
    if (!userMessage) throw new BadRequestException('请输入补充要求');
    const followUp =
      this.followUpContext.readLatestFollowUpContext(task) ??
      (await this.followUpContext.appendFollowUpContext(task, userMessage));
    task = followUp.task;
    const refreshedGoal = followUp.refreshedGoal;

    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentReplanStarted,
      '开始异步重新规划 Social Agent 任务',
      { runId, userMessage, refreshedGoal },
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
    task = await this.taskLifecycle.assertTaskOwner(taskId, ownerUserId);
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
    await this.runState.updateRunSnapshot(
      ownerUserId,
      taskId,
      runId,
      {
        replan,
        message: usedTimeoutFallback
          ? '已收到补充信息，当前先基于规则匹配继续搜索。'
          : '已更新 Agent 计划，正在刷新候选人。',
      },
      visibleStepLabel,
    );

    const refreshed = await this.draftSearch.refreshDraftAndCandidates({
      task,
      goal: refreshedGoal,
      refreshTask: () =>
        this.taskLifecycle.assertTaskOwner(taskId, ownerUserId),
    });
    task = refreshed.task;
    const draft = refreshed.draft;
    const searchResult = refreshed.searchResult;
    const candidates = refreshed.candidates;

    await done('draft', '已重新生成约练草稿', AgentTaskEventType.ToolReturned, {
      toolName: SocialAgentToolName.CreateSocialRequest,
      draft: this.safeDraftForEvent(draft),
    });
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

    const result =
      await this.recommendationResults.completeRecommendationResult({
        ownerUserId,
        task,
        visibleSteps,
        draft,
        candidates,
        searchResult,
        statusReason: 'follow_up_replan_refreshed',
        buildMemoryContext: (currentTask) =>
          this.routeContext.buildMemoryContext(currentTask, null),
        toEventDto: (event) => this.toEventDto(event),
      });
    const finalResult: SocialAgentChatReplanRunResult = { ...result, replan };
    await this.runState.completeReplanRun({
      ownerUserId,
      taskId,
      runId,
      visibleSteps,
      replan,
      result: finalResult,
      visibleStepLabel,
    });
    return finalResult;
  }

  private async writeEvent(
    task: { id: number; ownerUserId: number },
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
          event: 'social_agent.replan_run_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
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

  private safeDraftForEvent(value: unknown): Record<string, unknown> {
    return sanitizeForDisplay(value) as Record<string, unknown>;
  }
}
