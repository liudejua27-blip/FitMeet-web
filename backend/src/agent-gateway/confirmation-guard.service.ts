import { Injectable } from '@nestjs/common';

const DANGEROUS_ADHOC_ACTIONS = new Set([
  'send_message',
  'send_message_to_candidate',
  'reply_message',
  'add_friend',
  'connect_candidate',
  'create_activity',
  'join_activity',
  'invite_activity',
  'offline_meeting',
  'share_location',
  'payment',
  'publish_social_request',
]);

const EXPLICIT_APPROVAL_TOOLS = new Set([
  'send_message',
  'send_message_to_candidate',
  'reply_message',
  'add_friend',
  'connect_candidate',
  'create_activity',
  'join_activity',
  'invite_activity',
  'offline_meeting',
  'share_location',
  'payment',
  'publish_social_request',
]);

@Injectable()
export class ConfirmationGuardService {
  requiresExplicitConfirmation(toolName: string): boolean {
    return DANGEROUS_ADHOC_ACTIONS.has(toolName);
  }

  hasExplicitApprovalCredential(input: Record<string, unknown>): boolean {
    return Boolean(
      this.number(input.approvalId) || this.number(input.approvalRequestId),
    );
  }

  canRunAsConfirmedUserAction(
    toolName: string,
    input: Record<string, unknown>,
  ): boolean {
    if (this.hasExplicitApprovalCredential(input)) {
      return EXPLICIT_APPROVAL_TOOLS.has(toolName);
    }
    return false;
  }

  private number(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
}
