import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentTask } from './entities/agent-task.entity';
import {
  PaymentIntent,
  PaymentIntentStatus,
} from './entities/payment-intent.entity';
import { buildSocialAgentPaymentIntentDedupeKey } from './social-agent-loop-state';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

export type SocialAgentPaymentIntentToolResult = {
  output: Record<string, unknown>;
  paymentIntentKeys?: string[];
};

@Injectable()
export class SocialAgentPaymentIntentToolService {
  constructor(
    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepo: Repository<PaymentIntent>,
    private readonly toolInput: SocialAgentToolInputParserService,
    private readonly taskMemory: SocialAgentTaskMemoryService,
  ) {}

  async record(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
  ): Promise<SocialAgentPaymentIntentToolResult> {
    const amount = this.toolInput.positiveAmount(
      input.amount ?? input.total ?? input.value,
    );
    if (amount == null) throw new BadRequestException('amount is required');

    const currency = (this.toolInput.string(input.currency) || 'CNY')
      .toUpperCase()
      .slice(0, 8);
    const targetUserId = this.toolInput.number(
      input.targetUserId ?? input.payeeUserId ?? input.toUserId,
    );
    const description =
      this.toolInput.string(input.description ?? input.summary ?? input.note) ||
      'Agent payment intent';
    const status =
      this.toolInput.paymentIntentStatus(input.status) ??
      PaymentIntentStatus.Created;
    const paymentDedupeKey = buildSocialAgentPaymentIntentDedupeKey({
      targetUserId: targetUserId ?? null,
      amount,
      currency,
      description,
    });

    if (
      this.taskMemory.hasSocialLoopKey(
        task,
        'paymentIntentKeys',
        paymentDedupeKey,
      )
    ) {
      return {
        output: {
          skipped: true,
          duplicate: true,
          reason: 'duplicate_payment_intent',
          targetUserId: targetUserId ?? null,
          amount: amount.toFixed(2),
          currency,
          description,
        },
      };
    }

    const paymentIntent = await this.paymentIntentRepo.save(
      this.paymentIntentRepo.create({
        ownerUserId: task.ownerUserId,
        agentConnectionId: task.agentConnectionId,
        agentTaskId: task.id,
        stepId,
        targetUserId: targetUserId ?? null,
        amount: amount.toFixed(2),
        currency,
        description,
        status,
        provider: this.toolInput.string(input.provider) || 'manual_intent',
        providerReference:
          this.toolInput.string(input.providerReference) ?? null,
        metadata: {
          ...(this.toolInput.isRecord(input.metadata) ? input.metadata : {}),
          agentTaskId: task.id,
          stepId,
          userId: task.ownerUserId,
          targetUserId: targetUserId ?? null,
          source: 'social_agent_tool_executor',
          permissionMode: task.permissionMode,
          auditPolicy: 'payment_intent_only_no_silent_charge',
          reversible: true,
          gatewayStatus: 'not_integrated',
        },
      }),
    );

    return {
      output: {
        id: paymentIntent.id,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        description: paymentIntent.description,
        targetUserId: paymentIntent.targetUserId,
        userId: task.ownerUserId,
        agentTaskId: task.id,
        provider: paymentIntent.provider,
        gatewayStatus: 'not_integrated',
        auditPolicy: 'payment_intent_only_no_silent_charge',
        reversible: true,
        message:
          'Payment intent created; real payment gateway integration is pending.',
      },
      paymentIntentKeys: this.taskMemory.appendSocialLoopKey(
        task,
        'paymentIntentKeys',
        paymentDedupeKey,
      ),
    };
  }
}
