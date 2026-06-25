import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SocialProfileService } from './social-profile.service';
import { OnboardingService } from './onboarding.service';
import { User } from './user.entity';
import { UserSocialProfile } from './user-social-profile.entity';
import { MediaAsset } from './media-asset.entity';
import { ProfileUpdateProposal } from './profile-update-proposal.entity';
import { UserConsent } from './user-consent.entity';
import { UserProfilePhoto } from './user-profile-photo.entity';
import { Follow } from '../friends/follow.entity';
import { Meet } from '../meets/meet.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserSocialProfile,
      MediaAsset,
      ProfileUpdateProposal,
      UserConsent,
      UserProfilePhoto,
      Follow,
      Meet,
      MeetParticipant,
      AiDelegateProfile,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, SocialProfileService, OnboardingService],
  exports: [
    UsersService,
    SocialProfileService,
    OnboardingService,
    TypeOrmModule,
  ],
})
export class UsersModule {}
