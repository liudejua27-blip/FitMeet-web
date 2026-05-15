import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiDelegateProfile } from './ai-delegate-profile.entity';
import { AiMatchSession } from './ai-match-session.entity';
import { AiMatchController } from './ai-match.controller';
import { AiMatchService } from './ai-match.service';
import { FriendsModule } from '../friends/friends.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiDelegateProfile, AiMatchSession]),
    FriendsModule,
    MessagesModule,
  ],
  controllers: [AiMatchController],
  providers: [AiMatchService],
})
export class AiMatchModule {}
