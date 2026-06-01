import { Module } from '@nestjs/common';

/**
 * Reserved boundary for future FitMeet skills/API access.
 *
 * This module intentionally exposes no controller today. External agents,
 * wearables, BCI devices, or automation clients must not bypass FitMeet's
 * first-party Agent, permission modes, Safety Agent checks, PendingApproval,
 * and audit pipeline.
 */
@Module({})
export class FutureSkillsGatewayModule {}
