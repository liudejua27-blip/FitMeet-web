import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentProfileService } from './agent-profile.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { ActivitiesModule } from '../activities/activities.module';
import {
  AgentUserController,
  AgentApiController,
  AgentProfileQAController,
  PublicSocialIntentController,
  PublicSocialSkillsController,
} from './agent-gateway.controller';
import { AgentSkillsController } from './agent-skills.controller';
import { MiniProgramController } from './mini-program.controller';
import { AgentTokenGuard } from './guards/agent-token.guard';
import { AgentPermissionGuard } from './guards/agent-permission.guard';
import { AgentOwnerOrTokenGuard } from './guards/agent-owner-or-token.guard';
import { AgentConnection } from './entities/agent-connection.entity';
import { AgentProfile } from './entities/agent-profile.entity';
import { AgentPermission } from './entities/agent-permission.entity';
import { UserPreference } from './entities/user-preference.entity';
import { MatchCandidate } from './entities/match-candidate.entity';
import { AgentActivityLog } from './entities/agent-activity-log.entity';
import { AgentActionLog } from './entities/agent-action-log.entity';
import {
  AgentRuntimeGoal,
  AgentRuntimeLog,
  AgentRuntimePlan,
  AgentRuntimeResult,
  AgentRuntimeStep,
  AgentRuntimeTask,
  AgentRuntimeToolCall,
} from './entities/agent-runtime.entity';
import { AgentTask, AgentTaskEvent } from './entities/agent-task.entity';
import { AgentActionLogService } from './agent-action-log.service';
import { AgentWebhookService } from './agent-webhook.service';
import { AiSocialAutopilotService } from './ai-social-autopilot.service';
import { AgentDiscoveryService } from './agent-discovery.service';
import { AgentProfileQAService } from './agent-profile-qa.service';
import { ProfileMatchService } from './profile-match.service';
import { ProfileMatchAutopilotService } from './profile-match-autopilot.service';
import { MatchReasonerService } from './match-reasoner.service';
import { MatchModule } from '../match/match.module';
import { AgentApprovalRequest } from './entities/agent-approval-request.entity';
import { AgentSettings } from './entities/agent-settings.entity';
import { AgentApprovalService } from './agent-approval.service';
import { AgentSettingsService } from './agent-settings.service';
import { AgentControlController } from './agent-control.controller';
import { SafetyEvent } from './entities/safety-event.entity';
import { ContactRequest } from './entities/contact-request.entity';
import { SocialRequest } from './entities/social-request.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { MessagesModule } from '../messages/messages.module';
import { MeetsModule } from '../meets/meets.module';
import { SafetyModule } from '../safety/safety.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FriendsModule } from '../friends/friends.module';
import { SocialRequestsModule } from '../social-requests/social-requests.module';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import { Follow } from '../friends/follow.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';

@Module({
  imports: [
    MessagesModule,
    MeetsModule,
    SafetyModule,
    NotificationsModule,
    FriendsModule,
    UsersModule,
    forwardRef(() => ActivitiesModule),
    forwardRef(() => SocialRequestsModule),
    forwardRef(() => MatchModule),
    TypeOrmModule.forFeature([
      AgentConnection,
      AgentProfile,
      AgentPermission,
      UserPreference,
      MatchCandidate,
      AgentActivityLog,
      AgentActionLog,
      AgentRuntimeTask,
      AgentRuntimeGoal,
      AgentRuntimePlan,
      AgentRuntimeStep,
      AgentRuntimeToolCall,
      AgentRuntimeResult,
      AgentRuntimeLog,
      AgentTask,
      AgentTaskEvent,
      AgentApprovalRequest,
      AgentSettings,
      SafetyEvent,
      ContactRequest,
      SocialRequest,
      PublicSocialIntent,
      UserSocialRequest,
      SocialRequestCandidate,
      Follow,
      AiDelegateProfile,
      AiMatchSession,
      UserSocialProfile,
      User,
    ]),
  ],
  providers: [
    AgentGatewayService,
    AgentProfileService,
    AgentApprovalService,
    AgentApprovalDispatcherService,
    AgentSettingsService,
    AgentActionLogService,
    AgentWebhookService,
    AiSocialAutopilotService,
    AgentDiscoveryService,
    AgentProfileQAService,
    ProfileMatchService,
    ProfileMatchAutopilotService,
    MatchReasonerService,
    AgentTokenGuard,
    AgentPermissionGuard,
    AgentOwnerOrTokenGuard,
  ],
  controllers: [
    AgentUserController,
    AgentApiController,
    AgentProfileQAController,
    AgentSkillsController,
    MiniProgramController,
    AgentControlController,
    PublicSocialIntentController,
    PublicSocialSkillsController,
  ],
  exports: [
    AgentGatewayService,
    AgentProfileService,
    AgentApprovalService,
    AgentApprovalDispatcherService,
    AgentSettingsService,
    AgentActionLogService,
    AgentWebhookService,
    AiSocialAutopilotService,
    ProfileMatchService,
    ProfileMatchAutopilotService,
    AgentTokenGuard,
    AgentPermissionGuard,
    AgentOwnerOrTokenGuard,
    TypeOrmModule,
  ],
})
export class AgentGatewayModule {}
