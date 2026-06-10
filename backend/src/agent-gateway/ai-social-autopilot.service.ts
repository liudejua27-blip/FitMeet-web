import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';

import {
  AgentProfile,
  AgentProfileStatus,
  AgentAutonomyLevel,
} from './entities/agent-profile.entity';
import {
  ApprovalRiskLevel,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  AgentActionLog,
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  UserSocialRequest,
  UserSocialRequestStatus,
} from '../social-requests/social-request.entity';
import { shouldRunBackgroundJobs } from '../common/process-role.util';
import {
  SocialRequestCandidate,
  SocialRequestCandidateStatus,
  CandidateRiskLevel,
} from '../match/social-request-candidate.entity';
import { MatchService } from '../match/match.service';
import { AgentApprovalService } from './agent-approval.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { AgentActionLogService } from './agent-action-log.service';
import { AgentWebhookService } from './agent-webhook.service';
import { canAutoExecute } from './agent-autonomy.policy';
import { AgentSettingsMode } from './entities/agent-settings.entity';

/**
 * AiSocialAutopilotService
 *
 * Cron-driven internal autopilot that, for each active AgentProfile, scans
 * the owner's active social requests, runs the match pipeline (which
 * already enriches candidates via DeepSeek with deterministic fallbacks),
 * and decides per-candidate whether to:
 *   - auto-execute (creates a PendingAction + immediately approves it, so
 *     the existing dispatcher path runs and advances candidate/request
 *     status),
 *   - queue a PendingAction for owner approval, or
 *   - record only a planned AgentActionLog (suggestion-only mode).
 *
 * The autopilot never crashes the whole sweep — every per-agent iteration
 * is wrapped in try/catch and per-candidate work is best-effort.
 *
 * Disabled by default. Toggle with env ENABLE_AI_SOCIAL_AUTOPILOT=true.
 * Effective minimum interval via AI_SOCIAL_AUTOPILOT_INTERVAL_MINUTES.
 */
@Injectable()
export class AiSocialAutopilotService {
  private readonly logger = new Logger(AiSocialAutopilotService.name);
  private lastRunAt: Date | null = null;
  private running = false;

  private static readonly ACTIVE_REQUEST_STATUSES = [
    UserSocialRequestStatus.Matching,
    UserSocialRequestStatus.Matched,
    UserSocialRequestStatus.InvitationPending,
  ];

  constructor(
    @InjectRepository(AgentProfile)
    private readonly profileRepo: Repository<AgentProfile>,
    @InjectRepository(UserSocialRequest)
    private readonly requestRepo: Repository<UserSocialRequest>,
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(AgentActionLog)
    private readonly actionLogRepo: Repository<AgentActionLog>,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
    private readonly approvals: AgentApprovalService,
    private readonly dispatcher: AgentApprovalDispatcherService,
    private readonly actionLogs: AgentActionLogService,
    private readonly webhooks: AgentWebhookService,
  ) {}

  // ── Cron entry ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async onCron(): Promise<void> {
    if (!shouldRunBackgroundJobs()) return;
    if (!isEnabled()) return;
    const intervalMs = configuredIntervalMs();
    if (
      this.lastRunAt &&
      Date.now() - this.lastRunAt.getTime() < intervalMs - 1000
    ) {
      return;
    }
    try {
      await this.runOnce('cron');
    } catch (err) {
      this.logger.error(
        `Autopilot cron failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Execute a single autopilot sweep.
   *
   * - When `ownerUserId` is provided, the sweep is scoped to that owner's
   *   active AgentProfile(s). This is what the legacy agent-token endpoint
   *   `POST /agent/social-autopilot/run-once` triggers — it gives an agent
   *   the ability to ask the platform to process its owner's queue without
   *   waiting for the next cron tick.
   * - When omitted, scans every active AgentProfile (cron / ops trigger).
   *
   * Safe to call from cron or any manual trigger endpoint.
   */
  async runOnce(
    triggeredBy: 'cron' | 'manual' = 'manual',
    ownerUserId?: number,
  ): Promise<AutopilotRunSummary> {
    if (this.running) {
      this.logger.warn('Autopilot sweep already in progress, skipping');
      return {
        triggeredBy,
        skipped: true,
        reason: 'already_running',
        agentsScanned: 0,
        requestsScanned: 0,
        decisions: { executed: 0, pending: 0, planned: 0, skipped: 0 },
      };
    }
    this.running = true;
    this.lastRunAt = new Date();

    const summary: AutopilotRunSummary = {
      triggeredBy,
      skipped: false,
      agentsScanned: 0,
      requestsScanned: 0,
      decisions: { executed: 0, pending: 0, planned: 0, skipped: 0 },
    };

    try {
      let profiles: AgentProfile[] = [];
      try {
        profiles = await this.profileRepo.find({
          where: {
            status: AgentProfileStatus.Active,
            ...(ownerUserId != null ? { ownerUserId } : {}),
          },
          take: 200,
        });
      } catch (err) {
        this.logger.error(
          `Autopilot: failed to load profiles (owner=${ownerUserId ?? 'all'}): ${
            err instanceof Error ? err.stack || err.message : String(err)
          }`,
        );
        return summary;
      }

      for (const profile of profiles) {
        if (profile.ownerUserId == null) continue;
        summary.agentsScanned += 1;
        try {
          await this.processAgent(profile, summary);
        } catch (err) {
          this.logger.error(
            `Autopilot failed for agent ${profile.id} (owner=${profile.ownerUserId}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Autopilot sweep crashed: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }

    this.logger.log(
      `Autopilot sweep done (${triggeredBy}): agents=${summary.agentsScanned} requests=${summary.requestsScanned} decisions=${JSON.stringify(summary.decisions)}`,
    );
    return summary;
  }

  // ── Per-agent processing ──────────────────────────────────────

  private async processAgent(
    profile: AgentProfile,
    summary: AutopilotRunSummary,
  ): Promise<void> {
    const ownerUserId = profile.ownerUserId as number;
    const dailyCap = dailyCapFor(profile.autonomyLevel);
    if (
      dailyCap <= 0 &&
      !canAutoExecute('send_message', profile.autonomyLevel, 'low')
    ) {
      // Assisted/sandbox modes: only suggestion-only path applies.
    }

    const todayCount = await this.countTodayAutoMessages(ownerUserId);
    let remainingCap = Math.max(0, dailyCap - todayCount);

    const requests = await this.requestRepo.find({
      where: {
        userId: ownerUserId,
        status: In(AiSocialAutopilotService.ACTIVE_REQUEST_STATUSES),
      },
      order: { updatedAt: 'DESC' },
      take: 10,
    });
    if (requests.length === 0) return;

    for (const request of requests) {
      summary.requestsScanned += 1;
      // Generate / refresh candidates. Best-effort; runMatch already
      // catches AI enrichment failures internally and applies fallbacks.
      try {
        await this.matchService.runMatch(request.id, ownerUserId, { limit: 8 });
      } catch (err) {
        this.logger.warn(
          `runMatch skipped for request=${request.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }

      const candidates = await this.candidateRepo.find({
        where: {
          socialRequestId: request.id,
          status: SocialRequestCandidateStatus.Suggested,
        },
        order: { score: 'DESC' },
        take: 5,
      });

      for (const cand of candidates) {
        try {
          const decision = await this.decideAndExecute(
            profile,
            request,
            cand,
            remainingCap,
          );
          summary.decisions[decision] += 1;
          if (decision === 'executed') remainingCap -= 1;
        } catch (err) {
          this.logger.warn(
            `Candidate decision failed (req=${request.id}, cand=${cand.id}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  // ── Per-candidate decision ────────────────────────────────────

  private async decideAndExecute(
    profile: AgentProfile,
    request: UserSocialRequest,
    candidate: SocialRequestCandidate,
    remainingCap: number,
  ): Promise<DecisionOutcome> {
    const ownerUserId = profile.ownerUserId as number;

    // Dedup: never re-message a candidate the agent has already messaged.
    const alreadyMessaged = await this.actionLogRepo.findOne({
      where: {
        ownerUserId,
        actionType: AgentActionType.SendMessage,
        targetUserId: candidate.candidateUserId,
        actionStatus: In([
          AgentActionStatus.Executed,
          AgentActionStatus.PendingApproval,
        ]),
      },
    });
    if (alreadyMessaged) return 'skipped';

    // Dedup: candidate row already advanced past Suggested.
    if (candidate.status !== SocialRequestCandidateStatus.Suggested) {
      return 'skipped';
    }

    const sanitizedMessage = stripPii(candidate.suggestedMessage ?? '');
    const candidateRisk = candidate.riskLevel ?? CandidateRiskLevel.Low;
    const approvalRisk = mapCandidateToApprovalRisk(candidateRisk);
    const actionRisk = mapCandidateToActionRisk(candidateRisk);

    const canAuto =
      canAutoExecute('send_message', profile.autonomyLevel, candidateRisk) &&
      remainingCap > 0 &&
      profile.agentConnectionId !== null &&
      sanitizedMessage.length > 0;

    const isAssistedOnly = !canAutoExecute(
      'send_message',
      profile.autonomyLevel,
      'low',
    );

    // Branch 1: Assisted/sandbox/etc. — suggestion only.
    if (isAssistedOnly) {
      await this.actionLogs.logAgentAction({
        ownerUserId,
        agentId: profile.agentConnectionId,
        actionType: AgentActionType.SendMessage,
        actionStatus: AgentActionStatus.Planned,
        riskLevel: actionRisk,
        targetUserId: candidate.candidateUserId,
        relatedSocialRequestId: request.id,
        relatedCandidateId: candidate.id,
        inputSummary: sanitizedMessage,
        outputSummary: 'suggestion_only_assisted_mode',
        payload: {
          autonomyLevel: profile.autonomyLevel,
          score: candidate.score,
        },
        reason: 'autopilot_suggestion_assisted',
      });
      return 'planned';
    }

    // Branch 2: Auto-execute via existing approval+dispatcher path.
    if (canAuto) {
      const approval = await this.approvals.create({
        userId: ownerUserId,
        agentConnectionId: profile.agentConnectionId,
        type: ApprovalType.SendMessage,
        actionType: 'send_message',
        skillName: 'autopilot.send_message',
        payload: {
          toUserId: candidate.candidateUserId,
          content: sanitizedMessage,
          socialRequestId: request.id,
          candidateRecordId: candidate.id,
        },
        summary: truncate(sanitizedMessage, 200),
        riskLevel: approvalRisk,
        reason: 'autopilot_auto_execute',
        createdBy: 'agent',
        relatedSocialRequestId: request.id,
        relatedCandidateId: candidate.id,
        rationale: 'AI Social Autopilot 自动外联候选用户',
      });

      const result = await this.approvals.approve(
        approval.id,
        ownerUserId,
        (a) => this.dispatcher.dispatch(a),
      );

      const failed = result.dispatchError !== undefined;
      await this.actionLogs.logAgentAction({
        ownerUserId,
        agentId: profile.agentConnectionId,
        actionType: AgentActionType.SendMessage,
        actionStatus: failed
          ? AgentActionStatus.Failed
          : AgentActionStatus.Executed,
        riskLevel: actionRisk,
        targetUserId: candidate.candidateUserId,
        relatedSocialRequestId: request.id,
        relatedCandidateId: candidate.id,
        inputSummary: sanitizedMessage,
        outputSummary: failed
          ? `dispatch_failed: ${result.dispatchError}`
          : 'autopilot_executed',
        payload: {
          approvalId: approval.id,
          autonomyLevel: profile.autonomyLevel,
          score: candidate.score,
        },
        reason: failed
          ? 'autopilot_dispatch_failed'
          : 'autopilot_auto_executed',
      });
      if (!failed) {
        this.emitAutopilotWebhook(profile.agentConnectionId, {
          ownerUserId,
          agentProfileId: profile.id,
          socialRequestId: request.id,
          candidateId: candidate.id,
          targetUserId: candidate.candidateUserId,
          approvalId: approval.id,
          decision: 'executed',
        });
      }
      return failed ? 'skipped' : 'executed';
    }

    // Branch 3: Needs approval — queue PendingAction.
    if (this.shouldQueueAutopilotApproval())
      await this.approvals.create({
        userId: ownerUserId,
        agentConnectionId: profile.agentConnectionId,
        type: ApprovalType.SendMessage,
        actionType: 'send_message',
        skillName: 'autopilot.send_message',
        payload: {
          toUserId: candidate.candidateUserId,
          content: sanitizedMessage,
          socialRequestId: request.id,
          candidateRecordId: candidate.id,
        },
        summary: truncate(sanitizedMessage, 200),
        riskLevel: approvalRisk,
        reason:
          remainingCap <= 0
            ? 'autopilot_daily_cap_reached'
            : 'autopilot_needs_approval',
        createdBy: 'agent',
        relatedSocialRequestId: request.id,
        relatedCandidateId: candidate.id,
        rationale: 'AI Social Autopilot 建议向该用户发送破冰消息，等待你的确认',
      });

    await this.actionLogs.logAgentAction({
      ownerUserId,
      agentId: profile.agentConnectionId,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Planned,
      riskLevel: actionRisk,
      targetUserId: candidate.candidateUserId,
      relatedSocialRequestId: request.id,
      relatedCandidateId: candidate.id,
      inputSummary: sanitizedMessage,
      outputSummary:
        remainingCap <= 0
          ? 'autopilot_daily_cap_reached'
          : 'autopilot_not_auto_executable',
      payload: {
        autonomyLevel: profile.autonomyLevel,
        score: candidate.score,
        capRemaining: remainingCap,
      },
      reason:
        remainingCap <= 0
          ? 'autopilot_daily_cap_reached'
          : 'autopilot_not_auto_executable',
    });
    this.emitAutopilotWebhook(profile.agentConnectionId, {
      ownerUserId,
      agentProfileId: profile.id,
      socialRequestId: request.id,
      candidateId: candidate.id,
      targetUserId: candidate.candidateUserId,
      decision: 'planned',
    });
    return 'planned';
  }

  private emitAutopilotWebhook(
    agentConnectionId: number | null | undefined,
    payload: Record<string, unknown>,
  ) {
    void this.webhooks.emitToConnection(
      agentConnectionId,
      'autopilot.action_executed',
      payload,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────

  private shouldQueueAutopilotApproval() {
    return false;
  }

  private async countTodayAutoMessages(ownerUserId: number): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.actionLogRepo.count({
      where: {
        ownerUserId,
        actionType: AgentActionType.SendMessage,
        actionStatus: AgentActionStatus.Executed,
        createdAt: Between(start, end),
      },
    });
  }
}

// ── Module-local helpers ─────────────────────────────────────────

export interface AutopilotRunSummary {
  triggeredBy: 'cron' | 'manual';
  skipped: boolean;
  reason?: string;
  agentsScanned: number;
  requestsScanned: number;
  decisions: Record<DecisionOutcome, number>;
}

type DecisionOutcome = 'executed' | 'pending' | 'planned' | 'skipped';

function isEnabled(): boolean {
  return (
    (process.env.ENABLE_AI_SOCIAL_AUTOPILOT ?? '').toLowerCase() === 'true'
  );
}

function configuredIntervalMs(): number {
  const raw = Number(process.env.AI_SOCIAL_AUTOPILOT_INTERVAL_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : 5;
  return minutes * 60 * 1000;
}

function dailyCapFor(level: AgentAutonomyLevel): number {
  switch (level) {
    case AgentAutonomyLevel.Open:
      return 50;
    case AgentAutonomyLevel.Normal:
      return 10;
    case AgentAutonomyLevel.Assisted:
    default:
      return 0;
  }
}

function mapCandidateToApprovalRisk(
  level: CandidateRiskLevel,
): ApprovalRiskLevel {
  switch (level) {
    case CandidateRiskLevel.High:
      return ApprovalRiskLevel.High;
    case CandidateRiskLevel.Medium:
      return ApprovalRiskLevel.Medium;
    default:
      return ApprovalRiskLevel.Low;
  }
}

function mapCandidateToActionRisk(
  level: CandidateRiskLevel,
): AgentActionRiskLevel {
  switch (level) {
    case CandidateRiskLevel.High:
      return AgentActionRiskLevel.High;
    case CandidateRiskLevel.Medium:
      return AgentActionRiskLevel.Medium;
    default:
      return AgentActionRiskLevel.Low;
  }
}

/**
 * Strip personally identifiable contact info before any auto-message is
 * queued / executed. We are intentionally conservative: when in doubt we
 * redact rather than transmit.
 */
function stripPii(text: string): string {
  if (!text) return '';
  let out = text;
  // Chinese mobile numbers
  out = out.replace(/1[3-9]\d{9}/g, '[已隐藏]');
  // International-ish phone numbers
  out = out.replace(/\+?\d[\d\s-]{7,}\d/g, '[已隐藏]');
  // WeChat / QQ / Line / Telegram handles
  out = out.replace(
    /(微信|wechat|wx|qq|line|telegram|tg)[\s:：是号id]*[\w.-]{3,}/gi,
    '[联系方式已隐藏]',
  );
  // Email
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[已隐藏]');
  // Detailed address hints (number + 号/室/楼/室号)
  out = out.replace(/\d+\s*(号|室|楼|栋|层)/g, '[地址已隐藏]');
  return out.trim();
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// AgentSettingsMode is referenced via canAutoExecute through the policy module;
// keep a side-effect-free import retained so tree-shaking does not strip the enum.
void AgentSettingsMode;
