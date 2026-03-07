import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeetsController } from './meets.controller';
import { MeetsService } from './meets.service';
import { Meet } from './meet.entity';
import { MeetParticipant } from './meet-participant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Meet, MeetParticipant])],
  controllers: [MeetsController],
  providers: [MeetsService],
  exports: [MeetsService],
})
export class MeetsModule {}
