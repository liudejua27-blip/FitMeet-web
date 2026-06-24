import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import type {
  FitMeetAgentSafety,
  FitMeetAlphaCard,
} from './fitmeet-alpha-agent.types';
import { AgentCardAssemblerService } from './response-quality/agent-card-assembler.service';
import { LightStatusMapperService } from './response-quality/light-status-mapper.service';
import { UserFacingResponseSanitizerService } from './response-quality/user-facing-response-sanitizer.service';
import type {
  SocialAgentChatRunResult,
  SocialAgentAssistantMessageSource,
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';

export type UserFacingAgentLightStatus =
  | '正在思考'
  | '正在理解你的需求'
  | '正在结合你的长期偏好'
  | '正在读取你的偏好'
  | '正在筛选合适的人'
  | '正在筛选公开可发现的人'
  | '正在排除时间不合适的人'
  | '正在整理合适机会'
  | '正在检查安全边界'
  | '正在生成开场白'
  | '正在等待你确认'
  | '正在创建约练计划'
  | '正在整理约练方案'
  | '正在整理资料更新'
  | '正在整理资料变化建议';

export interface UserFacingAgentSafeStatus {
  blocked: boolean;
  level: FitMeetAgentSafety['level'];
  boundaryNotes: string[];
  requiredConfirmations: string[];
}

export interface UserFacingAgentPendingConfirmation {
  id: number | string | null;
  type: string;
  actionType: string;
  summary: string;
  riskLevel: string;
  payload?: Record<string, unknown>;
  expiresAt: string | null;
}

export interface UserFacingAgentRecoveryNotice {
  kind: 'failed' | 'timeout' | 'interrupted' | 'checkpoint';
  title: string;
  message: string;
  retryable: boolean;
  source: 'fallback_suppressed' | 'checkpoint_recovery' | 'stream_error';
}

export type UserFacingAgentPublicLoopStage =
  | 'profile_completion'
  | 'opportunity_card_generated'
  | 'publish_confirmation_required'
  | 'discover_visible'
  | 'candidates_recommended'
  | 'contact_confirmation_required'
  | 'messages_handoff'
  | 'dismissed';

export interface UserFacingAgentPublicLoop {
  stage: UserFacingAgentPublicLoopStage;
  publicIntentId: string | null;
  discoverHref: string | null;
  publicIntentHref: string | null;
  messagesHref: string | null;
  requiredConfirmation: boolean;
}

export type UserFacingAgentWorkflowState =
  | 'PROFILE_REQUIRED'
  | 'INTENT_DRAFT'
  | 'PUBLISH_CONFIRMATION_REQUIRED'
  | 'DISCOVER_VISIBLE'
  | 'CANDIDATES_READY'
  | 'CONTACT_CONFIRMATION_REQUIRED'
  | 'CONVERSATION_ACTIVE'
  | 'DISMISSED'
  | 'RECOVERY'
  | 'IDLE';

export interface UserFacingAgentWorkflow {
  workflowId: string | null;
  state: UserFacingAgentWorkflowState;
  requiredAction: string | null;
  retryable: boolean;
  recoveryMessage: string | null;
}

export interface UserFacingAgentResponse {
  taskId?: number | null;
  assistantMessage: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  recoveryNotice?: UserFacingAgentRecoveryNotice;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
  publicLoop?: UserFacingAgentPublicLoop;
  workflow?: UserFacingAgentWorkflow;
  lifeGraphWritebackProposal?: Record<string, unknown>;
  permissionMode: AgentTaskPermissionMode;
}

export type SanitizableAgentResult =
  | SocialAgentIntentRouteResult
  | SocialAgentChatRunResult;

const fallbackSanitizer = new UserFacingResponseSanitizerService(
  new LightStatusMapperService(),
  new AgentCardAssemblerService(),
);

export function toUserFacingAgentResponse(
  result: SanitizableAgentResult,
  permissionMode: AgentTaskPermissionMode,
): UserFacingAgentResponse {
  return fallbackSanitizer.toUserFacingAgentResponse(result, permissionMode);
}
