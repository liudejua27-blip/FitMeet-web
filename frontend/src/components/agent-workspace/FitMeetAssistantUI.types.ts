import type { ThreadUserMessagePart } from '@assistant-ui/react';

import type {
  UserFacingAgentAssistantMessageSource,
  UserFacingAgentProgressKind,
  UserFacingAgentResponse,
} from '../../api/socialAgentApi';

export type FitMeetAssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: FitMeetAssistantAttachment[];
  status?: 'streaming' | 'done' | 'error';
  result?: UserFacingAgentResponse | null;
  taskId?: number | null;
  runId?: string | null;
  messageId?: string | null;
  traceId?: string | null;
  feedback?: 'positive' | 'negative' | null;
  feedbackStatus?: 'submitting' | 'submitted' | 'failed' | null;
  feedbackErrorValue?: 'positive' | 'negative' | null;
  showSocialResult?: boolean;
  conversationIntent?: 'conversation' | 'social' | 'approval';
  assistantMessageSource?: UserFacingAgentAssistantMessageSource;
  surfaceKind?: 'answer' | 'recovery' | 'system' | 'notice';
  branchable?: boolean;
  createsBranch?: boolean;
  reminderId?: number | string | null;
  reminderContext?: Record<string, unknown> | null;
  resolvedApproval?: {
    id: number | string | null;
    decision: 'approved' | 'rejected';
    summary?: string | null;
  } | null;
  branch?: {
    groupId: string;
    index: number;
    count: number;
    activeIndex?: number;
    syncStatus?: 'idle' | 'syncing' | 'synced' | 'failed';
  };
};

export type FitMeetAssistantAttachment = {
  id: string;
  type: 'image' | 'file';
  name?: string;
  contentType?: string;
  content?: ThreadUserMessagePart[];
};

export type FitMeetAssistantStep = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'waiting' | 'error';
  kind?: UserFacingAgentProgressKind;
  processType?: string;
  agentName?: string | null;
  detail?: string;
  metadata?: Record<string, unknown>;
  snapshot?: {
    schemaVersion: 'fitmeet.step-snapshot.v1';
    observation?: string[];
    critique?: string;
    result?: string;
  };
};

export type FitMeetAssistantRecovery = {
  kind:
    | 'failed'
    | 'stopped'
    | 'action_failed'
    | 'checkpoint_failed'
    | 'checkpoint_available'
    | 'missing_info'
    | 'unauthorized'
    | 'safety';
  title: string;
  message: string;
  prompt: string;
  retryable: boolean;
  checkpoint?: {
    checkpointId: number | string;
    stepId?: string | null;
    action: 'resume' | 'retry' | 'replay' | 'fork';
    steps?: Array<{
      stepId: string;
      label: string;
      status: string | null;
      retryable: boolean;
      replayable: boolean;
      forkable: boolean;
    }>;
  };
};
