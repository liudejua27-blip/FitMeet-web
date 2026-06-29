import { Injectable, Logger } from '@nestjs/common';

import { SocialAgentMainAgentTurnService } from '../social-agent-main-agent-turn.service';
import type {
  LegacyAgentFallbackInput,
  LegacyAgentFallbackResult,
} from './legacy-agent.types';

/**
 * Legacy comprehensive agent.
 *
 * Do not add Workout/Friend/Travel main-loop logic here.
 * This adapter is only for casual chat, explanation, old task compatibility,
 * and unknown fallback.
 */
@Injectable()
export class LegacyAgentAdapterService {
  private readonly logger = new Logger(LegacyAgentAdapterService.name);

  constructor(
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
  ) {}

  async handleFallback(
    input: LegacyAgentFallbackInput,
  ): Promise<LegacyAgentFallbackResult> {
    this.logger.log(
      JSON.stringify({
        event: 'legacy_agent.fallback',
        taskId: input.task.id,
        fallbackReason: input.fallbackReason,
        messagePreview: input.message.slice(0, 80),
      }),
    );

    return this.mainAgentTurn.handleRouteTurn({
      ownerUserId: input.ownerUserId,
      task: input.task,
      message: input.message,
      hasCandidates: input.body.hasCandidates === true,
      startedAt: input.startedAt,
      signal: input.signal,
    });
  }
}
