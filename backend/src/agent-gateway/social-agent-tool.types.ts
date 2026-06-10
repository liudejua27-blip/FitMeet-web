import { AgentTaskStatus } from './entities/agent-task.entity';
import type { AgentLoopRun } from './agent-loop.types';

export enum SocialAgentToolName {
  GetMyProfile = 'get_my_profile',
  GetAiProfile = 'get_ai_profile',
  GenerateProfileQuestions = 'generate_profile_questions',
  UpdateAiProfileFromAnswers = 'update_ai_profile_from_answers',
  UpdateProfileFromAgentContext = 'update_profile_from_agent_context',
  GetCurrentTaskMemory = 'get_current_task_memory',
  PublishSocialRequest = 'publish_social_request',
  CreateSocialRequest = 'create_social_request',
  SearchPublicIntents = 'search_public_intents',
  SearchActivities = 'search_activities',
  SearchMatches = 'search_matches',
  ExplainMatches = 'explain_matches',
  DraftOpener = 'draft_opener',
  SendMessageToCandidate = 'send_message_to_candidate',
  SendMessage = 'send_message',
  ConnectCandidate = 'connect_candidate',
  AddFriend = 'add_friend',
  CreateActivity = 'create_activity',
  JoinActivity = 'join_activity',
  InviteActivity = 'invite_activity',
  SaveCandidate = 'save_candidate',
  GetConversations = 'get_conversations',
  GetAgentInbox = 'get_agent_inbox',
  WriteInbox = 'write_inbox',
  ReadInbox = 'read_inbox',
  GetPendingApprovals = 'get_pending_approvals',
  ApproveAction = 'approve_action',
  RejectAction = 'reject_action',
  ReadLongTermMemory = 'read_long_term_memory',
  SummarizeCurrentTask = 'summarize_current_task',
  GetCandidatePoolDebug = 'get_candidate_pool_debug',
  ReadTaskConversationMessages = 'read_task_conversation_messages',
  SummarizeReply = 'summarize_reply',
  DecideNextSocialAction = 'decide_next_social_action',
  ReplyMessage = 'reply_message',
  OfflineMeeting = 'offline_meeting',
  ShareLocation = 'share_location',
  Payment = 'payment',
}

export type SocialAgentToolCallStatus = 'succeeded' | 'failed' | 'blocked';

export interface SocialAgentToolCallRecord extends Record<string, unknown> {
  id: string;
  stepId: string;
  toolName: SocialAgentToolName;
  status: SocialAgentToolCallStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface SocialAgentTaskExecutionResult {
  taskId: number;
  executedSteps: number;
  succeededSteps: number;
  failedSteps: number;
  blockedSteps: number;
  toolCalls: SocialAgentToolCallRecord[];
}

export interface SocialAgentRunNextResult extends SocialAgentTaskExecutionResult {
  status: AgentTaskStatus;
  handledReply: boolean;
  decision: Record<string, unknown> | null;
  agentLoop?: AgentLoopRun;
}
