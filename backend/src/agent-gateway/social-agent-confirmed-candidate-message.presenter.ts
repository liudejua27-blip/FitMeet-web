import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentTaskMemory } from './social-agent-memory.util';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

export function buildSocialAgentConfirmedCandidateMessageState(input: {
  action: SocialAgentToolCallRecord;
  targetUserId: number;
  candidate: Record<string, unknown>;
  text: string;
  candidateRecordId: number | null;
  socialRequestId: number | null;
}): {
  messageId: string | null;
  conversationId: string | null;
  candidateActionPatch: Record<string, unknown>;
  transitionPatch: Partial<SocialAgentTaskMemory['currentTask']>;
  assistantMessage: string;
} {
  const output = isRecord(input.action.output) ? input.action.output : {};
  const messageId = cleanDisplayText(output.id ?? output.messageId, '') || null;
  const conversationId = cleanDisplayText(output.conversationId, '') || null;
  const name = cleanDisplayText(
    input.candidate.nickname ?? input.candidate.displayName,
    `用户 #${input.targetUserId}`,
  );

  return {
    messageId,
    conversationId,
    candidateActionPatch: {
      send: 'sent',
      conversationId,
      messageId,
      candidateRecordId: input.candidateRecordId,
      socialRequestId: input.socialRequestId,
      toolCallId: input.action.id,
      connectionState: 'waiting_reply',
      nextRecoverableAction: 'meet_loop.resume',
      sideEffectPolicy: 'no_followup_without_user_confirmation',
    },
    transitionPatch: {
      objective: 'candidate_messaging',
      nextStep:
        '等待候选人回复；继续发消息、发起约练或连接前仍会再次确认。',
      shouldSearchNow: false,
      awaitingSearchConfirmation: false,
      waitingFor: 'candidate_reply',
      lastCompletedStep: 'message_sent',
    },
    assistantMessage: `已确认发送给${name}：${input.text}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
