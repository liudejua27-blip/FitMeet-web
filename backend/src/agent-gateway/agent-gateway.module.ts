import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentGatewayService } from './agent-gateway.service';
import { AgentProfileService } from './agent-profile.service';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import { AgentLoopService } from './agent-loop.service';
import { AgentObservabilityService } from './agent-observability.service';
import { AgentObservabilityAlertSinkService } from './agent-observability-alert-sink.service';
import { AgentApprovalDispatcherService } from './agent-approval-dispatcher.service';
import { AgentSelfImproveService } from './agent-self-improve.service';
import { ActivitiesModule } from '../activities/activities.module';
import { SocialAgentReminderController } from './social-agent-reminder.controller';
import { AgentSelfImproveController } from './agent-self-improve.controller';
import { AgentL5RuntimeController } from './agent-l5-runtime.controller';
import { SocialAgentChatController } from './social-agent-chat.controller';
import { SocialAgentTasksController } from './social-agent-tasks.controller';
import { AgentProfileQAController } from './agent-profile-qa.controller';
import { PublicSocialIntentController } from './public-social-intent.controller';
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
import { AgentRunCheckpoint } from './entities/agent-run-checkpoint.entity';
import {
  AgentEvalCase,
  AgentReflectionRun,
  AgentSkillPatch,
} from './entities/agent-self-improve.entity';
import {
  AgentMeetLoopState,
  AgentOnlineReplaySample,
  AgentSkillPatchEffect,
  AgentSubagentMemory,
  SubagentWorkerFailure,
  SubagentWorkerHeartbeat,
  SubagentWorkerJob,
} from './entities/agent-l5-runtime.entity';
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
import { SocialAgentWorkflowRouterService } from './social-agent-workflow-router.service';
import { SocialAgentBrainService } from './social-agent-brain.service';
import { FitMeetAlphaAgentSdkService } from './fitmeet-alpha-agent-sdk.service';
import { FitMeetSubagentRuntimeService } from './fitmeet-subagent-runtime.service';
import { FitMeetSubagentWorkerDispatcherService } from './fitmeet-subagent-worker-dispatcher.service';
import { FitMeetSubagentWorkerService } from './fitmeet-subagent-worker.service';
import { FitMeetSubagentWorkerRuntimeService } from './fitmeet-subagent-worker-runtime.service';
import { SubagentWorkerQueueService } from './subagent-worker-queue.service';
import { SocialAgentFinalResponseService } from './social-agent-final-response.service';
import { SocialAgentModelRouterService } from './social-agent-model-router.service';
import { SocialAgentMemoryContextService } from './social-agent-memory-context.service';
import { SocialAgentActionSideEffectService } from './social-agent-action-side-effect.service';
import { SocialSideEffectService } from './social-side-effect.service';
import { SocialAgentToolExecutionPolicyService } from './social-agent-tool-execution-policy.service';
import { SocialAgentToolJsonModelService } from './social-agent-tool-json-model.service';
import { SocialAgentToolExecutorService } from './social-agent-tool-executor.service';
import { SocialAgentConfirmationPolicyService } from './social-agent-confirmation-policy.service';
import { SocialAgentToolCallFactoryService } from './social-agent-tool-call-factory.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentPaymentIntentToolService } from './social-agent-payment-intent-tool.service';
import { SocialAgentMessageToolService } from './social-agent-message-tool.service';
import { SocialAgentActivityToolService } from './social-agent-activity-tool.service';
import { SocialAgentMessageEventToolService } from './social-agent-message-event-tool.service';
import { SocialAgentConversationToolService } from './social-agent-conversation-tool.service';
import { SocialAgentDecisionToolService } from './social-agent-decision-tool.service';
import { SocialAgentSafetyToolService } from './social-agent-safety-tool.service';
import { SocialAgentTaskMemoryService } from './social-agent-task-memory.service';
import { FitMeetAgentToolRegistryService } from './fitmeet-agent-tool-registry.service';
import { SocialAgentAutopilotService } from './social-agent-autopilot.service';
import { SocialAgentChatService } from './social-agent-chat.service';
import { SocialAgentChatDeepSeekClientService } from './social-agent-chat-deepseek-client.service';
import { SocialAgentChatLlmService } from './social-agent-chat-llm.service';
import { SocialAgentRunStateService } from './social-agent-run-state.service';
import { SocialAgentFollowUpContextService } from './social-agent-follow-up-context.service';
import { SocialAgentReplanProgressService } from './social-agent-replan-progress.service';
import { SocialAgentProfileEnrichmentService } from './social-agent-profile-enrichment.service';
import { SocialAgentMeetLoopService } from './social-agent-meet-loop.service';
import { SocialAgentCardActionRouterService } from './social-agent-card-action-router.service';
import { SocialAgentLifeGraphCardActionService } from './social-agent-life-graph-card-action.service';
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
import { SocialAgentMainAgentTurnEventsService } from './social-agent-main-agent-turn-events.service';
import { SocialAgentMainAgentTurnResultService } from './social-agent-main-agent-turn-result.service';
import { SocialAgentRunRecommendationService } from './social-agent-run-recommendation.service';
import { SocialAgentReplanRunService } from './social-agent-replan-run.service';
import { SocialAgentRouteTurnService } from './social-agent-route-turn.service';
import { SocialAgentQueuedRunService } from './social-agent-queued-run.service';
import { SocialAgentRunOrchestratorService } from './social-agent-run-orchestrator.service';
import { SocialAgentSessionQueryService } from './social-agent-session-query.service';
import { SocialAgentReplanFacadeService } from './social-agent-replan-facade.service';
import { SocialAgentInitialSearchQueueService } from './social-agent-initial-search-queue.service';
import { SocialAgentChatTurnFacadeService } from './social-agent-chat-turn-facade.service';
import { SocialAgentChatTurnCallbacksService } from './social-agent-chat-turn-callbacks.service';
import { SocialAgentChatRunFacadeService } from './social-agent-chat-run-facade.service';
import { SocialAgentChatSessionFacadeService } from './social-agent-chat-session-facade.service';
import { SocialAgentMessageFeedbackService } from './social-agent-message-feedback.service';
import { SocialAgentFeedbackEventService } from './social-agent-feedback-event.service';
import { SocialAgentReminderService } from './social-agent-reminder.service';
import { SocialAgentThreadService } from './social-agent-thread.service';
import { SocialAgentThreadSessionManager } from './social-agent-thread-session-manager.service';
import { SocialAgentContextHydratorService } from './social-agent-context-hydrator.service';
import { SocialAgentTaskMemoryStateMachineService } from './social-agent-task-memory-state-machine.service';
import { SocialAgentEventV2Service } from './social-agent-event-v2.service';
import { SocialAgentEventStore } from './social-agent-event-store.service';
import { SocialCodexApprovalSchemaService } from './social-codex-approval-schema.service';
import { SocialCodexEventPipelineService } from './social-codex-event-pipeline.service';
import { SocialCodexRuntimePolicyService } from './social-codex-runtime-policy.service';
import { SocialCodexLifeGraphGovernanceService } from './social-codex-life-graph-governance.service';
import { SocialCodexTraceEvalService } from './social-codex-trace-eval.service';
import { AgentRunCheckpointService } from './agent-run-checkpoint.service';
import { FitMeetAgentRuntimeService } from './fitmeet-agent-runtime.service';
import { SocialAgentCandidatePoolService } from './social-agent-candidate-pool.service';
import { CandidateSearchIndexService } from './candidate-search-index.service';
import { SocialAgentLlmOutputCacheService } from './social-agent-llm-output-cache.service';
import { SocialAgentSemanticResponseCacheService } from './social-agent-semantic-response-cache.service';
import { SocialAgentToolResultCacheService } from './social-agent-tool-result-cache.service';
import { SocialAgentEmbeddingCacheService } from './social-agent-embedding-cache.service';
import { SocialAgentTokenBudgetContextPackerService } from './social-agent-token-budget-context-packer.service';
import { SocialAgentMetricsService } from './social-agent-metrics.service';
import { SocialAgentLongTermMemoryService } from './social-agent-long-term-memory.service';
import { SocialAgentLongTermMemory } from './entities/social-agent-long-term-memory.entity';
import { SocialAgentMessageFeedback } from './entities/social-agent-message-feedback.entity';
import { AgentFeedbackEvent } from './entities/agent-feedback-event.entity';
import { CandidateSearchIndex } from './entities/candidate-search-index.entity';
import { SocialCandidateEvent } from './entities/social-candidate-event.entity';
import { SocialCandidateSnapshot } from './entities/social-candidate-snapshot.entity';
import {
  SocialAgentReminder,
  SocialAgentReminderPreference,
} from './entities/social-agent-reminder.entity';
import { SocialAgentUserInterestEvent } from './entities/social-agent-user-interest-event.entity';
import { SocialAgentUserInterestEventService } from './social-agent-user-interest-event.service';
import { SocialAgentPreferenceGeneralizationService } from './social-agent-preference-generalization.service';
import { SocialCandidateAuditService } from './social-candidate-audit.service';
import { SocialAgentMatchHistoryService } from './social-agent-match-history.service';
import { SocialAgentRagService } from './social-agent-rag.service';
import { SocialAgentRouteContextService } from './social-agent-route-context.service';
import { SocialAgentRouteCandidateConfirmationService } from './social-agent-route-candidate-confirmation.service';
import { SocialAgentRouteCompletionService } from './social-agent-route-completion.service';
import { SocialAgentRouteConversationTurnService } from './social-agent-route-conversation-turn.service';
import { SocialAgentRouteEntranceService } from './social-agent-route-entrance.service';
import { SocialAgentRouteProfileTurnService } from './social-agent-route-profile-turn.service';
import { SocialAgentRouteSearchTurnService } from './social-agent-route-search-turn.service';
import { SocialAgentRouteActionTurnService } from './social-agent-route-action-turn.service';
import { SocialAgentRouteDecisionService } from './social-agent-route-decision.service';
import { SocialAgentRouteAgentLoopRunnerService } from './social-agent-route-agent-loop-runner.service';
import { SocialAgentProfileGateService } from './social-agent-profile-gate.service';
import { SocialAgentStreamingResponseService } from './social-agent-streaming-response.service';
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
import { AgentSideEffectLedger } from './entities/agent-side-effect-ledger.entity';
import { MatchingJob } from './entities/matching-job.entity';
import { AgentSettings } from './entities/agent-settings.entity';
import { AgentApprovalService } from './agent-approval.service';
import { AgentSideEffectLedgerService } from './agent-side-effect-ledger.service';
import { MatchingJobService } from './matching-job.service';
import { SocialAgentMatchingJobProcessorService } from './social-agent-matching-job-processor.service';
import { SocialAgentMatchingJobWorkerCronService } from './social-agent-matching-job-worker-cron.service';
import { SocialAgentPublishReconcilerService } from './social-agent-publish-reconciler.service';
import { SocialAgentPublishReconcilerCronService } from './social-agent-publish-reconciler-cron.service';
import { SocialAgentMatchRelaxationService } from './social-agent-match-relaxation.service';
import { SocialAgentMatchRelaxationActionService } from './social-agent-match-relaxation-action.service';
import { SocialAgentApplicationActionService } from './social-agent-application-action.service';
import { PublicIntentPrivacyGuardService } from './public-intent-privacy-guard.service';
import { SocialIntentRateLimitService } from './social-intent-rate-limit.service';
import { SocialAgentDomainClassifierService } from './social-agent-domain-classifier.service';
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
import { SocialLoopModule } from '../social-loop/social-loop.module';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { SocialRequestCandidate } from '../match/social-request-candidate.entity';
import { Follow } from '../friends/follow.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { AiMatchSession } from '../ai-match/ai-match-session.entity';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { SocialActivity } from '../activities/entities/activity.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminRbacModule } from '../admin-rbac/admin-rbac.module';

@Module({
  imports: [
    MessagesModule,
    MeetsModule,
    SafetyModule,
    NotificationsModule,
    AdminRbacModule,
    FriendsModule,
    RealtimeModule,
    UsersModule,
    SocialLoopModule,
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
      AgentRunCheckpoint,
      AgentReflectionRun,
      AgentSkillPatch,
      AgentEvalCase,
      AgentMeetLoopState,
      AgentOnlineReplaySample,
      AgentSkillPatchEffect,
      AgentSubagentMemory,
      SubagentWorkerJob,
      SubagentWorkerHeartbeat,
      SubagentWorkerFailure,
      FitMeetAgentRun,
      FitMeetAgentRunStep,
      FitMeetAgentToolCall,
      FitMeetAgentMessage,
      FitMeetAgentMemoryUpdate,
      AgentApprovalRequest,
      AgentSideEffectLedger,
      MatchingJob,
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
      SocialAgentMessageFeedback,
      AgentFeedbackEvent,
      CandidateSearchIndex,
      SocialCandidateSnapshot,
      SocialCandidateEvent,
      SocialAgentUserInterestEvent,
      SocialAgentReminderPreference,
      SocialAgentReminder,
      User,
      SocialActivity,
    ]),
  ],
  providers: [
    AgentGatewayService,
    AgentProfileService,
    AgentL5RuntimeService,
    AgentLoopService,
    AgentObservabilityService,
    AgentObservabilityAlertSinkService,
    AgentSelfImproveService,
    AgentApprovalService,
    AgentSideEffectLedgerService,
    MatchingJobService,
    SocialAgentMatchingJobProcessorService,
    SocialAgentMatchingJobWorkerCronService,
    SocialAgentPublishReconcilerService,
    SocialAgentPublishReconcilerCronService,
    SocialAgentMatchRelaxationService,
    SocialAgentMatchRelaxationActionService,
    SocialAgentApplicationActionService,
    PublicIntentPrivacyGuardService,
    SocialIntentRateLimitService,
    SocialAgentDomainClassifierService,
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
    SocialAgentWorkflowRouterService,
    SocialAgentBrainService,
    FitMeetAlphaAgentSdkService,
    FitMeetSubagentRuntimeService,
    FitMeetSubagentWorkerDispatcherService,
    FitMeetSubagentWorkerService,
    FitMeetSubagentWorkerRuntimeService,
    SubagentWorkerQueueService,
    SocialAgentStreamingResponseService,
    SocialAgentFinalResponseService,
    SocialAgentModelRouterService,
    SocialAgentMemoryContextService,
    SocialAgentActionSideEffectService,
    SocialSideEffectService,
    SocialAgentToolExecutionPolicyService,
    SocialAgentToolJsonModelService,
    SocialAgentConfirmationPolicyService,
    SocialAgentToolCallFactoryService,
    SocialAgentAutopilotService,
    SocialAgentChatDeepSeekClientService,
    SocialAgentChatLlmService,
    SocialAgentRunStateService,
    SocialAgentFollowUpContextService,
    SocialAgentReplanProgressService,
    SocialAgentProfileEnrichmentService,
    SocialAgentMeetLoopService,
    SocialAgentCardActionRouterService,
    SocialAgentLifeGraphCardActionService,
    SocialAgentCandidateCommandService,
    SocialAgentCandidateActionService,
    SocialAgentDraftPublicationService,
    SocialAgentDraftSearchService,
    SocialAgentRecommendationResultService,
    SocialAgentActivitySearchService,
    SocialAgentSessionRestoreService,
    SocialAgentMessageLogService,
    SocialAgentTaskLifecycleService,
    SocialAgentMainAgentTurnEventsService,
    SocialAgentMainAgentTurnResultService,
    SocialAgentMainAgentTurnService,
    SocialAgentRunRecommendationService,
    SocialAgentReplanRunService,
    SocialAgentRouteTurnService,
    SocialAgentQueuedRunService,
    SocialAgentRunOrchestratorService,
    SocialAgentSessionQueryService,
    SocialAgentReplanFacadeService,
    SocialAgentInitialSearchQueueService,
    SocialAgentChatTurnCallbacksService,
    SocialAgentChatTurnFacadeService,
    SocialAgentChatRunFacadeService,
    SocialAgentChatSessionFacadeService,
    SocialAgentMessageFeedbackService,
    SocialAgentFeedbackEventService,
    SocialAgentReminderService,
    SocialAgentThreadService,
    SocialAgentThreadSessionManager,
    SocialAgentContextHydratorService,
    SocialAgentTaskMemoryStateMachineService,
    SocialAgentEventV2Service,
    SocialAgentEventStore,
    SocialCodexApprovalSchemaService,
    SocialCodexEventPipelineService,
    SocialCodexRuntimePolicyService,
    SocialCodexLifeGraphGovernanceService,
    SocialCodexTraceEvalService,
    AgentRunCheckpointService,
    SocialAgentChatService,
    FitMeetAgentRuntimeService,
    SocialAgentLlmOutputCacheService,
    SocialAgentSemanticResponseCacheService,
    SocialAgentToolResultCacheService,
    SocialAgentEmbeddingCacheService,
    SocialAgentTokenBudgetContextPackerService,
    SocialAgentCandidatePoolService,
    CandidateSearchIndexService,
    SocialAgentMetricsService,
    SocialAgentLongTermMemoryService,
    SocialAgentUserInterestEventService,
    SocialAgentPreferenceGeneralizationService,
    SocialCandidateAuditService,
    SocialAgentMatchHistoryService,
    SocialAgentRagService,
    SocialAgentRouteContextService,
    SocialAgentRouteCandidateConfirmationService,
    SocialAgentRouteCompletionService,
    SocialAgentRouteConversationTurnService,
    SocialAgentRouteEntranceService,
    SocialAgentRouteProfileTurnService,
    SocialAgentRouteSearchTurnService,
    SocialAgentProfileGateService,
    SocialAgentRouteActionTurnService,
    SocialAgentRouteDecisionService,
    SocialAgentRouteAgentLoopRunnerService,
    SocialAgentTargetResolverService,
    SocialAgentToolExecutorService,
    SocialAgentToolInputParserService,
    SocialAgentPaymentIntentToolService,
    SocialAgentMessageToolService,
    SocialAgentActivityToolService,
    SocialAgentMessageEventToolService,
    SocialAgentConversationToolService,
    SocialAgentDecisionToolService,
    SocialAgentSafetyToolService,
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
    AgentControlController,
    AgentProfileQAController,
    PublicSocialIntentController,
    SocialAgentReminderController,
    AgentSelfImproveController,
    AgentL5RuntimeController,
    SocialAgentChatController,
    SocialAgentTasksController,
  ],
  exports: [
    AgentGatewayService,
    AgentProfileService,
    AgentL5RuntimeService,
    AgentLoopService,
    AgentObservabilityService,
    AgentObservabilityAlertSinkService,
    AgentSelfImproveService,
    AgentApprovalService,
    AgentSideEffectLedgerService,
    MatchingJobService,
    SocialAgentMatchingJobProcessorService,
    SocialAgentMatchRelaxationService,
    SocialAgentMatchRelaxationActionService,
    PublicIntentPrivacyGuardService,
    SocialIntentRateLimitService,
    SocialAgentDomainClassifierService,
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
    SocialAgentWorkflowRouterService,
    SocialAgentBrainService,
    FitMeetAlphaAgentSdkService,
    FitMeetSubagentRuntimeService,
    FitMeetSubagentWorkerDispatcherService,
    FitMeetSubagentWorkerService,
    FitMeetSubagentWorkerRuntimeService,
    SubagentWorkerQueueService,
    SocialAgentStreamingResponseService,
    SocialAgentFinalResponseService,
    SocialAgentModelRouterService,
    SocialAgentMemoryContextService,
    SocialAgentActionSideEffectService,
    SocialSideEffectService,
    SocialAgentToolExecutionPolicyService,
    SocialAgentToolJsonModelService,
    SocialAgentConfirmationPolicyService,
    SocialAgentToolCallFactoryService,
    SocialAgentAutopilotService,
    SocialAgentChatService,
    SocialAgentRunStateService,
    SocialAgentSessionRestoreService,
    SocialAgentMessageLogService,
    SocialAgentMessageFeedbackService,
    SocialAgentFeedbackEventService,
    SocialAgentThreadService,
    AgentRunCheckpointService,
    SocialAgentEventV2Service,
    SocialAgentEventStore,
    SocialCodexApprovalSchemaService,
    SocialCodexEventPipelineService,
    SocialCodexRuntimePolicyService,
    SocialCodexLifeGraphGovernanceService,
    SocialCodexTraceEvalService,
    SocialAgentTaskLifecycleService,
    SocialAgentMainAgentTurnEventsService,
    SocialAgentMainAgentTurnResultService,
    SocialAgentMainAgentTurnService,
    SocialAgentRunRecommendationService,
    SocialAgentReplanRunService,
    SocialAgentReplanFacadeService,
    SocialAgentCandidateCommandService,
    SocialAgentInitialSearchQueueService,
    SocialAgentChatTurnCallbacksService,
    SocialAgentQueuedRunService,
    SocialAgentFollowUpContextService,
    SocialAgentReplanProgressService,
    FitMeetAgentRuntimeService,
    SocialAgentLlmOutputCacheService,
    SocialAgentSemanticResponseCacheService,
    SocialAgentToolResultCacheService,
    SocialAgentEmbeddingCacheService,
    SocialAgentTokenBudgetContextPackerService,
    SocialAgentCandidatePoolService,
    CandidateSearchIndexService,
    SocialAgentLongTermMemoryService,
    SocialAgentUserInterestEventService,
    SocialAgentPreferenceGeneralizationService,
    SocialCandidateAuditService,
    SocialAgentMatchHistoryService,
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
