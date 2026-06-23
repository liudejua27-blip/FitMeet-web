import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { cleanDisplayText } from '../common/display-text.util';

export interface SocialAgentTokenBudgetContextPackerInput {
  userMessage: string;
  intent?: string | null;
  route?: Record<string, unknown> | null;
  conversationHistory?: Array<Record<string, unknown>>;
  memoryContext?: Record<string, unknown> | null;
  taskContext?: Record<string, unknown> | null;
  plannerDecision?: Record<string, unknown> | null;
  toolResults?: unknown[];
  searchResults?: Record<string, unknown> | null;
  agentState?: string | null;
  safetyRules?: string[];
  responseGoal?: string | null;
  fallbackReply: string;
}

export type SocialAgentTokenBudgetPackResult = {
  payload: Record<string, unknown>;
  promptBudget: {
    policy: 'token_budget_context_packer_v1';
    budgetMode: SocialAgentTokenBudgetMode;
    conversationTurns: number;
    contextTurnLimit: number;
    approxPromptChars: number;
    maxApproxPromptChars: number;
    budgetApplied: boolean;
    truncatedSections: string[];
    promptPrefixHash: string | null;
    dynamicContextHash: string;
  };
};

export type SocialAgentTokenBudgetContextPackOptions = {
  promptPrefix?: string | null;
  budgetMode?: SocialAgentTokenBudgetMode;
};

export type SocialAgentTokenBudgetMode = 'standard' | 'strict';

type SlotConfirmation = 'user_confirmed' | 'inferred_context';

type SlotEntry = {
  value: string;
  confirmation: SlotConfirmation;
  state?: string;
};

const DEFAULT_CONTEXT_TURNS = 40;
const MIN_CONTEXT_TURNS = 20;
const MAX_CONTEXT_TURNS = 80;
const DEFAULT_STRICT_CONTEXT_TURNS = 8;
const MIN_STRICT_CONTEXT_TURNS = 4;
const MAX_STRICT_CONTEXT_TURNS = 20;
const COMPACT_TEXT_LIMIT = 900;
const COMPACT_ARRAY_LIMIT = 12;
const COMPACT_DEPTH_LIMIT = 4;
const DEFAULT_MAX_PROMPT_CHARS = 24000;
const DEFAULT_STRICT_MAX_PROMPT_CHARS = 12000;
const MIN_MAX_PROMPT_CHARS = 4000;
const MAX_MAX_PROMPT_CHARS = 120000;
const MAX_STRICT_PROMPT_CHARS = 24000;

@Injectable()
export class SocialAgentTokenBudgetContextPackerService {
  constructor(@Optional() private readonly config?: ConfigService) {}

  packFinalResponseInput(
    input: SocialAgentTokenBudgetContextPackerInput,
    options: SocialAgentTokenBudgetContextPackOptions = {},
  ): SocialAgentTokenBudgetPackResult {
    const budgetMode = options.budgetMode ?? this.defaultBudgetMode();
    const conversationHistory = this.compactConversationHistory(
      input.conversationHistory,
      budgetMode,
    );
    const memoryContext = this.compactAgentContext(input.memoryContext);
    const taskContext = this.compactAgentContext(input.taskContext);
    const toolResults = this.compactToolResults(input.toolResults ?? []);
    const searchResults = this.compactSearchResults(input.searchResults);
    const plannerDecision = this.compactPlannerDecision(input.plannerDecision);
    const route = this.compactRoute(input.route);
    const rawPayload = {
      userMessage: cleanDisplayText(input.userMessage, ''),
      intent: input.intent ?? input.route?.intent ?? null,
      route,
      conversationHistory,
      memoryContext,
      taskContext,
      knownTaskSlotConstraints: this.taskSlotConstraints(input),
      plannerDecision,
      toolResults,
      searchResults,
      agentState: input.agentState ?? null,
      safetyRules:
        input.safetyRules && input.safetyRules.length > 0
          ? input.safetyRules
          : this.defaultSafetyRules(),
      responseGoal: input.responseGoal ?? null,
      fallbackReply: input.fallbackReply,
    };
    const budgeted = this.fitPayloadToBudget(rawPayload, budgetMode);
    const payload = budgeted.payload;
    const promptBudget = {
      policy: 'token_budget_context_packer_v1' as const,
      budgetMode,
      conversationTurns: Array.isArray(payload.conversationHistory)
        ? payload.conversationHistory.length
        : 0,
      contextTurnLimit: this.contextTurnLimit(budgetMode),
      approxPromptChars: budgeted.approxPromptChars,
      maxApproxPromptChars: budgeted.maxApproxPromptChars,
      budgetApplied: budgeted.truncatedSections.length > 0,
      truncatedSections: budgeted.truncatedSections,
      promptPrefixHash: options.promptPrefix
        ? this.hashStableString(options.promptPrefix)
        : null,
      dynamicContextHash: this.hashStableValue(payload),
    };
    return {
      payload: {
        ...payload,
        promptBudget,
      },
      promptBudget,
    };
  }

  knownSlots(
    input: SocialAgentTokenBudgetContextPackerInput,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, slot] of Object.entries(this.slotEntries(input))) {
      out[key] = slot.value;
    }
    return out;
  }

  private fitPayloadToBudget(
    payload: Record<string, unknown>,
    budgetMode: SocialAgentTokenBudgetMode,
  ): {
    payload: Record<string, unknown>;
    approxPromptChars: number;
    maxApproxPromptChars: number;
    truncatedSections: string[];
  } {
    const maxApproxPromptChars = this.maxApproxPromptChars(budgetMode);
    let current = this.clonePlainRecord(payload);
    const truncatedSections: string[] = [];
    const seenSections = new Set<string>();
    const approx = () => JSON.stringify(current).length;
    const mark = (section: string) => {
      if (seenSections.has(section)) return;
      seenSections.add(section);
      truncatedSections.push(section);
    };
    const apply = (
      section: string,
      transform: (value: Record<string, unknown>) => Record<string, unknown>,
    ) => {
      if (approx() <= maxApproxPromptChars) return;
      const before = approx();
      current = transform(current);
      if (approx() < before) mark(section);
    };

    apply('conversationHistory:last12', (value) =>
      this.trimTopLevelArray(value, 'conversationHistory', 12),
    );
    apply('toolResults:last6', (value) =>
      this.trimTopLevelArray(value, 'toolResults', 6),
    );
    apply('conversationHistory:last6', (value) =>
      this.trimTopLevelArray(value, 'conversationHistory', 6),
    );
    apply('toolResults:last3', (value) =>
      this.trimTopLevelArray(value, 'toolResults', 3),
    );
    apply('searchResults:top2', (value) =>
      this.trimSearchResultArrays(value, 2),
    );
    apply('searchResults:top1', (value) =>
      this.trimSearchResultArrays(value, 1),
    );
    apply('memoryContext:arrays3', (value) =>
      this.trimNestedArraysInSection(value, 'memoryContext', 3),
    );
    apply('taskContext:arrays3', (value) =>
      this.trimNestedArraysInSection(value, 'taskContext', 3),
    );
    apply('text:420', (value) => this.trimNestedText(value, 420));
    apply('toolResults:empty', (value) =>
      this.trimTopLevelArray(value, 'toolResults', 0),
    );
    apply('conversationHistory:last4', (value) =>
      this.trimTopLevelArray(value, 'conversationHistory', 4),
    );
    apply('searchResults:empty', (value) => ({
      ...value,
      searchResults: null,
    }));
    apply('conversationHistory:last2', (value) =>
      this.trimTopLevelArray(value, 'conversationHistory', 2),
    );

    return {
      payload: current,
      approxPromptChars: approx(),
      maxApproxPromptChars,
      truncatedSections,
    };
  }

  private clonePlainRecord(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private trimTopLevelArray(
    payload: Record<string, unknown>,
    key: string,
    limit: number,
  ): Record<string, unknown> {
    const value = payload[key];
    if (!Array.isArray(value) || value.length <= limit) return payload;
    return {
      ...payload,
      [key]: limit <= 0 ? [] : value.slice(-limit),
    };
  }

  private trimSearchResultArrays(
    payload: Record<string, unknown>,
    limit: number,
  ): Record<string, unknown> {
    const searchResults = this.isRecord(payload.searchResults)
      ? payload.searchResults
      : null;
    if (!searchResults) return payload;
    const next = { ...searchResults };
    for (const key of ['candidates', 'candidateCards', 'activityResults']) {
      if (Array.isArray(next[key]) && next[key].length > limit) {
        next[key] = next[key].slice(0, limit);
      }
    }
    return {
      ...payload,
      searchResults: next,
    };
  }

  private trimNestedArraysInSection(
    payload: Record<string, unknown>,
    key: string,
    limit: number,
  ): Record<string, unknown> {
    if (!this.isRecord(payload[key])) return payload;
    return {
      ...payload,
      [key]: this.trimNestedArrays(payload[key], limit, 0),
    };
  }

  private trimNestedArrays(
    value: unknown,
    limit: number,
    depth: number,
  ): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (depth >= COMPACT_DEPTH_LIMIT) return value;
    if (Array.isArray(value)) {
      return value
        .slice(0, limit)
        .map((item) => this.trimNestedArrays(item, limit, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      out[key] = this.trimNestedArrays(raw, limit, depth + 1);
    }
    return out;
  }

  private trimNestedText(
    payload: Record<string, unknown>,
    limit: number,
  ): Record<string, unknown> {
    return this.trimTextValue(payload, limit, 0) as Record<string, unknown>;
  }

  private trimTextValue(value: unknown, limit: number, depth: number): unknown {
    if (typeof value === 'string') return this.compactShortText(value, limit);
    if (value === null || value === undefined || typeof value !== 'object') {
      return value;
    }
    if (depth >= COMPACT_DEPTH_LIMIT) return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.trimTextValue(item, limit, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      out[key] = this.trimTextValue(raw, limit, depth + 1);
    }
    return out;
  }

  private compactConversationHistory(
    history?: Array<Record<string, unknown>>,
    budgetMode: SocialAgentTokenBudgetMode = 'standard',
  ): Array<Record<string, unknown>> {
    const safeHistory = Array.isArray(history) ? history : [];
    const turns = safeHistory
      .slice(-this.contextTurnLimit(budgetMode))
      .map((turn) => ({
        role: cleanDisplayText(turn.role, ''),
        text: this.compactText(turn.text ?? turn.content),
      }))
      .filter((turn) => turn.role && turn.text)
      .filter((turn) => !this.isProcessOnlyAssistantTurn(turn));
    const deduped: Array<Record<string, unknown>> = [];
    for (const turn of turns) {
      const last = deduped.at(-1);
      if (last?.role === turn.role && last?.text === turn.text) continue;
      deduped.push(turn);
    }
    return deduped;
  }

  private isProcessOnlyAssistantTurn(turn: {
    role: string;
    text: string;
  }): boolean {
    if (turn.role !== 'assistant') return false;
    return /^(正在|已记录|已记住|正在理解|正在整理|正在检查|正在筛选|查看过程|已确认需要补充的信息|可以继续处理|刚才连接中断|这次处理没有完成)/.test(
      turn.text,
    );
  }

  private compactRoute(
    route?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!route) return null;
    return this.compactModelContext({
      intent: route.intent,
      confidence: route.confidence,
      entities: route.entities,
      shouldSearch: route.shouldSearch,
      shouldReplan: route.shouldReplan,
      shouldUpdateProfile: route.shouldUpdateProfile,
      shouldExecuteAction: route.shouldExecuteAction,
      replyStrategy: route.replyStrategy,
      source: route.source,
    });
  }

  private compactPlannerDecision(
    decision?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!decision) return null;
    return this.compactModelContext({
      intent: decision.intent,
      responseGoal: decision.responseGoal,
      shouldCallTools: decision.shouldCallTools,
      plannedTools: decision.plannedTools,
      nextStep: decision.nextStep,
      reason: decision.reason,
      taskId: decision.taskId,
    });
  }

  private compactToolResults(results: unknown[]): unknown[] {
    return results
      .filter((item) => item !== null && item !== undefined)
      .slice(-COMPACT_ARRAY_LIMIT)
      .map((item) => this.compactToolResult(item));
  }

  private compactSearchResults(
    searchResults?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!searchResults) return null;
    return (
      this.compactResultContainer(searchResults) ??
      this.compactModelContext(searchResults)
    );
  }

  private compactAgentContext<T>(value: T): T {
    if (!this.isRecord(value)) return this.compactModelContext(value);
    const out = this.compactModelContext(value) as Record<string, unknown>;
    const taskMemory = this.isRecord(value.taskMemory)
      ? value.taskMemory
      : null;
    if (taskMemory) {
      out.taskMemory = this.compactAgentContext(taskMemory);
    }
    for (const key of [
      'lifeGraphSummary',
      'lifeGraphMemory',
      'longTermMemory',
      'memoryFacts',
    ]) {
      const summary = this.compactLifeGraphContext(
        this.valueAtPath(value, key),
      );
      if (summary) out[key] = summary;
    }
    const factSummaries = this.compactLifeGraphFactSummaries(
      this.readArrayField(value, [
        'lifeGraphFactDisplaySummaries',
        'lifeGraphFactProposals',
        'lifeGraphFacts',
      ]),
    );
    if (factSummaries.length > 0) {
      out.lifeGraphFactDisplaySummaries = factSummaries;
    }
    const governance = this.compactLifeGraphGovernanceSummary(
      this.firstRecord(value, ['lifeGraphGovernanceSummary']),
    );
    if (governance) out.lifeGraphGovernanceSummary = governance;
    for (const key of [
      'pendingApprovals',
      'approvalRequiredActions',
      'pendingActions',
    ]) {
      const approvals = this.compactApprovalList(
        this.readArrayField(value, [key]),
      );
      if (approvals.length > 0) out[key] = approvals;
    }
    for (const key of [
      'meetLoopTimeline',
      'meetLoopState',
      'timeline',
      'timelineCard',
    ]) {
      const timeline = this.compactMeetLoopTimeline(
        this.valueAtPath(value, key),
      );
      if (timeline) out[key] = timeline;
    }
    return out as T;
  }

  private compactToolResult(item: unknown): unknown {
    const record = this.isRecord(item) ? item : null;
    if (!record) return this.compactModelContext(item);
    const directSummary = this.compactResultContainer(record);
    if (directSummary) {
      return this.compactModelContext({
        ...this.compactToolResultHeader(record),
        ...directSummary,
      });
    }
    for (const key of ['output', 'result', 'payload', 'data', 'searchResult']) {
      const nested = this.isRecord(record[key]) ? record[key] : null;
      if (!nested) continue;
      const nestedSummary = this.compactResultContainer(nested);
      if (!nestedSummary) continue;
      return this.compactModelContext({
        ...this.compactToolResultHeader(record),
        [key]: nestedSummary,
      });
    }
    const toolUiSummary = this.compactToolUiCard(record);
    if (toolUiSummary) {
      return this.compactModelContext({
        ...this.compactToolResultHeader(record),
        ...toolUiSummary,
      });
    }
    return this.compactModelContext(record);
  }

  private compactToolResultHeader(
    record: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...(record.name ? { name: record.name } : {}),
      ...(record.toolName ? { toolName: record.toolName } : {}),
      ...(record.status ? { status: record.status } : {}),
      ...(record.stage ? { stage: record.stage } : {}),
      ...(record.action ? { action: record.action } : {}),
    };
  }

  private compactResultContainer(
    value: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const candidates = this.readArrayField(value, [
      'candidates',
      'candidateCards',
      'candidateResults',
      'recommendedCandidates',
    ]);
    const activityResults = this.readArrayField(value, [
      'activityResults',
      'activities',
      'activityCards',
      'events',
    ]);
    if (candidates.length === 0 && activityResults.length === 0) {
      return null;
    }
    return {
      summaryPolicy: 'candidate_result_summary_v1',
      ...(candidates.length > 0
        ? {
            totalCandidates: candidates.length,
            candidates: candidates
              .slice(0, 3)
              .map((candidate) => this.compactCandidateSummary(candidate)),
          }
        : {}),
      ...(activityResults.length > 0
        ? {
            totalActivities: activityResults.length,
            activityResults: activityResults
              .slice(0, 3)
              .map((activity) => this.compactActivitySummary(activity)),
          }
        : {}),
      ...(value.emptyReason ? { emptyReason: value.emptyReason } : {}),
      ...(value.nextStep ? { nextStep: value.nextStep } : {}),
      ...(value.userVisibleSummary
        ? { userVisibleSummary: this.compactText(value.userVisibleSummary) }
        : {}),
    };
  }

  private compactToolUiCard(
    value: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const schemaType = this.firstText(value, ['schemaType', 'type']);
    if (
      schemaType === 'life_graph.diff' ||
      schemaType === 'life_graph_update'
    ) {
      const lifeGraph = this.compactLifeGraphContext(
        value.data ?? value.payload ?? value,
      );
      return lifeGraph
        ? {
            summaryPolicy: 'tool_ui_card_summary_v1',
            schemaType,
            title: this.firstText(value, ['title']),
            status: this.firstValue(value, ['status']),
            lifeGraph,
          }
        : null;
    }
    if (schemaType === 'safety.approval' || /approval/i.test(schemaType)) {
      const approval = this.compactApprovalSummary(
        value.data ?? value.payload ?? value,
      );
      return approval
        ? {
            summaryPolicy: 'tool_ui_card_summary_v1',
            schemaType,
            title: this.firstText(value, ['title']),
            status: this.firstValue(value, ['status']),
            approval,
          }
        : null;
    }
    if (schemaType === 'meet_loop.timeline' || /meet_loop/i.test(schemaType)) {
      const timeline = this.compactMeetLoopTimeline(
        value.data ?? value.payload ?? value,
      );
      return timeline
        ? {
            summaryPolicy: 'tool_ui_card_summary_v1',
            schemaType,
            title: this.firstText(value, ['title']),
            status: this.firstValue(value, ['status']),
            meetLoopTimeline: timeline,
          }
        : null;
    }
    return null;
  }

  private compactLifeGraphContext(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!this.isRecord(value)) return null;
    const preferences = this.compactNamedValueRecord(
      this.firstRecord(value, ['preferences', 'stablePreferences', 'facts']),
      8,
    );
    const facts = this.compactLifeGraphFactSummaries(
      this.readArrayField(value, ['facts', 'stableFacts', 'items']),
    );
    const boundaries = this.compactTextList([
      ...this.readArrayField(value, [
        'boundaries',
        'safetyBoundaries',
        'boundaryNotes',
      ]),
      this.firstText(value, ['safetyBoundary', 'socialBoundary']),
    ]).slice(0, 5);
    const evidence = this.compactTextList(
      this.readArrayField(value, ['evidence', 'sourceSummaries']),
    ).slice(0, 3);
    const out = {
      summaryPolicy: 'life_graph_prompt_summary_v1',
      ...(Object.keys(preferences).length > 0 ? { preferences } : {}),
      ...(facts.length > 0 ? { facts: facts.slice(0, 5) } : {}),
      ...(boundaries.length > 0 ? { boundaries } : {}),
      ...(evidence.length > 0 ? { evidence } : {}),
      ...(this.firstValue(value, ['updatedAt', 'lastUpdatedAt'])
        ? { updatedAt: this.firstValue(value, ['updatedAt', 'lastUpdatedAt']) }
        : {}),
    };
    return Object.keys(out).length > 1 ? out : null;
  }

  private compactLifeGraphFactSummaries(values: unknown[]): unknown[] {
    return values
      .filter((item) => item !== null && item !== undefined)
      .slice(0, 5)
      .map((item) => {
        const record = this.isRecord(item) ? item : {};
        return this.compactModelContext({
          key: this.firstValue(record, ['key', 'factKey', 'id']),
          title: this.firstText(record, ['title', 'label', 'name']),
          value: this.compactShortText(
            this.firstValue(record, [
              'value',
              'summary',
              'text',
              'description',
            ]),
            220,
          ),
          confidence: this.firstValue(record, ['confidence']),
          sensitivity: this.firstValue(record, [
            'sensitivity',
            'sensitivityLevel',
          ]),
          expiresAt: this.firstValue(record, ['expiresAt']),
          status: this.firstValue(record, ['status']),
        });
      });
  }

  private compactLifeGraphGovernanceSummary(
    value?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!value) return null;
    return this.compactModelContext({
      total: value.total,
      autoSaveCount: value.autoSaveCount,
      confirmationRequiredCount: value.confirmationRequiredCount,
      blockedCount: value.blockedCount,
      sensitiveCount: value.sensitiveCount,
      expiringFactKeys: Array.isArray(value.expiringFactKeys)
        ? value.expiringFactKeys.slice(0, 5)
        : undefined,
    });
  }

  private compactApprovalList(values: unknown[]): unknown[] {
    return values
      .filter((item) => item !== null && item !== undefined)
      .slice(0, 5)
      .map((item) => this.compactApprovalSummary(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  private compactApprovalSummary(
    value: unknown,
  ): Record<string, unknown> | null {
    const record = this.isRecord(value) ? value : {};
    const out = this.compactModelContext({
      approvalId: this.firstValue(record, ['approvalId', 'id']),
      actionType: this.firstText(record, [
        'actionType',
        'action',
        'type',
        'schemaAction',
      ]),
      riskLevel: this.firstValue(record, ['riskLevel', 'risk']),
      status: this.firstValue(record, ['status']),
      target: this.firstText(record, [
        'targetName',
        'displayName',
        'candidate.displayName',
        'candidate.name',
        'candidate.nickname',
      ]),
      summary: this.compactShortText(
        this.firstValue(record, ['summary', 'title', 'label', 'description']),
        220,
      ),
      visibleToOtherUser: this.compactShortText(
        this.firstValue(record, [
          'visibleToOtherUser',
          'outboundText',
          'messagePreview',
          'candidateMessage',
        ]),
        220,
      ),
      checkpointId: this.firstValue(record, ['checkpointId']),
      idempotencyKey: this.firstValue(record, ['idempotencyKey']),
    });
    return Object.keys(out).length > 0 ? out : null;
  }

  private compactMeetLoopTimeline(
    value: unknown,
  ): Record<string, unknown> | null {
    const record = this.isRecord(value) ? value : {};
    const timelineSource =
      this.isRecord(record.timeline) || Array.isArray(record.timeline)
        ? record.timeline
        : value;
    const steps = Array.isArray(timelineSource)
      ? timelineSource
      : this.readArrayField(
          this.isRecord(timelineSource) ? timelineSource : {},
          ['steps', 'items', 'events', 'timeline'],
        );
    const compactSteps = steps.slice(0, 6).map((step) => {
      const item = this.isRecord(step) ? step : {};
      return this.compactModelContext({
        key: this.firstValue(item, ['key', 'id', 'stage']),
        title: this.firstText(item, ['title', 'label', 'name', 'stage']),
        state: this.firstValue(item, ['state', 'status']),
        detail: this.compactShortText(
          this.firstValue(item, ['detail', 'summary', 'description']),
          180,
        ),
        at: this.firstValue(item, ['at', 'createdAt', 'updatedAt']),
      });
    });
    const currentStage = this.firstValue(record, [
      'currentStage',
      'stage',
      'status',
      'timeline.currentStage',
    ]);
    const nextAction = this.firstValue(record, [
      'nextAction',
      'recommendedNextAction',
      'timeline.nextAction',
    ]);
    const out = {
      summaryPolicy: 'meet_loop_prompt_summary_v1',
      ...(currentStage ? { currentStage } : {}),
      ...(nextAction ? { nextAction } : {}),
      ...(compactSteps.length > 0 ? { steps: compactSteps } : {}),
    };
    return Object.keys(out).length > 1 ? out : null;
  }

  private compactNamedValueRecord(
    record?: Record<string, unknown> | null,
    limit = 8,
  ): Record<string, unknown> {
    if (!record) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record).slice(0, limit)) {
      const compacted = this.compactShortText(value, 180);
      if (!compacted) continue;
      out[key] = compacted;
    }
    return out;
  }

  private compactCandidateSummary(candidate: unknown): Record<string, unknown> {
    const record = this.isRecord(candidate) ? candidate : {};
    const scoreBreakdown = this.compactScoreBreakdown(
      this.firstRecord(record, [
        'scoreBreakdown',
        'matchScoreBreakdown',
        'rankingBreakdown',
      ]),
    );
    return this.compactModelContext({
      candidateRecordId: this.firstValue(record, [
        'candidateRecordId',
        'socialRequestCandidateId',
        'id',
      ]),
      candidateUserId: this.firstValue(record, [
        'candidateUserId',
        'targetUserId',
        'userId',
        'profile.userId',
        'user.id',
      ]),
      displayName: this.firstText(record, [
        'displayName',
        'nickname',
        'name',
        'profile.name',
        'user.nickname',
      ]),
      city: this.firstText(record, ['city', 'profile.city', 'location.city']),
      locationText: this.firstText(record, [
        'locationText',
        'profile.locationText',
        'geoArea',
      ]),
      matchScore: this.firstValue(record, ['matchScore', 'score']),
      level: this.firstValue(record, ['level', 'matchLevel']),
      interestTags: this.compactTextList([
        ...this.readArrayField(record, [
          'interestTags',
          'activityTags',
          'tags',
        ]),
        ...this.readArrayField(record, [
          'commonTags',
          'sharedInterests',
          'profile.interestTags',
        ]),
      ]).slice(0, 5),
      matchReasons: this.compactTextList([
        ...this.readArrayField(record, [
          'matchReasons',
          'reasons',
          'reasonTags',
          'explanations',
        ]),
        this.firstText(record, [
          'recommendedReason',
          'matchReason',
          'explanation',
          'summary',
        ]),
      ]).slice(0, 4),
      preferenceHistorySignals: this.compactTextList(
        this.readArrayField(record, ['preferenceHistorySignals']),
      ).slice(0, 3),
      safetyNotes: this.compactTextList([
        ...this.readArrayField(record, [
          'safetyNotes',
          'riskWarnings',
          'warnings',
          'boundaries',
        ]),
        this.firstText(record, ['safetyBoundary', 'safetyNote']),
      ]).slice(0, 2),
      suggestedOpener: this.compactShortText(
        this.firstValue(record, [
          'suggestedOpener',
          'openerDraft',
          'openingLine',
        ]),
        180,
      ),
      scoreBreakdown:
        Object.keys(scoreBreakdown).length > 0 ? scoreBreakdown : undefined,
      publicIntentId: this.firstValue(record, [
        'publicIntentId',
        'socialRequestId',
      ]),
      activityId: this.firstValue(record, ['activityId']),
    });
  }

  private compactActivitySummary(activity: unknown): Record<string, unknown> {
    const record = this.isRecord(activity) ? activity : {};
    return this.compactModelContext({
      activityId: this.firstValue(record, ['activityId', 'id']),
      title: this.firstText(record, ['title', 'name']),
      activity: this.firstText(record, ['activity', 'activityType', 'type']),
      timeWindow: this.firstText(record, [
        'timeWindow',
        'time_window',
        'startTime',
      ]),
      city: this.firstText(record, ['city', 'location.city']),
      locationText: this.firstText(record, ['locationText', 'location.name']),
      tags: this.compactTextList(
        this.readArrayField(record, ['tags', 'activityTags', 'interestTags']),
      ).slice(0, 5),
      reasons: this.compactTextList([
        ...this.readArrayField(record, ['reasons', 'matchReasons']),
        this.firstText(record, ['summary', 'reason']),
      ]).slice(0, 4),
      safetyNotes: this.compactTextList([
        ...this.readArrayField(record, ['safetyNotes', 'warnings']),
        this.firstText(record, ['safetyBoundary']),
      ]).slice(0, 2),
    });
  }

  private compactScoreBreakdown(
    scoreBreakdown?: Record<string, unknown> | null,
  ): Record<string, unknown> {
    if (!scoreBreakdown) return {};
    const out: Record<string, unknown> = {};
    for (const key of [
      'behaviorPreference',
      'lifeGraphBehaviorFit',
      'interestSimilarity',
      'timeOverlap',
      'distance',
      'distanceKm',
      'safetyRisk',
      'score',
    ]) {
      const value = scoreBreakdown[key];
      if (value === undefined || value === null || value === '') continue;
      out[key] = value;
    }
    return out;
  }

  private compactTextList(values: unknown[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values.flat()) {
      const text =
        typeof raw === 'string'
          ? this.compactShortText(raw, 160)
          : this.isRecord(raw)
            ? this.compactShortText(
                raw.label ?? raw.name ?? raw.title ?? raw.reason ?? raw.text,
                160,
              )
            : '';
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  }

  private readArrayField(
    record: Record<string, unknown>,
    keys: string[],
  ): unknown[] {
    for (const key of keys) {
      const value = this.valueAtPath(record, key);
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  private firstRecord(
    record: Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> | null {
    for (const key of keys) {
      const value = this.valueAtPath(record, key);
      if (this.isRecord(value)) return value;
    }
    return null;
  }

  private firstText(record: Record<string, unknown>, keys: string[]): string {
    return this.compactShortText(this.firstValue(record, keys), 220);
  }

  private firstValue(record: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
      const value = this.valueAtPath(record, key);
      if (value === undefined || value === null || value === '') continue;
      return value;
    }
    return undefined;
  }

  private valueAtPath(record: Record<string, unknown>, path: string): unknown {
    let current: unknown = record;
    for (const part of path.split('.')) {
      if (!this.isRecord(current)) return undefined;
      current = current[part];
    }
    return current;
  }

  private compactShortText(value: unknown, limit: number): string {
    const text = cleanDisplayText(value, '').trim();
    if (!text) return '';
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}…`;
  }

  private compactModelContext<T>(value: T): T {
    return this.compactValue(value, 0) as T;
  }

  private compactValue(value: unknown, depth: number): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return this.compactText(value);
    if (typeof value !== 'object') return value;
    if (depth >= COMPACT_DEPTH_LIMIT) {
      return Array.isArray(value) ? `[${value.length} items]` : '[object]';
    }
    if (Array.isArray(value)) {
      return value
        .slice(0, COMPACT_ARRAY_LIMIT)
        .map((item) => this.compactValue(item, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (this.shouldDropPromptContextKey(key)) continue;
      const compacted = this.compactValue(raw, depth + 1);
      if (compacted === undefined || compacted === '') continue;
      out[key] = compacted;
    }
    return out;
  }

  private shouldDropPromptContextKey(key: string): boolean {
    return /^(traceId|requestId|eventId|seq|stack|raw|rawJson|rawPayload|rawResponse|rawRequest|debug|internal|prompt|messages|fullConversation|httpHeaders|authorization|token|apiKey)$/i.test(
      key,
    );
  }

  private compactText(value: unknown): string {
    const text = cleanDisplayText(value, '').trim();
    if (text.length <= COMPACT_TEXT_LIMIT) return text;
    return `${text.slice(0, COMPACT_TEXT_LIMIT)}…`;
  }

  private contextTurnLimit(mode: SocialAgentTokenBudgetMode): number {
    if (mode === 'strict') {
      const configured = Number(
        this.config?.get<string>(
          'SOCIAL_AGENT_FINAL_RESPONSE_STRICT_CONTEXT_TURN_LIMIT',
        ) ??
          this.config?.get<string>(
            'SOCIAL_AGENT_DEEPSEEK_STRICT_CONTEXT_TURN_LIMIT',
          ) ??
          '',
      );
      if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_STRICT_CONTEXT_TURNS;
      }
      return Math.min(
        Math.max(Math.floor(configured), MIN_STRICT_CONTEXT_TURNS),
        MAX_STRICT_CONTEXT_TURNS,
      );
    }
    const configured = Number(
      this.config?.get<string>(
        'SOCIAL_AGENT_FINAL_RESPONSE_CONTEXT_TURN_LIMIT',
      ) ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_CONTEXT_TURN_LIMIT') ??
        '',
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_CONTEXT_TURNS;
    }
    return Math.min(
      Math.max(Math.floor(configured), MIN_CONTEXT_TURNS),
      MAX_CONTEXT_TURNS,
    );
  }

  private maxApproxPromptChars(mode: SocialAgentTokenBudgetMode): number {
    if (mode === 'strict') {
      const configured = Number(
        this.config?.get<string>(
          'SOCIAL_AGENT_FINAL_RESPONSE_STRICT_MAX_PROMPT_CHARS',
        ) ??
          this.config?.get<string>(
            'SOCIAL_AGENT_DEEPSEEK_STRICT_MAX_PROMPT_CHARS',
          ) ??
          '',
      );
      if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_STRICT_MAX_PROMPT_CHARS;
      }
      return Math.min(
        Math.max(Math.floor(configured), MIN_MAX_PROMPT_CHARS),
        MAX_STRICT_PROMPT_CHARS,
      );
    }
    const configured = Number(
      this.config?.get<string>(
        'SOCIAL_AGENT_FINAL_RESPONSE_MAX_PROMPT_CHARS',
      ) ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_MAX_PROMPT_CHARS') ??
        '',
    );
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_MAX_PROMPT_CHARS;
    }
    return Math.min(
      Math.max(Math.floor(configured), MIN_MAX_PROMPT_CHARS),
      MAX_MAX_PROMPT_CHARS,
    );
  }

  private defaultBudgetMode(): SocialAgentTokenBudgetMode {
    const configured = cleanDisplayText(
      this.config?.get<string>(
        'SOCIAL_AGENT_FINAL_RESPONSE_CONTEXT_BUDGET_MODE',
      ) ??
        this.config?.get<string>('SOCIAL_AGENT_DEEPSEEK_CONTEXT_BUDGET_MODE') ??
        '',
      '',
    )
      .trim()
      .toLowerCase();
    return configured === 'strict' ? 'strict' : 'standard';
  }

  private taskSlotConstraints(
    input: SocialAgentTokenBudgetContextPackerInput,
  ): Record<string, unknown> {
    const slots = this.slotEntries(input);
    const labels: Record<string, string> = {
      activity: '活动',
      time_window: '时间',
      location_text: '地点',
      geo_area: '区域',
      intensity: '强度',
      visibility: '公开方式',
      safety_boundary: '安全边界',
      invite_tone: '邀请语气',
      candidate_preference: '候选偏好',
    };
    const known = Object.entries(slots)
      .filter(([, slot]) => cleanDisplayText(slot.value, ''))
      .map(([key, slot]) => ({
        key,
        label: labels[key] ?? key,
        value: slot.value,
        ...(slot.state ? { state: slot.state } : {}),
        confirmation: slot.confirmation,
      }));
    return {
      treatAsHardConstraints: known.length > 0,
      knownSlots: known,
      doNotAskAgainFor: known
        .filter((slot) => slot.confirmation === 'user_confirmed')
        .map((slot) => slot.key),
      userVisibleSummary: known
        .map((slot) => `${slot.label}：${slot.value}`)
        .join('；'),
      candidatePreferencePolicy:
        'candidate_preference 只能用于公开可发现资料、公开标签或用户自愿公开信息，不能推断隐私。',
      instruction:
        '如果 knownSlots 已包含用户刚才或之前补充的信息，最终回复必须基于这些信息继续推进；除非用户主动修改，否则不要再次询问 doNotAskAgainFor 中的字段。',
    };
  }

  private slotEntries(
    input: SocialAgentTokenBudgetContextPackerInput,
  ): Record<string, SlotEntry> {
    const taskContext = this.isRecord(input.taskContext)
      ? input.taskContext
      : {};
    const taskMemory = this.isRecord(taskContext.taskMemory)
      ? taskContext.taskMemory
      : {};
    return {
      ...this.extractKnownConstraintSlotEntries(input.memoryContext),
      ...this.extractKnownConstraintSlotEntries(taskMemory),
      ...this.extractKnownConstraintSlotEntries(taskContext),
      ...this.extractSlotEntries(input.memoryContext?.taskSlots),
      ...this.extractSlotEntries(taskMemory.taskSlots),
      ...this.extractSlotEntries(taskContext.taskSlots),
    };
  }

  private extractKnownConstraintSlotEntries(
    value: unknown,
  ): Record<string, SlotEntry> {
    const source = this.isRecord(value) ? value : {};
    const constraints = this.isRecord(source.knownTaskSlotConstraints)
      ? source.knownTaskSlotConstraints
      : {};
    const knownSlots = Array.isArray(constraints.knownSlots)
      ? constraints.knownSlots
      : [];
    const doNotAskAgainFor = Array.isArray(constraints.doNotAskAgainFor)
      ? new Set(
          constraints.doNotAskAgainFor
            .map((item) => cleanDisplayText(item, ''))
            .filter(Boolean),
        )
      : new Set<string>();
    const out: Record<string, SlotEntry> = {};
    for (const rawSlot of knownSlots) {
      if (!this.isRecord(rawSlot)) continue;
      const key = cleanDisplayText(rawSlot.key, '');
      const valueText = cleanDisplayText(rawSlot.value, '');
      if (!key || !valueText) continue;
      const state = cleanDisplayText(rawSlot.state, '');
      const confirmation =
        rawSlot.confirmation === 'user_confirmed' || doNotAskAgainFor.has(key)
          ? 'user_confirmed'
          : 'inferred_context';
      out[key] = {
        value: valueText,
        confirmation,
        ...(state ? { state } : {}),
      };
    }
    return out;
  }

  private extractSlotEntries(value: unknown): Record<string, SlotEntry> {
    const slots = this.isRecord(value) ? value : {};
    const knownStates = new Set([
      'inferred',
      'answered',
      'confirmed',
      'completed',
      'modified',
    ]);
    const userConfirmedStates = new Set([
      'answered',
      'confirmed',
      'completed',
      'modified',
    ]);
    const out: Record<string, SlotEntry> = {};
    for (const key of [
      'activity',
      'time_window',
      'location_text',
      'geo_area',
      'intensity',
      'visibility',
      'safety_boundary',
      'invite_tone',
      'candidate_preference',
    ]) {
      const raw = slots[key];
      const slot = this.isRecord(raw) ? raw : {};
      const state = cleanDisplayText(slot.state, '');
      if (state && !knownStates.has(state)) continue;
      const valueText = cleanDisplayText(slot.value ?? raw, '');
      if (!valueText) continue;
      out[key] = {
        value: valueText,
        confirmation: userConfirmedStates.has(state)
          ? 'user_confirmed'
          : 'inferred_context',
        ...(state ? { state } : {}),
      };
    }
    return out;
  }

  private defaultSafetyRules(): string[] {
    return [
      '涉及私信、加好友、连接候选人、创建公开活动或公开需求时，必须遵守确认要求。',
      '不要承诺线下见面安全；提醒优先公共场所、尊重边界。',
      '不要输出骚扰、操控、越界或隐私泄露式文案。',
      '不要把推断当成事实。',
    ];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private hashStableValue(value: unknown): string {
    return this.hashStableString(this.stableStringify(value));
  }

  private hashStableString(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private stableStringify(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }
    if (typeof value === 'bigint') return JSON.stringify(value.toString());
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (typeof value === 'symbol') {
      return JSON.stringify(value.description ?? '[symbol]');
    }
    if (typeof value === 'function') return JSON.stringify('[function]');
    if (typeof value !== 'object') return JSON.stringify(null);
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`,
      )
      .join(',')}}`;
  }
}
