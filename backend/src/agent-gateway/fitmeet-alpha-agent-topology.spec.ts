import {
  FITMEET_ALPHA_AGENT_HANDOFFS,
  FITMEET_ALPHA_AGENT_PATH,
  FITMEET_ALPHA_AGENT_TOOL_OWNERS,
  FITMEET_ALPHA_NEXT_AGENT_MAP,
  FITMEET_ALPHA_NEXT_AGENT_VALUES,
  fitMeetAlphaAgentForNextAgent,
  fitMeetAlphaAgentOwnersForTool,
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
      'Social Match Agent',
      'Meet Loop Agent',
      'Math Agent',
    ]);
  });

  it('only allows Main Agent handoffs to registered subagents', () => {
    const supportedAgents = new Set(FITMEET_ALPHA_AGENT_PATH);

    expect(FITMEET_ALPHA_AGENT_HANDOFFS).toHaveLength(4);
    for (const handoff of FITMEET_ALPHA_AGENT_HANDOFFS) {
      expect(handoff.from).toBe('FitMeet Main Agent');
      expect(supportedAgents.has(handoff.to)).toBe(true);
      expect(handoff.reason).toEqual(expect.any(String));
      expect(handoff.reason.length).toBeGreaterThan(8);
    }
  });

  it('maps every structured nextAgent value to an implemented user-facing agent', () => {
    expect(FITMEET_ALPHA_NEXT_AGENT_VALUES).toEqual([
      'life_graph',
      'social_match',
      'meet_loop',
      'math',
      'answer',
    ]);
    expect(Object.keys(FITMEET_ALPHA_NEXT_AGENT_MAP).sort()).toEqual(
      [...FITMEET_ALPHA_NEXT_AGENT_VALUES].sort(),
    );

    for (const nextAgent of FITMEET_ALPHA_NEXT_AGENT_VALUES) {
      const agentName = fitMeetAlphaAgentForNextAgent(nextAgent);

      expect(agentName).not.toBeNull();
      expect(FITMEET_ALPHA_AGENT_PATH).toContain(agentName);
    }
  });

  it('routes math requests only through the implemented no-side-effect Math Agent', () => {
    expect(fitMeetAlphaAgentForNextAgent('math')).toBe('Math Agent');
    expect(fitMeetAlphaAgentForNextAgent('math_agent')).toBeNull();
    expect(fitMeetAlphaAgentForNextAgent('calendar_agent')).toBeNull();
    expect(FITMEET_ALPHA_AGENT_TOOL_OWNERS['Math Agent']).toEqual([]);
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
      'Math Agent',
    );
    expect(fitMeetAlphaAgentOwnersForTool('calculate_training_pace')).toEqual(
      [],
    );
  });
});
