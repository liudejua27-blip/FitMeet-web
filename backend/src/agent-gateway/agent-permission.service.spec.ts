import { AgentActionType } from './entities/agent-action-log.entity';
import { AgentAction } from './entities/agent-permission.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';

describe('AgentPermissionService', () => {
  const service = new AgentPermissionService();
  const allActions = [
    SocialAgentAction.SearchProfiles,
    SocialAgentAction.GenerateContent,
    SocialAgentAction.DraftMessage,
    SocialAgentAction.FavoriteCandidate,
    SocialAgentAction.WriteInbox,
    SocialAgentAction.SendMessage,
    SocialAgentAction.AddFriend,
    SocialAgentAction.SendInvite,
    SocialAgentAction.OfflineMeet,
    SocialAgentAction.Payment,
  ];

  it('keeps Assist/manual_confirm actions available for approval gating', () => {
    expect(service.getAllowedActions(AgentTaskPermissionMode.Assist)).toEqual(
      allActions,
    );
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Assist,
        SocialAgentAction.AddFriend,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Assist,
        SocialAgentAction.SendMessage,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Assist,
        SocialAgentAction.SearchProfiles,
      ),
    ).toBe(true);
  });

  it('keeps Confirm/manual_confirm actions available for approval gating', () => {
    expect(service.getAllowedActions(AgentTaskPermissionMode.Confirm)).toEqual(
      allActions,
    );
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Confirm,
        SocialAgentAction.SendInvite,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Confirm,
        SocialAgentAction.AddFriend,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Confirm,
        SocialAgentAction.FavoriteCandidate,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Confirm,
        SocialAgentAction.Payment,
      ),
    ).toBe(true);
  });

  it('keeps Limited Auto actions available while risk policy decides automation', () => {
    expect(
      service.getAllowedActions(AgentTaskPermissionMode.LimitedAuto),
    ).toEqual(allActions);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.LimitedAuto,
        SocialAgentAction.Payment,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.LimitedAuto,
        SocialAgentAction.SearchProfiles,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.LimitedAuto,
        SocialAgentAction.SendInvite,
      ),
    ).toBe(true);
  });

  it('normalizes existing agent action enums to runtime actions', () => {
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Assist,
        AgentAction.ContactRequest,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Confirm,
        AgentAction.SearchProfiles,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.Confirm,
        AgentActionType.GenerateInvite,
      ),
    ).toBe(true);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.LimitedAuto,
        AgentActionType.JoinActivity,
      ),
    ).toBe(true);
  });

  it('returns a blocked decision for unknown modes or actions', () => {
    expect(
      service.evaluate('unknown' as never, SocialAgentAction.SendMessage),
    ).toMatchObject({
      mode: null,
      action: SocialAgentAction.SendMessage,
      allowed: false,
      reason: 'unknown_permission_mode',
    });
    expect(
      service.evaluate(AgentTaskPermissionMode.Assist, 'unknown' as never),
    ).toMatchObject({
      mode: 'manual_confirm',
      action: null,
      allowed: false,
      reason: 'unknown_action',
    });
  });
});
