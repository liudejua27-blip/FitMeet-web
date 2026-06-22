import {
  applyConversationTurnState,
  applyProfileTurnState,
  applySearchTurnState,
  createSocialAgentRouteTurnState,
} from './social-agent-route-turn-state';

describe('social agent route turn state', () => {
  it('starts with a fallback assistant message and empty side effects', () => {
    expect(createSocialAgentRouteTurnState('fallback')).toEqual({
      savedContext: false,
      profileUpdated: false,
      queuedRun: null,
      runMode: null,
      assistantMessage: 'fallback',
      assistantMessageSource: 'fallback',
      activityResults: [],
      profileUpdateProposal: null,
      assistantStreamed: false,
      agentLoop: null,
      subagentHandoffs: [],
    });
  });

  it('keeps the previous assistant message when a conversation patch has none', () => {
    const state = createSocialAgentRouteTurnState('fallback');

    expect(
      applyConversationTurnState(state, {
        savedContext: true,
        profileUpdated: true,
        profileUpdateProposal: null,
      }),
    ).toMatchObject({
      assistantMessage: 'fallback',
      assistantMessageSource: 'fallback',
      savedContext: true,
      profileUpdated: true,
    });
  });

  it('lets profile turn proposals replace previous profile state', () => {
    const state = applyConversationTurnState(
      createSocialAgentRouteTurnState('fallback'),
      {
        assistantMessage: 'conversation',
        assistantMessageSource: 'llm',
        savedContext: true,
        profileUpdated: true,
        profileUpdateProposal: null,
      },
    );
    const proposal = { proposedFields: [{ key: 'city', value: 'Qingdao' }] };

    expect(
      applyProfileTurnState(state, {
        assistantMessage: 'profile',
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: proposal as never,
      }),
    ).toMatchObject({
      assistantMessage: 'profile',
      assistantMessageSource: 'llm',
      savedContext: true,
      profileUpdated: false,
      profileUpdateProposal: proposal,
    });
  });

  it('preserves saved context when search queues a follow-up run', () => {
    const state = applyConversationTurnState(
      createSocialAgentRouteTurnState('fallback'),
      {
        savedContext: true,
        profileUpdated: false,
        profileUpdateProposal: null,
      },
    );
    const queuedRun = { taskId: 101, runId: 'run_1' };
    const activityResults = [{ activityId: 9, title: 'Run club' }];

    expect(
      applySearchTurnState(state, {
        savedContext: false,
        activityResults: activityResults as never,
        queuedRun: queuedRun as never,
        runMode: 'follow_up',
      }),
    ).toMatchObject({
      assistantMessage: 'fallback',
      savedContext: true,
      activityResults,
      queuedRun,
      runMode: 'follow_up',
    });
  });

  it('keeps deterministic assistant source from search turns', () => {
    const state = createSocialAgentRouteTurnState('fallback');

    expect(
      applySearchTurnState(state, {
        assistantMessage: '没有找到真实活动，建议发布到发现。',
        assistantMessageSource: 'deterministic_route',
        savedContext: true,
        activityResults: [],
        queuedRun: null,
        runMode: null,
      }),
    ).toMatchObject({
      assistantMessage: '没有找到真实活动，建议发布到发现。',
      assistantMessageSource: 'deterministic_route',
      savedContext: true,
    });
  });
});
