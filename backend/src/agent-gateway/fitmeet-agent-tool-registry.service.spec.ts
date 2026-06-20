import { SocialAgentAction } from './agent-permission.service';
import { AgentActionRiskLevel } from './entities/agent-action-log.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  FIRST_STAGE_AGENT_TOOL_NAMES,
  FitMeetAgentToolCategory,
  FitMeetAgentToolRegistryService,
  SOCIAL_AGENT_MODEL_TOOL_NAMES,
} from './fitmeet-agent-tool-registry.service';

describe('FitMeetAgentToolRegistryService', () => {
  const service = new FitMeetAgentToolRegistryService();

  it('defines every tool with the required public contract', () => {
    const manifest = service.getManifest();
    const names = new Set<string>();

    expect(manifest.name).toBe('FitMeet Agent Tool Registry');
    expect(manifest.tools.length).toBeGreaterThan(20);

    for (const tool of manifest.tools) {
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.riskLevel).toEqual(
        expect.stringMatching(/^(low|medium|high)$/),
      );
      expect(tool.permission).toEqual(expect.any(String));
      expect(typeof tool.requiresApproval).toBe('boolean');
      expect(typeof tool.requiresConfirmation).toBe('boolean');
      expect(tool.failureFallback).toEqual(expect.any(String));
      expect(tool.inputSchema).toEqual(
        expect.objectContaining({ type: 'object' }),
      );
      expect(tool.outputSchema).toEqual(
        expect.objectContaining({ type: 'object' }),
      );
      expect(tool.permissionMode.length).toBeGreaterThan(0);
      expect(
        tool.permissionMode.every((mode) =>
          Object.values(AgentTaskPermissionMode).includes(mode),
        ),
      ).toBe(true);
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
    }
  });

  it('covers the required FitMeet tool categories', () => {
    const categories = service.listCategories().map((category) => category.id);

    expect(categories).toEqual(
      expect.arrayContaining(Object.values(FitMeetAgentToolCategory)),
    );

    for (const category of categories) {
      expect(service.listTools({ category })).not.toHaveLength(0);
    }
  });

  it('registers every first-stage Agent Tool Runtime tool as implemented', () => {
    const tools = service.getManifest().tools;
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([...FIRST_STAGE_AGENT_TOOL_NAMES]),
    );

    for (const name of FIRST_STAGE_AGENT_TOOL_NAMES) {
      expect(service.getTool(name)).toEqual(
        expect.objectContaining({
          name,
          runtimeStatus: 'implemented',
        }),
      );
    }
  });

  it('keeps first-stage tools executable through an executor tool name', () => {
    for (const name of FIRST_STAGE_AGENT_TOOL_NAMES) {
      expect(service.getTool(name)?.executorToolName).toEqual(
        expect.any(String),
      );
    }
  });

  it('registers search_real_candidates as a low-risk real candidate tool', () => {
    const tool = service.getTool('search_real_candidates');

    expect(tool).toMatchObject({
      name: 'search_real_candidates',
      category: FitMeetAgentToolCategory.Candidate,
      riskLevel: AgentActionRiskLevel.Low,
      requiresApproval: false,
      permissionAction: SocialAgentAction.SearchProfiles,
      executorToolName: 'search_matches',
      runtimeStatus: 'implemented',
      plannerEnabled: true,
      permissionMode: [
        AgentTaskPermissionMode.Assist,
        AgentTaskPermissionMode.Confirm,
        AgentTaskPermissionMode.LimitedAuto,
      ],
    });
    expect(tool?.inputSchema).toEqual(
      expect.objectContaining({ type: 'object' }),
    );
    expect(tool?.outputSchema).toEqual(
      expect.objectContaining({ type: 'object' }),
    );
  });

  it('returns only implemented planner-visible tools for planning', () => {
    const plannerTools = service.listPlannerTools(
      AgentTaskPermissionMode.Assist,
    );

    expect(plannerTools.map((tool) => tool.name)).toContain(
      'search_real_candidates',
    );
    expect(
      plannerTools.every((tool) => tool.runtimeStatus === 'implemented'),
    ).toBe(true);
    expect(plannerTools.every((tool) => tool.plannerEnabled)).toBe(true);
    expect(plannerTools.map((tool) => tool.name)).not.toContain(
      'update_long_term_memory',
    );
    expect(plannerTools.map((tool) => tool.name)).not.toContain(
      'approve_action',
    );
    expect(plannerTools.map((tool) => tool.name)).not.toContain(
      'get_candidate_pool_debug',
    );
    expect(
      plannerTools.every(
        (tool) => tool.category !== FitMeetAgentToolCategory.AdminDebug,
      ),
    ).toBe(true);
  });

  it('exposes the canonical model-facing tool list', () => {
    const modelTools = service.listModelTools(AgentTaskPermissionMode.Confirm);
    const modelToolNames = modelTools.map((tool) => tool.name);

    expect(modelToolNames).toEqual(
      expect.arrayContaining([...SOCIAL_AGENT_MODEL_TOOL_NAMES]),
    );
    expect(modelTools).toHaveLength(SOCIAL_AGENT_MODEL_TOOL_NAMES.length);
    expect(modelToolNames).not.toContain('get_candidate_pool_debug');

    for (const tool of modelTools) {
      expect(tool.runtimeStatus).toBe('implemented');
      expect(tool.plannerEnabled).toBe(true);
      expect(tool.inputSchema).toEqual(
        expect.objectContaining({ type: 'object' }),
      );
      expect(tool.outputSchema).toEqual(
        expect.objectContaining({ type: 'object' }),
      );
      expect(tool.failureFallback).toEqual(expect.any(String));
      expect(typeof tool.requiresConfirmation).toBe('boolean');
    }
  });

  it('resolves canonical registry names to executor tool names', () => {
    expect(service.resolveExecutorToolName('get_user_profile')).toBe(
      'get_my_profile',
    );
    expect(service.resolveExecutorToolName('get_conversation_messages')).toBe(
      'read_task_conversation_messages',
    );
    expect(service.resolveExecutorToolName('get_candidate_detail')).toBe(
      'explain_matches',
    );
    expect(service.resolveExecutorToolName('search_real_candidates')).toBe(
      'search_matches',
    );
    expect(service.resolveExecutorToolName('search_matches')).toBe(
      'search_matches',
    );
    expect(service.resolveExecutorToolName('get_agent_inbox')).toBe(
      'get_agent_inbox',
    );
    expect(service.resolveExecutorToolName('unknown_tool')).toBeNull();
  });
});
