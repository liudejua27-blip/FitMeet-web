import { Injectable, Optional } from '@nestjs/common';

import type { AgentTask } from '../entities/agent-task.entity';
import type {
  LoopAgentDecisionAction,
  LoopAgentDecisionBase,
} from '../loop-agent/loop-agent.types';
import type {
  FriendRequiredSlot,
  FriendSlotValidation,
  FriendSlots,
} from './friend-loop.types';
import { FriendUnderstandingService } from './friend-understanding.service';

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
  constructor(
    @Optional()
    private readonly understanding?: FriendUnderstandingService,
  ) {}

  async decideEntrance(input: {
    task?: AgentTask | null;
    message: string;
    slots: FriendSlots;
    signal?: AbortSignal | null;
  }): Promise<FriendAgentDecision> {
    const slots = await this.enrichEntranceSlots(input);
    return {
      loopKind: 'friend',
      action: 'ASK_INTAKE',
      reason: 'friend_entrance_collect_slots',
      slots,
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

  private async enrichEntranceSlots(input: {
    task?: AgentTask | null;
    message: string;
    slots: FriendSlots;
    signal?: AbortSignal | null;
  }): Promise<FriendSlots> {
    if (!this.understanding?.shouldCall(input)) return input.slots;
    const understanding = await this.understanding.understand({
      task: input.task ?? null,
      message: input.message,
      ruleSlots: input.slots,
      signal: input.signal ?? null,
    });
    return this.understanding.mergeSlots(
      input.slots,
      this.understanding.slotsFromUnderstanding(understanding),
    );
  }
}
