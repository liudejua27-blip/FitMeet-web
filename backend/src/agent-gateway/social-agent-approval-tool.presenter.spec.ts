import { BadRequestException } from '@nestjs/common';

import {
  buildSocialAgentPendingApprovalsToolOutput,
  readSocialAgentApprovalToolId,
} from './social-agent-approval-tool.presenter';

describe('social-agent-approval-tool.presenter', () => {
  const readNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  it('reads approval ids from canonical and legacy input fields', () => {
    expect(readSocialAgentApprovalToolId({ approvalId: 12 }, readNumber)).toBe(
      12,
    );
    expect(readSocialAgentApprovalToolId({ id: 13 }, readNumber)).toBe(13);
  });

  it('throws a stable validation error when approval id is missing', () => {
    expect(() => readSocialAgentApprovalToolId({}, readNumber)).toThrow(
      BadRequestException,
    );
    expect(() => readSocialAgentApprovalToolId({}, readNumber)).toThrow(
      'approvalId is required',
    );
  });

  it('preserves pending approvals output shape and optional limit behavior', () => {
    const approvals = [{ id: 1 }, { id: 2 }, { id: 3 }];

    expect(buildSocialAgentPendingApprovalsToolOutput(approvals, null)).toEqual(
      { approvals },
    );
    expect(buildSocialAgentPendingApprovalsToolOutput(approvals, 2)).toEqual({
      approvals: [{ id: 1 }, { id: 2 }],
    });
  });
});
