import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Post as PostEntity } from '../posts/post.entity';
import { Coach } from '../coaches/coach.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, PostEntity, Coach]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
