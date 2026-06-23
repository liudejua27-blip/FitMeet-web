import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../activities/activities.module';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { AgentTokenGuard } from '../agent-gateway/guards/agent-token.guard';
import { UserSocialRequest } from './social-request.entity';
import { SocialRequestsService } from './social-requests.service';
import { AgentSocialRequestAdapter } from './agent-social-request.adapter';
import { MatchModule } from '../match/match.module';
import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import { AgentActivityLog } from '../agent-gateway/entities/agent-activity-log.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { Follow } from '../friends/follow.entity';
import { AgentSettings } from '../agent-gateway/entities/agent-settings.entity';
import { AgentApprovalRequest } from '../agent-gateway/entities/agent-approval-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserSocialRequest,
      AgentConnection,
      SocialRequestCandidate,
      AgentActivityLog,
      PublicSocialIntent,
      User,
      UserSocialProfile,
      Follow,
      AgentSettings,
      AgentApprovalRequest,
    ]),
    forwardRef(() => MatchModule),
    forwardRef(() => ActivitiesModule),
    forwardRef(() => AgentGatewayModule),
    MessagesModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [
    SocialRequestsService,
    AgentTokenGuard,
    AgentSocialRequestAdapter,
  ],
  exports: [SocialRequestsService, AgentSocialRequestAdapter],
})
export class SocialRequestsModule {}
