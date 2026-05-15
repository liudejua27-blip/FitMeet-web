import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { Post } from './post.entity';
import { PostLike } from './post-like.entity';
import { PostSave } from './post-save.entity';
import { ModerationModule } from '../moderation/moderation.module';
import { Meet } from '../meets/meet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostLike, PostSave, Meet]),
    ModerationModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
