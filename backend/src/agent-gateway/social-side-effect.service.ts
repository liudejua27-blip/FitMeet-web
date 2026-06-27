import { Injectable } from '@nestjs/common';

import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';

type SocialSideEffectInput<T extends Record<string, unknown>> = {
  actorUserId: number;
  taskId?: number | null;
  effectType: string;
  idempotencyKey: string;
  payloadHash?: string | null;
  resourceType?: string;
  resourceId?: string | number | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  execute: () => Promise<T>;
  compensate?: () => Promise<unknown>;
};

@Injectable()
export class SocialSideEffectService {
  constructor(private readonly ledger: AgentSideEffectLedgerService) {}

  async runOnce<T extends Record<string, unknown>>(
    input: SocialSideEffectInput<T>,
  ): Promise<{ result: T; reused: boolean }> {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new Error('social_side_effect_idempotency_key_required');
    }
    return this.ledger.run(
      {
        ownerUserId: input.actorUserId,
        agentTaskId: input.taskId ?? null,
        actionType: input.effectType,
        idempotencyKey,
        resourceType: input.resourceType ?? '',
        resourceId: input.resourceId ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          payloadHash: input.payloadHash ?? null,
          hasCompensation: Boolean(input.compensate),
        },
        request: input.payload ?? input.metadata ?? {},
      },
      input.execute,
    );
  }
}
