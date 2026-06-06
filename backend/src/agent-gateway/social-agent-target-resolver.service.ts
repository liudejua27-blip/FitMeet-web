import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { SafetyService } from '../safety/safety.service';
import { User } from '../users/user.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';

@Injectable()
export class SocialAgentTargetResolverService {
  constructor(
    @InjectRepository(SocialRequestCandidate)
    private readonly candidateRepo: Repository<SocialRequestCandidate>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(UserSocialRequest)
    private readonly userSocialRequestRepo: Repository<UserSocialRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly safety: SafetyService,
  ) {}

  async resolveCandidateTargetUser(
    input: Record<string, unknown>,
    ownerUserId: number,
  ): Promise<number> {
    const candidateInput = this.isRecord(input.candidate)
      ? input.candidate
      : {};
    const publicIntentId =
      this.string(input.publicIntentId ?? candidateInput.publicIntentId) ??
      null;
    const socialRequestId = this.number(
      input.socialRequestId ??
        input.requestId ??
        candidateInput.socialRequestId ??
        candidateInput.requestId,
    );
    const candidateRecordId = this.number(
      input.candidateRecordId ??
        input.candidateId ??
        candidateInput.candidateRecordId ??
        candidateInput.candidateId,
    );

    let targetUserId = this.number(
      input.targetUserId ??
        candidateInput.targetUserId ??
        input.candidateUserId ??
        candidateInput.candidateUserId ??
        input.userId ??
        candidateInput.userId ??
        input.toUserId ??
        candidateInput.toUserId ??
        input.recipientUserId ??
        candidateInput.recipientUserId ??
        input.recipientId ??
        candidateInput.recipientId ??
        input.receiverId ??
        candidateInput.receiverId ??
        input.followingId ??
        candidateInput.followingId,
    );

    if (publicIntentId) {
      const publicIntent = await this.publicIntentRepo.findOne({
        where: { id: publicIntentId },
      });
      const publicIntentUserId = this.number(publicIntent?.userId);
      if (
        targetUserId &&
        publicIntentUserId &&
        targetUserId !== publicIntentUserId
      ) {
        throw this.targetBadRequest(
          'MISSING_TARGET_USER',
          '公开约练卡片目标用户不一致',
        );
      }
      targetUserId = targetUserId ?? publicIntentUserId;
    }

    if (!targetUserId && socialRequestId) {
      const socialRequest = await this.userSocialRequestRepo.findOne({
        where: { id: socialRequestId },
      });
      targetUserId = this.number(socialRequest?.userId);
    }

    if ((!targetUserId || targetUserId === ownerUserId) && candidateRecordId) {
      const candidate = await this.candidateRepo.findOne({
        where: { id: candidateRecordId },
      });
      targetUserId = this.number(candidate?.candidateUserId) ?? targetUserId;
    }

    if (!targetUserId) {
      throw this.targetBadRequest(
        'MISSING_TARGET_USER',
        '这个候选缺少目标用户，无法操作。',
      );
    }
    if (targetUserId === ownerUserId) {
      throw this.targetBadRequest('TARGET_IS_SELF', '不能把自己作为目标用户');
    }

    const targetUser = await this.userRepo.findOne({
      where: { id: targetUserId },
    });
    if (!targetUser) {
      throw this.targetBadRequest('MISSING_TARGET_USER', '目标用户不存在');
    }

    const blockedUserIds = await this.safety.getMutualBlockUserIds(ownerUserId);
    if (blockedUserIds.has(targetUserId)) {
      throw new ForbiddenException({
        success: false,
        code: 'TARGET_BLOCKED',
        message: '你和该用户之间存在拉黑关系，无法操作。',
      });
    }

    return targetUserId;
  }

  private targetBadRequest(code: string, message: string): BadRequestException {
    return new BadRequestException({ success: false, code, message });
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private number(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
