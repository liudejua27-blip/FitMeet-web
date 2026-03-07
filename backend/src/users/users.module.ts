import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Follow } from '../friends/follow.entity';
import { Post } from '../posts/post.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Coach } from '../coaches/coach.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Follow, Post, Meet, MeetParticipant, Coach])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
