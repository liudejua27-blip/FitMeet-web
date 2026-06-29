import { Injectable } from '@nestjs/common';

import type {
  LoopAgentDecisionAction,
  LoopAgentDecisionBase,
} from '../loop-agent/loop-agent.types';
import type {
  FriendRequiredSlot,
  FriendSlotValidation,
  FriendSlots,
} from './friend-loop.types';

export type FriendAgentDecisionAction = Extract<
  LoopAgentDecisionAction,
  'ASK_INTAKE' | 'CREATE_DRAFT' | 'HANDOFF_LEGACY'
>;

export type FriendAgentDecision = LoopAgentDecisionBase<
  'friend',
  FriendAgentDecisionAction,
  FriendSlots,
  FriendRequiredSlot
>;

@Injectable()
export class FriendAgentBrainService {
  decideEntrance(input: { slots: FriendSlots }): FriendAgentDecision {
    return {
      loopKind: 'friend',
      action: 'ASK_INTAKE',
      reason: 'friend_entrance_collect_slots',
      slots: input.slots,
      missing: [],
    };
  }

  decideIntakeSubmit(input: {
    slots: FriendSlots;
    validation: FriendSlotValidation;
  }): FriendAgentDecision {
    if (!input.validation.valid) {
      return {
        loopKind: 'friend',
        action: 'ASK_INTAKE',
        reason: 'friend_required_slots_missing',
        slots: input.slots,
        missing: input.validation.missing,
      };
    }
    return {
      loopKind: 'friend',
      action: 'CREATE_DRAFT',
      reason: 'friend_required_slots_ready',
      slots: input.slots,
      missing: [],
    };
  }
}
