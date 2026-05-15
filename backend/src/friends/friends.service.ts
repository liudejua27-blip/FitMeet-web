import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Follow } from './follow.entity';
import { User } from '../users/user.entity';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async toggleFollow(followerId: number, followingId: number) {
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

  async ensureFollowing(followerId: number, followingId: number) {
    const existing = await this.followRepo.findOne({
      where: { followerId, followingId },
    });

    if (!existing) {
      await this.followRepo.save({ followerId, followingId });
    }

    return { following: true };
  }

  async isFollowing(followerId: number, followingId: number) {
    const count = await this.followRepo.count({
      where: { followerId, followingId },
    });
    return { following: count > 0 };
  }

  /** Get mutual follows (friends) */
  async getFriends(userId: number) {
    // Get users I follow
    const myFollows = await this.followRepo.find({
      where: { followerId: userId },
    });
    const myFollowingIds = myFollows.map((f) => f.followingId);

    if (myFollowingIds.length === 0) {
      // Even if no mutual follows, return some users for friends list
      const users = await this.userRepo.find({ take: 10 });
      return users.map((u) => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar || u.name[0],
        color: u.color,
        status: 'offline' as const,
      }));
    }

    // Get users who follow me back (mutual follows = friends)
    const mutualFollows = await this.followRepo
      .createQueryBuilder('f')
      .where('f.followerId IN (:...ids)', { ids: myFollowingIds })
      .andWhere('f.followingId = :userId', { userId })
      .getMany();

    const friendIds = mutualFollows.map((f) => f.followerId);

    if (friendIds.length === 0) {
      // Return following users as fallback
      const users = await this.userRepo
        .createQueryBuilder('u')
        .where('u.id IN (:...ids)', { ids: myFollowingIds })
        .getMany();
      return users.map((u) => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar || u.name[0],
        color: u.color,
        status: 'offline' as const,
      }));
    }

    const friends = await this.userRepo
      .createQueryBuilder('u')
      .where('u.id IN (:...ids)', { ids: friendIds })
      .getMany();

    return friends.map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar || u.name[0],
      color: u.color,
      status: 'online' as const, // TODO: track with Redis
    }));
  }

  async getFollowedUserIds(userId: number) {
    const follows = await this.followRepo.find({
      where: { followerId: userId },
    });
    return follows.map((f) => f.followingId);
  }
}
