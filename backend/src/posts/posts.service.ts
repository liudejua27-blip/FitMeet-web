import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostSave } from './post-save.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { ModerationService } from '../moderation/moderation.service';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(PostLike)
    private readonly likeRepo: Repository<PostLike>,
    @InjectRepository(PostSave)
    private readonly saveRepo: Repository<PostSave>,
    private readonly moderationService: ModerationService,
  ) {}

  async findAll(category?: string, page: number = 1, limit: number = 10) {
    const qb = this.postRepo.createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .orderBy('post.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (category && category !== 'all') {
      qb.where('post.type = :category OR post.sport = :category', { category });
    }

    const [posts, total] = await qb.getManyAndCount();
    return {
      data: posts.map(p => this.toFeedResponse(p)),
      metadata: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
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
    });
    const saved = await this.postRepo.save(post);
    const full = await this.postRepo.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });
    return this.toFeedResponse(full!);
  }

  async toggleLike(postId: number, userId: number) {
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
      likedPostIds: likes.map(l => l.postId),
      savedPostIds: saves.map(s => s.postId),
    };
  }

  private toFeedResponse(post: Post) {
    const user = post.user;
    return {
      id: post.id,
      userId: user?.id,
      type: post.type,
      sport: post.sport,
      dist: post.dist || '',
      username: user?.name || '',
      gender: user?.gender || '',
      age: user?.age || 0,
      city: user?.city || '',
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
    };
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
