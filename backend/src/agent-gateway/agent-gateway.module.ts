import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentProfileService } from './agent-profile.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { ActivitiesModule } from '../activities/activities.module';
import { SocialAgentAutopilotController } from './social-agent-autopilot.controller';
import { SocialAgentChatController } from './social-agent-chat.controller';
import { SocialAgentDebugController } from './social-agent-debug.controller';
import { SocialAgentTasksController } from './social-agent-tasks.controller';
import {
  FitMeetAgentToolRegistryAgentController,
  FitMeetAgentToolRegistryUserController,
} from './fitmeet-agent-tool-registry.controller';
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
import { PaymentIntent } from './entities/payment-intent.entity';
import { AgentTask, AgentTaskEvent } from './entities/agent-task.entity';
import {
  FitMeetAgentMessage,
  FitMeetAgentMemoryUpdate,
  FitMeetAgentRun,
  FitMeetAgentRunStep,
  FitMeetAgentToolCall,
} from './entities/fitmeet-agent-runtime.entity';
import { AgentActionLogService } from './agent-action-log.service';
import { AgentPermissionService } from './agent-permission.service';
import { SocialAgentPlannerService } from './social-agent-planner.service';
import { SocialAgentIntentRouterService } from './social-agent-intent-router.service';
import { SocialAgentBrainService } from './social-agent-brain.service';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';
import { SocialAgentMemoryContextService } from './social-agent-memory-context.service';
import { SocialAgentActionSideEffectService } from './social-agent-action-side-effect.service';
import { SocialAgentToolExecutionPolicyService } from './social-agent-tool-execution-policy.service';
import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SocialAgentToolExecutorService } from './social-agent-tool-executor.service';
import { SocialAgentConfirmationPolicyService } from './social-agent-confirmation-policy.service';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentPaymentIntentToolService } from './social-agent-payment-intent-tool.service';
import { SocialAgentMessageToolService } from './social-agent-message-tool.service';
import { SocialAgentActivityToolService } from './social-agent-activity-tool.service';
import { SocialAgentInboxToolService } from './social-agent-inbox-tool.service';
import { SocialAgentConversationToolService } from './social-agent-conversation-tool.service';
import { SocialAgentDecisionToolService } from './social-agent-decision-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentAutopilotService } from './social-agent-autopilot.service';
import { SocialAgentChatService } from './social-agent-chat.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import { SocialAgentCandidateCommandService } from './social-agent-candidate-command.service';
import { SocialAgentCandidateActionService } from './social-agent-candidate-action.service';
import { SocialAgentDraftPublicationService } from './social-agent-draft-publication.service';
import { SocialAgentDraftSearchService } from './social-agent-draft-search.service';
import { SocialAgentRecommendationResultService } from './social-agent-recommendation-result.service';
import { SocialAgentActivitySearchService } from './social-agent-activity-search.service';
import { SocialAgentSessionRestoreService } from './social-agent-session-restore.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentRunRecommendationService } from './social-agent-run-recommendation.service';
import { SocialAgentReplanRunService } from './social-agent-replan-run.service';
import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentChatTurnFacadeService } from './social-agent-chat-turn-facade.service';
import { SocialAgentChatRunFacadeService } from './social-agent-chat-run-facade.service';
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentMetricsController } from './social-agent-metrics.controller';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentLongTermMemory } from './entities/social-agent-long-term-memory.entity';
import { SocialAgentRagService } from './social-agent-rag.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';
import { SocialAgentRouteCompletionService } from './social-agent-route-completion.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';
import { SocialAgentTargetResolverService } from './social-agent-target-resolver.service';
import { AgentWebhookService } from './agent-webhook.service';
import { AiSocialAutopilotService } from './ai-social-autopilot.service';
import { AgentDiscoveryService } from './agent-discovery.service';
import { AgentProfileQAService } from './agent-profile-qa.service';
import { ProfileMatchService } from './profile-match.service';
import { ProfileMatchAutopilotService } from './profile-match-autopilot.service';
import { MatchReasonerService } from './match-reasoner.service';
import { CandidateExplanationService } from './candidate-explanation.service';
import { SceneRiskPolicyService } from './scene-risk-policy.service';
import { CardCopywriterService } from './response-quality/card-copywriter.service';
import { ConfirmationCopyService } from './response-quality/confirmation-copy.service';
import { PersonalizationService } from './response-quality/personalization.service';
import { SafetyCopyService } from './response-quality/safety-copy.service';
import { TonePolicyService } from './response-quality/tone-policy.service';
import { AgentQualityEvaluatorService } from './agent-quality/agent-quality-evaluator.service';
import { AgentSessionAssemblerService } from './agent-session-assembler.service';
import { ConfirmationGuardService } from './confirmation-guard.service';
import { AgentCardAssemblerService } from './response-quality/agent-card-assembler.service';
import { DebugEnvelopeBuilderService } from './response-quality/debug-envelope-builder.service';
import { LightStatusMapperService } from './response-quality/light-status-mapper.service';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
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
import { LifeGraphModule } from '../life-graph/life-graph.module';
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
import { SocialActivity } from '../activities/entities/activity.entity';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MessagesModule,
    MeetsModule,
    SafetyModule,
    NotificationsModule,
    FriendsModule,
    RealtimeModule,
    UsersModule,
    LifeGraphModule,
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
      PaymentIntent,
      AgentTask,
      AgentTaskEvent,
      FitMeetAgentRun,
      FitMeetAgentRunStep,
      FitMeetAgentToolCall,
      FitMeetAgentMessage,
      FitMeetAgentMemoryUpdate,
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
      SocialAgentLongTermMemory,
      User,
      SocialActivity,
    ]),
  ],
  providers: [
    AgentGatewayService,
    AgentProfileService,
    AgentApprovalService,
    AgentApprovalDispatcherService,
    AgentSettingsService,
    AgentActionLogService,
    AgentPermissionService,
    CandidateExplanationService,
    SceneRiskPolicyService,
    TonePolicyService,
    SafetyCopyService,
    ConfirmationCopyService,
    PersonalizationService,
    CardCopywriterService,
    AgentQualityEvaluatorService,
    AgentSessionAssemblerService,
    AgentCardAssemblerService,
    LightStatusMapperService,
    UserFacingResponseSanitizerService,
    DebugEnvelopeBuilderService,
    ConfirmationGuardService,
    FitMeetAgentToolRegistryService,
    SocialAgentPlannerService,
    SocialAgentIntentRouterService,
    SocialAgentBrainService,
    FitMeetAlphaAgentSdkService,
    SocialAgentFinalResponseService,
    SocialAgentModelRouterService,
    SocialAgentMemoryContextService,
    SocialAgentActionSideEffectService,
    SocialAgentToolExecutionPolicyService,
    SocialAgentToolJsonModelService,
    SocialAgentConfirmationPolicyService,
    SocialAgentToolCallFactoryService,
    SocialAgentAutopilotService,
    SocialAgentChatLlmService,
    SocialAgentRunStateService,
    SocialAgentFollowUpContextService,
    SocialAgentReplanProgressService,
    SocialAgentProfileEnrichmentService,
    SocialAgentMeetLoopService,
    SocialAgentCardActionRouterService,
    SocialAgentCandidateCommandService,
    SocialAgentCandidateActionService,
    SocialAgentDraftPublicationService,
    SocialAgentDraftSearchService,
    SocialAgentRecommendationResultService,
    SocialAgentActivitySearchService,
    SocialAgentSessionRestoreService,
    SocialAgentMessageLogService,
    SocialAgentTaskLifecycleService,
    SocialAgentMainAgentTurnService,
    SocialAgentRunRecommendationService,
    SocialAgentReplanRunService,
    SocialAgentRouteTurnService,
    SocialAgentQueuedRunService,
    SocialAgentRunOrchestratorService,
    SocialAgentSessionQueryService,
    SocialAgentReplanFacadeService,
    SocialAgentInitialSearchQueueService,
    SocialAgentChatTurnFacadeService,
    SocialAgentChatRunFacadeService,
    SocialAgentChatService,
    FitMeetAgentRuntimeService,
    SocialAgentCandidatePoolService,
    SocialAgentMetricsService,
    SocialAgentLongTermMemoryService,
    SocialAgentRagService,
    SocialAgentRouteContextService,
    SocialAgentRouteCandidateConfirmationService,
    SocialAgentRouteCompletionService,
    SocialAgentRouteConversationTurnService,
    SocialAgentRouteProfileTurnService,
    SocialAgentRouteSearchTurnService,
    SocialAgentRouteActionTurnService,
    SocialAgentRouteDecisionService,
    SocialAgentTargetResolverService,
    SocialAgentToolExecutorService,
    SocialAgentToolInputParserService,
    SocialAgentPaymentIntentToolService,
    SocialAgentMessageToolService,
    SocialAgentActivityToolService,
    SocialAgentInboxToolService,
    SocialAgentConversationToolService,
    SocialAgentDecisionToolService,
    SocialAgentTaskMemoryService,
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
    AgentControlController,
    AgentApiController,
    AgentProfileQAController,
    AgentSkillsController,
    MiniProgramController,
    PublicSocialIntentController,
    PublicSocialSkillsController,
    SocialAgentAutopilotController,
    SocialAgentChatController,
    SocialAgentDebugController,
    FitMeetAgentToolRegistryAgentController,
    FitMeetAgentToolRegistryUserController,
    SocialAgentMetricsController,
    SocialAgentTasksController,
  ],
  exports: [
    AgentGatewayService,
    AgentProfileService,
    AgentApprovalService,
    AgentApprovalDispatcherService,
    AgentSettingsService,
    AgentActionLogService,
    AgentPermissionService,
    CandidateExplanationService,
    SceneRiskPolicyService,
    AgentQualityEvaluatorService,
    AgentSessionAssemblerService,
    AgentCardAssemblerService,
    LightStatusMapperService,
    UserFacingResponseSanitizerService,
    DebugEnvelopeBuilderService,
    ConfirmationGuardService,
    FitMeetAgentToolRegistryService,
    SocialAgentPlannerService,
    SocialAgentIntentRouterService,
    SocialAgentBrainService,
    FitMeetAlphaAgentSdkService,
    SocialAgentFinalResponseService,
    SocialAgentModelRouterService,
    SocialAgentMemoryContextService,
    SocialAgentActionSideEffectService,
    SocialAgentToolExecutionPolicyService,
    SocialAgentToolJsonModelService,
    SocialAgentConfirmationPolicyService,
    SocialAgentToolCallFactoryService,
    SocialAgentAutopilotService,
    SocialAgentChatService,
    SocialAgentRunStateService,
    SocialAgentSessionRestoreService,
    SocialAgentMessageLogService,
    SocialAgentTaskLifecycleService,
    SocialAgentMainAgentTurnService,
    SocialAgentRunRecommendationService,
    SocialAgentReplanRunService,
    SocialAgentReplanFacadeService,
    SocialAgentCandidateCommandService,
    SocialAgentInitialSearchQueueService,
    SocialAgentQueuedRunService,
    SocialAgentFollowUpContextService,
    SocialAgentReplanProgressService,
    FitMeetAgentRuntimeService,
    SocialAgentCandidatePoolService,
    SocialAgentLongTermMemoryService,
    SocialAgentRagService,
    SocialAgentRouteContextService,
    SocialAgentToolExecutorService,
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
