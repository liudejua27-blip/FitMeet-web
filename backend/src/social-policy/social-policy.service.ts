import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBlock } from '../safety/user-block.entity';
import { OnboardingService } from '../users/onboarding.service';
import {
  allowDecision,
  denyDecision,
  SocialPolicyAction,
  SocialPolicyDecision,
} from './social-policy.types';

type PublicIntentApplicationInput = {
  applicantUserId: number;
  ownerUserId: number | null;
  publicIntentId: string;
  status: string;
  closesAt?: Date | null;
  acceptedCount?: number;
  capacityMax?: number;
  applicationPolicy?: string;
};

type ApplicationResolutionInput = {
  actorUserId: number;
  ownerUserId: number;
  applicantUserId: number;
  applicationStatus: string;
  resolution: 'accepted' | 'rejected';
};

export type PublicTextPolicyResult = SocialPolicyDecision & {
  fields: string[];
};

const PUBLIC_TEXT_PATTERNS: Array<{
  key: string;
  label: string;
  pattern: RegExp;
}> = [
  { key: 'phone', label: '手机号', pattern: /\b1[3-9]\d{9}\b/u },
  {
    key: 'wechat',
    label: '微信号',
    pattern: /(微信|wechat|weixin|wx|vx|加我|联系方式)[:：\s]*[a-z0-9_-]{4,}/iu,
  },
  { key: 'qq', label: 'QQ', pattern: /\bqq[:：\s]*[1-9]\d{4,12}\b/iu },
  {
    key: 'email',
    label: '邮箱',
    pattern: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu,
  },
  {
    key: 'precise_address',
    label: '精确地址',
    pattern: /(门牌|单元|宿舍|几号楼|号楼|详细地址|家门口|住在).{0,24}/u,
  },
];

@Injectable()
export class SocialPolicyService {
  constructor(
    private readonly onboarding: OnboardingService,
    @InjectRepository(UserBlock)
    private readonly blockRepo: Repository<UserBlock>,
  ) {}

  async evaluateSocialEligibility(
    userId: number,
    action: SocialPolicyAction,
  ): Promise<SocialPolicyDecision> {
    const status = await this.onboarding.getStatus(userId);
    if (status.status !== 'ready') {
      return denyDecision(
        action,
        'social_profile_not_ready',
        '完善个人资料后才能继续这个社交动作。',
        {
          metadata: {
            userId,
            onboardingStatus: status.status,
            missing: status.completion?.missing ?? [],
          },
        },
      );
    }
    return allowDecision(action, { metadata: { userId } });
  }

  async evaluateUserPair(
    actorUserId: number,
    targetUserId: number,
    action: SocialPolicyAction,
  ): Promise<SocialPolicyDecision> {
    if (actorUserId === targetUserId) {
      return denyDecision(
        action,
        'self_target_not_allowed',
        '不能对自己执行这个社交动作。',
        {
          metadata: { actorUserId, targetUserId },
        },
      );
    }
    const actorDecision = await this.evaluateSocialEligibility(
      actorUserId,
      action,
    );
    if (!actorDecision.allowed) return actorDecision;
    const targetDecision = await this.evaluateSocialEligibility(
      targetUserId,
      action,
    );
    if (!targetDecision.allowed) return targetDecision;
    if (await this.isBlocked(actorUserId, targetUserId)) {
      return denyDecision(
        action,
        'user_blocked',
        '双方当前不能进行这个社交动作。',
        { metadata: { actorUserId, targetUserId } },
      );
    }
    return allowDecision(action, {
      metadata: { actorUserId, targetUserId },
    });
  }

  async evaluatePublicIntentApplication(
    input: PublicIntentApplicationInput,
  ): Promise<SocialPolicyDecision> {
    const action: SocialPolicyAction = 'public_intent.apply';
    if (!input.ownerUserId) {
      return denyDecision(
        action,
        'public_intent_not_active',
        '这张约练卡暂时不可报名。',
        {
          metadata: { publicIntentId: input.publicIntentId },
        },
      );
    }
    if (input.ownerUserId === input.applicantUserId) {
      return denyDecision(
        action,
        'self_application_not_allowed',
        '不能报名自己的约练卡。',
        {
          metadata: {
            publicIntentId: input.publicIntentId,
            applicantUserId: input.applicantUserId,
          },
        },
      );
    }
    if (String(input.status) !== 'active') {
      return denyDecision(
        action,
        'public_intent_not_active',
        '这张约练卡暂时不可报名。',
        {
          metadata: {
            publicIntentId: input.publicIntentId,
            status: input.status,
          },
        },
      );
    }
    if (input.closesAt && input.closesAt.getTime() <= Date.now()) {
      return denyDecision(
        action,
        'public_intent_expired',
        '这张约练卡已经结束报名。',
        {
          metadata: {
            publicIntentId: input.publicIntentId,
            closesAt: input.closesAt.toISOString(),
          },
        },
      );
    }
    if (
      typeof input.acceptedCount === 'number' &&
      typeof input.capacityMax === 'number' &&
      input.acceptedCount >= input.capacityMax
    ) {
      return denyDecision(
        action,
        'public_intent_full',
        '这张约练卡名额已经满了。',
        {
          metadata: {
            publicIntentId: input.publicIntentId,
            acceptedCount: input.acceptedCount,
            capacityMax: input.capacityMax,
          },
        },
      );
    }
    const pairDecision = await this.evaluateUserPair(
      input.applicantUserId,
      input.ownerUserId,
      action,
    );
    if (!pairDecision.allowed) return pairDecision;
    return allowDecision(action, {
      code: 'owner_approval_required',
      publicMessage: '报名已提交，等待发起人确认。',
      requiredConfirmations: ['public_intent_owner_approval'],
      metadata: {
        publicIntentId: input.publicIntentId,
        applicantUserId: input.applicantUserId,
        ownerUserId: input.ownerUserId,
        applicationPolicy: input.applicationPolicy ?? 'approval_required',
      },
    });
  }

  async evaluateOwnerApplicationResolution(
    input: ApplicationResolutionInput,
  ): Promise<SocialPolicyDecision> {
    const action: SocialPolicyAction =
      input.resolution === 'accepted'
        ? 'public_intent.application.accept'
        : 'public_intent.application.reject';
    if (input.actorUserId !== input.ownerUserId) {
      return denyDecision(
        action,
        'owner_required',
        '只有约练卡发起人可以处理报名。',
        {
          metadata: {
            actorUserId: input.actorUserId,
            ownerUserId: input.ownerUserId,
          },
        },
      );
    }
    if (input.applicationStatus !== 'pending') {
      return denyDecision(
        action,
        'application_already_resolved',
        '这个报名已经处理过了。',
        {
          metadata: {
            actorUserId: input.actorUserId,
            applicationStatus: input.applicationStatus,
          },
        },
      );
    }
    const pairDecision = await this.evaluateUserPair(
      input.ownerUserId,
      input.applicantUserId,
      action,
    );
    if (!pairDecision.allowed) return pairDecision;
    return allowDecision(action, {
      requiredConfirmations:
        input.resolution === 'accepted'
          ? ['accept_application_creates_meet_and_conversation']
          : [],
      metadata: {
        ownerUserId: input.ownerUserId,
        applicantUserId: input.applicantUserId,
        resolution: input.resolution,
      },
    });
  }

  inspectPublicText(value: unknown): PublicTextPolicyResult {
    const text = this.flattenText(value);
    const hits = PUBLIC_TEXT_PATTERNS.filter((item) => item.pattern.test(text));
    const fields = hits.map((item) => item.key);
    const labels = Array.from(new Set(hits.map((item) => item.label)));
    if (!hits.length) {
      return {
        ...allowDecision('public_text.inspect'),
        fields,
      };
    }
    return {
      ...denyDecision(
        'public_text.inspect',
        'public_text_privacy_violation',
        `公开内容不能包含${labels.join('、')}。移除后可以继续。`,
        {
          reasons: labels,
          metadata: { fields },
        },
      ),
      fields,
    };
  }

  private async isBlocked(userId: number, targetUserId: number) {
    const count = await this.blockRepo.count({
      where: [
        { blockerId: userId, blockedId: targetUserId },
        { blockerId: targetUserId, blockedId: userId },
      ],
    });
    return count > 0;
  }

  private flattenText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.flattenText(item)).join(' ');
    }
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>)
        .map((item) => this.flattenText(item))
        .join(' ');
    }
    return '';
  }
}
