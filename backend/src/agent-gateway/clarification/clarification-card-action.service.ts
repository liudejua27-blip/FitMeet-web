import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import type { SocialAgentCardActionBody } from '../social-agent-action.types';
import type { SocialAgentIntentRouteResult } from '../social-agent-chat.types';
import { FriendLoopService } from '../friend-loop/friend-loop.service';
import { WorkoutLoopService } from '../workout-loop/workout-loop.service';

@Injectable()
export class ClarificationCardActionService {
  constructor(
    @Optional()
    private readonly workoutLoop?: WorkoutLoopService,
    @Optional()
    private readonly friendLoop?: FriendLoopService,
  ) {}

  async perform(input: {
    ownerUserId: number;
    taskId: number;
    body: SocialAgentCardActionBody;
  }): Promise<SocialAgentIntentRouteResult> {
    const action =
      typeof input.body.action === 'string' ? input.body.action : '';
    if (action === 'clarification.yes') {
      return this.assertWorkoutLoop().applyConfirmedSlots({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        payload: record(input.body.payload),
      });
    }
    if (action === 'clarification.select') {
      if (this.isFriendClarification(input.body.payload)) {
        if (!this.friendLoop) {
          throw new BadRequestException(
            'Friend clarification runtime unavailable',
          );
        }
        return this.friendLoop.applySelectedSlots({
          ownerUserId: input.ownerUserId,
          taskId: input.taskId,
          payload: record(input.body.payload),
        });
      }
      return this.assertWorkoutLoop().applySelectedSlots({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        payload: record(input.body.payload),
      });
    }
    if (action === 'clarification.no') {
      if (this.isFriendClarification(input.body.payload)) {
        if (!this.friendLoop) {
          throw new BadRequestException(
            'Friend clarification runtime unavailable',
          );
        }
        return this.friendLoop.openIntakeFromFallback({
          ownerUserId: input.ownerUserId,
          taskId: input.taskId,
          payload: record(input.body.payload),
        });
      }
      return this.assertWorkoutLoop().openIntakeFromFallback({
        ownerUserId: input.ownerUserId,
        taskId: input.taskId,
        payload: record(input.body.payload),
      });
    }
    throw new BadRequestException('Unsupported clarification action');
  }

  private isFriendClarification(value: unknown): boolean {
    const payload = record(value);
    return (
      text(payload.inferredIntent) === 'friend' ||
      text(payload.noFallback) === 'friend_intake'
    );
  }

  private assertWorkoutLoop(): WorkoutLoopService {
    if (!this.workoutLoop) {
      throw new BadRequestException(
        'Workout clarification runtime unavailable',
      );
    }
    return this.workoutLoop;
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
