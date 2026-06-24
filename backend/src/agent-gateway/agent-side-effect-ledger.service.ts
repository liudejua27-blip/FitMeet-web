import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AgentSideEffectLedger,
  AgentSideEffectLedgerStatus,
} from './entities/agent-side-effect-ledger.entity';

type RunSideEffectInput = {
  ownerUserId: number;
  agentTaskId?: number | null;
  actionType: string;
  idempotencyKey: string;
  resourceType?: string;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AgentSideEffectLedgerService {
  private readonly logger = new Logger(AgentSideEffectLedgerService.name);

  constructor(
    @InjectRepository(AgentSideEffectLedger)
    private readonly repo: Repository<AgentSideEffectLedger>,
  ) {}

  async run<T extends Record<string, unknown>>(
    input: RunSideEffectInput,
    operation: () => Promise<T>,
  ): Promise<{ result: T; reused: boolean }> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) return { result: await operation(), reused: false };

    const existing = await this.repo.findOne({
      where: { actionType: input.actionType, idempotencyKey },
    });
    if (existing?.status === AgentSideEffectLedgerStatus.Succeeded) {
      return { result: existing.result as T, reused: true };
    }
    if (existing?.status === AgentSideEffectLedgerStatus.Pending) {
      const settled = await this.waitForSettled(
        input.actionType,
        idempotencyKey,
      );
      if (settled?.status === AgentSideEffectLedgerStatus.Succeeded) {
        return { result: settled.result as T, reused: true };
      }
      if (this.isFreshPending(existing)) {
        throw new Error('side_effect_already_running');
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
      });
    ledger.status = AgentSideEffectLedgerStatus.Pending;
    ledger.attemptCount = (ledger.attemptCount ?? 0) + 1;
    ledger.lastAttemptAt = new Date();
    ledger.nextRetryAt = null;
    ledger.errorMessage = '';
    await this.repo.save(ledger);

    try {
      const result = await operation();
      ledger.status = AgentSideEffectLedgerStatus.Succeeded;
      ledger.result = result;
      ledger.errorMessage = '';
      ledger.nextRetryAt = null;
      await this.repo.save(ledger);
      return { result, reused: false };
    } catch (error) {
      ledger.status = AgentSideEffectLedgerStatus.Failed;
      ledger.errorMessage = this.errorMessage(error);
      ledger.nextRetryAt = this.nextRetryAt(ledger.attemptCount);
      await this.repo.save(ledger);
      this.logger.warn({
        event: 'agent.side_effect.failed',
        actionType: input.actionType,
        idempotencyKey,
        agentTaskId: input.agentTaskId ?? null,
        error: ledger.errorMessage,
      });
      throw error;
    }
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
      if (!latest || latest.status !== AgentSideEffectLedgerStatus.Pending) {
        return latest;
      }
    }
    return null;
  }

  private isFreshPending(ledger: AgentSideEffectLedger): boolean {
    if (!ledger.lastAttemptAt) return true;
    return Date.now() - new Date(ledger.lastAttemptAt).getTime() < 30_000;
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
