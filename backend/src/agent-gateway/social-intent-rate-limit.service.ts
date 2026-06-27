import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import type { FitMeetAlphaCard } from './fitmeet-alpha-agent.types';
import { PublicSocialIntent } from './entities/public-social-intent.entity';

export type SocialIntentRateLimitResult = {
  allowed: boolean;
  used: number;
  limit: number;
  resetAt: string;
};

@Injectable()
export class SocialIntentRateLimitService {
  private readonly defaultLimit = Math.max(
    1,
    Math.floor(
      Number(process.env.SOCIAL_AGENT_INTENT_RATE_LIMIT_PER_HOUR) || 5,
    ),
  );

  constructor(
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
  ) {}

  async check(ownerUserId: number): Promise<SocialIntentRateLimitResult> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const used = await this.publicIntentRepo.count({
      where: {
        userId: ownerUserId,
        mode: 'public',
        createdAt: MoreThan(since),
      },
    });
    return {
      allowed: used < this.defaultLimit,
      used,
      limit: this.defaultLimit,
      resetAt: new Date(since.getTime() + 60 * 60 * 1000).toISOString(),
    };
  }

  buildRateLimitedCard(input: {
    taskId: number;
    result: SocialIntentRateLimitResult;
  }): FitMeetAlphaCard {
    return {
      id: `rate_limit:${input.taskId}`,
      type: 'candidate_empty_state',
      schemaVersion: 'fitmeet.tool-ui.v1',
      schemaType: 'social_match.rate_limited',
      title: '发布频率过高',
      body: `为了防骚扰和保护发现页质量，每小时最多发布 ${input.result.limit} 张公开约练卡。稍后可以继续发布。`,
      status: 'blocked',
      data: {
        schemaName: 'SocialIntentRateLimitCard',
        schemaType: 'social_match.rate_limited',
        taskId: input.taskId,
        used: input.result.used,
        limit: input.result.limit,
        resetAt: input.result.resetAt,
        safetyBoundary: '频控只限制公开发布，不影响你编辑草稿或查看已有对话。',
        recoveryOptions: [
          {
            key: 'edit_card',
            label: '修改卡片',
            detail: '先调整内容，稍后再发布。',
            requiresConfirmation: false,
          },
        ],
      },
      actions: [
        {
          id: `rate_limit:${input.taskId}:edit`,
          label: '修改卡片',
          action: 'activity.modify_time',
          schemaAction: 'activity.modify_time',
          requiresConfirmation: false,
          payload: {
            taskId: input.taskId,
            sourceAction: 'rate_limit.modify_card',
          },
        },
      ],
    };
  }
}
