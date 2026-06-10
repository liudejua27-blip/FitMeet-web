import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { redactSensitiveValue } from '../common/privacy-redaction.util';
import { LifeGraphAccessAuditLog } from './entities/life-graph-access-audit-log.entity';
import { LifeGraphAuditLog } from './entities/life-graph-audit-log.entity';
import { LifeGraphBehaviorEvent } from './entities/life-graph-behavior-event.entity';
import { LifeGraphCorrection } from './entities/life-graph-correction.entity';
import { LifeGraphField } from './entities/life-graph-field.entity';
import { LifeGraphSignalScore } from './entities/life-graph-signal-score.entity';
import { LifeGraphUpdateAudit } from './entities/life-graph-update-audit.entity';
import { LifeGraphDataTier } from './life-graph.enums';
import { classifyLifeGraphField } from './life-graph-privacy.util';

type SensitiveAccessInput = {
  userId: number;
  actorUserId?: number | null;
  action: string;
  purpose: string;
  route?: string;
  decision?: 'allowed' | 'denied' | 'system';
  fields?: LifeGraphField[];
  fieldKeys?: string[];
  dataTiers?: LifeGraphDataTier[];
  metadata?: Record<string, unknown>;
};

type RetentionDeleteTarget =
  | 'behaviorEvents'
  | 'signalScores'
  | 'updateAudits'
  | 'corrections'
  | 'auditLogs'
  | 'accessAuditLogs';

type RetentionResult = Record<
  RetentionDeleteTarget,
  { cutoff: string; deleted: number; dryRun: boolean }
>;

@Injectable()
export class LifeGraphComplianceService {
  private readonly logger = new Logger(LifeGraphComplianceService.name);

  constructor(
    @InjectRepository(LifeGraphAccessAuditLog)
    private readonly accessAuditLogs: Repository<LifeGraphAccessAuditLog>,
    @InjectRepository(LifeGraphBehaviorEvent)
    private readonly behaviorEvents: Repository<LifeGraphBehaviorEvent>,
    @InjectRepository(LifeGraphSignalScore)
    private readonly signalScores: Repository<LifeGraphSignalScore>,
    @InjectRepository(LifeGraphUpdateAudit)
    private readonly updateAudits: Repository<LifeGraphUpdateAudit>,
    @InjectRepository(LifeGraphCorrection)
    private readonly corrections: Repository<LifeGraphCorrection>,
    @InjectRepository(LifeGraphAuditLog)
    private readonly auditLogs: Repository<LifeGraphAuditLog>,
  ) {}

  async auditSensitiveAccess(input: SensitiveAccessInput): Promise<void> {
    const dataTiers = this.resolveDataTiers(input);
    const fieldKeys = this.resolveFieldKeys(input);
    const shouldWrite =
      dataTiers.some((tier) => tier !== LifeGraphDataTier.PublicProfile) ||
      ['export', 'delete', 'retention_purge'].includes(input.action);
    if (!shouldWrite) return;
    try {
      await this.accessAuditLogs.save(
        this.accessAuditLogs.create({
          userId: input.userId,
          actorUserId: input.actorUserId ?? input.userId,
          action: input.action,
          purpose: input.purpose,
          route: input.route ?? '',
          decision: input.decision ?? 'allowed',
          dataTiers,
          fieldKeys,
          metadata: redactSensitiveValue(input.metadata ?? {}) as Record<
            string,
            unknown
          >,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'life_graph.sensitive_access_audit_failed',
          userId: input.userId,
          action: input.action,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  listAccessAuditLogs(input: {
    userId?: number | null;
    limit?: number;
  }): Promise<LifeGraphAccessAuditLog[]> {
    const where = input.userId ? { userId: input.userId } : {};
    return this.accessAuditLogs.find({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: this.limit(input.limit),
    });
  }

  retentionPolicy() {
    return {
      behaviorEventsDays: this.days('LIFE_GRAPH_BEHAVIOR_RETENTION_DAYS', 365),
      signalScoresDays: this.days(
        'LIFE_GRAPH_SIGNAL_SCORE_RETENTION_DAYS',
        540,
      ),
      updateAuditsDays: this.days(
        'LIFE_GRAPH_UPDATE_AUDIT_RETENTION_DAYS',
        730,
      ),
      correctionsDays: this.days('LIFE_GRAPH_CORRECTION_RETENTION_DAYS', 730),
      auditLogsDays: this.days('LIFE_GRAPH_AUDIT_LOG_RETENTION_DAYS', 1095),
      accessAuditLogsDays: this.days(
        'LIFE_GRAPH_ACCESS_AUDIT_RETENTION_DAYS',
        1095,
      ),
    };
  }

  async applyRetentionPolicy(
    input: {
      dryRun?: boolean;
      actorUserId?: number | null;
    } = {},
  ): Promise<{
    policy: ReturnType<typeof this.retentionPolicy>;
    result: RetentionResult;
  }> {
    const dryRun = input.dryRun !== false;
    const policy = this.retentionPolicy();
    const result: RetentionResult = {
      behaviorEvents: await this.purgeByDate(
        this.behaviorEvents,
        'createdAt',
        policy.behaviorEventsDays,
        dryRun,
      ),
      signalScores: await this.purgeByDate(
        this.signalScores,
        'updatedAt',
        policy.signalScoresDays,
        dryRun,
      ),
      updateAudits: await this.purgeByDate(
        this.updateAudits,
        'createdAt',
        policy.updateAuditsDays,
        dryRun,
      ),
      corrections: await this.purgeByDate(
        this.corrections,
        'createdAt',
        policy.correctionsDays,
        dryRun,
      ),
      auditLogs: await this.purgeByDate(
        this.auditLogs,
        'createdAt',
        policy.auditLogsDays,
        dryRun,
      ),
      accessAuditLogs: await this.purgeByDate(
        this.accessAuditLogs,
        'createdAt',
        policy.accessAuditLogsDays,
        dryRun,
      ),
    };
    await this.auditSensitiveAccess({
      userId: input.actorUserId ?? 0,
      actorUserId: input.actorUserId ?? null,
      action: 'retention_purge',
      purpose: dryRun
        ? 'life_graph_retention_dry_run'
        : 'life_graph_retention_apply',
      route: '/social-agent/l5/compliance/life-graph-retention/apply',
      decision: 'system',
      dataTiers: [
        LifeGraphDataTier.PrivateMatching,
        LifeGraphDataTier.Sensitive,
        LifeGraphDataTier.UserSecret,
      ],
      metadata: { dryRun, result },
    });
    return { policy, result };
  }

  private resolveDataTiers(input: SensitiveAccessInput): LifeGraphDataTier[] {
    if (input.dataTiers?.length) return Array.from(new Set(input.dataTiers));
    const tiers = (input.fields ?? []).map((field) =>
      classifyLifeGraphField({
        category: field.category,
        fieldKey: field.fieldKey,
        signalType: field.signalType,
      }),
    );
    return Array.from(new Set(tiers));
  }

  private resolveFieldKeys(input: SensitiveAccessInput): string[] {
    if (input.fieldKeys?.length) {
      return Array.from(new Set(input.fieldKeys)).slice(0, 200);
    }
    return Array.from(
      new Set((input.fields ?? []).map((field) => field.fieldKey)),
    ).slice(0, 200);
  }

  private async purgeByDate<T extends object>(
    repo: Repository<T>,
    field: string,
    days: number,
    dryRun: boolean,
  ): Promise<{ cutoff: string; deleted: number; dryRun: boolean }> {
    const cutoff = new Date(Date.now() - days * 86400000);
    const where = { [field]: LessThan(cutoff) } as never;
    const deleted = dryRun
      ? await repo.count({ where })
      : ((await repo.delete(where)).affected ?? 0);
    return { cutoff: cutoff.toISOString(), deleted, dryRun };
  }

  private days(key: string, fallback: number): number {
    const parsed = Number(process.env[key]);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.trunc(parsed);
  }

  private limit(value?: number): number {
    if (!Number.isFinite(value) || !value || value <= 0) return 50;
    return Math.min(500, Math.trunc(value));
  }
}
