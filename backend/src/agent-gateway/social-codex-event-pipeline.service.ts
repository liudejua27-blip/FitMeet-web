import { Injectable, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import { SocialAgentEventStore } from './social-agent-event-store.service';
import { SocialAgentEventV2Service } from './social-agent-event-v2.service';
import type {
  SocialAgentEventV2,
  SocialAgentEventV2Stage,
  SocialAgentEventV2Type,
} from './social-agent-event-v2.types';
import { SocialAgentProfileGateService } from './social-agent-profile-gate.service';
import {
  SocialAgentTaskMemoryStateMachineService,
  type SocialAgentTaskSlots,
} from './social-agent-task-memory-state-machine.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';
import { SocialAgentContextHydratorService } from './social-agent-context-hydrator.service';
import type { UserFacingAgentResponse } from './user-facing-agent-response';
import { SocialCodexApprovalSchemaService } from './social-codex-approval-schema.service';
import {
  sanitizeSocialCodexProcessDetail,
  sanitizeSocialCodexProcessTitle,
} from './social-codex-public-process-text';
import { sanitizeSocialAgentUserVisiblePayload } from './social-agent-user-visible-payload';
import { summarizeSocialCodexRun } from './social-codex-run-summary';

const FITMEET_TOOL_UI_SCHEMA_VERSION = 'fitmeet.tool-ui.v1';
const FITMEET_TOOL_UI_SCHEMA_TYPES = new Set([
  'social_match.candidate',
  'social_match.activity',
  'life_graph.diff',
  'meet_loop.timeline',
  'safety.approval',
  'generic.card',
]);

export type SocialCodexEventWriter = (
  type: SocialAgentEventV2Type,
  stage: SocialAgentEventV2Stage,
  title: string,
  options: {
    state: 'running' | 'done' | 'waiting' | 'failed';
    detail?: string;
    payload?: Record<string, unknown>;
    messageId?: string | null;
  },
) => Promise<SocialAgentEventV2>;

@Injectable()
export class SocialCodexEventPipelineService {
  private readonly fallbackEventV2 = new SocialAgentEventV2Service();

  constructor(
    @Optional()
    private readonly eventV2?: SocialAgentEventV2Service,
    @Optional()
    private readonly eventStore?: SocialAgentEventStore,
    @Optional()
    private readonly taskSlots?: SocialAgentTaskMemoryStateMachineService,
    @Optional()
    private readonly contextHydrator?: SocialAgentContextHydratorService,
    @Optional()
    private readonly profileGate?: SocialAgentProfileGateService,
    @Optional()
    private readonly approvalSchema?: SocialCodexApprovalSchemaService,
  ) {}

  createWriter(input: {
    write: (event: string, data: SocialAgentEventV2) => void;
    userId: number;
    taskId: number | null;
    threadId?: string | number | null;
    runId: string;
  }): SocialCodexEventWriter {
    const emittedDisplayKeys = new Set<string>();
    const emittedEvents: SocialAgentEventV2[] = [];
    return async (type, stage, title, options) => {
      const safeTitle = sanitizeSocialCodexProcessTitle(title, {
        type,
        stage,
        state: options.state,
      });
      const safeDetail = sanitizeSocialCodexProcessDetail(options.detail, {
        type,
        stage,
        state: options.state,
      });
      let event = this.eventService().envelope({
        type,
        userId: input.userId,
        threadId: input.threadId,
        taskId: input.taskId,
        runId: input.runId,
        stage,
        visibility: 'user_visible',
        messageId: options.messageId,
        display: {
          title: safeTitle,
          ...(safeDetail ? { detail: safeDetail } : {}),
          state: options.state,
        },
        payload: sanitizeSocialAgentUserVisiblePayload(type, options.payload),
      });
      if (this.isTerminalRunEvent(event)) {
        event = this.withRunSummary(event, emittedEvents);
      }
      if (type !== 'assistant.delta') {
        const displayKey = this.userVisibleDisplayKey(event);
        if (displayKey && emittedDisplayKeys.has(displayKey)) {
          return event;
        }
        if (displayKey) emittedDisplayKeys.add(displayKey);
      }
      input.write(event.type, event);
      if (event.type !== 'assistant.delta') {
        await this.eventStore?.appendEventByTaskId(
          input.userId,
          event.taskId,
          event,
        );
      }
      emittedEvents.push(event);
      return event;
    };
  }

  private isTerminalRunEvent(event: SocialAgentEventV2): boolean {
    return event.type === 'run.completed' || event.type === 'run.failed';
  }

  private withRunSummary(
    event: SocialAgentEventV2,
    previousEvents: SocialAgentEventV2[],
  ): SocialAgentEventV2 {
    const summary = summarizeSocialCodexRun([...previousEvents, event]);
    return {
      ...event,
      payload: {
        ...(event.payload ?? {}),
        summary,
      },
    };
  }

  private userVisibleDisplayKey(event: SocialAgentEventV2): string | null {
    if (event.visibility !== 'user_visible') return null;
    const title = cleanDisplayText(event.display?.title ?? '');
    if (!title) return null;
    const detail = cleanDisplayText(event.display?.detail ?? '');
    if (event.type === 'approval.required' || event.type === 'approval.resolved') {
      return [
        event.type,
        event.stage,
        event.display?.state ?? '',
        this.approvalDisplayIdentity(event),
        title,
        detail,
      ].join('|');
    }
    return [
      event.display?.state ?? '',
      title,
      detail,
    ].join('|');
  }

  private approvalDisplayIdentity(event: SocialAgentEventV2): string {
    const payload = this.recordValue(event.payload) ?? {};
    const approvalId = cleanDisplayText(payload.approvalId, '');
    if (approvalId) return `approval:${approvalId}`;
    const checkpointId = cleanDisplayText(payload.checkpointId, '');
    if (checkpointId) return `checkpoint:${checkpointId}`;
    const actionType = cleanDisplayText(payload.actionType, '');
    if (actionType) return `action:${actionType}`;
    return 'approval:unknown';
  }

  async writeRunStarted(
    writer: SocialCodexEventWriter,
    title = '正在理解你的需求',
    detail = '会结合最近对话和已确认偏好，整理成自然回复。',
  ) {
    return writer('run.started', 'detect_social_intent', title, {
      state: 'running',
      detail,
    });
  }

  async writeHydrateContext(writer: SocialCodexEventWriter) {
    return writer(
      'visible_process.delta',
      'hydrate_context',
      '正在读取你的偏好',
      {
        state: 'running',
        detail:
          '会结合最近对话、当前任务和已确认偏好，不展示内部思考链。',
      },
    );
  }

  async writeCheckpointRestore(
    writer: SocialCodexEventWriter,
    action?: string | null,
  ) {
    return writer(
      'visible_process.delta',
      'hydrate_context',
      '正在接着刚才的进度',
      {
        state: 'running',
        detail:
          '会读取上一次任务状态和待确认动作，不会重复执行已经完成的内容。',
        payload: {
          checkpointAction: action ?? null,
        },
      },
    );
  }

  async writeAssistantDelta(
    writer: SocialCodexEventWriter,
    delta: string,
    messageId?: string | null,
    source: 'llm' | 'fallback' = 'llm',
  ) {
    return writer('assistant.delta', 'detect_social_intent', '正在回复', {
      state: 'running',
      messageId: messageId ?? null,
      payload: {
        delta,
        messageId: messageId ?? null,
        source,
      },
    });
  }

  async writeStep(
    writer: SocialCodexEventWriter,
    step: {
      label: string;
      status: 'pending' | 'running' | 'done' | 'failed';
      detail?: string;
    },
  ) {
    return writer(
      this.toolTypeForStatus(step.status),
      this.stageFromStep(step.label),
      this.lightStatusFromStep(step.label),
      {
        state:
          step.status === 'done'
            ? 'done'
            : step.status === 'failed'
              ? 'failed'
              : 'running',
        detail: step.detail,
      },
    );
  }

  async writeRunFailed(writer: SocialCodexEventWriter) {
    return writer('run.failed', 'detect_social_intent', '连接中断了，可以继续', {
      state: 'failed',
      detail: '这段需求还在，可以直接继续；重试会从刚才的位置接着处理。',
    });
  }

  async writeRunCompleted(writer: SocialCodexEventWriter, lifecycle: string) {
    const completion = this.runCompletionDisplay(lifecycle);
    return writer(
      'run.completed',
      completion.stage,
      completion.title,
      {
        state: completion.state,
        detail: completion.detail,
      },
    );
  }

  async writeEarlySlotInferenceEvents(
    writer: SocialCodexEventWriter,
    message: unknown,
    context: {
      taskId?: number | string | null;
      threadId?: number | string | null;
    } = {},
  ) {
    if (!this.taskSlots || typeof message !== 'string') return;
    if (!this.shouldEmitEarlySlotInference(message, context)) return;
    const slots = this.taskSlots.extractSlotsFromUserMessage(message);
    const summary = Object.entries(slots)
      .filter(([, slot]) => slot?.value && slot.state !== 'inferred')
      .sort(
        ([left], [right]) =>
          this.visibleSlotPriority(left) - this.visibleSlotPriority(right),
      )
      .map(([key, slot]) => [key, slot.value]);
    if (summary.length === 0) return;
    await writer('slot.filled', 'slot_filling', '已记录你补充的信息', {
      state: 'done',
      detail: summary
        .map(([, value]) => String(value))
        .filter(Boolean)
        .slice(0, 4)
        .join('、'),
      payload: {
        slots: this.pickSlots(
          slots,
          summary.map(([key]) => String(key)),
        ),
        provisional: true,
      },
    });
  }

  private shouldEmitEarlySlotInference(
    message: string,
    context: {
      taskId?: number | string | null;
      threadId?: number | string | null;
    },
  ): boolean {
    if (this.hasExplicitSocialExecutionIntent(message)) return true;
    const taskId =
      this.positiveNumber(context.taskId) ??
      this.positiveNumber(context.threadId);
    return Boolean(taskId);
  }

  async writeProfileGateIfNeeded(
    writer: SocialCodexEventWriter,
    userId: number,
    input: {
      text?: string | null;
      taskId?: number | null;
      threadId?: string | number | null;
    },
  ) {
    if (!(await this.shouldEmitProfileGate(userId, input))) return;
    if (!this.profileGate) return;
    const taskId =
      this.positiveNumber(input.taskId) ?? this.positiveNumber(input.threadId);
    const context = taskId
      ? await this.contextHydrator
          ?.hydrateContext({
            userId,
            taskId,
            threadId: input.threadId ?? taskId,
          })
          .catch(() => null)
      : null;
    const status = await (
      typeof this.profileGate.getMinimumProfileStatusWithTaskSlots ===
      'function'
        ? this.profileGate.getMinimumProfileStatusWithTaskSlots(
            userId,
            context?.taskSlots,
          )
        : this.profileGate.getMinimumProfileStatus(userId)
    ).catch(() => null);
    if (!status) return;
    await writer(
      status.passed ? 'tool.done' : 'tool.progress',
      'profile_gate',
      status.passed ? '画像门槛已满足' : '匹配前还差一点人物画像',
      {
        state: status.passed ? 'done' : 'waiting',
        detail: status.passed
          ? '普通聊天可以继续；进入匹配、发布或邀请前也已满足最低画像要求。'
          : `还需要补充：${status.nextActions.slice(0, 3).join('、') || '城市、兴趣、时间或边界'}`,
        payload: {
          passed: status.passed,
          missing: status.missing,
          profileCompleteness: status.profileCompleteness,
          canEnterMatchPool: status.canEnterMatchPool,
        },
      },
    );
  }

  async writeApprovalResolved(
    writer: SocialCodexEventWriter,
    input: {
      decision?: 'approved' | 'rejected' | null;
      approvalId?: unknown;
      checkpointId?: unknown;
      sourceCheckpointId?: unknown;
      resumeCursor?: Record<string, unknown> | null;
      checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    },
  ) {
    const decision = input.decision;
    if (decision !== 'approved' && decision !== 'rejected') return;
    const checkpointId =
      this.positiveNumber(input.checkpointId) ??
      this.positiveNumber(input.sourceCheckpointId) ??
      this.positiveNumber(input.resumeCursor?.checkpointId);
    const approvalId = this.positiveNumber(input.approvalId);
    await writer(
      'approval.resolved',
      'approval',
      decision === 'approved' ? '已确认' : '已取消',
      {
        state: 'done',
        detail:
          decision === 'approved'
            ? '我会从同一个任务继续处理，不会重新询问已确认的信息。'
            : '这个动作已取消，不会触达对方，也不会公开位置或联系方式。',
        payload: {
          approvalId,
          decision,
          checkpointId,
          resumeCursor: this.publicResumeCursor(input.resumeCursor),
          checkpointAction: input.checkpointAction ?? null,
        },
      },
    );
  }

  async writeContextEvents(
    writer: SocialCodexEventWriter,
    userId: number,
    taskId: number | null,
    runId: string,
    threadId?: string | number | null,
  ): Promise<void> {
    const effectiveTaskId =
      this.positiveNumber(taskId) ?? this.positiveNumber(threadId);
    if (!effectiveTaskId) return;
    const context = await this.contextHydrator
      ?.hydrateContext({
        userId,
        taskId: effectiveTaskId,
        threadId: threadId ?? `agent-task:${effectiveTaskId}`,
      })
      .catch(() => null);
    const slots: SocialAgentTaskSlots | Record<string, unknown> =
      context?.taskSlots ?? {};
    const lifeGraphFactProposals = context?.lifeGraphFactProposals ?? [];
    const lifeGraphFactDisplaySummaries =
      context?.lifeGraphFactDisplaySummaries ?? [];
    const lifeGraphGovernanceSummary = context?.lifeGraphGovernanceSummary ?? {
      total: lifeGraphFactProposals.length,
      autoSaveCount: 0,
      confirmationRequiredCount: 0,
      blockedCount: 0,
      sensitiveCount: 0,
      expiringFactKeys: [],
    };
    const summary = this.slotValueEntries(slots);
    const previousSlotValues = await this.previousSlotEventValues(
      userId,
      effectiveTaskId,
    );
    const newSlots: Record<string, unknown> = {};
    const modifiedSlots: Record<string, unknown> = {};
    for (const [key, value] of summary) {
      const previous = previousSlotValues.get(key);
      const next = this.displayString(value);
      if (!previousSlotValues.has(key)) {
        newSlots[key] = value;
      } else if (previous !== undefined && previous !== next) {
        modifiedSlots[key] = value;
      }
    }
    if (summary.length === 0) return;
    if (Object.keys(newSlots).length > 0) {
      await writer('slot.completed', 'slot_filling', '已记录你的关键信息', {
        state: 'done',
        detail: this.valuesDetail(newSlots),
        payload: { slots: this.pickSlots(slots, Object.keys(newSlots)) },
      });
    }
    if (Object.keys(modifiedSlots).length > 0) {
      await writer('slot.filled', 'slot_filling', '已更新你的关键信息', {
        state: 'done',
        detail: this.valuesDetail(modifiedSlots),
        payload: { slots: this.pickSlots(slots, Object.keys(modifiedSlots)) },
      });
    }
    if (
      Object.keys(newSlots).length === 0 &&
      Object.keys(modifiedSlots).length === 0
    ) {
      return;
    }
    await writer('memory.saved', 'hydrate_context', '这些信息下次会继续使用', {
      state: 'done',
      detail: lifeGraphFactProposals.length
        ? `已整理 ${lifeGraphGovernanceSummary.total} 条长期偏好建议：${lifeGraphGovernanceSummary.autoSaveCount} 条可低风险保留，${lifeGraphGovernanceSummary.confirmationRequiredCount} 条需你确认。`
        : undefined,
      payload: {
        taskId: effectiveTaskId,
        runId,
        saved: ['task_slots', 'recent_messages'],
        lifeGraphFacts: lifeGraphFactDisplaySummaries,
        lifeGraphGovernanceSummary,
      },
    });
  }

  async writeResultEvents(
    writer: SocialCodexEventWriter,
    result: UserFacingAgentResponse,
  ): Promise<void> {
    if (this.shouldEmitSafetyProcess(result)) {
      await writer('safety_check.done', 'safety_filter', '已检查安全边界', {
        state: result.safeStatus.blocked ? 'failed' : 'done',
        detail:
          result.safeStatus.boundaryNotes.slice(0, 2).join('；') ||
          '已按安全边界检查，真实触达前仍会让你确认。',
        payload: {
          level: result.safeStatus.level,
          blocked: result.safeStatus.blocked,
          requiredConfirmations: result.safeStatus.requiredConfirmations,
        },
      });
    }

    const candidateCount = result.cards.filter((card) =>
      this.isCandidateCard(card),
    ).length;
    if (candidateCount > 0) {
      await writer(
        'candidate_search.started',
        'search_candidates',
        '正在筛选公开可发现的人',
        {
          state: 'running',
          detail: '只会使用公开资料、公开动态、活动报名和公开约练意图。',
        },
      );
      await writer(
        'candidate_search.done',
        'rank_candidates',
        `找到 ${candidateCount} 个公开可发现的人`,
        {
          state: 'done',
          detail: '我只会展示公开可发现的信息，联系对方前仍需要你确认。',
          payload: { candidateCount },
        },
      );
    }

    const activityCount = result.cards.filter((card) =>
      this.isActivityCard(card),
    ).length;
    if (activityCount > 0) {
      await writer(
        'candidate_search.started',
        'search_candidates',
        '正在查找可参考活动',
        {
          state: 'running',
          detail: '会先整理公开活动，再让你决定是否继续。',
        },
      );
      await writer(
        'candidate_search.done',
        'search_candidates',
        `找到 ${activityCount} 个可参考活动`,
        {
          state: 'done',
          detail: '你可以先查看详情，再决定是否发起邀请。',
          payload: { activityCount },
        },
      );
    }

    const opportunity = result.cards.find((card) =>
      this.isOpportunityCard(card),
    );
    if (opportunity) {
      await writer(
        'opportunity_card.created',
        'create_opportunity_card',
        '这张约练卡可以发布到发现',
        {
          state: 'done',
          detail: this.cardTitle(opportunity) || '发布前会先让你确认公开内容。',
          payload: {
            cardId: this.cardId(opportunity),
            schemaType: this.cardSchemaType(opportunity),
          },
        },
      );
    }

    if (result.lifeGraphWritebackProposal) {
      await writer(
        'memory.saved',
        'life_graph_writeback',
        '已整理画像变化建议',
        {
          state: 'waiting',
          detail: '确认前不会写入长期 Life Graph，你可以修改或忽略。',
          payload: { proposal: result.lifeGraphWritebackProposal },
        },
      );
    }

    for (const item of result.pendingConfirmations) {
      const itemPayload = this.recordValue(item.payload)
        ? (item.payload as Record<string, unknown>)
        : {};
      const checkpointId =
        this.positiveNumber(itemPayload.checkpointId) ??
        this.positiveNumber(itemPayload.resumeCheckpointId) ??
        result.runtime?.checkpointId ??
        null;
      const schemaPayload = this.approvalSchemaService().enrichPayload({
        actionType: item.actionType,
        summary: item.summary,
        riskLevel: item.riskLevel,
        payload: {
          approvalId: item.id,
          checkpointId,
          actionType: item.actionType,
          riskLevel: item.riskLevel,
          ...itemPayload,
        },
      });
      const schema = schemaPayload.socialCodexApproval as
        | { title?: string; detail?: string }
        | undefined;
      await writer(
        'approval.required',
        'approval',
        schema?.title || '执行这个动作前需要你确认',
        {
          state: 'waiting',
          detail: schema?.detail || item.summary,
          payload: schemaPayload,
        },
      );
    }
  }

  private shouldEmitSafetyProcess(result: UserFacingAgentResponse): boolean {
    if (result.safeStatus.blocked) return true;
    if (result.safeStatus.level !== 'low') return true;
    if (result.safeStatus.requiredConfirmations.length > 0) return true;
    if (result.pendingConfirmations.length > 0) return true;
    return result.cards.some(
      (card) =>
        this.isCandidateCard(card) ||
        this.isActivityCard(card) ||
        this.cardSchemaType(card) === 'safety.approval' ||
        this.cardSchemaType(card) === 'meet_loop.timeline',
    );
  }

  stageFromStep(label: string): SocialAgentEventV2Stage {
    return this.stepProcessFromLabel(label).stage;
  }

  private async shouldEmitProfileGate(
    userId: number,
    input: {
      text?: string | null;
      taskId?: number | null;
      threadId?: string | number | null;
    },
  ): Promise<boolean> {
    if (this.hasExplicitSocialExecutionIntent(input.text)) return true;
    const taskId =
      this.positiveNumber(input.taskId) ?? this.positiveNumber(input.threadId);
    if (!taskId || !this.contextHydrator) return false;
    const context = await this.contextHydrator
      .hydrateContext({
        userId,
        taskId,
        threadId: input.threadId ?? taskId,
      })
      .catch(() => null);
    const slots = context?.taskSlots;
    if (!slots || typeof slots !== 'object') return false;
    return ['activity', 'time_window', 'location_text', 'geo_area'].some(
      (key) =>
        Boolean(
          this.recordValue((slots as Record<string, unknown>)[key])?.value,
        ),
    );
  }

  private hasExplicitSocialExecutionIntent(text: unknown): boolean {
    const normalized =
      typeof text === 'string' ? text.trim().toLowerCase() : '';
    if (!normalized) return false;
    if (
      /(找人|找.*搭子|搭子|约练|约人|约局|活动|认识新朋友|匹配|推荐.*人|候选|加好友|发邀请|邀请|发布到发现|发到发现|discover|meet)/i.test(
        normalized,
      )
    ) {
      return true;
    }
    const hasActivity =
      /(散步|跑步|羽毛球|篮球|健身|徒步|爬山|骑行|游泳|瑜伽|飞盘|网球|乒乓|咖啡|吃饭|电影)/i.test(
        normalized,
      );
    const hasTime =
      /(周末|今天|明天|今晚|上午|下午|晚上|中午|早上|[0-9一二三四五六七八九十]+点)/i.test(
        normalized,
      );
    const hasPlace =
      /(附近|大学|公园|商场|体育馆|健身房|校区|区|市|青岛|上海|北京|深圳|广州|杭州|成都|武汉|南京)/i.test(
        normalized,
      );
    return hasActivity && hasTime && hasPlace;
  }

  private toolTypeForStatus(
    status: 'pending' | 'running' | 'done' | 'failed',
  ): SocialAgentEventV2Type {
    if (status === 'done') return 'tool.done';
    if (status === 'failed') return 'run.failed';
    return status === 'pending' ? 'tool.started' : 'tool.progress';
  }

  private lightStatusFromStep(label: string): string {
    return this.stepProcessFromLabel(label).title;
  }

  private stepProcessFromLabel(label: string): {
    stage: SocialAgentEventV2Stage;
    title: string;
  } {
    if (/确认|审批|approval|confirm/i.test(label)) {
      return { stage: 'approval', title: '发送邀请前需要你确认' };
    }
    if (/安全|边界|隐私|权限|guardrail|risk|sandbox/i.test(label)) {
      return { stage: 'safety_filter', title: '正在检查安全边界' };
    }
    if (/开场白|邀请文案|邀约文案|破冰|打招呼|opener/i.test(label)) {
      return { stage: 'generate_opener', title: '正在生成开场白' };
    }
    if (/排序|评分|优先级|时间|排除|rank|score/i.test(label)) {
      return { stage: 'rank_candidates', title: '正在整理合适选项' };
    }
    if (/筛选|候选|匹配|搜索|search|candidate|match/i.test(label)) {
      return {
        stage: 'search_candidates',
        title: '正在筛选公开可发现的人',
      };
    }
    if (/Life Graph|画像|profile/i.test(label)) {
      return { stage: 'profile_gate', title: '正在读取你的偏好' };
    }
    if (/活动|约练|约局|activity|meet/i.test(label)) {
      return { stage: 'create_opportunity_card', title: '正在补齐约练卡' };
    }
    return { stage: 'detect_social_intent', title: '正在理解你的需求' };
  }

  private runCompletionDisplay(lifecycle: string): {
    stage: SocialAgentEventV2Stage;
    title: string;
    detail?: string;
    state: 'done' | 'waiting';
  } {
    switch (lifecycle) {
      case 'waiting_confirmation':
        return {
          stage: 'approval',
          title: '发送邀请前需要你确认',
          detail: '确认前不会发布、触达对方或公开敏感信息。',
          state: 'waiting',
        };
      case 'searching_candidates':
        return {
          stage: 'search_candidates',
          title: '已筛选公开可发现的人',
          detail: '只使用公开资料、公开动态、活动报名和公开约练意图。',
          state: 'done',
        };
      case 'showing_candidates':
        return {
          stage: 'rank_candidates',
          title: '已整理合适机会',
          detail: '你可以查看详情、保存候选，或在确认后发送邀请。',
          state: 'done',
        };
      case 'activity_planning':
        return {
          stage: 'create_opportunity_card',
          title: '已整理约练卡',
          detail: '发布到发现或发送邀请前都会先让你确认。',
          state: 'done',
        };
      case 'messaging_candidate':
        return {
          stage: 'generate_opener',
          title: '已准备开场白',
          detail: '发送前仍需要你确认对方可见内容。',
          state: 'done',
        };
      case 'profile_building':
      case 'profile_saved':
        return {
          stage: 'life_graph_writeback',
          title: '已整理画像变化建议',
          detail: '只会保留稳定偏好；敏感信息会继续等待你确认。',
          state: 'done',
        };
      case 'workflow_guiding':
        return {
          stage: 'slot_filling',
          title: '已整理需要补充的信息',
          detail: '已回答的信息不会重复追问，除非你主动修改。',
          state: 'done',
        };
      case 'error_recovery':
        return {
          stage: 'detect_social_intent',
          title: '连接中断了，可以继续',
          detail: '这段需求还在，可以直接继续；刚才没有执行任何高风险动作。',
          state: 'done',
        };
      case 'casual_chatting':
      case 'idle':
      default:
        return {
          stage: 'detect_social_intent',
          title: '已理解你的需求',
          detail: '我会继续沿用当前对话上下文。',
          state: 'done',
        };
    }
  }

  private async previousSlotEventValues(
    userId: number,
    taskId: number,
  ): Promise<Map<string, string>> {
    const values = new Map<string, string>();
    const events = await this.eventStore
      ?.listSocialCodexEventsByTask(taskId, userId, { take: 2000 })
      .catch(() => []);
    for (const event of events ?? []) {
      if (event.type !== 'slot.completed' && event.type !== 'slot.filled') {
        continue;
      }
      const slots = this.recordValue(event.payload?.slots);
      if (!slots) continue;
      for (const [key, slot] of Object.entries(slots)) {
        const value = this.recordValue(slot)?.value;
        const displayValue = this.displayString(value);
        if (displayValue) values.set(key, displayValue);
      }
    }
    return values;
  }

  private pickSlots(
    slots: SocialAgentTaskSlots | Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(slots, key)) {
        out[key] = (slots as Record<string, unknown>)[key];
      }
    }
    return out;
  }

  private visibleSlotPriority(key: string): number {
    const priority: Record<string, number> = {
      time_window: 1,
      activity: 2,
      location_text: 3,
      candidate_preference: 4,
      geo_area: 5,
      safety_boundary: 6,
      visibility: 7,
      invite_tone: 8,
      intensity: 9,
    };
    return priority[key] ?? 99;
  }

  private valuesDetail(values: Record<string, unknown>): string {
    return Object.values(values)
      .map((value) => this.displayString(value))
      .filter(Boolean)
      .slice(0, 4)
      .join('、');
  }

  private slotValueEntries(
    slots: SocialAgentTaskSlots | Record<string, unknown>,
  ): Array<[string, unknown]> {
    const entries: Array<[string, unknown]> = [];
    for (const [key, slot] of Object.entries(
      slots as Record<string, unknown>,
    )) {
      const record = this.recordValue(slot);
      if (!record || !Object.prototype.hasOwnProperty.call(record, 'value')) {
        continue;
      }
      entries.push([key, record.value]);
    }
    return entries;
  }

  private isCandidateCard(card: unknown): boolean {
    return this.isCanonicalToolUiCard(card, 'social_match.candidate');
  }

  private isActivityCard(card: unknown): boolean {
    return this.isCanonicalToolUiCard(card, 'social_match.activity');
  }

  private isOpportunityCard(card: unknown): boolean {
    if (!this.isCanonicalToolUiCard(card, 'social_match.activity')) {
      return false;
    }
    const schema = this.cardSchemaType(card);
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    return (
      schema === 'social_match.activity' &&
      Boolean(data?.opportunity || data?.opportunityCard === true)
    );
  }

  private isCanonicalToolUiCard(
    card: unknown,
    expectedSchemaType?: string,
  ): boolean {
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    if (!record || !data) return false;
    const schemaType = this.cardSchemaType(card);
    if (!schemaType || !FITMEET_TOOL_UI_SCHEMA_TYPES.has(schemaType)) {
      return false;
    }
    if (expectedSchemaType && schemaType !== expectedSchemaType) {
      return false;
    }
    const schemaVersion =
      this.stringValue(record.schemaVersion) ||
      this.stringValue(data.schemaVersion);
    if (schemaVersion !== FITMEET_TOOL_UI_SCHEMA_VERSION) {
      return false;
    }
    const dataSchemaType = this.stringValue(data.schemaType);
    if (dataSchemaType && dataSchemaType !== schemaType) {
      return false;
    }
    return Boolean(this.stringValue(data.schemaName) || dataSchemaType);
  }

  private cardType(card: unknown): string {
    const record = this.recordValue(card);
    return this.stringValue(record?.type);
  }

  private cardSchemaType(card: unknown): string {
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    return (
      this.stringValue(record?.schemaType) || this.stringValue(data?.schemaType)
    );
  }

  private cardTitle(card: unknown): string {
    const record = this.recordValue(card);
    const data = this.recordValue(record?.data);
    const opportunity = this.recordValue(data?.opportunity);
    return (
      this.stringValue(record?.title) ||
      this.stringValue(data?.title) ||
      this.stringValue(opportunity?.title)
    );
  }

  private cardId(card: unknown): string | null {
    const record = this.recordValue(card);
    return this.stringValue(record?.id) || null;
  }

  private eventService(): SocialAgentEventV2Service {
    return this.eventV2 ?? this.fallbackEventV2;
  }

  private approvalSchemaService(): SocialCodexApprovalSchemaService {
    return this.approvalSchema ?? new SocialCodexApprovalSchemaService();
  }

  private recordValue(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private positiveNumber(value: unknown): number | null {
    return parseSocialAgentThreadTaskId(value);
  }

  private publicResumeCursor(value: unknown): Record<string, unknown> | null {
    const cursor = this.recordValue(value);
    if (!cursor) return null;
    const out: Record<string, unknown> = {};
    const threadId = this.stringValue(cursor.threadId);
    const action = this.stringValue(cursor.action);
    const stepId = this.stringValue(cursor.stepId);
    const checkpointId = this.positiveNumber(cursor.checkpointId);
    const parentCheckpointId = this.positiveNumber(cursor.parentCheckpointId);
    if (threadId) out.threadId = threadId;
    if (checkpointId) out.checkpointId = checkpointId;
    out.parentCheckpointId = parentCheckpointId;
    if (action) out.action = action;
    if (stepId) out.stepId = stepId;
    return out;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? cleanDisplayText(value, '').trim() : '';
  }

  private displayString(value: unknown): string {
    if (typeof value === 'string') return cleanDisplayText(value, '').trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    const record = this.recordValue(value);
    if (!record) return '';
    return (
      this.stringValue(record.value) ||
      this.stringValue(record.title) ||
      this.stringValue(record.label) ||
      this.stringValue(record.name)
    );
  }
}
