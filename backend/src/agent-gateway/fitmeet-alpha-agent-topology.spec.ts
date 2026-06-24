import {
  FITMEET_ALPHA_AGENT_HANDOFFS,
  FITMEET_ALPHA_AGENT_PATH,
  FITMEET_ALPHA_AGENT_RUNTIME_BOUNDARIES,
  FITMEET_ALPHA_AGENT_TOOL_OWNERS,
  FITMEET_ALPHA_LEGACY_NEXT_AGENT_VALUES,
  FITMEET_ALPHA_NEXT_AGENT_MAP,
  FITMEET_ALPHA_NEXT_AGENT_VALUES,
  fitMeetAlphaAgentForNextAgent,
  fitMeetAlphaAgentOwnersForTool,
  fitMeetAlphaAgentRuntimeBoundary,
} from './fitmeet-alpha-agent-topology';
import {
  FitMeetAgentToolRegistryService,
  SOCIAL_AGENT_MODEL_TOOL_NAMES,
} from './fitmeet-agent-tool-registry.service';

describe('FitMeet Alpha Agent topology', () => {
  it('keeps the supported subagent graph explicit', () => {
    expect(FITMEET_ALPHA_AGENT_PATH).toEqual([
      'FitMeet Main Agent',
      'Agent Brain',
      'Life Graph Agent',
      'Match Agent',
    ]);
  });

  it('only allows Main Agent handoffs to registered subagents', () => {
    const supportedAgents = new Set(FITMEET_ALPHA_AGENT_PATH);

    expect(FITMEET_ALPHA_AGENT_HANDOFFS).toHaveLength(3);
    for (const handoff of FITMEET_ALPHA_AGENT_HANDOFFS) {
      expect(handoff.from).toBe('FitMeet Main Agent');
      expect(supportedAgents.has(handoff.to)).toBe(true);
      expect(handoff.reason).toEqual(expect.any(String));
      expect(handoff.reason.length).toBeGreaterThan(8);
    }
  });

  it('keeps runtime role budgets centralized and low-cost', () => {
    expect(Object.keys(FITMEET_ALPHA_AGENT_RUNTIME_BOUNDARIES).sort()).toEqual(
      [...FITMEET_ALPHA_AGENT_PATH].sort(),
    );
    expect(fitMeetAlphaAgentRuntimeBoundary('Agent Brain')).toMatchObject({
      role: 'agent_brain',
      memoryScope: 'agent_brain.turn_memory',
      maxToolCalls: 1,
      maxRetries: 0,
      evalHints: expect.objectContaining({
        forbidsPrivacyReadWrite: true,
      }),
    });
    expect(fitMeetAlphaAgentRuntimeBoundary('Life Graph Agent')).toMatchObject({
      role: 'life_graph_agent',
      memoryScope: 'life_graph.profile_memory',
      maxToolCalls: 2,
      maxRetries: 1,
      evalHints: expect.objectContaining({
        needsUserConfirmedMerge: true,
      }),
    });
    expect(fitMeetAlphaAgentRuntimeBoundary('Match Agent')).toMatchObject({
      role: 'match_agent',
      memoryScope: 'matching.candidate_memory',
      maxToolCalls: 3,
      maxRetries: 1,
      evalHints: expect.objectContaining({
        needsIdempotency: true,
      }),
    });
  });

  it('maps every structured nextAgent value to an implemented user-facing agent', () => {
    expect(FITMEET_ALPHA_NEXT_AGENT_VALUES).toEqual([
      'agent_brain',
      'life_graph_agent',
      'match_agent',
      'main_agent',
    ]);
    expect(FITMEET_ALPHA_LEGACY_NEXT_AGENT_VALUES).toEqual([
      'life_graph',
      'social_match',
      'meet_loop',
      'math',
      'answer',
    ]);
    expect(Object.keys(FITMEET_ALPHA_NEXT_AGENT_MAP).sort()).toEqual(
      [
        ...FITMEET_ALPHA_NEXT_AGENT_VALUES,
        ...FITMEET_ALPHA_LEGACY_NEXT_AGENT_VALUES,
      ].sort(),
    );

    for (const nextAgent of FITMEET_ALPHA_NEXT_AGENT_VALUES) {
      const agentName = fitMeetAlphaAgentForNextAgent(nextAgent);

      expect(agentName).not.toBeNull();
      expect(FITMEET_ALPHA_AGENT_PATH).toContain(agentName);
    }
  });

  it('routes math requests only through the implemented no-side-effect Agent Brain', () => {
    expect(fitMeetAlphaAgentForNextAgent('agent_brain')).toBe('Agent Brain');
    expect(fitMeetAlphaAgentForNextAgent('math')).toBe('Agent Brain');
    expect(fitMeetAlphaAgentForNextAgent('math_agent')).toBeNull();
    expect(fitMeetAlphaAgentForNextAgent('calendar_agent')).toBeNull();
    expect(FITMEET_ALPHA_AGENT_TOOL_OWNERS['Agent Brain']).toEqual([]);
  });

  it('keeps legacy nextAgent values as compatibility aliases only', () => {
    expect(fitMeetAlphaAgentForNextAgent('life_graph')).toBe(
      'Life Graph Agent',
    );
    expect(fitMeetAlphaAgentForNextAgent('social_match')).toBe('Match Agent');
    expect(fitMeetAlphaAgentForNextAgent('meet_loop')).toBe('Match Agent');
    expect(fitMeetAlphaAgentForNextAgent('answer')).toBe('FitMeet Main Agent');
  });

  it('assigns every model-facing tool to at least one implemented subagent', () => {
    const registry = new FitMeetAgentToolRegistryService();

    for (const toolName of SOCIAL_AGENT_MODEL_TOOL_NAMES) {
      const owners = fitMeetAlphaAgentOwnersForTool(toolName);
      const tool = registry.getTool(toolName);

      expect(tool).toMatchObject({
        runtimeStatus: 'implemented',
        plannerEnabled: true,
      });
      expect(owners.length).toBeGreaterThan(0);
      for (const owner of owners) {
        expect(FITMEET_ALPHA_AGENT_PATH).toContain(owner);
      }
    }
  });

  it('keeps subagent tool ownership limited to implemented planner-visible tools', () => {
    const registry = new FitMeetAgentToolRegistryService();
    const modelTools = new Set<string>(SOCIAL_AGENT_MODEL_TOOL_NAMES);

    for (const [agentName, toolNames] of Object.entries(
      FITMEET_ALPHA_AGENT_TOOL_OWNERS,
    )) {
      expect(FITMEET_ALPHA_AGENT_PATH).toContain(agentName);
      for (const toolName of toolNames) {
        expect(modelTools.has(toolName)).toBe(true);
        expect(registry.getTool(toolName)).toMatchObject({
          runtimeStatus: 'implemented',
          plannerEnabled: true,
        });
      }
    }
  });

  it('does not assign external tools to future math capabilities before they exist', () => {
    expect(Object.keys(FITMEET_ALPHA_AGENT_TOOL_OWNERS)).toContain(
      'Agent Brain',
    );
    expect(fitMeetAlphaAgentOwnersForTool('calculate_training_pace')).toEqual(
      [],
    );
  });
});
