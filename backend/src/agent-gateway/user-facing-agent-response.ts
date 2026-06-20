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
  | '正在结合你的 Life Graph'
  | '正在筛选合适的人'
  | '正在排除时间不合适的人'
  | '正在检查安全边界'
  | '正在生成开场白'
  | '正在等待你确认'
  | '正在创建约练计划'
  | '正在更新你的 Life Graph';

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

export interface UserFacingAgentResponse {
  assistantMessage: string;
  assistantMessageSource?: SocialAgentAssistantMessageSource;
  recoveryNotice?: UserFacingAgentRecoveryNotice;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
  lifeGraphWritebackProposal?: Record<string, unknown>;
  permissionMode: AgentTaskPermissionMode;
  runtime?: {
    checkpointId?: number | null;
    checkpointType?: string | null;
    canResume?: boolean;
    canReplay?: boolean;
    canFork?: boolean;
    parentCheckpointId?: number | null;
    threadId?: string | null;
    idempotencyKey?: string | null;
    checkpointAction?: 'resume' | 'retry' | 'replay' | 'fork' | null;
    resumeCursor?: {
      threadId?: string | null;
      checkpointId?: number | string | null;
      parentCheckpointId?: number | string | null;
      action?: 'resume' | 'retry' | 'replay' | 'fork' | null;
      stepId?: string | null;
    } | null;
    sourceStep?: {
      stepId: string;
      label: string | null;
      toolName: string | null;
    } | null;
    stepScope?: {
      mode: 'full_checkpoint' | 'through_step';
      stepCount: number;
      sourceCheckpointId: number | null;
    } | null;
    sideEffectPolicy?: {
      idempotencyKey: string;
      sideEffectsBeforeResume: 'idempotent_only';
      duplicatePolicy: 'reuse_idempotency_key';
    } | null;
  };
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
