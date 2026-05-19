import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { UserPreference } from '../agent-gateway/entities/user-preference.entity';
import { SocialRequestCandidate } from './social-request-candidate.entity';
import { CompatibilityScorerService } from './compatibility-scorer.service';
import { MatchService } from './match.service';
import { MatchController } from './match.controller';
import { AgentMatchController } from './agent-match.controller';
import { SafetyModule } from '../safety/safety.module';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { AgentTokenGuard } from '../agent-gateway/guards/agent-token.guard';
import { AgentPermissionGuard } from '../agent-gateway/guards/agent-permission.guard';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { AgentPermission } from '../agent-gateway/entities/agent-permission.entity';
import { AgentActivityLog } from '../agent-gateway/entities/agent-activity-log.entity';
import { SafetyEvent } from '../agent-gateway/entities/safety-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SocialRequestCandidate,
      UserSocialRequest,
      User,
      UserSocialProfile,
      UserPreference,
      AgentConnection,
      AgentPermission,
      AgentActivityLog,
      SafetyEvent,
    ]),
    SafetyModule,
    forwardRef(() => AgentGatewayModule),
  ],
  controllers: [MatchController, AgentMatchController],
  providers: [
    MatchService,
    CompatibilityScorerService,
    AgentTokenGuard,
    AgentPermissionGuard,
  ],
  exports: [MatchService, CompatibilityScorerService, TypeOrmModule],
})
export class MatchModule {}
