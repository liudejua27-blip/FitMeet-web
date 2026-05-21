import { AgentActionType } from './entities/agent-action-log.entity';
import { AgentAction } from './entities/agent-permission.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  AgentPermissionService,
  SocialAgentAction,
} from './agent-permission.service';

describe('AgentPermissionService', () => {
  const service = new AgentPermissionService();

  it('allows only Assist Mode actions', () => {
    expect(service.getAllowedActions(AgentTaskPermissionMode.Assist)).toEqual([
      SocialAgentAction.AddFriend,
      SocialAgentAction.SendMessage,
    ]);
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
    ).toBe(false);
  });

  it('allows only Confirm Mode actions', () => {
    expect(service.getAllowedActions(AgentTaskPermissionMode.Confirm)).toEqual([
      SocialAgentAction.AddFriend,
      SocialAgentAction.SearchProfiles,
      SocialAgentAction.GenerateContent,
      SocialAgentAction.DraftMessage,
      SocialAgentAction.FavoriteCandidate,
      SocialAgentAction.SendMessage,
      SocialAgentAction.SendInvite,
    ]);
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
    ).toBe(false);
  });

  it('allows only Limited Auto Mode actions', () => {
    expect(
      service.getAllowedActions(AgentTaskPermissionMode.LimitedAuto),
    ).toEqual([
      SocialAgentAction.FavoriteCandidate,
      SocialAgentAction.DraftMessage,
      SocialAgentAction.WriteInbox,
      SocialAgentAction.SendMessage,
      SocialAgentAction.AddFriend,
      SocialAgentAction.OfflineMeet,
      SocialAgentAction.Payment,
    ]);
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
    ).toBe(false);
    expect(
      service.canExecute(
        AgentTaskPermissionMode.LimitedAuto,
        SocialAgentAction.SendInvite,
      ),
    ).toBe(false);
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
      mode: AgentTaskPermissionMode.Assist,
      action: null,
      allowed: false,
      reason: 'unknown_action',
    });
  });
});
