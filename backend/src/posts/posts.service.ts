import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostSave } from './post-save.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { ModerationService } from '../moderation/moderation.service';
import { Meet } from '../meets/meet.entity';

type Origin = { lat?: number; lng?: number };

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly likeRepo: Repository<PostLike>,
    @InjectRepository(PostSave)
    private readonly saveRepo: Repository<PostSave>,
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    private readonly moderationService: ModerationService,
  ) {}

  async findAll(
    category?: string,
    page: number = 1,
    limit: number = 10,
    origin: Origin = {},
  ) {
    const safePage = Math.max(1, Math.trunc(page || 1));
    const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit || 10)));
    const requestedCategory = category || 'all';

    if (requestedCategory === 'meet') {
      const [meets, total] = await this.buildMeetFeedQuery()
        .skip((safePage - 1) * safeLimit)
        .take(safeLimit)
        .getManyAndCount();
      return this.toPagedResponse(
        meets.map((meet) => this.toMeetFeedResponse(meet, origin)),
        total,
        safePage,
        safeLimit,
      );
    }

    if (requestedCategory && requestedCategory !== 'all') {
      const [posts, total] = await this.buildPostFeedQuery(requestedCategory)
        .skip((safePage - 1) * safeLimit)
        .take(safeLimit)
        .getManyAndCount();
      return this.toPagedResponse(
        posts.map((post) => this.toFeedResponse(post, origin)),
        total,
        safePage,
        safeLimit,
      );
    }

    const fetchLimit = safePage * safeLimit;
    const [posts, postTotal] = await this.buildPostFeedQuery()
      .take(fetchLimit)
      .getManyAndCount();
    const [meets, meetTotal] = await this.buildMeetFeedQuery()
      .take(fetchLimit)
      .getManyAndCount();
    const data = [
      ...posts.map((post) => this.toFeedResponse(post, origin)),
      ...meets.map((meet) => this.toMeetFeedResponse(meet, origin)),
    ]
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      })
      .slice((safePage - 1) * safeLimit, safePage * safeLimit);

    return this.toPagedResponse(
      data,
      postTotal + meetTotal,
      safePage,
      safeLimit,
    );
  }

  async findOne(id: number) {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['user', 'comments', 'comments.user'],
    });

    if (!post) {
      throw new NotFoundException(`Post #${id} not found`);
    }

    // Increment view count
    await this.postRepo.increment({ id }, 'viewCount', 1);

    return this.toFeedResponse(post);
  }

  async create(userId: number, dto: CreatePostDto) {
    // 1. Unified Moderation Check (Sync + Async AI Simulation)
    await this.moderationService.checkText(dto.text);
    if (dto.tags) {
      for (const tag of dto.tags) {
        await this.moderationService.checkText(tag);
      }
    }
    const post = this.postRepo.create({
      ...dto,
      userId,
      tags: dto.tags || [],
      images: dto.images || [],
      city: dto.city?.trim() || '',
      loc: dto.loc?.trim() || '',
      address: dto.address?.trim() || '',
      poiId: dto.poiId || null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
    });
    const saved = await this.postRepo.save(post);
    const full = await this.postRepo.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });
    return this.toFeedResponse(full!);
  }

  async toggleLike(postId: number, userId: number) {
    await this.assertPostExists(postId);

    const existing = await this.likeRepo.findOne({
      where: { postId, userId },
    });

    if (existing) {
      await this.likeRepo.remove(existing);
      await this.postRepo.decrement({ id: postId }, 'likesCount', 1);
      return { liked: false };
    } else {
      await this.likeRepo.save({ postId, userId });
      await this.postRepo.increment({ id: postId }, 'likesCount', 1);
      return { liked: true };
    }
  }

  async toggleSave(postId: number, userId: number) {
    await this.assertPostExists(postId);

    const existing = await this.saveRepo.findOne({
      where: { postId, userId },
    });

    if (existing) {
      await this.saveRepo.remove(existing);
      return { saved: false };
    } else {
      await this.saveRepo.save({ postId, userId });
      return { saved: true };
    }
  }

  async getUserLikesAndSaves(userId: number) {
    const likes = await this.likeRepo.find({ where: { userId } });
    const saves = await this.saveRepo.find({ where: { userId } });
    return {
      likedPostIds: likes.map((l) => l.postId),
      savedPostIds: saves.map((s) => s.postId),
    };
  }

  private buildPostFeedQuery(category?: string) {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .orderBy('post.createdAt', 'DESC');

    if (category && category !== 'all') {
      qb.where('post.type = :category OR post.sport = :category', { category });
    }

    return qb;
  }

  private async assertPostExists(postId: number) {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException(`Post #${postId} not found`);
  }

  private buildMeetFeedQuery() {
    return this.meetRepo
      .createQueryBuilder('meet')
      .leftJoinAndSelect('meet.user', 'user')
      .leftJoinAndSelect('meet.club', 'club')
      .where('meet.status != :cancelled', { cancelled: 'cancelled' })
      .orderBy('meet.createdAt', 'DESC');
  }

  private toPagedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ) {
    return {
      data,
      metadata: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  private toFeedResponse(post: Post, origin: Origin = {}) {
    const user = post.user;
    const distanceMeters = this.getDistanceMeters(origin, post);
    return {
      id: post.id,
      userId: user?.id,
      type: post.type,
      sport: post.sport,
      dist: distanceMeters
        ? this.formatDistance(distanceMeters)
        : post.dist || '',
      distanceMeters,
      username: user?.name || '',
      gender: user?.gender || '',
      age: user?.age || 0,
      city: post.city || user?.city || '',
      loc: post.loc || '',
      address: post.address || '',
      poiId: post.poiId,
      lat: post.lat,
      lng: post.lng,
      color: user?.color || '#C8FF00',
      colorBg: this.getColorBg(user?.color || '#C8FF00'),
      emoji: post.emoji || '',
      text: post.text,
      tags: post.tags || [],
      likes: post.likesCount,
      comments: post.commentsCount,
      viewCount: post.viewCount,
      slots: post.slots,
      cert: user?.singleCert || false,
      level: post.level,
      images: post.images || [],
      videoUrl: post.videoUrl,
      createdAt: post.createdAt?.toISOString(),
    };
  }

  private toMeetFeedResponse(meet: Meet, origin: Origin = {}) {
    const user = meet.user;
    const distanceMeters = this.getDistanceMeters(origin, meet);
    return {
      id: -meet.id,
      sourceId: meet.id,
      userId: user?.id,
      type: 'meet',
      sport: meet.type,
      dist: distanceMeters
        ? this.formatDistance(distanceMeters)
        : meet.dist || '',
      distanceMeters,
      username: user?.name || '',
      gender: user?.gender || '',
      age: user?.age || 0,
      city: meet.city || user?.city || '',
      loc: meet.loc,
      address: meet.address || '',
      poiId: meet.poiId,
      lat: meet.lat,
      lng: meet.lng,
      color: user?.color || '#C8FF00',
      colorBg: this.getColorBg(user?.color || '#C8FF00'),
      emoji: '',
      title: meet.title,
      text: meet.desc || `${meet.time} · ${meet.loc}`,
      tags: [meet.groupType, meet.creatorType].filter(Boolean),
      likes: 0,
      comments: 0,
      viewCount: 0,
      slots: `${Math.max(meet.maxSlots - meet.slots, 0)}/${meet.maxSlots}`,
      cert: user?.singleCert || user?.verified || false,
      level: meet.level,
      images: [],
      videoUrl: undefined,
      createdAt: meet.createdAt?.toISOString(),
    };
  }

  private hasOrigin(origin: Origin): origin is { lat: number; lng: number } {
    return Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
  }

  private getDistanceMeters(
    origin: Origin,
    item: { lat?: number | null; lng?: number | null },
  ) {
    if (
      !this.hasOrigin(origin) ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lng)
    ) {
      return undefined;
    }

    const earthRadius = 6371000;
    const dLat = this.toRadians((item.lat as number) - origin.lat);
    const dLng = this.toRadians((item.lng as number) - origin.lng);
    const fromLat = this.toRadians(origin.lat);
    const toLat = this.toRadians(item.lat as number);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return Math.round(
      earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
    );
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private formatDistance(meters: number) {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  }

  private getColorBg(color: string): string {
    const map: Record<string, string> = {
      '#C8FF00': '#2a3300',
      '#FF6B9D': '#330020',
      '#A78BFA': '#1a0a2e',
      '#F97316': '#2a1100',
      '#38BDF8': '#001528',
      '#22C55E': '#0a2010',
      '#818CF8': '#0a0a1a',
      '#FB923C': '#2a1000',
    };
    return map[color] || '#1a1a1a';
  }
}
