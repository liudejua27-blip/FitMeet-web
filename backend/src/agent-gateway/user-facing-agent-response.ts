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
  SocialAgentIntentRouteResult,
} from './social-agent-chat.types';

export type UserFacingAgentLightStatus =
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
  expiresAt: string | null;
}

export interface UserFacingAgentResponse {
  assistantMessage: string;
  lightStatus: UserFacingAgentLightStatus;
  cards: FitMeetAlphaCard[];
  safeStatus: UserFacingAgentSafeStatus;
  pendingConfirmations: UserFacingAgentPendingConfirmation[];
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
