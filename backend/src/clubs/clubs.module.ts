import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meet } from '../meets/meet.entity';
import { MeetsModule } from '../meets/meets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClubMember } from './club-member.entity';
import { Club } from './club.entity';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Club, ClubMember, Meet]),
    MeetsModule,
    NotificationsModule,
  ],
  controllers: [ClubsController],
  providers: [ClubsService],
  exports: [ClubsService, TypeOrmModule],
})
export class ClubsModule {}
