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

  it('routes friend geo selection and fallback to FriendLoopService', async () => {
    const workoutLoop = {
      applyConfirmedSlots: jest.fn(),
      applySelectedSlots: jest.fn(),
      openIntakeFromFallback: jest.fn(),
    };
    const friendLoop = {
      applySelectedSlots: jest.fn().mockResolvedValue({ action: 'clarify' }),
      openIntakeFromFallback: jest
        .fn()
        .mockResolvedValue({ action: 'clarify' }),
    };
    const service = new ClarificationCardActionService(
      workoutLoop as never,
      friendLoop as never,
    );

    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'clarification.select' as never,
        payload: {
          inferredIntent: 'friend',
          selectedPatch: { city: '成都' },
        },
      },
    });
    await service.perform({
      ownerUserId: 7,
      taskId: 101,
      body: {
        action: 'clarification.no' as never,
        payload: { noFallback: 'friend_intake' },
      },
    });

    expect(friendLoop.applySelectedSlots).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: {
        inferredIntent: 'friend',
        selectedPatch: { city: '成都' },
      },
    });
    expect(friendLoop.openIntakeFromFallback).toHaveBeenCalledWith({
      ownerUserId: 7,
      taskId: 101,
      payload: { noFallback: 'friend_intake' },
    });
    expect(workoutLoop.applySelectedSlots).not.toHaveBeenCalled();
    expect(workoutLoop.openIntakeFromFallback).not.toHaveBeenCalled();
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
