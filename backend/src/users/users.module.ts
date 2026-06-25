import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SocialProfileService } from './social-profile.service';
import { User } from './user.entity';
import { UserSocialProfile } from './user-social-profile.entity';
import { ProfileUpdateProposal } from './profile-update-proposal.entity';
import { Follow } from '../friends/follow.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSocialProfile,
      ProfileUpdateProposal,
      Follow,
      Meet,
      MeetParticipant,
      AiDelegateProfile,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, SocialProfileService],
  exports: [UsersService, SocialProfileService, TypeOrmModule],
})
export class UsersModule {}
