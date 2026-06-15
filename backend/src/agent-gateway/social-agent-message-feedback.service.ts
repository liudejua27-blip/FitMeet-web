import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import { AgentObservabilityService } from './agent-observability.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import {
  SocialAgentMessageFeedback,
  type SocialAgentMessageFeedbackValue,
} from './entities/social-agent-message-feedback.entity';

export type SocialAgentMessageFeedbackInput = {
  messageId: string;
  value: SocialAgentMessageFeedbackValue;
  reason?: string | null;
  taskId?: number | null;
  runId?: string | null;
  traceId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class SocialAgentMessageFeedbackService {
  constructor(
    @InjectRepository(SocialAgentMessageFeedback)
    private readonly feedbackRepo: Repository<SocialAgentMessageFeedback>,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly observability: AgentObservabilityService,
  ) {}

  async submit(ownerUserId: number, input: SocialAgentMessageFeedbackInput) {
    const messageId = cleanDisplayText(input.messageId, '').slice(0, 160);
    if (!messageId) throw new BadRequestException('messageId is required');
    if (input.value !== 'positive' && input.value !== 'negative') {
      throw new BadRequestException(
        'feedback value must be positive or negative',
      );
    }

    const agentTaskId = this.positiveNumber(input.taskId);
    if (agentTaskId) {
      await this.taskLifecycle.assertTaskOwner(agentTaskId, ownerUserId);
    }

    const existing = await this.feedbackRepo.findOne({
      where: { ownerUserId, messageId },
    });
    const row =
      existing ?? this.feedbackRepo.create({ ownerUserId, messageId });
    row.agentTaskId = agentTaskId;
    row.value = input.value;
    row.reason = cleanDisplayText(input.reason, '').slice(0, 240) || null;
    row.runId = cleanDisplayText(input.runId, '').slice(0, 120) || null;
    row.traceId = cleanDisplayText(input.traceId, '').slice(0, 120) || null;
    row.source = cleanDisplayText(input.source, 'agent_web').slice(0, 80);
    row.metadata = sanitizeForDisplay(input.metadata ?? {}) as Record<
      string,
      unknown
    >;

    const saved = await this.feedbackRepo.save(row);
    this.observability.recordUserSatisfaction({
      traceId: saved.traceId,
      score: saved.value === 'positive' ? 1 : 0,
      source: saved.source,
    });

    return {
      ok: true,
      id: saved.id,
      messageId: saved.messageId,
      value: saved.value,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  listRecent(limit = 50): Promise<SocialAgentMessageFeedback[]> {
    const take = Math.max(1, Math.min(Math.trunc(Number(limit)) || 50, 200));
    return this.feedbackRepo.find({
      order: { updatedAt: 'DESC', id: 'DESC' },
      take,
    });
  }

  private positiveNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
  }
}
