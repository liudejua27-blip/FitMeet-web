import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, In, Repository } from 'typeorm';

import { sanitizeForDisplay } from '../common/display-text.util';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import {
  AgentMeetLoopState,
  AgentOnlineReplaySample,
  AgentSkillPatchEffect,
  AgentSubagentMemory,
} from './entities/agent-l5-runtime.entity';

type MeetLoopStage =
  | 'invite_requested'
  | 'invite_sent'
  | 'reply_received'
  | 'rescheduled'
  | 'activity_draft_created'
  | 'activity_publish_cancelled'
  | 'activity_confirmed'
  | 'activity_checked_in'
  | 'activity_completed'
  | 'proof_submitted'
  | 'review_submitted'
  | 'trust_score_updated';

@Injectable()
export class AgentL5RuntimeService {
  private readonly logger = new Logger(AgentL5RuntimeService.name);

  constructor(
    @InjectRepository(AgentOnlineReplaySample)
    private readonly replayRepo: Repository<AgentOnlineReplaySample>,
    @InjectRepository(AgentSubagentMemory)
    private readonly subagentMemoryRepo: Repository<AgentSubagentMemory>,
    @InjectRepository(AgentMeetLoopState)
    private readonly meetLoopRepo: Repository<AgentMeetLoopState>,
    @InjectRepository(AgentSkillPatchEffect)
    private readonly patchEffectRepo: Repository<AgentSkillPatchEffect>,
  ) {}

  async recordSubagentMemory(input: {
    ownerUserId: number;
    agentTaskId?: number | null;
    agentName: FitMeetAlphaAgentName;
    memoryScope: string;
    input: Record<string, unknown>;
    plannerInput?: Record<string, unknown> | null;
    toolCalls?: Array<Record<string, unknown>> | null;
    observation: Record<string, unknown>;
    observations?: Array<Record<string, unknown>> | null;
    critique: string;
    handoffOutput: Record<string, unknown>;
    evalHints?: Record<string, unknown> | null;
  }): Promise<void> {
    const evalSnapshot = this.buildSubagentEvalSnapshot(input);
    const failureReview = this.buildSubagentFailureReview(input, evalSnapshot);
    await this.subagentMemoryRepo
      .save(
        this.subagentMemoryRepo.create({
          ownerUserId: input.ownerUserId,
          agentTaskId: input.agentTaskId ?? null,
          agentName: input.agentName,
          memoryScope: input.memoryScope,
          input: sanitizeForDisplay({
            rawInput: input.input,
            plannerInput: input.plannerInput ?? input.input,
          }) as Record<string, unknown>,
          observation: sanitizeForDisplay({
            latest: input.observation,
            observations: input.observations ?? [input.observation],
          }) as Record<string, unknown>,
          critique: {
            text: input.critique,
            evalHints: sanitizeForDisplay(input.evalHints ?? {}),
            eval: sanitizeForDisplay(evalSnapshot),
            failureReview: sanitizeForDisplay(failureReview),
          },
          handoffOutput: sanitizeForDisplay({
            ...input.handoffOutput,
            toolCalls: input.toolCalls ?? [],
            evalHints: input.evalHints ?? {},
            eval: evalSnapshot,
            failureReview,
          }) as Record<string, unknown>,
        }),
      )
      .catch((error) => this.warn('subagent_memory_write_failed', error));
  }

  async transitionMeetLoop(input: {
    ownerUserId: number;
    agentTaskId: number;
    activityId?: number | null;
    candidateUserId?: number | null;
    stage: MeetLoopStage;
    waitingFor: string;
    state: Record<string, unknown>;
    review?: Record<string, unknown> | null;
  }): Promise<AgentMeetLoopState | null> {
    const previous = await this.meetLoopRepo.findOne({
      where: { agentTaskId: input.agentTaskId },
    });
    if (previous && !this.canTransition(previous.stage, input.stage)) {
      previous.state = {
        ...(previous.state ?? {}),
        invalidTransition: {
          from: previous.stage,
          to: input.stage,
          at: new Date().toISOString(),
        },
      };
      await this.meetLoopRepo.save(previous);
      return previous;
    }
    const now = new Date().toISOString();
    const transition = {
      from: previous?.stage ?? null,
      to: input.stage,
      waitingFor: input.waitingFor,
      at: now,
    };
    const row =
      previous ??
      this.meetLoopRepo.create({
        ownerUserId: input.ownerUserId,
        agentTaskId: input.agentTaskId,
        transitionHistory: [],
      });
    row.activityId = input.activityId ?? row.activityId ?? null;
    row.candidateUserId = input.candidateUserId ?? row.candidateUserId ?? null;
    row.stage = input.stage;
    row.waitingFor = input.waitingFor;
    row.state = sanitizeForDisplay(input.state) as Record<string, unknown>;
    row.review = input.review ?? row.review ?? null;
    row.transitionHistory = [
      ...(Array.isArray(row.transitionHistory) ? row.transitionHistory : []),
      transition,
    ].slice(-50);
    row.completedAt =
      input.stage === 'trust_score_updated' ? new Date() : row.completedAt;
    return this.meetLoopRepo.save(row).catch((error) => {
      this.warn('meet_loop_state_write_failed', error);
      return null;
    });
  }

  replaySamplesForEvalCases(
    evalCaseIds: number[],
  ): Promise<AgentOnlineReplaySample[]> {
    if (evalCaseIds.length === 0) return Promise.resolve([]);
    return this.replayRepo.find({
      where: { evalCaseId: In(evalCaseIds) },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
    });
  }

  async captureReplaySample(input: {
    ownerUserId: number;
    agentTaskId: number;
    evalCaseId: number;
    replayType: string;
    input: Record<string, unknown>;
    expectedBehavior: Record<string, unknown>;
    replayContext: Record<string, unknown>;
  }): Promise<AgentOnlineReplaySample | null> {
    return this.replayRepo
      .save(
        this.replayRepo.create({
          ownerUserId: input.ownerUserId,
          agentTaskId: input.agentTaskId,
          evalCaseId: input.evalCaseId,
          replayType: input.replayType,
          status: 'captured',
          input: sanitizeForDisplay(input.input) as Record<string, unknown>,
          expectedBehavior: sanitizeForDisplay(
            input.expectedBehavior,
          ) as Record<string, unknown>,
          replayContext: sanitizeForDisplay(input.replayContext) as Record<
            string,
            unknown
          >,
        }),
      )
      .catch((error) => {
        this.warn('replay_sample_write_failed', error);
        return null;
      });
  }

  async recordReplayResult(input: {
    sample: AgentOnlineReplaySample;
    result: Record<string, unknown>;
  }): Promise<void> {
    input.sample.lastReplay = {
      ...input.result,
      replayedAt: new Date().toISOString(),
    };
    input.sample.status = 'used_for_eval';
    await this.replayRepo
      .save(input.sample)
      .catch((error) => this.warn('replay_sample_update_failed', error));
  }

  async recordPatchEffect(input: {
    patchId: number;
    metric: string;
    value: number;
    sampleSize?: number | null;
    decision: 'observe' | 'promote' | 'rollback';
    note?: string | null;
    context?: Record<string, unknown>;
  }): Promise<AgentSkillPatchEffect | null> {
    return this.patchEffectRepo
      .save(
        this.patchEffectRepo.create({
          patchId: input.patchId,
          metric: input.metric,
          value: input.value,
          sampleSize: input.sampleSize ?? null,
          decision: input.decision,
          note: input.note ?? '',
          context: input.context ?? {},
        }),
      )
      .catch((error) => {
        this.warn('patch_effect_write_failed', error);
        return null;
      });
  }

  async recentPatchEffects(
    patchId: number,
    limit = 50,
  ): Promise<AgentSkillPatchEffect[]> {
    return this.patchEffectRepo.find({
      where: { patchId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: Math.max(1, Math.min(limit, 200)),
    });
  }

  decideCanary(input: {
    effects: AgentSkillPatchEffect[];
  }): 'observe' | 'promote' | 'rollback' {
    const effects = input.effects;
    const sampleSize = effects.reduce(
      (sum, item) => sum + (Number(item.sampleSize) || 1),
      0,
    );
    if (sampleSize < 20) return 'observe';
    const failureSignals = effects.filter((item) =>
      /(fail|error|rollback|quality_drop|complaint|block)/i.test(item.metric),
    );
    const badScore =
      failureSignals.length > 0
        ? failureSignals.reduce((sum, item) => sum + item.value, 0) /
          failureSignals.length
        : 0;
    if (badScore > 0.08) return 'rollback';
    const qualitySignals = effects.filter((item) =>
      /(quality|satisfaction|success|pass|conversion)/i.test(item.metric),
    );
    const goodScore =
      qualitySignals.length > 0
        ? qualitySignals.reduce((sum, item) => sum + item.value, 0) /
          qualitySignals.length
        : 0;
    return goodScore >= 0.85 ? 'promote' : 'observe';
  }

  async dashboard(limit = 30) {
    const take = this.normalizeLimit(limit, 80);
    const [replaySamples, subagentMemory, meetLoopStates, patchEffects] =
      await Promise.all([
        this.listReplaySamples(take),
        this.listSubagentMemory({ limit: take }),
        this.listMeetLoopStates({ limit: take }),
        this.listPatchEffects({ limit: take }),
      ]);
    return {
      summary: this.buildDashboardSummary({
        replaySamples,
        subagentMemory,
        meetLoopStates,
        patchEffects,
      }),
      replaySamples,
      subagentMemory,
      meetLoopStates,
      patchEffects,
    };
  }

  listReplaySamples(limit = 50): Promise<AgentOnlineReplaySample[]> {
    return this.replayRepo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.normalizeLimit(limit, 200),
    });
  }

  listSubagentMemory(input?: {
    agentName?: string | null;
    limit?: number | null;
  }): Promise<AgentSubagentMemory[]> {
    const where: FindOptionsWhere<AgentSubagentMemory> = {};
    if (input?.agentName) {
      where.agentName = input.agentName as FitMeetAlphaAgentName;
    }
    return this.subagentMemoryRepo.find({
      where,
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: this.normalizeLimit(input?.limit ?? 50, 200),
    });
  }

  listMeetLoopStates(input?: {
    stage?: string | null;
    limit?: number | null;
  }): Promise<AgentMeetLoopState[]> {
    const where: FindOptionsWhere<AgentMeetLoopState> = {};
    if (input?.stage) {
      where.stage = input.stage;
    }
    return this.meetLoopRepo.find({
      where,
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: this.normalizeLimit(input?.limit ?? 50, 200),
    });
  }

  listPatchEffects(input?: {
    patchId?: number | null;
    limit?: number | null;
  }): Promise<AgentSkillPatchEffect[]> {
    const where: FindOptionsWhere<AgentSkillPatchEffect> = {};
    if (input?.patchId && Number.isFinite(input.patchId)) {
      where.patchId = input.patchId;
    }
    return this.patchEffectRepo.find({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.normalizeLimit(input?.limit ?? 50, 200),
    });
  }

  private buildDashboardSummary(input: {
    replaySamples: AgentOnlineReplaySample[];
    subagentMemory: AgentSubagentMemory[];
    meetLoopStates: AgentMeetLoopState[];
    patchEffects: AgentSkillPatchEffect[];
  }) {
    const recentReplayUsed = input.replaySamples.filter(
      (sample) => sample.status === 'used_for_eval',
    ).length;
    const activeMeetLoops = input.meetLoopStates.filter(
      (state) => !state.completedAt,
    ).length;
    const rollbackSignals = input.patchEffects.filter(
      (effect) => effect.decision === 'rollback',
    ).length;
    const subagentNames = new Set(
      input.subagentMemory.map((memory) => memory.agentName),
    );
    return {
      replayCases: input.replaySamples.length,
      replayUsedForEval: recentReplayUsed,
      subagentMemories: input.subagentMemory.length,
      activeSubagents: subagentNames.size,
      meetLoopStates: input.meetLoopStates.length,
      activeMeetLoops,
      canarySignals: input.patchEffects.length,
      rollbackSignals,
    };
  }

  private normalizeLimit(
    value: number | null | undefined,
    max: number,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 50;
    return Math.max(1, Math.min(Math.trunc(parsed), max));
  }

  private buildSubagentEvalSnapshot(input: {
    agentName: FitMeetAlphaAgentName;
    memoryScope: string;
    observation: Record<string, unknown>;
    observations?: Array<Record<string, unknown>> | null;
    handoffOutput: Record<string, unknown>;
    evalHints?: Record<string, unknown> | null;
  }): Record<string, unknown> {
    const observations = input.observations ?? [input.observation];
    const hasError = observations.some((item) => Boolean(item.error));
    const requiresApproval = observations.some(
      (item) =>
        item.requiresConfirmation === true || item.approvalRequired === true,
    );
    const base = {
      agentName: input.agentName,
      memoryScope: input.memoryScope,
      runner:
        input.evalHints?.evalRunner ??
        this.defaultSubagentEvalRunner(input.agentName),
      passed: !hasError,
      requiresApproval,
      hasError,
      sampleCount: observations.length,
      generatedAt: new Date().toISOString(),
    };
    if (input.agentName === 'Life Graph Agent') {
      return {
        ...base,
        checks: {
          conflictDetection: this.containsKey(input, /conflict|冲突/i),
          mergeBoundary: this.containsKey(input, /merge|合并|profile/i),
          privacySensitivity: this.containsKey(input, /privacy|隐私|contact/i),
          userConfirmationBoundary: requiresApproval,
        },
      };
    }
    if (input.agentName === 'Match Agent') {
      return {
        ...base,
        checks: {
          candidateRecall: this.containsKey(input, /candidate|候选|match/i),
          rankingSignal: this.containsKey(input, /rank|score|排序|质量/i),
          explanationConsistency: this.containsKey(
            input,
            /explanation|reason|解释|原因/i,
          ),
          stateMachineStage: this.containsKey(input, /stage|state|状态/i),
          idempotencySignal: this.containsKey(input, /idempotent|retry|重试/i),
          profileWriteback: this.containsKey(input, /life.?graph|画像|回写/i),
          approvalBoundary: requiresApproval,
          recallFailureReviewNeeded:
            hasError || this.zeroCandidateSignal(input),
        },
      };
    }
    return {
      ...base,
      checks: {
        deterministicToolContract: input.agentName === 'Agent Brain',
        boundedHandoff: true,
      },
    };
  }

  private buildSubagentFailureReview(
    input: {
      agentName: FitMeetAlphaAgentName;
      critique: string;
      observation: Record<string, unknown>;
      observations?: Array<Record<string, unknown>> | null;
      evalHints?: Record<string, unknown> | null;
    },
    evalSnapshot: Record<string, unknown>,
  ): Record<string, unknown> {
    const observations = input.observations ?? [input.observation];
    const failedObservation = observations.find(
      (item) => Boolean(item.error) || item.status === 'failed',
    );
    const failed =
      Boolean(failedObservation) ||
      /failed|error|失败|异常/i.test(input.critique);
    const approvalBoundary =
      evalSnapshot.requiresApproval === true ||
      observations.some(
        (item) =>
          item.requiresConfirmation === true || item.approvalRequired === true,
      );
    return {
      required: failed,
      policy:
        input.evalHints?.failureReviewPolicy ??
        this.defaultSubagentFailurePolicy(input.agentName),
      reason: failed
        ? failedObservation?.error
          ? 'tool_error'
          : 'critique_failed'
        : approvalBoundary
          ? 'approval_boundary'
          : 'none',
      clusterKey: failed
        ? `${this.slug(input.agentName)}:${this.failureCluster(input)}`
        : null,
      nextAction: failed
        ? 'create_replay_case_and_patch_candidate'
        : approvalBoundary
          ? 'wait_for_explicit_approval'
          : 'store_as_success_trace',
      generatedAt: new Date().toISOString(),
    };
  }

  private defaultSubagentEvalRunner(agent: FitMeetAlphaAgentName): string {
    if (agent === 'Life Graph Agent')
      return 'life_graph_memory_conflict_eval_v1';
    if (agent === 'Match Agent') {
      return 'match_recall_ranking_and_meet_loop_eval_v1';
    }
    if (agent === 'Agent Brain') return 'agent_brain_low_cost_router_eval_v1';
    return 'main_agent_handoff_eval_v1';
  }

  private defaultSubagentFailurePolicy(agent: FitMeetAlphaAgentName): string {
    if (agent === 'Life Graph Agent') {
      return 'review_profile_conflicts_and_merge_boundaries';
    }
    if (agent === 'Match Agent') {
      return 'cluster_recall_ranking_or_state_transition_failures';
    }
    if (agent === 'Agent Brain') return 'review_router_or_unit_boundary';
    return 'review_planner_handoff_failures';
  }

  private containsKey(value: unknown, pattern: RegExp): boolean {
    if (value == null) return false;
    if (typeof value === 'string') return pattern.test(value);
    if (typeof value === 'number' || typeof value === 'boolean') return false;
    if (Array.isArray(value)) {
      return value.some((item) => this.containsKey(item, pattern));
    }
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).some(
        ([key, item]) => pattern.test(key) || this.containsKey(item, pattern),
      );
    }
    return false;
  }

  private zeroCandidateSignal(value: unknown): boolean {
    if (value == null || typeof value !== 'object') return false;
    if (Array.isArray(value)) {
      return value.some((item) => this.zeroCandidateSignal(item));
    }
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) => /candidateCount|候选/.test(key) && Number(item) === 0,
    );
  }

  private safeText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }

  private failureCluster(input: {
    critique: string;
    observation: Record<string, unknown>;
    observations?: Array<Record<string, unknown>> | null;
  }): string {
    const observations = input.observations ?? [input.observation];
    const firstError = observations.find((item) => item.error)?.error;
    const source = this.safeText(firstError) || input.critique || 'unknown';
    return source
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  private canTransition(from: string, to: string): boolean {
    if (from === to) return true;
    const allowed: Record<string, string[]> = {
      invite_requested: ['invite_sent', 'activity_draft_created'],
      invite_sent: ['reply_received', 'activity_draft_created'],
      reply_received: [
        'rescheduled',
        'activity_draft_created',
        'activity_confirmed',
      ],
      rescheduled: ['activity_draft_created', 'activity_confirmed'],
      activity_draft_created: [
        'invite_sent',
        'reply_received',
        'activity_publish_cancelled',
        'activity_confirmed',
      ],
      activity_publish_cancelled: [],
      activity_confirmed: [
        'rescheduled',
        'activity_checked_in',
        'activity_completed',
      ],
      activity_checked_in: ['activity_completed', 'proof_submitted'],
      activity_completed: ['proof_submitted', 'review_submitted'],
      proof_submitted: ['review_submitted', 'activity_completed'],
      review_submitted: ['trust_score_updated'],
      trust_score_updated: [],
    };
    return (
      allowed[from] ?? ['invite_requested', 'activity_draft_created']
    ).includes(to);
  }

  private warn(event: string, error: unknown): void {
    this.logger.warn(
      JSON.stringify({
        event: `agent_l5_runtime.${event}`,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  private slug(agent: FitMeetAlphaAgentName): string {
    return agent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
