import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InviteCode } from './entities/invite-code.entity';
import { WaitlistAnalyticsEvent } from './entities/waitlist-analytics-event.entity';
import { WaitlistAppEntry } from './entities/waitlist-app-entry.entity';
import { WaitlistController } from './waitlist.controller';
import { WaitlistQualityScoringService } from './waitlist-quality-scoring.service';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaitlistAppEntry,
      InviteCode,
      WaitlistAnalyticsEvent,
    ]),
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService, WaitlistQualityScoringService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
