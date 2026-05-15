import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { AgentActivitiesController } from './agent-activities.controller';
import { ActivityTemplate } from './entities/activity-template.entity';
import { SocialActivity } from './entities/activity.entity';
import { ActivityProof } from './entities/activity-proof.entity';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { MeetsModule } from '../meets/meets.module';
import { User } from '../users/user.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActivityTemplate,
      SocialActivity,
      ActivityProof,
      User,
      UserSocialRequest,
      PublicSocialIntent,
    ]),
    forwardRef(() => AgentGatewayModule),
    forwardRef(() => MeetsModule),
  ],
  providers: [ActivitiesService],
  controllers: [ActivitiesController, AgentActivitiesController],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
