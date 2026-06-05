import type {
  SocialAgentChatCandidate,
  SocialAgentChatRunResult,
  SocialAgentPermissionMode,
} from '../../api/socialAgentDebugApi';

export type AgentWorkbenchMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type AgentRunStepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'error'
  | 'waiting_confirmation';

export type AgentRunEvent = {
  runId?: string;
  stepId: string;
  type:
    | 'intent_detected'
    | 'profile_loaded'
    | 'permission_checked'
    | 'tool_call_started'
    | 'tool_call_finished'
    | 'candidates_scored'
    | 'safety_checked'
    | 'final_answer'
    | 'action_required';
  title: string;
  summary?: string;
  status: AgentRunStepStatus;
  agent:
    | 'FitMeetAgent'
    | 'LifeGraphAgent'
    | 'MatchAgent'
    | 'SafetyAgent'
    | 'ConversationAgent';
  tool?: string;
  createdAt: string;
};

export type AgentConversation = {
  id: string;
  title: string;
  type: '找搭子' | '画像完善' | '聊天建议' | '约练活动' | '安全提醒';
  updatedAt: string;
};

export type AgentConfirmAction = {
  id: string;
  type:
    | 'friend_request'
    | 'message'
    | 'activity'
    | 'contact'
    | 'privacy'
    | 'auto_reply';
  title: string;
  target: string;
  content: string;
  riskNote: string;
  permissionMode: SocialAgentPermissionMode;
  candidate?: SocialAgentChatCandidate;
};

export type AgentWorkbenchState = {
  messages: AgentWorkbenchMessage[];
  events: AgentRunEvent[];
  result: SocialAgentChatRunResult | null;
  activeAction: AgentConfirmAction | null;
};
