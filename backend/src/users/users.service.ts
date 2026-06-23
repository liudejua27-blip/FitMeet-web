import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Follow } from '../friends/follow.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    @InjectRepository(MeetParticipant)
    private readonly participantRepo: Repository<MeetParticipant>,
  ) {}

  async findById(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const followersCount = await this.followRepo.count({
      where: { followingId: id },
    });
    const followingCount = await this.followRepo.count({
      where: { followerId: id },
    });
    const meetHosted = await this.meetRepo.count({ where: { userId: id } });
    const meetJoined = await this.participantRepo.count({
      where: { userId: id },
    });

    const rest = this.toPublicUser(user);
    return {
      ...rest,
      followers: followersCount,
      following: followingCount,
      meetCount: meetHosted + meetJoined,
    };
  }

  async updateProfile(id: number, data: Partial<User>) {
    const updateData: Partial<User> = { ...data };
    delete updateData.password;
    delete updateData.email;
    delete updateData.id;

    await this.userRepo.update(id, updateData);
    return this.findById(id);
  }

  /**
   * Update the user's last-known coordinates and (optionally) their
   * nearby-match opt-in. Stamps `locationUpdatedAt` to now so the
   * matching pipeline can age-out stale fixes.
   */
  async updateLocation(
    id: number,
    lat: number,
    lng: number,
    acceptNearbyMatch?: boolean,
  ) {
    const patch: Partial<User> = {
      lat,
      lng,
      locationUpdatedAt: new Date(),
    };
    if (typeof acceptNearbyMatch === 'boolean') {
      patch.acceptNearbyMatch = acceptNearbyMatch;
    }
    await this.userRepo.update(id, patch);
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return {
      id: user.id,
      lat: user.lat,
      lng: user.lng,
      locationUpdatedAt: user.locationUpdatedAt,
      acceptNearbyMatch: user.acceptNearbyMatch,
    };
  }

  async findAll() {
    const users = await this.userRepo.find();
    return users.map((user) => this.toPublicUser(user));
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      name: this.publicText(user.name, 'FitMeet 用户'),
      avatar: this.publicText(user.avatar, ''),
      color: user.color,
      gender: this.publicText(user.gender, ''),
      age: user.age,
      city: this.publicText(user.city, ''),
      gym: this.publicText(user.gym, ''),
      bio: this.publicText(user.bio, '这位用户正在寻找同频的运动社交伙伴。'),
      coverUrl: this.publicText(user.coverUrl ?? '', ''),
      singleCert: user.singleCert,
      verified: user.verified,
      interestTags: this.publicTags(user.interestTags ?? []),
      trainingDays: user.trainingDays,
      trainingCount: user.trainingCount,
      caloriesBurned: user.caloriesBurned,
      trustScore: user.trustScore,
      socialTrustCount: user.socialTrustCount,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private publicTags(tags: string[]) {
    return tags
      .map((tag) => this.publicText(tag, ''))
      .filter((tag) => tag.length > 0);
  }

  private publicText(value: string | null | undefined, fallback: string) {
    const text = `${value ?? ''}`.trim();
    if (!text || this.isInternalFixtureText(text)) return fallback;
    if (/^unknown$/i.test(text)) return fallback;
    return text;
  }

  private isInternalFixtureText(text: string) {
    return /\b(agent\s*smoke|smoke\s*account|api\s*smoke|seed|fixture|test\s*account)\b/i.test(
      text,
    );
  }
}
