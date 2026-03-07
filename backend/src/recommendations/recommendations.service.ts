import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../posts/post.entity';
import { User } from '../users/user.entity';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Post)
    private postsRepository: Repository<Post>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async getRecommendedPosts(userId: number, limit: number = 10): Promise<Post[]> {
    // Basic recommendation algorithm:
    // 1. Fetch recent posts
    // 2. Score them based on likes and views (simplified)
    // 3. Filter out posts from blocked users (if implemented) or already seen (if tracking)
    // 4. Return top scored posts

    const posts = await this.postsRepository.find({
      take: 50, // Fetch a pool of recent posts
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });

    // Simple scoring: (likes * 2) + views
    // In a real app, you would use more complex logic, potentially involving user interests
    const scoredPosts = posts.map(post => {
      const score = (post.likesCount || 0) * 2 + (post.viewCount || 0);
      return { post, score };
    });

    // Sort by score descending
    scoredPosts.sort((a, b) => b.score - a.score);

    return scoredPosts.slice(0, limit).map(item => item.post);
  }

  async getRecommendedUsers(userId: number, limit: number = 5): Promise<User[]> {
    // Recommend users not followed yet providing simplistic logic
    // Ensure we don't recommend self
    return this.usersRepository.createQueryBuilder('user')
      .where('user.id != :userId', { userId })
      .orderBy('RANDOM()') // Postgres/SQLite specific, check database compatibility
      .take(limit)
      .getMany();
  }
}
