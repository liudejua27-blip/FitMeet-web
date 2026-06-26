import { requestProtected } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export type AgentFeedbackType =
  | 'candidate_quality'
  | 'agent_understanding'
  | 'task_correction'
  | 'task_outcome'
  | 'message_quality';

export type AgentFeedbackReasonCode =
  | 'good_fit'
  | 'bad_fit'
  | 'too_far'
  | 'time_mismatch'
  | 'style_mismatch'
  | 'wrong_activity'
  | 'privacy_preference'
  | 'not_public'
  | 'other';

export type SubmitAgentFeedbackEventInput = {
  taskId?: number | string | null;
  publicIntentId?: string | null;
  matchingJobId?: number | string | null;
  candidateId?: number | string | null;
  candidateRecordId?: number | string | null;
  feedbackType: AgentFeedbackType;
  reasonCode: AgentFeedbackReasonCode;
  freeText?: string | null;
  appliesToCurrentTask?: boolean | null;
  appliesToFutureProfile?: boolean | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AgentFeedbackEventResult = {
  ok: true;
  id: number;
  taskId: number | null;
  publicIntentId: string | null;
  matchingJobId: number | null;
  candidateId: number | null;
  feedbackType: AgentFeedbackType;
  reasonCode: AgentFeedbackReasonCode;
  correctionType: string | null;
  createdAt: string;
};

export function submitAgentFeedbackEvent(input: SubmitAgentFeedbackEventInput) {
  return requestProtected<AgentFeedbackEventResult>(
    fitMeetCoreEndpoints.socialAgentChat.feedbackEvents,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
