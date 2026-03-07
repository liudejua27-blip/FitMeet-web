import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoachesController } from './coaches.controller';
import { CoachesService } from './coaches.service';
import { Coach } from './coach.entity';
import { Review } from './review.entity';
import { Follow } from '../friends/follow.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Coach, Review, Follow])],
  controllers: [CoachesController],
  providers: [CoachesService],
  exports: [CoachesService],
})
export class CoachesModule {}
