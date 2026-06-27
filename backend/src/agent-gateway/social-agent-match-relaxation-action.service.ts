import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserSocialRequest } from '../social-requests/social-request.entity';
import { AgentTask } from './entities/agent-task.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { MatchingJobService } from './matching-job.service';
import type { SocialAgentRelaxationStrategyId } from './social-agent-match-relaxation.types';

const SOCIAL_REQUEST_ADVISORY_LOCK_NAMESPACE = 1_782_160_006;

export type ApplyMatchingRelaxationResult = {
  strategyId: SocialAgentRelaxationStrategyId;
  publicIntentId: string;
  socialRequestId: number;
  matchingJobId: number;
  sourceVersion: string;
  reused: boolean;
};

@Injectable()
export class SocialAgentMatchRelaxationActionService {
  constructor(
    private readonly matchingJobs: MatchingJobService,
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
  ) {}

  async applyRelaxation(input: {
    ownerUserId: number;
    taskId: number;
    payload: Record<string, unknown>;
  }): Promise<ApplyMatchingRelaxationResult> {
    const strategyId = this.strategyId(input.payload.strategyId);
    const socialRequestId = this.requiredNumber(
      input.payload.socialRequestId,
      'matching_relaxation_social_request_required',
    );
    const publicIntentId = this.requiredText(
      input.payload.publicIntentId,
      'matching_relaxation_public_intent_required',
    );

    return this.taskRepo.manager.transaction(async (manager) => {
      await this.lockSocialRequestAggregate(manager, socialRequestId);
      const task = await manager.getRepository(AgentTask).findOne({
        where: { id: input.taskId, ownerUserId: input.ownerUserId },
      });
      if (!task) throw new BadRequestException('agent_task_not_found');
      const request = await manager
        .getRepository(UserSocialRequest)
        .createQueryBuilder('request')
        .setLock('pessimistic_write')
        .where('request.id = :socialRequestId', { socialRequestId })
        .andWhere('request.userId = :ownerUserId', {
          ownerUserId: input.ownerUserId,
        })
        .getOne();
      if (!request) throw new BadRequestException('social_request_not_found');
      const intent = await manager
        .getRepository(PublicSocialIntent)
        .createQueryBuilder('intent')
        .setLock('pessimistic_write')
        .where('intent.id = :publicIntentId', { publicIntentId })
        .andWhere('intent.linkedSocialRequestId = :socialRequestId', {
          socialRequestId,
        })
        .andWhere('(intent.userId IS NULL OR intent.userId = :ownerUserId)', {
          ownerUserId: input.ownerUserId,
        })
        .getOne();
      if (!intent) throw new BadRequestException('public_intent_not_found');

      const baseSourceVersion = this.sourceVersion(intent);
      const sourceVersion = `${baseSourceVersion}:relax:${strategyId}`;
      const changedConstraints = this.record(input.payload.changedConstraints);
      this.applyToRequest(request, strategyId, changedConstraints);
      this.applyToIntent(intent, strategyId, changedConstraints, sourceVersion);
      await manager.getRepository(UserSocialRequest).save(request);
      await manager.getRepository(PublicSocialIntent).save(intent);

      const { job, reused } = await this.matchingJobs.enqueue({
        publicIntentId,
        sourceVersion,
        idempotencyKey: `matching-job:${publicIntentId}:${sourceVersion}`,
        ownerUserId: input.ownerUserId,
        linkedSocialRequestId: socialRequestId,
        metadata: {
          taskId: input.taskId,
          socialRequestId,
          publicIntentId,
          source: 'matching_relaxation',
          strategyId,
        },
      });
      return {
        strategyId,
        publicIntentId,
        socialRequestId,
        matchingJobId: job.id,
        sourceVersion,
        reused,
      };
    });
  }

  private applyToRequest(
    request: UserSocialRequest,
    strategyId: SocialAgentRelaxationStrategyId,
    changedConstraints: Record<string, unknown>,
  ): void {
    if (strategyId === 'expand_distance') {
      request.radiusKm = this.positiveInt(changedConstraints.radiusKm, 10);
    }
    request.metadata = {
      ...(request.metadata ?? {}),
      matchingRelaxation: {
        strategyId,
        changedConstraints,
        appliedAt: new Date().toISOString(),
      },
    };
  }

  private applyToIntent(
    intent: PublicSocialIntent,
    strategyId: SocialAgentRelaxationStrategyId,
    changedConstraints: Record<string, unknown>,
    sourceVersion: string,
  ): void {
    if (strategyId === 'expand_distance') {
      intent.radiusKm = this.positiveInt(changedConstraints.radiusKm, 10);
    }
    if (strategyId === 'expand_time') {
      intent.timePreference =
        this.text(changedConstraints.timePreference) || intent.timePreference;
    }
    if (strategyId === 'relax_tags') {
      intent.filters = {
        ...(intent.filters ?? {}),
        relaxedInterestTags: true,
      };
    }
    intent.metadata = {
      ...(intent.metadata ?? {}),
      sourceVersion,
      matchingRelaxation: {
        strategyId,
        changedConstraints,
        appliedAt: new Date().toISOString(),
      },
    };
  }

  private async lockSocialRequestAggregate(
    manager: EntityManager,
    socialRequestId: number,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
      SOCIAL_REQUEST_ADVISORY_LOCK_NAMESPACE,
      socialRequestId,
    ]);
  }

  private sourceVersion(intent: PublicSocialIntent): string {
    const metadataVersion = this.text(intent.metadata?.sourceVersion);
    if (metadataVersion) return metadataVersion;
    return `${intent.status}:${intent.updatedAt?.toISOString?.() ?? 'unknown'}`;
  }

  private strategyId(value: unknown): SocialAgentRelaxationStrategyId {
    const text = this.requiredText(
      value,
      'matching_relaxation_strategy_required',
    );
    if (
      text === 'expand_distance' ||
      text === 'expand_time' ||
      text === 'relax_tags'
    ) {
      return text;
    }
    throw new BadRequestException('matching_relaxation_strategy_invalid');
  }

  private requiredNumber(value: unknown, code: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(code);
    }
    return parsed;
  }

  private requiredText(value: unknown, code: string): string {
    const text = this.text(value);
    if (!text) throw new BadRequestException(code);
    return text;
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private positiveInt(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.round(parsed);
  }
}
