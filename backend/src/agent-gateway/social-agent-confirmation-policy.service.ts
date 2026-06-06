import { BadRequestException, Injectable } from '@nestjs/common';

import { AgentTask } from './entities/agent-task.entity';
import { ConfirmationGuardService } from './confirmation-guard.service';
import { SocialAgentTargetResolverService } from './social-agent-target-resolver.service';
import { SocialAgentToolName } from './social-agent-tool.types';

@Injectable()
export class SocialAgentConfirmationPolicyService {
  constructor(
    private readonly confirmationGuard: ConfirmationGuardService,
    private readonly targetResolver: SocialAgentTargetResolverService,
  ) {}

  hasUserApproval(input: Record<string, unknown>): boolean {
    if (this.number(input.approvalId) || this.number(input.approvalRequestId)) {
      return true;
    }
    const metadata = this.isRecord(input.metadata) ? input.metadata : {};
    return (
      this.bool(input.userConfirmed) ||
      this.bool(input.confirmedByUser) ||
      this.string(metadata.confirmationSource) === 'social_agent_chat'
    );
  }

  hasExplicitApprovalCredential(input: Record<string, unknown>): boolean {
    return this.confirmationGuard.hasExplicitApprovalCredential(input);
  }

  isDangerousAdhocAction(toolName: SocialAgentToolName): boolean {
    return this.confirmationGuard.requiresExplicitConfirmation(toolName);
  }

  canRunAsConfirmedUserAction(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): boolean {
    return this.confirmationGuard.canRunAsConfirmedUserAction(toolName, input);
  }

  withAdhocConfirmationMetadata(
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
    ownerUserId?: number,
  ): Record<string, unknown> {
    if (!ownerUserId) return input;
    if (!this.isUserConfirmedCandidateAction(toolName)) return input;
    const metadata = this.isRecord(input.metadata) ? input.metadata : {};
    if (this.string(metadata.confirmationSource)) return input;
    return {
      ...input,
      metadata: {
        ...metadata,
        confirmationSource: 'social_agent_chat',
      },
    };
  }

  assertAgentConnectionBound(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): void {
    if (!this.requiresAgentConnection(toolName) || task.agentConnectionId) {
      return;
    }
    if (this.canRunAsConfirmedUserAction(toolName, input)) return;
    throw new BadRequestException(
      `agentConnectionId is required for ${toolName}`,
    );
  }

  async validateDangerousAdhocActionTarget(
    task: AgentTask,
    toolName: SocialAgentToolName,
    input: Record<string, unknown>,
  ): Promise<void> {
    if (
      toolName !== SocialAgentToolName.ConnectCandidate &&
      toolName !== SocialAgentToolName.AddFriend
    ) {
      return;
    }

    await this.targetResolver.resolveCandidateTargetUser(
      input,
      task.ownerUserId,
    );
  }

  private requiresAgentConnection(toolName: SocialAgentToolName): boolean {
    return [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
      SocialAgentToolName.ReplyMessage,
      SocialAgentToolName.AddFriend,
      SocialAgentToolName.ConnectCandidate,
      SocialAgentToolName.InviteActivity,
      SocialAgentToolName.CreateActivity,
      SocialAgentToolName.OfflineMeeting,
      SocialAgentToolName.ShareLocation,
      SocialAgentToolName.Payment,
    ].includes(toolName);
  }

  private isUserConfirmedCandidateAction(
    toolName: SocialAgentToolName,
  ): boolean {
    return [
      SocialAgentToolName.SendMessage,
      SocialAgentToolName.SendMessageToCandidate,
    ].includes(toolName);
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private number(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private bool(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
