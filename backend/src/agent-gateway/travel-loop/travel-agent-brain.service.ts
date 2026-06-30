import { Injectable, Optional } from '@nestjs/common';

import type { AgentTask } from '../entities/agent-task.entity';
import { GeoResolverService } from '../geo/geo-resolver.service';
import type {
  LoopAgentDecisionAction,
  LoopAgentDecisionBase,
} from '../loop-agent/loop-agent.types';
import type {
  TravelRequiredSlot,
  TravelSlotValidation,
  TravelSlots,
} from './travel-loop.types';
import { TravelUnderstandingService } from './travel-understanding.service';

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
  constructor(
    @Optional()
    private readonly understanding?: TravelUnderstandingService,
    @Optional()
    private readonly geoResolver?: GeoResolverService,
  ) {}

  async decideEntrance(input: {
    task?: AgentTask | null;
    message: string;
    slots: TravelSlots;
    signal?: AbortSignal | null;
  }): Promise<TravelAgentDecision> {
    const slots = await this.enrichEntranceSlots(input);
    return {
      loopKind: 'travel',
      action: 'ASK_INTAKE',
      reason: 'travel_entrance_collect_slots',
      slots,
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

  private async enrichEntranceSlots(input: {
    task?: AgentTask | null;
    message: string;
    slots: TravelSlots;
    signal?: AbortSignal | null;
  }): Promise<TravelSlots> {
    const understoodSlots = await this.understandSlots(input);
    return this.resolveDestinationGeo(understoodSlots, input.message);
  }

  private async understandSlots(input: {
    task?: AgentTask | null;
    message: string;
    slots: TravelSlots;
    signal?: AbortSignal | null;
  }): Promise<TravelSlots> {
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
      input.message,
    );
  }

  private async resolveDestinationGeo(
    slots: TravelSlots,
    message: string,
  ): Promise<TravelSlots> {
    if (!this.geoResolver || !slots.destination) return slots;
    const geo = await this.geoResolver.resolveAsync({
      message,
      locationText: slots.destination,
      city: slots.city,
    });
    const trustedCity =
      geo.city && !geo.needsConfirmation && geo.confidence >= 0.65
        ? geo.city
        : slots.city;
    const trustedDestination =
      !geo.needsConfirmation && geo.locationText
        ? geo.locationText
        : slots.destination;
    return {
      ...slots,
      destination: trustedDestination,
      city: trustedCity,
      geoResolution: geo,
    };
  }
}
