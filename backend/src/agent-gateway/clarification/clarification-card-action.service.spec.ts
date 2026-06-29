import { BadRequestException } from '@nestjs/common';

import { ClarificationCardActionService } from './clarification-card-action.service';

describe('ClarificationCardActionService', () => {
  it('delegates yes/no answers to WorkoutLoopService', async () => {
    const workoutLoop = {
      applyConfirmedSlots: jest
        .fn()
        .mockResolvedValue({ action: 'await_confirmation' }),
      openIntakeFromFallback: jest
        .fn()
        .mockResolvedValue({ action: 'clarify' }),
    };
    const service = new ClarificationCardActionService(workoutLoop as never);

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'clarification.yes' as never,
        payload: { yesPatch: { activityType: '跑步' } },
      },
    });
    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'clarification.no' as never,
        payload: { noFallback: 'workout_intake' },
      },
    });

    expect(workoutLoop.applyConfirmedSlots).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: { yesPatch: { activityType: '跑步' } },
    });
    expect(workoutLoop.openIntakeFromFallback).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: { noFallback: 'workout_intake' },
    });
  });

  it('fails closed when workout runtime is unavailable', async () => {
    const service = new ClarificationCardActionService();

    await expect(
      service.perform({
        ownerUserId: 7,
        taskId: 101,
        body: { action: 'clarification.yes' as never, payload: {} },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
