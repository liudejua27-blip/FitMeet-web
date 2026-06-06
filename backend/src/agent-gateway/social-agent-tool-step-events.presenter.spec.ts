import {
  buildSocialAgentStepCompletedEvent,
  buildSocialAgentStepStartedEvent,
  buildSocialAgentToolCalledEvent,
  buildSocialAgentToolFailedEvent,
  buildSocialAgentToolReturnedEvent,
} from './social-agent-tool-step-events.presenter';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

function toolCall(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'step_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'succeeded',
    input: { targetUserId: 2 },
    output: { status: 'sent' },
    error: null,
    startedAt: '2026-06-01T00:00:00.000Z',
    completedAt: '2026-06-01T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  };
}

describe('social-agent-tool-step-events presenter', () => {
  const base = {
    toolName: SocialAgentToolName.SendMessage,
    stepId: 'step_1',
    toolCallId: 'call_1',
  };

  it('builds stable start and call timeline events', () => {
    expect(
      buildSocialAgentStepStartedEvent({
        ...base,
        input: { targetUserId: 2 },
      }),
    ).toEqual({
      summary: 'Started send_message',
      stepId: 'step_1',
      toolCallId: 'call_1',
      payload: {
        toolName: SocialAgentToolName.SendMessage,
        input: { targetUserId: 2 },
      },
    });

    expect(
      buildSocialAgentToolCalledEvent({
        ...base,
        input: { targetUserId: 2 },
        policy: { riskLevel: 'medium' },
      }),
    ).toEqual({
      summary: 'Called send_message',
      stepId: 'step_1',
      toolCallId: 'call_1',
      payload: {
        toolName: SocialAgentToolName.SendMessage,
        input: { targetUserId: 2 },
        policy: { riskLevel: 'medium' },
      },
    });
  });

  it('builds returned and completed events for success and pending approval', () => {
    const call = toolCall();

    expect(
      buildSocialAgentToolReturnedEvent({
        ...base,
        inputSummary: '{"targetUserId":2}',
        call,
      }),
    ).toMatchObject({
      summary: 'send_message succeeded',
      payload: {
        status: 'succeeded',
        output: { status: 'sent' },
        error: null,
      },
    });

    expect(
      buildSocialAgentToolReturnedEvent({
        ...base,
        inputSummary: '{"targetUserId":2}',
        call,
        pendingApproval: true,
      }),
    ).toMatchObject({
      summary: 'send_message pending approval',
      payload: { status: 'succeeded' },
    });

    expect(
      buildSocialAgentStepCompletedEvent({
        ...base,
        call,
        pendingApproval: true,
      }),
    ).toEqual({
      summary: 'Completed send_message',
      stepId: 'step_1',
      toolCallId: 'call_1',
      payload: { status: 'succeeded', pendingApproval: true },
    });
  });

  it('builds failed events without leaking a stale output payload', () => {
    const call = toolCall({
      status: 'blocked',
      output: null,
      error: { code: 'APPROVAL_REQUIRED', message: 'blocked' },
    });

    expect(
      buildSocialAgentToolFailedEvent({
        ...base,
        inputSummary: '{"targetUserId":2}',
        call,
      }),
    ).toEqual({
      summary: 'send_message blocked',
      stepId: 'step_1',
      toolCallId: 'call_1',
      payload: {
        toolName: SocialAgentToolName.SendMessage,
        inputSummary: '{"targetUserId":2}',
        status: 'blocked',
        output: null,
        error: { code: 'APPROVAL_REQUIRED', message: 'blocked' },
      },
    });
  });
});
