import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { Post } from '../posts/post.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ModerationService } from '../moderation/moderation.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    private readonly moderationService: ModerationService,
  ) {}

  async findByPost(postId: number) {
    await this.assertPostExists(postId);

    const comments = await this.commentRepo.find({
      where: { postId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    return comments.map((c) => this.toResponse(c));
  }

  async create(postId: number, userId: number, dto: CreateCommentDto) {
    await this.assertPostExists(postId);

    // 1. Unified Moderation Check
    await this.moderationService.checkText(dto.text);

    const comment = this.commentRepo.create({
      text: dto.text,
      postId,
      userId,
    });
    const saved = await this.commentRepo.save(comment);
    await this.postRepo.increment({ id: postId }, 'commentsCount', 1);

    const full = await this.commentRepo.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });
    return this.toResponse(full!);
  }

  async likeComment(commentId: number) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
    });
    if (!comment)
      throw new NotFoundException(`Comment #${commentId} not found`);

    await this.commentRepo.increment({ id: commentId }, 'likesCount', 1);
    return { success: true };
  }

  private async assertPostExists(postId: number) {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException(`Post #${postId} not found`);
  }

  private toResponse(c: Comment) {
    const now = new Date();
    const diff = now.getTime() - c.createdAt.getTime();
    const minutes = Math.floor(diff / 60000);
    let timeStr = '刚刚';
    if (minutes > 0 && minutes < 60) timeStr = `${minutes}分钟前`;
    else if (minutes >= 60 && minutes < 1440)
      timeStr = `${Math.floor(minutes / 60)}小时前`;
    else if (minutes >= 1440) timeStr = `${Math.floor(minutes / 1440)}天前`;

    return {
      id: c.id,
      username: c.user?.name || '',
      avatar: c.user?.avatar || '',
      color: c.user?.color || '#38BDF8',
      text: c.text,
      time: timeStr,
      likes: c.likesCount,
    };
  }
}
