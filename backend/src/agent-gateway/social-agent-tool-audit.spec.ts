import {
  getSocialAgentApprovalId,
  getSocialAgentRelatedActivityId,
  getSocialAgentRelatedCandidateId,
  getSocialAgentRelatedSocialRequestId,
  getSocialAgentTargetUserId,
  getSocialAgentToolInputSummary,
  getSocialAgentToolOutputSummary,
} from './social-agent-tool-audit';
import {
  SocialAgentToolCallRecord,
  SocialAgentToolName,
} from './social-agent-tool.types';

function call(
  overrides: Partial<SocialAgentToolCallRecord> = {},
): SocialAgentToolCallRecord {
  return {
    id: 'call_1',
    stepId: 'step_1',
    toolName: SocialAgentToolName.SendMessage,
    status: 'succeeded',
    input: {},
    output: {},
    error: null,
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:00:01.000Z',
    durationMs: 1000,
    ...overrides,
  };
}

describe('social agent tool audit helpers', () => {
  it('resolves target users from input aliases before output fallbacks', () => {
    expect(
      getSocialAgentTargetUserId(
        {
          candidate: { userId: 10 },
          recipientUserId: '11',
        },
        { targetUserId: 12 },
      ),
    ).toBe(11);
    expect(getSocialAgentTargetUserId({}, { candidateUserId: '13' })).toBe(13);
  });

  it('resolves related request, candidate, activity, and approval ids', () => {
    expect(
      getSocialAgentRelatedSocialRequestId(
        { requestId: '21' },
        { socialRequestId: 22 },
      ),
    ).toBe(21);
    expect(
      getSocialAgentRelatedCandidateId(
        SocialAgentToolName.SaveCandidate,
        {},
        { id: '31' },
      ),
    ).toBe(31);
    expect(
      getSocialAgentRelatedActivityId(
        SocialAgentToolName.OfflineMeeting,
        {},
        { id: '41' },
      ),
    ).toBe(41);
    expect(
      getSocialAgentApprovalId(
        SocialAgentToolName.ApproveAction,
        { id: '51' },
        { approvalId: 52 },
      ),
    ).toBe(51);
  });

  it('summarizes tool input and output without leaking large nested payloads', () => {
    const summary = getSocialAgentToolInputSummary(
      SocialAgentToolName.SendMessage,
      {
        text: 'hello',
        nested: { one: { two: { three: 'deep' } } },
      },
    );
    expect(summary).toContain(SocialAgentToolName.SendMessage);
    expect(summary.length).toBeLessThanOrEqual(500);

    const output = getSocialAgentToolOutputSummary(
      SocialAgentToolName.SendMessage,
      call({
        output: {
          conversationId: 'conversation_1',
          deeplyNested: { a: { b: { c: 'hidden' } } },
        },
      }),
    );
    expect(output).toContain('succeeded');
    expect(output).toContain('conversation_1');

    const failed = getSocialAgentToolOutputSummary(
      SocialAgentToolName.Payment,
      call({
        toolName: SocialAgentToolName.Payment,
        status: 'blocked',
        output: null,
        error: { code: 'APPROVAL_REQUIRED' },
      }),
    );
    expect(failed).toContain('APPROVAL_REQUIRED');
  });

  it('redacts contact and precise location data from tool audit summaries', () => {
    const input = getSocialAgentToolInputSummary(
      SocialAgentToolName.SendMessage,
      {
        message: '我的微信是 fitmeet-test，手机号 15253005312，青岛大学附近可以',
        exactLocation: '青岛大学 3 号宿舍 401',
        nested: {
          phone: '13812345678',
          publicText: '青岛大学附近',
          mapLink: 'amap://poi?name=青岛大学',
          coordinates: '36.062123,120.389456',
        },
      },
    );

    expect(input).toContain('青岛大学附近');
    expect(input).toContain('[redacted');
    expect(input).not.toContain('fitmeet-test');
    expect(input).not.toContain('15253005312');
    expect(input).not.toContain('13812345678');
    expect(input).not.toContain('3 号宿舍 401');
    expect(input).not.toContain('amap://poi');
    expect(input).not.toContain('36.062123');

    const output = getSocialAgentToolOutputSummary(
      SocialAgentToolName.ShareLocation,
      call({
        toolName: SocialAgentToolName.ShareLocation,
        output: {
          sentText: '定位 amap://poi 36.062123,120.389456',
          recipientUserId: 22,
        },
      }),
    );

    expect(output).toContain('succeeded');
    expect(output).not.toContain('amap://poi');
    expect(output).not.toContain('36.062123');
    expect(output).toContain('[redacted-location]');
  });
});
