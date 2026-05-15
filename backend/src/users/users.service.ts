import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Follow } from '../friends/follow.entity';
import { Post } from '../posts/post.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Coach } from '../coaches/coach.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    @InjectRepository(MeetParticipant)
    private readonly participantRepo: Repository<MeetParticipant>,
    @InjectRepository(Coach)
    private readonly coachRepo: Repository<Coach>,
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
    const postsCount = await this.postRepo.count({ where: { userId: id } });
    const meetHosted = await this.meetRepo.count({ where: { userId: id } });
    const meetJoined = await this.participantRepo.count({
      where: { userId: id },
    });
    const coach = await this.coachRepo.findOne({ where: { userId: id } });

    const rest = this.sanitizeUser(user);
    return {
      ...rest,
      followers: followersCount,
      following: followingCount,
      posts: postsCount,
      meetCount: meetHosted + meetJoined,
      coachSpecialty: coach?.specialty,
      coachExperience: coach?.experience,
      coachPrice: coach?.price,
      coachRating: coach ? Number(coach.rating) : undefined,
      coachStudents: coach?.students,
      coachCerts: coach?.coachCerts,
      coachIncome: coach?.income,
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
    return users.map((user) => this.sanitizeUser(user));
  }

  private sanitizeUser(user: User) {
    const result: Partial<User> = { ...user };
    delete result.password;
    return result;
  }
}
