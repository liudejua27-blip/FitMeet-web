import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Follow } from './follow.entity';
import { User } from '../users/user.entity';
import { AgentSideEffectLedgerService } from '../agent-gateway/agent-side-effect-ledger.service';

type EnsureFollowingOptions = {
  agentTaskId?: number | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Optional()
    private readonly sideEffectLedger?: AgentSideEffectLedgerService,
  ) {}

  async toggleFollow(followerId: number, followingId: number) {
    await this.assertFollowTarget(followerId, followingId);

    const existing = await this.followRepo.findOne({
      where: { followerId, followingId },
    });

    if (existing) {
      await this.followRepo.remove(existing);
      return { following: false };
    } else {
      await this.followRepo.save({ followerId, followingId });
      return { following: true };
    }
  }

  async ensureFollowing(
    followerId: number,
    followingId: number,
    options: EnsureFollowingOptions = {},
  ) {
    const idempotencyKey = this.idempotencyKey(options);
    if (this.sideEffectLedger && idempotencyKey) {
      const { result } = await this.sideEffectLedger.run(
        {
          ownerUserId: followerId,
          agentTaskId: this.positiveNumber(
            options.agentTaskId ?? options.metadata?.agentTaskId,
          ),
          actionType: 'ensure_following',
          idempotencyKey,
          resourceType: 'follow',
          resourceId: `${followerId}:${followingId}`,
          metadata: {
            followerId,
            followingId,
            ...(options.metadata ?? {}),
          },
          request: {
            followerId,
            followingId,
          },
        },
        () => this.ensureFollowingOnce(followerId, followingId),
      );
      return result;
    }
    return this.ensureFollowingOnce(followerId, followingId);
  }

  private async ensureFollowingOnce(followerId: number, followingId: number) {
    await this.assertFollowTarget(followerId, followingId);

    const existing = await this.followRepo.findOne({
      where: { followerId, followingId },
    });

    if (!existing) {
      const saved = await this.followRepo.save({ followerId, followingId });
      return { following: true, followId: saved.id };
    }

    return { following: true, followId: existing.id };
  }

  private idempotencyKey(options: EnsureFollowingOptions): string {
    const direct =
      typeof options.idempotencyKey === 'string'
        ? options.idempotencyKey.trim()
        : '';
    if (direct) return direct.slice(0, 180);
    const metadataKey =
      typeof options.metadata?.idempotencyKey === 'string'
        ? options.metadata.idempotencyKey.trim()
        : '';
    return metadataKey.slice(0, 180);
  }

  private positiveNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
  }

  private async assertFollowTarget(followerId: number, followingId: number) {
    if (!Number.isFinite(followingId) || followingId <= 0) {
      throw new BadRequestException('请选择要添加的用户');
    }
    if (followerId === followingId) {
      throw new BadRequestException('不能添加自己为好友');
    }
    const target = await this.userRepo.findOne({ where: { id: followingId } });
    if (!target) throw new NotFoundException('目标用户不存在');
  }

  async isFollowing(followerId: number, followingId: number) {
    const count = await this.followRepo.count({
      where: { followerId, followingId },
    });
    return { following: count > 0 };
  }

  /** Get mutual follows (friends) */
  getFriends(userId: number) {
    void userId;
    return [];
  }

  async getFollowedUserIds(userId: number) {
    const follows = await this.followRepo.find({
      where: { followerId: userId },
    });
    return follows.map((f) => f.followingId);
  }
}
