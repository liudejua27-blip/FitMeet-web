import { ForbiddenException, Injectable } from '@nestjs/common';

import { AgentActionType } from './entities/agent-action-log.entity';
import { AgentAction } from './entities/agent-permission.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';

export enum SocialAgentAction {
  AddFriend = 'add_friend',
  SendMessage = 'send_message',
  SearchProfiles = 'search_profiles',
  GenerateContent = 'generate_content',
  DraftMessage = 'draft_message',
  SendInvite = 'send_invite',
  FavoriteCandidate = 'favorite_candidate',
  WriteInbox = 'write_inbox',
  OfflineMeet = 'offline_meet',
  Payment = 'payment',
}

export type SocialAgentPermissionMode =
  | AgentTaskPermissionMode
  | `${AgentTaskPermissionMode}`;

export type SocialAgentActionInput =
  | SocialAgentAction
  | AgentAction
  | AgentActionType
  | string;

export interface AgentPermissionDecision {
  mode: AgentTaskPermissionMode | null;
  action: SocialAgentAction | null;
  allowed: boolean;
  reason: string;
  allowedActions: SocialAgentAction[];
}

const ACTIONS_BY_MODE: Record<
  AgentTaskPermissionMode,
  readonly SocialAgentAction[]
> = {
  [AgentTaskPermissionMode.Assist]: [
    SocialAgentAction.AddFriend,
    SocialAgentAction.SendMessage,
  ],
  [AgentTaskPermissionMode.Confirm]: [
    SocialAgentAction.SearchProfiles,
    SocialAgentAction.GenerateContent,
    SocialAgentAction.DraftMessage,
    SocialAgentAction.FavoriteCandidate,
    SocialAgentAction.SendMessage,
    SocialAgentAction.SendInvite,
  ],
  [AgentTaskPermissionMode.LimitedAuto]: [
    SocialAgentAction.FavoriteCandidate,
    SocialAgentAction.DraftMessage,
    SocialAgentAction.WriteInbox,
    SocialAgentAction.SendMessage,
    SocialAgentAction.AddFriend,
    SocialAgentAction.OfflineMeet,
    SocialAgentAction.Payment,
  ],
};

const CANONICAL_ACTIONS = new Set<string>(Object.values(SocialAgentAction));
const PERMISSION_MODES = new Set<string>(
  Object.values(AgentTaskPermissionMode),
);

const ACTION_ALIASES = new Map<string, SocialAgentAction>([
  [AgentAction.ContactRequest, SocialAgentAction.AddFriend],
  [AgentAction.SendMessage, SocialAgentAction.SendMessage],
  [AgentAction.SearchProfiles, SocialAgentAction.SearchProfiles],
  [AgentAction.GeneratePost, SocialAgentAction.GenerateContent],
  [AgentAction.GenerateMessage, SocialAgentAction.DraftMessage],
  [AgentAction.CreateSocialRequest, SocialAgentAction.SendInvite],
  [AgentAction.CreateActivity, SocialAgentAction.OfflineMeet],
  [AgentAction.JoinActivity, SocialAgentAction.OfflineMeet],
  [AgentActionType.AddFriend, SocialAgentAction.AddFriend],
  [AgentActionType.SendMessage, SocialAgentAction.SendMessage],
  [AgentActionType.RunMatch, SocialAgentAction.SearchProfiles],
  [AgentActionType.GenerateInvite, SocialAgentAction.SendInvite],
  [AgentActionType.InviteActivity, SocialAgentAction.SendInvite],
  [AgentActionType.CreateSocialRequest, SocialAgentAction.SendInvite],
  [AgentActionType.CreateActivity, SocialAgentAction.OfflineMeet],
  [AgentActionType.OfflineMeeting, SocialAgentAction.OfflineMeet],
  [AgentActionType.JoinActivity, SocialAgentAction.OfflineMeet],
  [AgentActionType.Payment, SocialAgentAction.Payment],
]);

@Injectable()
export class AgentPermissionService {
  getAllowedActions(mode: SocialAgentPermissionMode): SocialAgentAction[] {
    const normalizedMode = this.normalizeMode(mode);
    if (!normalizedMode) return [];
    return [...ACTIONS_BY_MODE[normalizedMode]];
  }

  canExecute(
    mode: SocialAgentPermissionMode,
    action: SocialAgentActionInput,
  ): boolean {
    return this.evaluate(mode, action).allowed;
  }

  evaluate(
    mode: SocialAgentPermissionMode,
    action: SocialAgentActionInput,
  ): AgentPermissionDecision {
    const normalizedMode = this.normalizeMode(mode);
    const normalizedAction = this.normalizeAction(action);

    if (!normalizedMode) {
      return {
        mode: null,
        action: normalizedAction,
        allowed: false,
        reason: 'unknown_permission_mode',
        allowedActions: [],
      };
    }

    const allowedActions = this.getAllowedActions(normalizedMode);
    if (!normalizedAction) {
      return {
        mode: normalizedMode,
        action: null,
        allowed: false,
        reason: 'unknown_action',
        allowedActions,
      };
    }

    const allowed = allowedActions.includes(normalizedAction);
    return {
      mode: normalizedMode,
      action: normalizedAction,
      allowed,
      reason: allowed ? 'allowed' : 'action_not_allowed_for_mode',
      allowedActions,
    };
  }

  assertCanExecute(
    mode: SocialAgentPermissionMode,
    action: SocialAgentActionInput,
  ): void {
    const decision = this.evaluate(mode, action);
    if (decision.allowed) return;

    throw new ForbiddenException(
      `Agent action ${String(action)} is not allowed in mode ${String(mode)}`,
    );
  }

  normalizeAction(action: SocialAgentActionInput): SocialAgentAction | null {
    if (CANONICAL_ACTIONS.has(action)) return action as SocialAgentAction;
    return ACTION_ALIASES.get(action) ?? null;
  }

  normalizeMode(
    mode: SocialAgentPermissionMode,
  ): AgentTaskPermissionMode | null {
    return PERMISSION_MODES.has(mode)
      ? (mode as AgentTaskPermissionMode)
      : null;
  }
}
