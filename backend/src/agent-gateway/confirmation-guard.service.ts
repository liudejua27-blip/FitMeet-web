import { Injectable } from '@nestjs/common';

const DANGEROUS_ADHOC_ACTIONS = new Set([
  'add_friend',
  'connect_candidate',
  'create_activity',
  'invite_activity',
  'offline_meeting',
  'share_location',
]);

const EXPLICIT_APPROVAL_TOOLS = new Set([
  'send_message',
  'send_message_to_candidate',
  'add_friend',
  'connect_candidate',
  'create_activity',
  'invite_activity',
  'offline_meeting',
  'share_location',
]);

const CHAT_CONFIRMATION_COMPATIBLE_TOOLS = new Set([
  'send_message',
  'send_message_to_candidate',
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

    const metadata =
      input.metadata && typeof input.metadata === 'object'
        ? (input.metadata as Record<string, unknown>)
        : {};
    return (
      CHAT_CONFIRMATION_COMPATIBLE_TOOLS.has(toolName) &&
      this.string(metadata.confirmationSource) === 'social_agent_chat'
    );
  }

  private number(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }
}
