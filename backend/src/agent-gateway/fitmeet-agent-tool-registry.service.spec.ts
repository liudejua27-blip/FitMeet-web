import { SocialAgentAction } from './agent-permission.service';
import { AgentActionRiskLevel } from './entities/agent-action-log.entity';
import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import {
  FIRST_STAGE_AGENT_TOOL_NAMES,
  FitMeetAgentToolCategory,
  FitMeetAgentToolRegistryService,
  SOCIAL_AGENT_MODEL_TOOL_NAMES,
} from './fitmeet-agent-tool-registry.service';
import { requiresMandatorySocialAgentApproval } from './social-agent-tool-policy';
import { SocialAgentToolName } from './social-agent-tool.types';

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

  it('registers view_match_history as an implemented owner-scoped read tool', () => {
    const tool = service.getTool('view_match_history');

    expect(tool).toMatchObject({
      name: 'view_match_history',
      category: FitMeetAgentToolCategory.Candidate,
      riskLevel: AgentActionRiskLevel.Low,
      requiresApproval: false,
      executorToolName: 'view_match_history',
      runtimeStatus: 'implemented',
      plannerEnabled: true,
      dataScope: 'owner_match_history_only',
      sideEffects: [],
    });
    expect(tool?.outputSchema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: expect.arrayContaining(['matches']),
      }),
    );
  });

  it('registers list_friends as an implemented owner-scoped relationship read tool', () => {
    const tool = service.getTool('list_friends');

    expect(tool).toMatchObject({
      name: 'list_friends',
      category: FitMeetAgentToolCategory.Friend,
      riskLevel: AgentActionRiskLevel.Low,
      requiresApproval: false,
      permission: 'read_only',
      permissionAction: SocialAgentAction.SearchProfiles,
      executorToolName: 'list_friends',
      runtimeStatus: 'implemented',
      plannerEnabled: true,
      dataScope: 'owner_friend_graph_only',
      sideEffects: [],
    });
    expect(tool?.outputSchema).toEqual(
      expect.objectContaining({
        type: 'object',
        required: expect.arrayContaining(['friends']),
      }),
    );
  });

  it('registers confirmed long-term memory tools as implemented owner-scoped tools', () => {
    expect(service.getTool('update_long_term_memory')).toMatchObject({
      name: 'update_long_term_memory',
      category: FitMeetAgentToolCategory.Memory,
      riskLevel: AgentActionRiskLevel.Medium,
      requiresApproval: true,
      requiresConfirmation: true,
      permissionAction: SocialAgentAction.GenerateContent,
      executorToolName: 'update_long_term_memory',
      runtimeStatus: 'implemented',
      plannerEnabled: true,
      dataScope: 'owner_agent_memory_only',
      sideEffects: ['memory_write'],
    });

    expect(
      service.getTool('optimize_recommendation_with_memory'),
    ).toMatchObject({
      name: 'optimize_recommendation_with_memory',
      category: FitMeetAgentToolCategory.Memory,
      riskLevel: AgentActionRiskLevel.Low,
      requiresApproval: false,
      requiresConfirmation: false,
      permissionAction: SocialAgentAction.SearchProfiles,
      executorToolName: 'optimize_recommendation_with_memory',
      runtimeStatus: 'implemented',
      plannerEnabled: true,
      dataScope: 'owner_memory_and_current_candidates_only',
      sideEffects: [],
    });
  });

  it('treats safety reporting as an explicit user confirmation action, not approval-gated automation', () => {
    expect(service.getTool('report_safety_issue')).toMatchObject({
      name: 'report_safety_issue',
      category: FitMeetAgentToolCategory.Safety,
      riskLevel: AgentActionRiskLevel.Medium,
      requiresApproval: false,
      requiresConfirmation: true,
      executorToolName: 'report_safety_issue',
      runtimeStatus: 'implemented',
      plannerEnabled: false,
      sideEffects: ['safety_report_create'],
    });
    expect(
      requiresMandatorySocialAgentApproval(
        SocialAgentToolName.ReportSafetyIssue,
      ),
    ).toBe(false);
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
    expect(plannerTools.map((tool) => tool.name)).toContain(
      'optimize_recommendation_with_memory',
    );
    expect(plannerTools.map((tool) => tool.name)).not.toContain(
      'approve_action',
    );
    expect(plannerTools.map((tool) => tool.name)).not.toContain(
      'get_candidate_pool_debug',
    );
    expect(plannerTools.map((tool) => tool.name)).not.toContain(
      'report_safety_issue',
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
    expect(service.resolveExecutorToolName('view_match_history')).toBe(
      'view_match_history',
    );
    expect(service.resolveExecutorToolName('list_friends')).toBe(
      'list_friends',
    );
    expect(service.resolveExecutorToolName('update_long_term_memory')).toBe(
      'update_long_term_memory',
    );
    expect(
      service.resolveExecutorToolName('optimize_recommendation_with_memory'),
    ).toBe('optimize_recommendation_with_memory');
    expect(service.resolveExecutorToolName('get_agent_message_events')).toBe(
      'get_agent_message_events',
    );
    expect(service.resolveExecutorToolName('unknown_tool')).toBeNull();
  });

  it('keeps create and publish social request tools unambiguous', () => {
    expect(service.getToolByExecutorName('publish_social_request')?.name).toBe(
      'publish_social_request',
    );
    expect(service.getToolByExecutorName('create_social_request')?.name).toBe(
      'create_social_request',
    );

    expect(service.normalizeToolName('publish_social_request')).toBe(
      SocialAgentToolName.PublishSocialRequest,
    );
    expect(service.normalizeToolName('create_social_request')).toBe(
      SocialAgentToolName.CreateSocialRequest,
    );
    expect(service.normalizeToolName('social_request_draft')).toBe(
      SocialAgentToolName.CreateSocialRequest,
    );

    expect(
      service.getTool('create_social_request')?.aliases ?? [],
    ).not.toContain('publish_social_request');
    expect(service.resolveExecutorToolName('publish_social_request')).toBe(
      'publish_social_request',
    );
    expect(service.resolveExecutorToolName('create_social_request')).toBe(
      'create_social_request',
    );
  });

  it('declares publish_social_request public intent sync outputs and side effects', () => {
    const tool = service.getTool('publish_social_request');

    expect(tool).toMatchObject({
      name: 'publish_social_request',
      outputSchema: expect.objectContaining({
        required: expect.arrayContaining([
          'socialRequestId',
          'publicIntentId',
          'synced',
        ]),
        properties: expect.objectContaining({
          publicIntentId: { type: 'string' },
          publicIntentStatus: { type: 'string' },
          synced: { type: 'boolean' },
          publicIntent: expect.objectContaining({ type: 'object' }),
        }),
      }),
      sideEffects: ['social_request_create_or_update', 'public_intent_sync'],
    });
  });
});
