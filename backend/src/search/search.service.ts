import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from '../users/user.entity';
import { Post } from '../posts/post.entity';
import { Coach } from '../coaches/coach.entity';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(Coach)
    private readonly coachRepo: Repository<Coach>,
  ) {}

  async search(query: string) {
    if (!query || query.trim().length === 0)
      return { users: [], posts: [], coaches: [] };

    const users = await this.userRepo
      .createQueryBuilder('user')
      .where(
        "to_tsvector('simple', user.name || ' ' || coalesce(user.bio, '')) @@ to_tsquery('simple', :q)",
        { q: `${query}:*` },
      )
      .orWhere('user.name ILIKE :lq', { lq: `%${query}%` }) // Fallback for short words
      .take(10)
      .getMany();

    const posts = await this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .where(
        "to_tsvector('simple', coalesce(post.title, '') || ' ' || post.text || ' ' || array_to_string(string_to_array(post.tags, ','), ' ')) @@ to_tsquery('simple', :q)",
        { q: `${query}:*` },
      )
      .orWhere('post.title ILIKE :lq OR post.text ILIKE :lq', {
        lq: `%${query}%`,
      })
      .take(10)
      .getMany();

    const coaches = await this.coachRepo
      .createQueryBuilder('coach')
      .leftJoinAndSelect('coach.user', 'user')
      .where(
        "to_tsvector('simple', coach.desc || ' ' || coach.specialty) @@ to_tsquery('simple', :q)",
        { q: `${query}:*` },
      )
      .orWhere('coach.desc ILIKE :lq', { lq: `%${query}%` })
      .take(5)
      .getMany();

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        type: 'user',
      })),
      posts: posts.map((p) => ({
        id: p.id,
        content: p.text.substring(0, 50),
        author: p.user.name,
        type: 'post',
      })),
      coaches: coaches.map((c) => ({
        id: c.id,
        name: c.user.name,
        title: c.specialty,
        type: 'coach',
      })),
    };
  }

  async suggest(query: string) {
    if (!query || query.length < 1) return [];

    // Simple robust suggestion: search user names and post tags
    const users = await this.userRepo.find({
      where: { name: ILike(`${query}%`) },
      select: ['name'],
      take: 5,
    });

    // For tags, raw query might be better if tags are array
    // Assuming tags is a string column for now based on simple ILike usage above,
    // or if simple-array in TypeORM, ILike works on the stringified version.

    return users.map((u) => u.name);
  }
}
