import {
  buildLegacyAgentActionLogInput,
  mapLegacyActionResult,
  mapLegacyLoggedActionToActionType,
  mapLegacyRiskLevel,
  numberOrNull,
  pickNumber,
  pickString,
  summarizeLegacyActionOutput,
} from './agent-gateway-legacy-log.mapper';
import {
  ActionResult,
  LoggedAction,
} from './entities/agent-activity-log.entity';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';

describe('agent gateway legacy log mapper', () => {
  it('maps legacy actions to canonical action types', () => {
    expect(mapLegacyLoggedActionToActionType(LoggedAction.AgentEvent, {})).toBe(
      AgentActionType.AgentEvent,
    );
    expect(mapLegacyLoggedActionToActionType(LoggedAction.Search, {})).toBe(
      AgentActionType.RunMatch,
    );
    expect(
      mapLegacyLoggedActionToActionType(LoggedAction.Search, {
        socialRequestId: 12,
      }),
    ).toBeNull();
    expect(
      mapLegacyLoggedActionToActionType(
        LoggedAction.ConfirmSocialRequestCandidate,
        { decision: 'reject' },
      ),
    ).toBe(AgentActionType.RejectAction);
  });

  it('maps legacy result and risk levels', () => {
    expect(mapLegacyActionResult(ActionResult.Success)).toBe(
      AgentActionStatus.Executed,
    );
    expect(mapLegacyActionResult(ActionResult.PendingApproval)).toBe(
      AgentActionStatus.PendingApproval,
    );
    expect(mapLegacyActionResult(ActionResult.Error)).toBe(
      AgentActionStatus.Failed,
    );
    expect(mapLegacyRiskLevel(ActionResult.Success, 0.8)).toBe(
      AgentActionRiskLevel.High,
    );
    expect(mapLegacyRiskLevel(ActionResult.Blocked, 0.1)).toBe(
      AgentActionRiskLevel.Medium,
    );
  });

  it('normalizes primitive payload fields for summaries', () => {
    expect(numberOrNull('42')).toBe(42);
    expect(numberOrNull('')).toBeNull();
    expect(pickNumber({ a: 'x', b: '7' }, 'a', 'b')).toBe(7);
    expect(pickString({ a: '  hello  ' }, 'a')).toBe('hello');
    expect(
      summarizeLegacyActionOutput(
        LoggedAction.Search,
        { candidateCount: '3' },
        ActionResult.Success,
      ),
    ).toBe('search: success, count=3');
  });

  it('builds canonical log input from legacy activity payloads', () => {
    const logInput = buildLegacyAgentActionLogInput({
      conn: { id: 5, userId: 9 } as never,
      action: LoggedAction.MatchPartner,
      payload: {
        agentTaskId: '101',
        targetUserId: '42',
        query: '跑步搭子',
        resultCount: 4,
      },
      result: ActionResult.Success,
      riskScore: 0.2,
    });

    expect(logInput).toMatchObject({
      ownerUserId: 9,
      agentId: 5,
      agentTaskId: 101,
      actionType: AgentActionType.RunMatch,
      actionStatus: AgentActionStatus.Executed,
      riskLevel: AgentActionRiskLevel.Low,
      targetUserId: 42,
      inputSummary: '跑步搭子',
      outputSummary: 'match_partner: success, count=4',
      reason: 'legacy_match_partner',
    });
  });

  it('skips legacy actions that already have canonical writes elsewhere', () => {
    expect(
      buildLegacyAgentActionLogInput({
        conn: { id: 5, userId: 9 } as never,
        action: LoggedAction.CreateSocialRequest,
        payload: {},
        result: ActionResult.Success,
      }),
    ).toBeNull();
  });
});
