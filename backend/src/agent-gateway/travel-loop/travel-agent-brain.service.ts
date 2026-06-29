import { Injectable } from '@nestjs/common';

import type {
  LoopAgentDecisionAction,
  LoopAgentDecisionBase,
} from '../loop-agent/loop-agent.types';
import type {
  TravelRequiredSlot,
  TravelSlotValidation,
  TravelSlots,
} from './travel-loop.types';

export type TravelAgentDecisionAction = Extract<
  LoopAgentDecisionAction,
  'ASK_INTAKE' | 'CREATE_DRAFT' | 'HANDOFF_LEGACY'
>;

export type TravelAgentDecision = LoopAgentDecisionBase<
  'travel',
  TravelAgentDecisionAction,
  TravelSlots,
  TravelRequiredSlot
>;

@Injectable()
export class TravelAgentBrainService {
  decideEntrance(input: { slots: TravelSlots }): TravelAgentDecision {
    return {
      loopKind: 'travel',
      action: 'ASK_INTAKE',
      reason: 'travel_entrance_collect_slots',
      slots: input.slots,
      missing: [],
    };
  }

  decideIntakeSubmit(input: {
    slots: TravelSlots;
    validation: TravelSlotValidation;
  }): TravelAgentDecision {
    if (!input.validation.valid) {
      return {
        loopKind: 'travel',
        action: 'ASK_INTAKE',
        reason: 'travel_required_slots_missing',
        slots: input.slots,
        missing: input.validation.missing,
      };
    }
    return {
      loopKind: 'travel',
      action: 'CREATE_DRAFT',
      reason: 'travel_required_slots_ready',
      slots: input.slots,
      missing: [],
    };
  }
}
