import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeetsController } from './meets.controller';
import { MeetsService } from './meets.service';
import { Meet } from './meet.entity';
import { MeetParticipant } from './meet-participant.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Meet, MeetParticipant]),
    NotificationsModule,
    forwardRef(() => ActivitiesModule),
  ],
  controllers: [MeetsController],
  providers: [MeetsService],
  exports: [MeetsService],
})
export class MeetsModule {}
