import { BadRequestException } from '@nestjs/common';

type NumberReader = (value: unknown) => number | null | undefined;

export function readSocialAgentApprovalToolId(
  input: Record<string, unknown>,
  readNumber: NumberReader,
): number {
  const approvalId = readNumber(input.approvalId ?? input.id);
  if (!approvalId) throw new BadRequestException('approvalId is required');
  return approvalId;
}

export function buildSocialAgentPendingApprovalsToolOutput<T>(
  approvals: T[],
  limit: number | null | undefined,
): { approvals: T[] } {
  return {
    approvals: limit ? approvals.slice(0, limit) : approvals,
  };
}
