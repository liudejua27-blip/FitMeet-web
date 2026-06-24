import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';

import {
  AgentSideEffectLedger,
  AgentSideEffectLedgerStatus,
} from './entities/agent-side-effect-ledger.entity';

export type SideEffectReconciliationResult<T extends Record<string, unknown>> =
  | { status: 'succeeded'; result: T }
  | { status: 'retry' }
  | { status: 'manual_review_required'; errorMessage?: string };

type RunSideEffectInput<T extends Record<string, unknown>> = {
  ownerUserId: number;
  agentTaskId?: number | null;
  actionType: string;
  idempotencyKey: string;
  resourceType?: string;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown>;
  request?: Record<string, unknown>;
  leaseMs?: number;
  leaseOwner?: string;
  maxAttempts?: number;
  reconcile?: (
    ledger: AgentSideEffectLedger,
  ) => Promise<SideEffectReconciliationResult<T> | null>;
};

type ClaimResult<T extends Record<string, unknown>> =
  | { kind: 'claimed'; ledger: AgentSideEffectLedger }
  | { kind: 'reused'; result: T }
  | { kind: 'running'; ledger: AgentSideEffectLedger }
  | { kind: 'reconciliation_required'; ledger: AgentSideEffectLedger };

type SqlQueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown>;
};

@Injectable()
export class AgentSideEffectLedgerService {
  private readonly logger = new Logger(AgentSideEffectLedgerService.name);
  private readonly processLeaseOwner = `pid:${process.pid}:${randomUUID()}`;

  constructor(
    @InjectRepository(AgentSideEffectLedger)
    private readonly repo: Repository<AgentSideEffectLedger>,
  ) {}

  async run<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
    operation: () => Promise<T>,
  ): Promise<{ result: T; reused: boolean }> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) return { result: await operation(), reused: false };

    const requestHash = this.requestHash(input);
    let claim = await this.claim(input, requestHash, false);
    if (claim.kind === 'reused') return { result: claim.result, reused: true };
    if (claim.kind === 'running') {
      const settled = await this.waitForSettled(
        input.actionType,
        idempotencyKey,
      );
      if (settled?.status === AgentSideEffectLedgerStatus.Succeeded) {
        return { result: settled.result as T, reused: true };
      }
      if (
        settled?.status === AgentSideEffectLedgerStatus.UnknownCommitState ||
        settled?.status === AgentSideEffectLedgerStatus.ManualReviewRequired
      ) {
        claim = { kind: 'reconciliation_required', ledger: settled };
      } else {
        throw new Error('side_effect_already_running');
      }
    }

    if (claim.kind === 'reconciliation_required') {
      const reconciliation = await this.reconcileOrThrow(input, claim.ledger);
      if (reconciliation.status === 'succeeded') {
        return { result: reconciliation.result, reused: true };
      }
      claim = await this.claim(input, requestHash, true);
      if (claim.kind !== 'claimed') {
        throw new Error('side_effect_reconciliation_required');
      }
    }

    if (claim.kind !== 'claimed') {
      throw new Error('side_effect_already_running');
    }

    const ledger = claim.ledger;

    try {
      const result = await operation();
      await this.markSucceeded(ledger, result);
      return { result, reused: false };
    } catch (error) {
      const failed = await this.markFailed(
        ledger,
        error,
        input.maxAttempts ?? 3,
      );
      this.logger.warn({
        event: 'agent.side_effect.failed',
        actionType: input.actionType,
        idempotencyKey,
        agentTaskId: input.agentTaskId ?? null,
        status: failed.status,
        error: failed.errorMessage,
      });
      throw error;
    }
  }

  private async claim<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
    requestHash: string,
    allowAfterReconciliation: boolean,
  ): Promise<ClaimResult<T>> {
    if (this.supportsAtomicSql()) {
      return this.claimWithSql(input, requestHash, allowAfterReconciliation);
    }
    return this.claimWithRepositoryFallback(
      input,
      requestHash,
      allowAfterReconciliation,
    );
  }

  private async claimWithSql<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
    requestHash: string,
    allowAfterReconciliation: boolean,
  ): Promise<ClaimResult<T>> {
    const idempotencyKey = input.idempotencyKey.trim();
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs(input));
    const leaseOwner = this.leaseOwner(input);

    return this.repo.manager.transaction(async (manager) => {
      const inserted = await this.queryRows<AgentSideEffectLedger>(
        manager,
        `INSERT INTO "agent_side_effect_ledger"
          ("ownerUserId", "agentTaskId", "actionType", "idempotencyKey",
           "status", "resourceType", "resourceId", "attemptCount",
           "leaseOwner", "leaseExpiresAt", "requestHash", "result",
           "metadata", "errorMessage", "lastAttemptAt", "nextRetryAt",
           "completedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, '{}'::jsonb,
           $11::jsonb, '', $12, NULL, NULL, $12, $12)
         ON CONFLICT ("actionType", "idempotencyKey") DO NOTHING
         RETURNING *`,
        [
          input.ownerUserId,
          input.agentTaskId ?? null,
          input.actionType,
          idempotencyKey,
          AgentSideEffectLedgerStatus.Running,
          input.resourceType ?? '',
          this.text(input.resourceId),
          leaseOwner,
          leaseExpiresAt,
          requestHash,
          JSON.stringify(input.metadata ?? {}),
          now,
        ],
      );
      if (inserted.length > 0) {
        return {
          kind: 'claimed',
          ledger: inserted[0],
        };
      }

      const rows = await this.queryRows<AgentSideEffectLedger>(
        manager,
        `SELECT * FROM "agent_side_effect_ledger"
         WHERE "actionType" = $1 AND "idempotencyKey" = $2
         FOR UPDATE`,
        [input.actionType, idempotencyKey],
      );
      const ledger = rows[0];
      if (!ledger) {
        throw new Error('side_effect_claim_failed');
      }
      this.assertRequestHash(ledger, requestHash);

      if (ledger.status === AgentSideEffectLedgerStatus.Succeeded) {
        return { kind: 'reused', result: ledger.result as T };
      }
      if (
        ledger.status === AgentSideEffectLedgerStatus.FailedFinal ||
        ledger.status === AgentSideEffectLedgerStatus.ManualReviewRequired
      ) {
        throw new Error(ledger.errorMessage || `side_effect_${ledger.status}`);
      }
      if (
        ledger.status === AgentSideEffectLedgerStatus.UnknownCommitState &&
        !allowAfterReconciliation
      ) {
        return { kind: 'reconciliation_required', ledger };
      }
      if (this.hasActiveLease(ledger, now)) {
        return { kind: 'running', ledger };
      }
      if (this.isPossiblyCommitted(ledger.status)) {
        const unknown = await this.markUnknownCommitState(manager, ledger, now);
        return { kind: 'reconciliation_required', ledger: unknown };
      }

      const claimedRows = await this.queryRows<AgentSideEffectLedger>(
        manager,
        `UPDATE "agent_side_effect_ledger"
         SET "status" = $1,
             "ownerUserId" = $2,
             "agentTaskId" = $3,
             "resourceType" = $4,
             "resourceId" = $5,
             "metadata" = $6::jsonb,
             "requestHash" = $7,
             "attemptCount" = COALESCE("attemptCount", 0) + 1,
             "leaseOwner" = $8,
             "leaseExpiresAt" = $9,
             "lastAttemptAt" = $10,
             "nextRetryAt" = NULL,
             "completedAt" = NULL,
             "errorMessage" = '',
             "updatedAt" = $10
         WHERE "id" = $11
         RETURNING *`,
        [
          AgentSideEffectLedgerStatus.Running,
          input.ownerUserId,
          input.agentTaskId ?? null,
          input.resourceType ?? '',
          this.text(input.resourceId),
          JSON.stringify(input.metadata ?? {}),
          requestHash,
          leaseOwner,
          leaseExpiresAt,
          now,
          ledger.id,
        ],
      );
      return {
        kind: 'claimed',
        ledger: claimedRows[0],
      };
    });
  }

  private async claimWithRepositoryFallback<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
    requestHash: string,
    allowAfterReconciliation: boolean,
  ): Promise<ClaimResult<T>> {
    const idempotencyKey = input.idempotencyKey.trim();
    const now = new Date();
    const existing = await this.repo.findOne({
      where: { actionType: input.actionType, idempotencyKey },
    });
    if (existing) {
      this.assertRequestHash(existing, requestHash);
      if (existing.status === AgentSideEffectLedgerStatus.Succeeded) {
        return { kind: 'reused', result: existing.result as T };
      }
      if (
        existing.status === AgentSideEffectLedgerStatus.FailedFinal ||
        existing.status === AgentSideEffectLedgerStatus.ManualReviewRequired
      ) {
        throw new Error(
          existing.errorMessage || `side_effect_${existing.status}`,
        );
      }
      if (
        existing.status === AgentSideEffectLedgerStatus.UnknownCommitState &&
        !allowAfterReconciliation
      ) {
        return { kind: 'reconciliation_required', ledger: existing };
      }
      if (this.hasActiveLease(existing, now)) {
        return { kind: 'running', ledger: existing };
      }
      if (this.isPossiblyCommitted(existing.status)) {
        existing.status = AgentSideEffectLedgerStatus.UnknownCommitState;
        existing.errorMessage =
          'side_effect_lease_expired_reconciliation_required';
        existing.leaseOwner = null;
        existing.leaseExpiresAt = null;
        await this.repo.save(existing);
        return { kind: 'reconciliation_required', ledger: existing };
      }
    }

    const ledger =
      existing ??
      this.repo.create({
        ownerUserId: input.ownerUserId,
        agentTaskId: input.agentTaskId ?? null,
        actionType: input.actionType,
        idempotencyKey,
        resourceType: input.resourceType ?? '',
        resourceId: this.text(input.resourceId),
        metadata: input.metadata ?? {},
        result: {},
      });
    ledger.status = AgentSideEffectLedgerStatus.Running;
    ledger.attemptCount = (ledger.attemptCount ?? 0) + 1;
    ledger.lastAttemptAt = now;
    ledger.nextRetryAt = null;
    ledger.errorMessage = '';
    ledger.leaseOwner = this.leaseOwner(input);
    ledger.leaseExpiresAt = new Date(now.getTime() + this.leaseMs(input));
    ledger.requestHash = requestHash;
    ledger.completedAt = null;
    await this.repo.save(ledger);
    return { kind: 'claimed', ledger };
  }

  private async reconcileOrThrow<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
    ledger: AgentSideEffectLedger,
  ): Promise<SideEffectReconciliationResult<T>> {
    if (!input.reconcile) {
      throw new Error('side_effect_reconciliation_required');
    }
    const result = await input.reconcile(ledger);
    if (!result) throw new Error('side_effect_reconciliation_required');
    if (result.status === 'succeeded') {
      await this.markSucceeded(ledger, result.result);
      return result;
    }
    if (result.status === 'manual_review_required') {
      ledger.status = AgentSideEffectLedgerStatus.ManualReviewRequired;
      ledger.errorMessage =
        result.errorMessage ?? 'side_effect_manual_review_required';
      ledger.leaseOwner = null;
      ledger.leaseExpiresAt = null;
      ledger.completedAt = new Date();
      await this.repo.save(ledger);
      throw new Error(ledger.errorMessage);
    }
    ledger.status = AgentSideEffectLedgerStatus.FailedRetryable;
    ledger.errorMessage = 'side_effect_reconciled_safe_to_retry';
    ledger.nextRetryAt = null;
    ledger.leaseOwner = null;
    ledger.leaseExpiresAt = null;
    await this.repo.save(ledger);
    return result;
  }

  private async markSucceeded<T extends Record<string, unknown>>(
    ledger: AgentSideEffectLedger,
    result: T,
  ) {
    ledger.status = AgentSideEffectLedgerStatus.Succeeded;
    ledger.result = result;
    ledger.errorMessage = '';
    ledger.nextRetryAt = null;
    ledger.leaseOwner = null;
    ledger.leaseExpiresAt = null;
    ledger.completedAt = new Date();
    await this.repo.save(ledger);
  }

  private async markFailed(
    ledger: AgentSideEffectLedger,
    error: unknown,
    maxAttempts: number,
  ): Promise<AgentSideEffectLedger> {
    const retryable = this.isRetryableError(error);
    const unknownCommit = this.isUnknownCommitError(error);
    ledger.status = unknownCommit
      ? AgentSideEffectLedgerStatus.UnknownCommitState
      : retryable && (ledger.attemptCount ?? 1) < maxAttempts
        ? AgentSideEffectLedgerStatus.FailedRetryable
        : AgentSideEffectLedgerStatus.FailedFinal;
    ledger.errorMessage = this.errorMessage(error);
    ledger.nextRetryAt =
      ledger.status === AgentSideEffectLedgerStatus.FailedRetryable
        ? this.nextRetryAt(ledger.attemptCount)
        : null;
    ledger.leaseOwner = null;
    ledger.leaseExpiresAt = null;
    ledger.completedAt =
      ledger.status === AgentSideEffectLedgerStatus.FailedFinal
        ? new Date()
        : null;
    await this.repo.save(ledger);
    return ledger;
  }

  private async markUnknownCommitState(
    manager: SqlQueryManager,
    ledger: AgentSideEffectLedger,
    now: Date,
  ): Promise<AgentSideEffectLedger> {
    const rows = await this.queryRows<AgentSideEffectLedger>(
      manager,
      `UPDATE "agent_side_effect_ledger"
       SET "status" = $1,
           "errorMessage" = $2,
           "leaseOwner" = NULL,
           "leaseExpiresAt" = NULL,
           "nextRetryAt" = NULL,
           "updatedAt" = $3
       WHERE "id" = $4
       RETURNING *`,
      [
        AgentSideEffectLedgerStatus.UnknownCommitState,
        'side_effect_lease_expired_reconciliation_required',
        now,
        ledger.id,
      ],
    );
    return rows[0];
  }

  private async queryRows<T>(
    manager: SqlQueryManager,
    query: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    const rows: unknown = await manager.query(query, parameters);
    if (!Array.isArray(rows)) return [];
    return rows as T[];
  }

  private nextRetryAt(attemptCount: number): Date {
    const delayMinutes = Math.min(Math.max(attemptCount, 1), 5);
    return new Date(Date.now() + delayMinutes * 60_000);
  }

  private async waitForSettled(
    actionType: string,
    idempotencyKey: string,
  ): Promise<AgentSideEffectLedger | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await this.sleep(100);
      const latest = await this.repo.findOne({
        where: { actionType, idempotencyKey },
      });
      if (
        !latest ||
        (latest.status !== AgentSideEffectLedgerStatus.Pending &&
          latest.status !== AgentSideEffectLedgerStatus.Running)
      ) {
        return latest;
      }
    }
    return null;
  }

  private hasActiveLease(ledger: AgentSideEffectLedger, now = new Date()) {
    if (
      ledger.status !== AgentSideEffectLedgerStatus.Pending &&
      ledger.status !== AgentSideEffectLedgerStatus.Running
    ) {
      return false;
    }
    const expiresAt = ledger.leaseExpiresAt
      ? new Date(ledger.leaseExpiresAt).getTime()
      : ledger.lastAttemptAt
        ? new Date(ledger.lastAttemptAt).getTime() + 30_000
        : 0;
    return expiresAt > now.getTime();
  }

  private isPossiblyCommitted(status: AgentSideEffectLedgerStatus): boolean {
    return (
      status === AgentSideEffectLedgerStatus.Pending ||
      status === AgentSideEffectLedgerStatus.Running
    );
  }

  private assertRequestHash(
    ledger: AgentSideEffectLedger,
    requestHash: string,
  ) {
    if (ledger.requestHash && ledger.requestHash !== requestHash) {
      throw new Error('side_effect_idempotency_key_conflict');
    }
  }

  private requestHash<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
  ): string {
    const payload = {
      actionType: input.actionType,
      ownerUserId: input.ownerUserId,
      resourceType: input.resourceType ?? '',
      resourceId: this.text(input.resourceId),
      request: input.request ?? input.metadata ?? {},
    };
    return createHash('sha256')
      .update(this.stableStringify(payload))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object')
      return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
      )
      .join(',')}}`;
  }

  private supportsAtomicSql() {
    return typeof this.repo.manager?.transaction === 'function';
  }

  private leaseMs<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
  ) {
    const leaseMs = Number(input.leaseMs ?? 30_000);
    if (!Number.isFinite(leaseMs) || leaseMs < 1_000) return 30_000;
    return Math.min(leaseMs, 10 * 60_000);
  }

  private leaseOwner<T extends Record<string, unknown>>(
    input: RunSideEffectInput<T>,
  ) {
    return (input.leaseOwner?.trim() || this.processLeaseOwner).slice(0, 120);
  }

  private isRetryableError(error: unknown): boolean {
    const record = error as { retryable?: unknown; status?: unknown };
    if (record?.retryable === false) return false;
    if (record?.status === 400 || record?.status === 403) return false;
    return true;
  }

  private isUnknownCommitError(error: unknown): boolean {
    const record = error as {
      code?: unknown;
      unknownCommitState?: unknown;
      commitStateUnknown?: unknown;
    };
    return (
      record?.code === 'UNKNOWN_COMMIT_STATE' ||
      record?.unknownCommitState === true ||
      record?.commitStateUnknown === true
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown): string {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'side_effect_failed';
    const trimmed = message.trim();
    return (trimmed || 'side_effect_failed').slice(0, 500);
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value.trim().slice(0, 120);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim().slice(0, 120);
    }
    return '';
  }
}
