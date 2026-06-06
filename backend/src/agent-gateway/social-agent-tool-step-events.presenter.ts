import type {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

type SocialAgentToolStepEventBase = {
  toolName: SocialAgentToolName;
  stepId: string;
  toolCallId: string;
};

type SocialAgentToolStepEventInput = {
  summary: string;
  payload?: Record<string, unknown>;
  stepId?: string | null;
  toolCallId?: string | null;
};

export function buildSocialAgentStepStartedEvent({
  toolName,
  stepId,
  toolCallId,
  input,
}: SocialAgentToolStepEventBase & {
  input: Record<string, unknown>;
}): SocialAgentToolStepEventInput {
  return {
    summary: `Started ${toolName}`,
    stepId,
    toolCallId,
    payload: { toolName, input },
  };
}

export function buildSocialAgentToolCalledEvent({
  toolName,
  stepId,
  toolCallId,
  input,
  policy,
}: SocialAgentToolStepEventBase & {
  input: Record<string, unknown>;
  policy: Record<string, unknown>;
}): SocialAgentToolStepEventInput {
  return {
    summary: `Called ${toolName}`,
    stepId,
    toolCallId,
    payload: {
      toolName,
      input,
      policy,
    },
  };
}

export function buildSocialAgentToolReturnedEvent({
  toolName,
  stepId,
  toolCallId,
  inputSummary,
  call,
  pendingApproval = false,
}: SocialAgentToolStepEventBase & {
  inputSummary: string;
  call: SocialAgentToolCallRecord;
  pendingApproval?: boolean;
}): SocialAgentToolStepEventInput {
  return {
    summary: `${toolName} ${pendingApproval ? 'pending approval' : 'succeeded'}`,
    stepId,
    toolCallId,
    payload: {
      toolName,
      inputSummary,
      status: call.status,
      output: call.output,
      error: null,
    },
  };
}

export function buildSocialAgentStepCompletedEvent({
  toolName,
  stepId,
  toolCallId,
  call,
  pendingApproval = false,
}: SocialAgentToolStepEventBase & {
  call: SocialAgentToolCallRecord;
  pendingApproval?: boolean;
}): SocialAgentToolStepEventInput {
  return {
    summary: `Completed ${toolName}`,
    stepId,
    toolCallId,
    payload: pendingApproval
      ? { status: call.status, pendingApproval: true }
      : { status: call.status },
  };
}

export function buildSocialAgentToolFailedEvent({
  toolName,
  stepId,
  toolCallId,
  inputSummary,
  call,
}: SocialAgentToolStepEventBase & {
  inputSummary: string;
  call: SocialAgentToolCallRecord;
}): SocialAgentToolStepEventInput {
  return {
    summary: `${toolName} ${call.status}`,
    stepId,
    toolCallId,
    payload: {
      toolName,
      inputSummary,
      status: call.status,
      output: null,
      error: call.error,
    },
  };
}
