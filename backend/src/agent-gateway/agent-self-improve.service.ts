import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AgentQualityReport } from './agent-quality/agent-quality-evaluator.service';
import {
  AgentEvalCase,
  AgentReflectionRun,
  AgentSkillPatch,
  AgentSkillPatchRiskLevel,
  AgentSkillPatchStatus,
} from './entities/agent-self-improve.entity';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import { shouldStreamFallbackAssistantText } from './social-agent-chat-stream.presenter';

export interface RecordAgentQualityFailureInput {
  taskId: number;
  ownerUserId?: number | null;
  assistantMessage?: string | null;
  qualityReport: AgentQualityReport;
  source?: string;
  context?: Record<string, unknown>;
}

export interface CreateAgentSkillPatchInput {
  reflectionRunId?: number | null;
  patchType: string;
  title: string;
  rationale?: string;
  target?: string;
  patch?: Record<string, unknown>;
  riskLevel?: AgentSkillPatchRiskLevel;
}

export interface EvaluateAgentSkillPatchInput {
  evalCaseIds?: number[];
  result?: Record<string, unknown>;
}

export interface PublishAgentSkillPatchInput {
  rolloutPercent?: number | null;
}

export interface RecordAgentSkillPatchEffectInput {
  metric: string;
  value: number;
  sampleSize?: number | null;
  note?: string | null;
}

export interface AgentSelfImproveAutomationResult {
  createdPatchIds: number[];
  evaluatedPatchIds: number[];
  autoPublishedPatchIds: number[];
  pendingReviewPatchIds: number[];
  reconciled: Array<{
    patchId: number;
    decision: 'observe' | 'promote' | 'rollback';
  }>;
}

type AgentSelfImproveFailureCluster = {
  key: string;
  count: number;
  severity: AgentSkillPatchRiskLevel;
  suggestedPatchType: string;
  suggestedTarget: string;
  reflectionIds: number[];
  source: 'reflection' | 'online_replay' | 'canary_metrics' | 'subagent_memory';
  evidence?: Array<Record<string, unknown>>;
};

type AgentSelfImproveDomain =
  | 'main_agent'
  | 'life_graph_agent'
  | 'social_match_agent'
  | 'meet_loop_agent'
  | 'math_agent'
  | 'tool_policy'
  | 'safety_policy'
  | 'unknown';

type AgentSelfImproveControl = {
  domain: AgentSelfImproveDomain;
  riskLevel: AgentSkillPatchRiskLevel;
  requiresHumanReview: boolean;
  autoCanaryAllowed: boolean;
  reasons: string[];
  classifier: string;
  classifiedAt: string;
};

type CanaryEffectLike = {
  metric?: string;
  value?: number;
  sampleSize?: number | null;
};

@Injectable()
export class AgentSelfImproveService {
  private readonly logger = new Logger(AgentSelfImproveService.name);

  constructor(
    @InjectRepository(AgentReflectionRun)
    private readonly reflectionRepo: Repository<AgentReflectionRun>,
    @InjectRepository(AgentSkillPatch)
    private readonly patchRepo: Repository<AgentSkillPatch>,
    @InjectRepository(AgentEvalCase)
    private readonly evalCaseRepo: Repository<AgentEvalCase>,
    @Optional() private readonly l5Runtime?: AgentL5RuntimeService,
  ) {}

  listReflectionRuns(limit = 50): Promise<AgentReflectionRun[]> {
    return this.reflectionRepo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.safeLimit(limit),
    });
  }

  listSkillPatches(
    status?: AgentSkillPatchStatus | null,
    limit = 50,
  ): Promise<AgentSkillPatch[]> {
    return this.patchRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.safeLimit(limit),
    });
  }

  listEvalCases(limit = 50): Promise<AgentEvalCase[]> {
    return this.evalCaseRepo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.safeLimit(limit),
    });
  }

  async listAutoRuns(limit = 50): Promise<AgentSkillPatch[]> {
    const patches = await this.patchRepo.find({
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: this.safeLimit(limit),
    });
    return patches.filter((patch) => {
      const patchData = this.asRecord(patch.patch);
      return Boolean(
        patchData.autoRunner ||
        patchData.rollout ||
        patchData.rollback ||
        patchData.lastEvaluation,
      );
    });
  }

  async runAutomationOnce(
    reviewerUserId: number | null = null,
  ): Promise<AgentSelfImproveAutomationResult> {
    const result: AgentSelfImproveAutomationResult = {
      createdPatchIds: [],
      evaluatedPatchIds: [],
      autoPublishedPatchIds: [],
      pendingReviewPatchIds: [],
      reconciled: [],
    };
    const clusters = await this.discoverAutomationClusters(100);
    for (const cluster of clusters.slice(0, 5)) {
      const riskLevel = cluster.severity;
      const patchDraft = this.patchDraftForCluster(cluster);
      let patch = await this.createSkillPatch({
        reflectionRunId: cluster.reflectionIds[0] ?? null,
        patchType: cluster.suggestedPatchType,
        title: `Auto patch: ${cluster.key}`,
        rationale: `Generated from ${cluster.count} clustered reflection failure(s).`,
        target: cluster.suggestedTarget,
        riskLevel,
        patch: {
          ...patchDraft,
          autoRunner: {
            source: 'self_improve_runner_v1',
            stage: 'draft_generated',
            signalSource: cluster.source,
            clusterKey: cluster.key,
            reflectionIds: cluster.reflectionIds,
            evidence: cluster.evidence ?? [],
            generatedAt: new Date().toISOString(),
          },
        },
      });
      patch = await this.bindAutoEvalCase(patch, cluster);
      result.createdPatchIds.push(patch.id);
      let evaluated: AgentSkillPatch;
      try {
        evaluated = await this.runSkillPatchEval(patch.id);
        result.evaluatedPatchIds.push(evaluated.id);
      } catch {
        result.pendingReviewPatchIds.push(patch.id);
        continue;
      }
      const reviewGate = this.reviewGate(evaluated);
      if (reviewGate.required) {
        evaluated.status = 'pending_review';
        evaluated.patch = {
          ...(evaluated.patch ?? {}),
          autoRunner: {
            ...this.asRecord(this.asRecord(evaluated.patch).autoRunner),
            stage: 'pending_human_review',
            reason: reviewGate.reason,
            updatedAt: new Date().toISOString(),
          },
        };
        await this.patchRepo.save(evaluated);
        result.pendingReviewPatchIds.push(evaluated.id);
        continue;
      }
      const autoGate = this.autoPublishEvalGate(evaluated);
      if (!autoGate.ok) {
        evaluated.status = 'pending_review';
        evaluated.patch = {
          ...(evaluated.patch ?? {}),
          autoRunner: {
            ...this.asRecord(this.asRecord(evaluated.patch).autoRunner),
            stage: 'pending_human_review',
            reason: autoGate.reason,
            updatedAt: new Date().toISOString(),
          },
        };
        await this.patchRepo.save(evaluated);
        result.pendingReviewPatchIds.push(evaluated.id);
        continue;
      }
      evaluated.status = 'approved';
      evaluated.reviewedByUserId = reviewerUserId;
      evaluated.reviewedAt = new Date();
      evaluated.patch = {
        ...(evaluated.patch ?? {}),
        autoRunner: {
          ...this.asRecord(this.asRecord(evaluated.patch).autoRunner),
          stage: 'auto_approved',
          updatedAt: new Date().toISOString(),
        },
      };
      await this.patchRepo.save(evaluated);
      const published = await this.publishSkillPatch(
        evaluated.id,
        reviewerUserId ?? 0,
        { rolloutPercent: 10 },
      );
      result.autoPublishedPatchIds.push(published.id);
    }

    for (const patch of await this.listSkillPatches('published', 50)) {
      const decision = await this.reconcileCanaryPatch(patch.id);
      result.reconciled.push({
        patchId: patch.id,
        decision: decision.decision,
      });
    }
    return result;
  }

  async publishedPromptRules(target: string): Promise<string[]> {
    return this.publishedTextRules('prompt', target);
  }

  async publishedLifeGraphExtractionRules(target: string): Promise<string[]> {
    return this.publishedTextRules('life_graph_extraction', target);
  }

  async publishedToolPolicyPatches(
    toolName: string,
  ): Promise<Array<Record<string, unknown>>> {
    const patches = await this.patchRepo.find({
      where: { status: 'published', patchType: 'tool_policy' },
      order: { publishedAt: 'DESC', id: 'DESC' },
      take: 50,
    });
    return patches
      .filter((patch) => this.patchMatchesTarget(patch, toolName))
      .map((patch) => patch.patch ?? {});
  }

  async publishedSafetyPolicyPatches(
    target = 'scene_risk',
  ): Promise<Array<Record<string, unknown>>> {
    const patches = await this.patchRepo.find({
      where: { status: 'published', patchType: 'safety_policy' },
      order: { publishedAt: 'DESC', id: 'DESC' },
      take: 50,
    });
    return patches
      .filter((patch) => !patch.target || patch.target === target)
      .map((patch) => patch.patch ?? {});
  }

  private async publishedTextRules(
    patchType: string,
    target: string,
  ): Promise<string[]> {
    const patches = await this.patchRepo.find({
      where: {
        status: 'published',
        patchType,
        target,
      },
      order: { publishedAt: 'DESC', id: 'DESC' },
      take: 20,
    });
    return patches.flatMap((patch) => this.readPromptRules(patch.patch));
  }

  async recordQualityFailure(
    input: RecordAgentQualityFailureInput,
  ): Promise<AgentReflectionRun | null> {
    try {
      const failedChecks = input.qualityReport.checks.filter(
        (check) => check.status === 'fail',
      );
      const warnChecks = input.qualityReport.checks.filter(
        (check) => check.status === 'warn',
      );
      const severity = this.severityFromScore(input.qualityReport.score);
      const reflection = await this.reflectionRepo.save(
        this.reflectionRepo.create({
          ownerUserId: input.ownerUserId ?? null,
          agentTaskId: input.taskId,
          triggerType: 'quality_failed',
          status: 'queued',
          source: input.source ?? 'quality_evaluator',
          severity,
          qualityScore: input.qualityReport.score,
          failedChecks: failedChecks.map((check) => ({
            id: check.id,
            message: check.message,
            evidence: check.evidence ?? [],
          })),
          input: {
            taskId: input.taskId,
            assistantPreview: this.preview(input.assistantMessage),
            context: input.context ?? {},
          },
          reflection: {
            summary: this.buildReflectionSummary(input.qualityReport),
            suggestions: input.qualityReport.suggestions,
            warnChecks: warnChecks.map((check) => ({
              id: check.id,
              message: check.message,
              evidence: check.evidence ?? [],
            })),
            nextAction:
              severity === 'high'
                ? 'create_human_review_patch'
                : 'add_regression_eval_case',
          },
          suggestedPatchIds: [],
        }),
      );

      await this.evalCaseRepo.save(
        this.evalCaseRepo.create({
          reflectionRunId: reflection.id,
          agentTaskId: input.taskId,
          caseType: 'quality_regression',
          status: 'active',
          title: this.buildEvalCaseTitle(input.qualityReport),
          source: 'quality_evaluator',
          input: {
            taskId: input.taskId,
            source: input.source ?? 'quality_evaluator',
            context: input.context ?? {},
          },
          expectedBehavior: {
            minScore: Math.max(90, input.qualityReport.score + 1),
            mustPassChecks: failedChecks.map((check) => check.id),
            suggestions: input.qualityReport.suggestions,
          },
          lastRun: {
            score: input.qualityReport.score,
            passed: input.qualityReport.passed,
            capturedAt: new Date().toISOString(),
          },
        }),
      );

      return reflection;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'fitmeet_agent.self_improve.record_failed',
          taskId: input.taskId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async createSkillPatch(
    input: CreateAgentSkillPatchInput,
  ): Promise<AgentSkillPatch> {
    const patchType = this.requiredText(input.patchType, 'patchType');
    const title = this.requiredText(input.title, 'title');
    const reflectionRunId = this.positiveNumberOrNull(input.reflectionRunId);
    if (reflectionRunId) await this.getReflection(reflectionRunId);
    const target = this.optionalText(input.target);
    const rationale = this.optionalText(input.rationale);
    const patchPayload = input.patch ?? {};
    const control = this.classifyPatchControl({
      patchType,
      target,
      rationale,
      patch: patchPayload,
      requestedRiskLevel: input.riskLevel,
    });
    return this.patchRepo.save(
      this.patchRepo.create({
        reflectionRunId,
        patchType,
        title,
        rationale,
        target,
        patch: {
          ...patchPayload,
          selfImproveControl: control,
        },
        riskLevel: control.riskLevel,
        status: 'draft',
        evalCaseIds: [],
      }),
    );
  }

  async evaluateSkillPatch(
    id: number,
    input: EvaluateAgentSkillPatchInput = {},
  ): Promise<AgentSkillPatch> {
    const patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['draft', 'pending_review', 'approved']);
    await this.attachEvaluation(patch, input);
    patch.status = 'pending_review';
    return this.patchRepo.save(patch);
  }

  async approveSkillPatch(
    id: number,
    reviewerUserId: number,
  ): Promise<AgentSkillPatch> {
    let patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['pending_review']);
    if (!this.hasEvaluation(patch)) {
      patch = await this.attachEvaluation(patch, {});
    }
    this.assertPassingEvaluation(patch);
    patch = this.refreshPatchControl(patch);
    patch.status = 'approved';
    patch.reviewedByUserId = reviewerUserId;
    patch.reviewedAt = new Date();
    return this.patchRepo.save(patch);
  }

  async rejectSkillPatch(
    id: number,
    reviewerUserId: number,
    reason?: string | null,
  ): Promise<AgentSkillPatch> {
    const patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['draft', 'pending_review', 'approved']);
    patch.status = 'rejected';
    patch.reviewedByUserId = reviewerUserId;
    patch.reviewedAt = new Date();
    patch.patch = {
      ...(patch.patch ?? {}),
      rejectionReason: this.optionalText(reason),
    };
    return this.patchRepo.save(patch);
  }

  async publishSkillPatch(
    id: number,
    reviewerUserId: number,
    input: PublishAgentSkillPatchInput = {},
  ): Promise<AgentSkillPatch> {
    let patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['approved']);
    if (!this.hasEvaluation(patch)) {
      patch = await this.attachEvaluation(patch, {});
    }
    this.assertPassingEvaluation(patch);
    patch = this.refreshPatchControl(patch);
    const reviewGate = this.reviewGate(patch);
    if (reviewGate.required && !patch.reviewedByUserId) {
      throw new BadRequestException(reviewGate.reason);
    }
    if (!patch.reviewedByUserId) {
      patch.reviewedByUserId = reviewerUserId;
      patch.reviewedAt = new Date();
    }
    patch.status = 'published';
    patch.publishedAt = new Date();
    patch.patch = {
      ...(patch.patch ?? {}),
      publishedByUserId: reviewerUserId,
      publishedAt: patch.publishedAt.toISOString(),
      selfImproveControl: this.controlForPatch(patch),
      rollout: {
        state: 'canary',
        percent: this.rolloutPercent(input.rolloutPercent),
        startedAt: patch.publishedAt.toISOString(),
      },
      onlineEffects: [
        ...this.readOnlineEffects(patch.patch),
        {
          metric: 'published_baseline',
          value: 1,
          sampleSize: 1,
          note: 'Patch published after eval and human approval.',
          recordedAt: patch.publishedAt.toISOString(),
        },
      ],
    };
    return this.patchRepo.save(patch);
  }

  async runSkillPatchEval(
    id: number,
    input: EvaluateAgentSkillPatchInput = {},
  ): Promise<AgentSkillPatch> {
    const patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['draft', 'pending_review', 'approved']);
    await this.attachEvaluation(patch, input);
    return this.patchRepo.save(patch);
  }

  async clusterReflectionFailures(
    limit = 100,
  ): Promise<AgentSelfImproveFailureCluster[]> {
    const reflections = await this.reflectionRepo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.safeLimit(limit),
    });
    const clusters = new Map<string, AgentSelfImproveFailureCluster>();
    for (const reflection of reflections) {
      const checks = Array.isArray(reflection.failedChecks)
        ? reflection.failedChecks
        : [];
      for (const check of checks) {
        const key =
          typeof check.id === 'string' && check.id.trim()
            ? check.id.trim()
            : reflection.triggerType;
        const current =
          clusters.get(key) ?? this.newFailureCluster(key, reflection.severity);
        current.count += 1;
        current.reflectionIds.push(reflection.id);
        if (reflection.severity === 'high') current.severity = 'high';
        clusters.set(key, current);
      }
    }
    return [...clusters.values()].sort((a, b) => b.count - a.count);
  }

  async discoverAutomationClusters(
    limit = 100,
  ): Promise<AgentSelfImproveFailureCluster[]> {
    const clusters = new Map<string, AgentSelfImproveFailureCluster>();
    const merge = (cluster: AgentSelfImproveFailureCluster) => {
      const existing = clusters.get(cluster.key);
      if (!existing) {
        clusters.set(cluster.key, cluster);
        return;
      }
      existing.count += cluster.count;
      existing.reflectionIds = [
        ...new Set([...existing.reflectionIds, ...cluster.reflectionIds]),
      ];
      existing.evidence = [
        ...(existing.evidence ?? []),
        ...(cluster.evidence ?? []),
      ].slice(0, 8);
      if (cluster.severity === 'high' || existing.severity === 'high') {
        existing.severity = 'high';
      } else if (
        cluster.severity === 'medium' ||
        existing.severity === 'medium'
      ) {
        existing.severity = 'medium';
      }
    };
    for (const cluster of await this.clusterReflectionFailures(limit)) {
      merge(cluster);
    }
    for (const cluster of await this.onlineReplayFailureClusters(limit)) {
      merge(cluster);
    }
    for (const cluster of await this.canaryMetricFailureClusters(limit)) {
      merge(cluster);
    }
    for (const cluster of await this.subagentMemoryFailureClusters(limit)) {
      merge(cluster);
    }
    return [...clusters.values()].sort((a, b) => b.count - a.count);
  }

  async recordOnlineReplayFromRoute(input: {
    ownerUserId: number;
    taskId: number;
    userMessage?: string | null;
    assistantMessage?: string | null;
    route: Record<string, unknown>;
    result?: Record<string, unknown>;
  }): Promise<AgentEvalCase | null> {
    if (!this.l5Runtime) return null;
    if (!shouldStreamFallbackAssistantText(input.assistantMessage)) return null;
    const assistantMessage = this.preview(input.assistantMessage);
    const evalCase = await this.evalCaseRepo.save(
      this.evalCaseRepo.create({
        reflectionRunId: null,
        agentTaskId: input.taskId,
        caseType: 'online_replay',
        status: 'active',
        title: `Online replay: task ${input.taskId}`,
        source: 'online_replay',
        input: {
          taskId: input.taskId,
          userMessage: this.preview(input.userMessage),
          route: input.route,
        },
        expectedBehavior: {
          minScore: 85,
          mustNotRegress: ['traceId', 'debug', 'stack', 'internal'],
          assistantPreview: assistantMessage,
        },
        lastRun: null,
      }),
    );
    await this.l5Runtime.captureReplaySample({
      ownerUserId: input.ownerUserId,
      agentTaskId: input.taskId,
      evalCaseId: evalCase.id,
      replayType: 'route_message',
      input: {
        userMessage: input.userMessage ?? '',
        route: input.route,
      },
      expectedBehavior: {
        minScore: 85,
        mustNotRegress: ['traceId', 'debug', 'stack', 'internal'],
      },
      replayContext: {
        assistantMessage,
        result: input.result ?? {},
      },
    });
    return evalCase;
  }

  async recordSkillPatchEffect(
    id: number,
    input: RecordAgentSkillPatchEffectInput,
  ): Promise<AgentSkillPatch> {
    let patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['published', 'rolled_back']);
    const metric = this.requiredText(input.metric, 'metric');
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      throw new BadRequestException('value must be a finite number');
    }
    await this.l5Runtime?.recordPatchEffect({
      patchId: patch.id,
      metric,
      value,
      sampleSize: this.positiveNumberOrNull(input.sampleSize),
      decision: 'observe',
      note: this.optionalText(input.note),
      context: {
        source: 'self_improve_api',
        status: patch.status,
      },
    });
    patch.patch = {
      ...(patch.patch ?? {}),
      onlineEffects: [
        ...this.readOnlineEffects(patch.patch),
        {
          metric,
          value,
          sampleSize: this.positiveNumberOrNull(input.sampleSize),
          note: this.optionalText(input.note),
          recordedAt: new Date().toISOString(),
        },
      ],
    };
    patch = await this.patchRepo.save(patch);
    const decision = await this.reconcileCanaryPatch(patch.id);
    return decision.patch;
  }

  async reconcileCanaryPatch(id: number): Promise<{
    decision: 'observe' | 'promote' | 'rollback';
    patch: AgentSkillPatch;
  }> {
    const patch = await this.getPatch(id);
    if (patch.status !== 'published') {
      return { decision: 'observe', patch };
    }
    const effects = await this.recentCanaryEffects(patch);
    const decision = this.decideCanaryFromEffects(effects);
    if (decision === 'rollback') {
      patch.status = 'rolled_back';
      patch.patch = {
        ...(patch.patch ?? {}),
        autoRunner: {
          ...this.asRecord(this.asRecord(patch.patch).autoRunner),
          stage: 'auto_rolled_back',
          updatedAt: new Date().toISOString(),
        },
        rollout: {
          ...this.asRecord(this.asRecord(patch.patch).rollout),
          state: 'rolled_back',
          endedAt: new Date().toISOString(),
        },
        rollback: {
          reason: 'canary_metrics_regressed',
          rolledBackAt: new Date().toISOString(),
        },
      };
      await this.l5Runtime?.recordPatchEffect({
        patchId: patch.id,
        metric: 'canary_decision',
        value: 0,
        sampleSize: this.totalEffectSampleSize(effects),
        decision,
        note: 'Canary metrics crossed rollback threshold.',
        context: { status: patch.status },
      });
      return { decision, patch: await this.patchRepo.save(patch) };
    }
    if (decision === 'promote') {
      patch.patch = {
        ...(patch.patch ?? {}),
        autoRunner: {
          ...this.asRecord(this.asRecord(patch.patch).autoRunner),
          stage: 'auto_promoted_stable',
          updatedAt: new Date().toISOString(),
        },
        rollout: {
          ...this.asRecord(this.asRecord(patch.patch).rollout),
          state: 'stable',
          percent: 100,
          promotedAt: new Date().toISOString(),
        },
      };
      await this.l5Runtime?.recordPatchEffect({
        patchId: patch.id,
        metric: 'canary_decision',
        value: 1,
        sampleSize: this.totalEffectSampleSize(effects),
        decision,
        note: 'Canary metrics crossed promotion threshold.',
        context: { status: patch.status },
      });
      return { decision, patch: await this.patchRepo.save(patch) };
    }
    return { decision, patch };
  }

  async rollbackSkillPatch(
    id: number,
    reviewerUserId: number,
    reason?: string | null,
  ): Promise<AgentSkillPatch> {
    const patch = await this.getPatch(id);
    this.assertPatchStatus(patch, ['published']);
    patch.status = 'rolled_back';
    patch.patch = {
      ...(patch.patch ?? {}),
      rollback: {
        byUserId: reviewerUserId,
        reason: this.optionalText(reason),
        rolledBackAt: new Date().toISOString(),
      },
    };
    return this.patchRepo.save(patch);
  }

  private severityFromScore(score: number): AgentSkillPatchRiskLevel {
    if (score < 60) return 'high';
    if (score < 85) return 'medium';
    return 'low';
  }

  private classifyPatchControl(input: {
    patchType: string;
    target: string;
    rationale: string;
    patch: Record<string, unknown>;
    requestedRiskLevel?: AgentSkillPatchRiskLevel;
  }): AgentSelfImproveControl {
    const text = this.patchControlText(input);
    const reasons: string[] = [];
    const domain = this.classifyPatchDomain(
      input.patchType,
      input.target,
      text,
    );
    const requestedRisk = input.requestedRiskLevel ?? 'medium';
    let riskLevel = requestedRisk;
    if (input.patchType === 'safety_policy') {
      riskLevel = this.maxRisk(riskLevel, 'high');
      reasons.push('safety_policy_patch');
    }
    if (domain === 'tool_policy') {
      riskLevel = this.maxRisk(riskLevel, 'medium');
      reasons.push('tool_policy_patch');
    }
    if (domain === 'life_graph_agent') {
      riskLevel = this.maxRisk(riskLevel, 'medium');
      reasons.push('life_graph_memory_surface');
    }
    if (this.patchTouchesHighRiskSurface(input)) {
      riskLevel = this.maxRisk(riskLevel, 'high');
      reasons.push('high_risk_social_or_privacy_surface');
    }
    const requiresHumanReview =
      riskLevel === 'high' ||
      domain === 'safety_policy' ||
      reasons.includes('high_risk_social_or_privacy_surface');
    return {
      domain,
      riskLevel,
      requiresHumanReview,
      autoCanaryAllowed: !requiresHumanReview,
      reasons: reasons.length > 0 ? reasons : ['standard_self_improve_patch'],
      classifier: 'fitmeet_self_improve_control_v1',
      classifiedAt: new Date().toISOString(),
    };
  }

  private classifyPatchDomain(
    patchType: string,
    target: string,
    text: string,
  ): AgentSelfImproveDomain {
    if (patchType === 'safety_policy') return 'safety_policy';
    if (patchType === 'tool_policy' || /^tool:/i.test(target)) {
      return 'tool_policy';
    }
    if (/life[_ -]?graph|profile|memory|画像|记忆/.test(text)) {
      return 'life_graph_agent';
    }
    if (
      /social[_ -]?match|candidate|match|ranking|recall|候选|匹配|排序/.test(
        text,
      )
    ) {
      return 'social_match_agent';
    }
    if (
      /meet[_ -]?loop|invite|reschedule|check.?in|activity|邀约|改期|见面|活动/.test(
        text,
      )
    ) {
      return 'meet_loop_agent';
    }
    if (/math|calculate|unit|deterministic|计算|单位/.test(text)) {
      return 'math_agent';
    }
    if (/final_response|main_agent|agent_brain|planner/.test(text)) {
      return 'main_agent';
    }
    return 'unknown';
  }

  private refreshPatchControl(patch: AgentSkillPatch): AgentSkillPatch {
    const control = this.classifyPatchControl({
      patchType: patch.patchType ?? '',
      target: patch.target ?? '',
      rationale: patch.rationale ?? '',
      patch: patch.patch ?? {},
      requestedRiskLevel: patch.riskLevel,
    });
    patch.riskLevel = control.riskLevel;
    patch.patch = {
      ...(patch.patch ?? {}),
      selfImproveControl: control,
    };
    return patch;
  }

  private controlForPatch(patch: AgentSkillPatch): AgentSelfImproveControl {
    const existing = this.asRecord(patch.patch?.selfImproveControl);
    if (existing.classifier === 'fitmeet_self_improve_control_v1') {
      return existing as AgentSelfImproveControl;
    }
    return this.classifyPatchControl({
      patchType: patch.patchType ?? '',
      target: patch.target ?? '',
      rationale: patch.rationale ?? '',
      patch: patch.patch ?? {},
      requestedRiskLevel: patch.riskLevel,
    });
  }

  private reviewGate(patch: AgentSkillPatch): {
    required: boolean;
    reason: string;
  } {
    const control = this.controlForPatch(this.refreshPatchControl(patch));
    if (!control.requiresHumanReview) {
      return { required: false, reason: 'auto_publish_allowed' };
    }
    return {
      required: true,
      reason:
        control.reasons.find((item) => item.includes('high_risk')) ??
        'high_risk_patch_requires_human_review',
    };
  }

  private patchControlText(input: {
    patchType: string;
    target: string;
    rationale: string;
    patch: Record<string, unknown>;
  }): string {
    return JSON.stringify({
      patchType: input.patchType,
      target: input.target,
      rationale: input.rationale,
      patch: input.patch,
    }).toLowerCase();
  }

  private maxRisk(
    current: AgentSkillPatchRiskLevel,
    next: AgentSkillPatchRiskLevel,
  ): AgentSkillPatchRiskLevel {
    const rank: Record<AgentSkillPatchRiskLevel, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    return rank[next] > rank[current] ? next : current;
  }

  private buildReflectionSummary(report: AgentQualityReport): string {
    const failed = report.checks
      .filter((check) => check.status === 'fail')
      .map((check) => check.id);
    if (failed.length === 0) {
      return `Quality score ${report.score}; warnings need regression coverage.`;
    }
    return `Quality score ${report.score}; failed checks: ${failed.join(', ')}.`;
  }

  private buildEvalCaseTitle(report: AgentQualityReport): string {
    const failed = report.checks.find((check) => check.status === 'fail');
    if (failed) return `Agent quality regression: ${failed.id}`;
    return 'Agent quality regression: warning follow-up';
  }

  private autoRuleForCluster(key: string): string {
    if (/tone|user_facing|trace|internal|debug/i.test(key)) {
      return 'Keep user-facing replies natural and never expose internal traces, debug fields, raw JSON, stack traces, model names, or tool logs.';
    }
    if (/approval|confirm|permission|safety/i.test(key)) {
      return 'Before any high-risk social side effect, explicitly wait for user confirmation and describe the pending action as not yet executed.';
    }
    if (/life|profile|memory/i.test(key)) {
      return 'When updating Life Graph memory, separate confirmed facts from inferred preferences and ask before merging sensitive or conflicting information.';
    }
    if (/match|candidate|search/i.test(key)) {
      return 'Explain matching results only from observed candidates and avoid inventing availability, intent, or relationship status.';
    }
    return `Prevent repeated regression for ${key} while preserving concise, natural user-facing replies.`;
  }

  private patchDraftForCluster(
    cluster: AgentSelfImproveFailureCluster,
  ): Record<string, unknown> {
    const rule = this.autoRuleForCluster(cluster.key);
    if (cluster.suggestedPatchType === 'safety_policy') {
      return {
        requireConfirmation: true,
        requireDoubleConfirmation: cluster.severity === 'high',
        safetyPrompt: rule,
        forceMinRiskLevel: cluster.severity === 'high' ? 'high' : 'medium',
        blockedActions: /payment|支付/i.test(cluster.key) ? ['payment'] : [],
      };
    }
    if (cluster.suggestedPatchType === 'tool_policy') {
      return {
        forceRequiresApproval: true,
        forceRiskLevel: cluster.severity === 'high' ? 'high' : 'medium',
        executionContract: rule,
        dailyLimit: cluster.severity === 'high' ? 0 : 3,
      };
    }
    if (cluster.suggestedPatchType === 'life_graph_extraction') {
      return {
        appendRule: rule,
        extractionGuidance: {
          conflictDetection: true,
          requireUserConfirmationForSensitiveMerge: true,
          separateConfirmedFactsFromInferences: true,
        },
      };
    }
    return {
      appendRule: rule,
      rules: [rule],
    };
  }

  private preview(value?: string | null): string {
    if (!value) return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 160
      ? `${normalized.slice(0, 157).trimEnd()}...`
      : normalized;
  }

  private async getReflection(id: number): Promise<AgentReflectionRun> {
    const reflection = await this.reflectionRepo.findOne({ where: { id } });
    if (!reflection) throw new NotFoundException('Reflection run not found');
    return reflection;
  }

  private async getPatch(id: number): Promise<AgentSkillPatch> {
    const patch = await this.patchRepo.findOne({ where: { id } });
    if (!patch) throw new NotFoundException('Skill patch not found');
    return patch;
  }

  private hasEvaluation(patch: AgentSkillPatch): boolean {
    return Boolean(
      patch.evalCaseIds?.length &&
      this.asRecord(patch.patch?.lastEvaluation).evaluatedAt,
    );
  }

  private async attachEvaluation(
    patch: AgentSkillPatch,
    input: EvaluateAgentSkillPatchInput,
  ): Promise<AgentSkillPatch> {
    const evalCaseIds = await this.resolveEvalCaseIds(patch, input.evalCaseIds);
    if (evalCaseIds.length === 0) {
      throw new BadRequestException(
        'Skill patch must have at least one eval case',
      );
    }
    const evaluation = await this.runEvaluation({
      patch,
      evalCaseIds,
      suppliedResult: input.result ?? {},
    });
    patch.evalCaseIds = evalCaseIds;
    patch.patch = {
      ...(patch.patch ?? {}),
      lastEvaluation: evaluation,
    };
    return patch;
  }

  private async runEvaluation(input: {
    patch: AgentSkillPatch;
    evalCaseIds: number[];
    suppliedResult: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const cases = await this.evalCaseRepo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 100,
    });
    const selectedCases = cases.filter((item) =>
      input.evalCaseIds.includes(item.id),
    );
    const caseResults = selectedCases.map((item) =>
      this.gradeEvalCase(input.patch, item),
    );
    for (const index of selectedCases.keys()) {
      selectedCases[index].lastRun = caseResults[index];
      await this.evalCaseRepo.save(selectedCases[index]);
    }
    const replaySamples =
      (await this.l5Runtime?.replaySamplesForEvalCases(input.evalCaseIds)) ??
      [];
    const replayResults = replaySamples.map((sample) =>
      this.gradeReplaySample(input.patch, sample),
    );
    for (const index of replaySamples.keys()) {
      await this.l5Runtime?.recordReplayResult({
        sample: replaySamples[index],
        result: replayResults[index],
      });
    }
    const suppliedScore = Number(input.suppliedResult.score);
    const score = Number.isFinite(suppliedScore)
      ? suppliedScore
      : this.averageScore([...caseResults, ...replayResults]);
    const suppliedPassed = input.suppliedResult.passed;
    const gradedResults = [...caseResults, ...replayResults];
    const passed =
      typeof suppliedPassed === 'boolean'
        ? suppliedPassed
        : gradedResults.every((item) => item.passed);
    const passedCount = gradedResults.filter((item) => item.passed).length;
    return {
      ...input.suppliedResult,
      runner: 'fitmeet_agent_eval_runner_v1',
      score,
      passed,
      sampleSize: gradedResults.length,
      passedCount,
      failedCount: gradedResults.length - passedCount,
      passRate:
        gradedResults.length > 0 ? passedCount / gradedResults.length : 1,
      evalCaseIds: input.evalCaseIds,
      caseResults,
      replayResults,
      evaluatedAt: new Date().toISOString(),
    };
  }

  private gradeEvalCase(
    patch: AgentSkillPatch,
    evalCase: AgentEvalCase,
  ): Record<string, unknown> & { score: number; passed: boolean } {
    const expected = this.asRecord(evalCase.expectedBehavior);
    const minScore = Number(expected.minScore);
    const requiredScore =
      Number.isFinite(minScore) && minScore > 0 ? minScore : 80;
    const checks = Array.isArray(expected.mustPassChecks)
      ? expected.mustPassChecks.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    const patchText = JSON.stringify({
      patchType: patch.patchType,
      target: patch.target,
      patch: patch.patch,
      rationale: patch.rationale,
    }).toLowerCase();
    const coveredChecks = checks.filter((check) =>
      this.patchTextCoversCheck(patchText, check),
    );
    const baseScore = patchText.length > 20 ? 82 : 55;
    const coverageBonus =
      checks.length > 0 ? (coveredChecks.length / checks.length) * 18 : 10;
    const score = Math.min(100, Math.round(baseScore + coverageBonus));
    return {
      evalCaseId: evalCase.id,
      title: evalCase.title,
      score,
      passed: score >= requiredScore,
      requiredScore,
      coveredChecks,
      missingChecks: checks.filter((check) => !coveredChecks.includes(check)),
      ranAt: new Date().toISOString(),
    };
  }

  private gradeReplaySample(
    patch: AgentSkillPatch,
    sample: { id: number; expectedBehavior: Record<string, unknown> },
  ): Record<string, unknown> & { score: number; passed: boolean } {
    const expected = this.asRecord(sample.expectedBehavior);
    const mustNotRegress = Array.isArray(expected.mustNotRegress)
      ? expected.mustNotRegress.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    const patchText = JSON.stringify({
      patchType: patch.patchType,
      target: patch.target,
      patch: patch.patch,
    }).toLowerCase();
    const regressions = mustNotRegress.filter((token) =>
      patchText.includes(token.toLowerCase()),
    );
    const score = regressions.length === 0 ? 95 : 55;
    return {
      replaySampleId: sample.id,
      score,
      passed: regressions.length === 0,
      regressions,
      ranAt: new Date().toISOString(),
    };
  }

  private patchTextCoversCheck(patchText: string, check: string): boolean {
    const tokens = check
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .filter((token) => token.length >= 3);
    if (tokens.some((token) => patchText.includes(token))) return true;
    if (/tone|user_facing|trace|leak/.test(check)) {
      return /(trace|internal|用户可见|user[-_ ]?facing|技术词|泄露)/i.test(
        patchText,
      );
    }
    if (/approval|confirm|action/.test(check)) {
      return /(confirm|approval|确认|审批|动作|side effect)/i.test(patchText);
    }
    if (/profile|life_graph|memory/.test(check)) {
      return /(profile|life graph|画像|记忆|memory)/i.test(patchText);
    }
    return false;
  }

  private averageScore(
    caseResults: Array<Record<string, unknown> & { score: number }>,
  ): number {
    if (caseResults.length === 0) return 100;
    return Math.round(
      caseResults.reduce((sum, item) => sum + item.score, 0) /
        caseResults.length,
    );
  }

  private assertPassingEvaluation(patch: AgentSkillPatch): void {
    const evaluation = this.asRecord(patch.patch?.lastEvaluation);
    if (evaluation.passed === false) {
      throw new BadRequestException('Skill patch eval failed');
    }
  }

  private autoPublishEvalGate(patch: AgentSkillPatch): {
    ok: boolean;
    reason?: string;
  } {
    const evaluation = this.asRecord(patch.patch?.lastEvaluation);
    const evalCaseIds = Array.isArray(patch.evalCaseIds)
      ? patch.evalCaseIds
      : [];
    const sampleSize = Number(evaluation.sampleSize);
    const passRate = Number(evaluation.passRate);
    const score = Number(evaluation.score);
    const replayResults = Array.isArray(evaluation.replayResults)
      ? evaluation.replayResults.map((item) => this.asRecord(item))
      : [];
    const caseResults = Array.isArray(evaluation.caseResults)
      ? evaluation.caseResults.map((item) => this.asRecord(item))
      : [];
    if (this.patchTouchesHighRiskSurface(patch)) {
      return { ok: false, reason: 'high_risk_surface_requires_review' };
    }
    const minEvalCases = patch.riskLevel === 'low' ? 1 : 3;
    if (evalCaseIds.length < minEvalCases) {
      return { ok: false, reason: 'insufficient_eval_case_coverage' };
    }
    if (Number.isFinite(sampleSize) && sampleSize < minEvalCases) {
      return { ok: false, reason: 'insufficient_eval_sample_size' };
    }
    if (evaluation.passed !== true) {
      return { ok: false, reason: 'eval_failed' };
    }
    if (Number.isFinite(score) && score < 85) {
      return { ok: false, reason: 'eval_score_below_threshold' };
    }
    if (Number.isFinite(passRate) && passRate < 1) {
      return { ok: false, reason: 'eval_pass_rate_below_threshold' };
    }
    if (
      [...caseResults, ...replayResults].some(
        (item) => item.passed === false || Number(item.score) < 80,
      )
    ) {
      return { ok: false, reason: 'eval_or_replay_regression' };
    }
    return { ok: true };
  }

  private patchTouchesHighRiskSurface(input: {
    patchType: string;
    target: string;
    patch: Record<string, unknown>;
    rationale: string;
  }): boolean {
    const text = this.patchControlText(input);
    return /safety_policy|tool_policy|privacy|payment|pay|send_message|connect_candidate|create_activity|publish|share_location|precise_location|公开发布|发消息|连接候选|创建活动|支付|隐私/.test(
      text,
    );
  }

  private rolloutPercent(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 10;
    return Math.min(100, Math.max(1, Math.round(parsed)));
  }

  private newFailureCluster(
    key: string,
    severity: AgentSkillPatchRiskLevel,
    source: AgentSelfImproveFailureCluster['source'] = 'reflection',
  ): AgentSelfImproveFailureCluster {
    const lower = key.toLowerCase();
    if (/approval|confirm|safety|risk/.test(lower)) {
      return {
        key,
        count: 0,
        severity,
        suggestedPatchType: 'safety_policy',
        suggestedTarget: 'scene_risk',
        reflectionIds: [],
        source,
      };
    }
    if (/profile|life|memory/.test(lower)) {
      return {
        key,
        count: 0,
        severity,
        suggestedPatchType: 'life_graph_extraction',
        suggestedTarget: 'profile_extraction.system_prompt',
        reflectionIds: [],
        source,
      };
    }
    if (/match|candidate|rank|recall/.test(lower)) {
      return {
        key,
        count: 0,
        severity,
        suggestedPatchType: 'prompt',
        suggestedTarget: 'social_match.system_prompt',
        reflectionIds: [],
        source,
      };
    }
    return {
      key,
      count: 0,
      severity,
      suggestedPatchType: 'prompt',
      suggestedTarget: 'final_response.system_prompt',
      reflectionIds: [],
      source,
    };
  }

  private async bindAutoEvalCase(
    patch: AgentSkillPatch,
    cluster: AgentSelfImproveFailureCluster,
  ): Promise<AgentSkillPatch> {
    const evalCase = await this.evalCaseRepo.save(
      this.evalCaseRepo.create({
        reflectionRunId: patch.reflectionRunId ?? null,
        agentTaskId: null,
        caseType: `auto_${cluster.source}`,
        status: 'active',
        title: `Auto eval: ${cluster.key}`,
        source: 'self_improve_runner',
        input: {
          clusterKey: cluster.key,
          source: cluster.source,
          evidence: cluster.evidence ?? [],
        },
        expectedBehavior: {
          minScore: cluster.severity === 'high' ? 92 : 85,
          mustPassChecks: [cluster.key],
          mustNotRegress: ['traceId', 'debug', 'stack', 'internal'],
        },
        lastRun: null,
      }),
    );
    patch.evalCaseIds = [
      ...new Set([...(patch.evalCaseIds ?? []), evalCase.id]),
    ];
    return this.patchRepo.save(patch);
  }

  private async onlineReplayFailureClusters(
    limit: number,
  ): Promise<AgentSelfImproveFailureCluster[]> {
    const samples = (await this.l5Runtime?.listReplaySamples(limit)) ?? [];
    const failed = samples.filter((sample) => {
      const lastReplay = this.asRecord(sample.lastReplay);
      return lastReplay.passed === false || Number(lastReplay.score) < 80;
    });
    if (failed.length === 0) return [];
    const cluster = this.newFailureCluster(
      'online_replay_regression',
      failed.length >= 3 ? 'medium' : 'low',
      'online_replay',
    );
    cluster.count = failed.length;
    cluster.evidence = failed.slice(0, 6).map((sample) => ({
      replaySampleId: sample.id,
      taskId: sample.agentTaskId,
      lastReplay: sample.lastReplay,
    }));
    return [cluster];
  }

  private async canaryMetricFailureClusters(
    limit: number,
  ): Promise<AgentSelfImproveFailureCluster[]> {
    const effects = (await this.l5Runtime?.listPatchEffects({ limit })) ?? [];
    const badEffects = effects.filter(
      (effect) =>
        /(fail|error|rollback|quality_drop|complaint|block)/i.test(
          effect.metric,
        ) && effect.value > 0.08,
    );
    if (badEffects.length === 0) return [];
    const cluster = this.newFailureCluster(
      'canary_metric_regression',
      'high',
      'canary_metrics',
    );
    cluster.count = badEffects.length;
    cluster.evidence = badEffects.slice(0, 6).map((effect) => ({
      patchId: effect.patchId,
      metric: effect.metric,
      value: effect.value,
      sampleSize: effect.sampleSize,
    }));
    return [cluster];
  }

  private async subagentMemoryFailureClusters(
    limit: number,
  ): Promise<AgentSelfImproveFailureCluster[]> {
    if (typeof this.l5Runtime?.listSubagentMemory !== 'function') return [];
    const memories = await this.l5Runtime.listSubagentMemory({ limit });
    const clusters = new Map<string, AgentSelfImproveFailureCluster>();
    for (const memory of memories) {
      const critique = this.asRecord(memory.critique);
      const failureReview = this.asRecord(critique.failureReview);
      if (failureReview.required !== true) continue;
      const key =
        typeof failureReview.clusterKey === 'string' &&
        failureReview.clusterKey.trim()
          ? failureReview.clusterKey.trim()
          : `${memory.agentName}:failure`;
      const cluster =
        clusters.get(key) ??
        this.newFailureCluster(key, 'medium', 'subagent_memory');
      cluster.count += 1;
      cluster.evidence = [
        ...(cluster.evidence ?? []),
        {
          memoryId: memory.id,
          agentName: memory.agentName,
          memoryScope: memory.memoryScope,
          failureReview,
        },
      ].slice(0, 6);
      clusters.set(key, cluster);
    }
    return [...clusters.values()].sort((a, b) => b.count - a.count);
  }

  private async recentCanaryEffects(
    patch: AgentSkillPatch,
  ): Promise<CanaryEffectLike[]> {
    const runtimeEffects =
      (await this.l5Runtime?.recentPatchEffects(patch.id)) ?? [];
    if (runtimeEffects.length > 0) return runtimeEffects;
    return this.readOnlineEffects(patch.patch).map((effect) => ({
      metric: typeof effect.metric === 'string' ? effect.metric : undefined,
      value: Number(effect.value),
      sampleSize: this.positiveNumberOrNull(effect.sampleSize),
    }));
  }

  private decideCanaryFromEffects(
    effects: CanaryEffectLike[],
  ): 'observe' | 'promote' | 'rollback' {
    const sampleSize = this.totalEffectSampleSize(effects);
    if (sampleSize < 20) return 'observe';
    const failureSignals = effects.filter((effect) =>
      /(fail|error|rollback|quality_drop|complaint|block)/i.test(
        effect.metric ?? '',
      ),
    );
    const badScore =
      failureSignals.length > 0
        ? failureSignals.reduce(
            (sum, effect) => sum + (Number(effect.value) || 0),
            0,
          ) / failureSignals.length
        : 0;
    if (badScore > 0.08) return 'rollback';
    const qualitySignals = effects.filter((effect) =>
      /(quality|satisfaction|success|pass|conversion)/i.test(
        effect.metric ?? '',
      ),
    );
    const goodScore =
      qualitySignals.length > 0
        ? qualitySignals.reduce(
            (sum, effect) => sum + (Number(effect.value) || 0),
            0,
          ) / qualitySignals.length
        : 0;
    return goodScore >= 0.85 ? 'promote' : 'observe';
  }

  private totalEffectSampleSize(
    effects: Array<{ sampleSize?: number | null }>,
  ): number {
    return effects.reduce(
      (sum, effect) => sum + (Number(effect.sampleSize) || 1),
      0,
    );
  }

  private readOnlineEffects(
    patch: Record<string, unknown> | null | undefined,
  ): Array<Record<string, unknown>> {
    const effects = patch?.onlineEffects;
    return Array.isArray(effects)
      ? effects.filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object' && !Array.isArray(item)),
        )
      : [];
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private assertPatchStatus(
    patch: AgentSkillPatch,
    allowed: AgentSkillPatchStatus[],
  ): void {
    if (allowed.includes(patch.status)) return;
    throw new BadRequestException(
      `Skill patch status ${patch.status} cannot transition here`,
    );
  }

  private async resolveEvalCaseIds(
    patch: AgentSkillPatch,
    explicitIds?: number[],
  ): Promise<number[]> {
    if (explicitIds?.length) {
      return explicitIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
    }
    if (!patch.reflectionRunId) return patch.evalCaseIds ?? [];
    const cases = await this.evalCaseRepo.find({
      where: { reflectionRunId: patch.reflectionRunId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 20,
    });
    return cases.map((item) => item.id);
  }

  private readPromptRules(patch: Record<string, unknown>): string[] {
    const rules: string[] = [];
    const appendRule = patch.appendRule;
    if (typeof appendRule === 'string' && appendRule.trim()) {
      rules.push(appendRule.trim());
    }
    const promptAddendum = patch.promptAddendum;
    if (typeof promptAddendum === 'string' && promptAddendum.trim()) {
      rules.push(promptAddendum.trim());
    }
    if (Array.isArray(patch.rules)) {
      for (const rule of patch.rules) {
        if (typeof rule === 'string' && rule.trim()) rules.push(rule.trim());
      }
    }
    return rules.slice(0, 20);
  }

  private patchMatchesTarget(
    patch: AgentSkillPatch,
    toolName: string,
  ): boolean {
    const normalizedToolName = toolName.trim();
    if (!patch.target) return true;
    if (patch.target === 'social_agent.tools') return true;
    if (patch.target === `tool:${normalizedToolName}`) return true;
    const patchToolName = patch.patch?.toolName;
    return (
      typeof patchToolName === 'string' && patchToolName === normalizedToolName
    );
  }

  private safeLimit(value: number): number {
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit <= 0) return 50;
    return Math.min(Math.floor(limit), 200);
  }

  private requiredText(value: unknown, fieldName: string): string {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new BadRequestException(`${fieldName} is required`);
    return text;
  }

  private optionalText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private positiveNumberOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}
