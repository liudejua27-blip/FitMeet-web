import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import type { SocialAgentCardActionBody } from '../social-agent-action.types';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { WorkoutLoopService } from '../workout-loop/workout-loop.service';

@Injectable()
export class ClarificationCardActionService {
  constructor(
    @Optional()
    private readonly workoutLoop?: WorkoutLoopService,
  ) {}

  async perform(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    if (!this.workoutLoop) {
      throw new BadRequestException(
        'Workout clarification runtime unavailable',
      );
    }
    const action =
      typeof input.body.action === 'string' ? input.body.action : '';
    if (action === 'clarification.yes') {
      return this.workoutLoop.applyConfirmedSlots({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        payload: record(input.body.payload),
      });
    }
    if (action === 'clarification.no') {
      return this.workoutLoop.openIntakeFromFallback({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        payload: record(input.body.payload),
      });
    }
    throw new BadRequestException('Unsupported clarification action');
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
