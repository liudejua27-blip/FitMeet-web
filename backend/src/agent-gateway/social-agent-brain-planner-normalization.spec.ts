import {
  normalizeSocialAgentBrainLlmPlan,
  normalizeSocialAgentBrainPlannedTools,
} from './social-agent-brain-planner-normalization';
import type { SocialAgentBrainAvailableTool } from './social-agent-brain.service';

const availableTools: SocialAgentBrainAvailableTool[] = [
  tool('update_profile_from_agent_context'),
  tool('append_profile_memory'),
  tool('search_real_candidates'),
  tool('search_public_intents'),
  tool('create_social_request'),
  tool('send_message_to_candidate'),
  tool('connect_candidate'),
  tool('create_activity'),
  tool('get_user_profile'),
  tool('get_conversation_messages'),
  tool('get_candidate_detail'),
  tool('unsafe_unlisted_tool', false),
];

function tool(name: string, included = true): SocialAgentBrainAvailableTool {
  return {
    name: included ? name : `available_${name}`,
    description: '',
    whenToUse: '',
    requiresConfirmation: false,
    returns: [],
  };
}

describe('social agent brain planner normalization', () => {
  it('accepts canonical and model-facing planner schema fields', () => {
    const plan = normalizeSocialAgentBrainLlmPlan({
      intent: 'profile_enrichment',
      reason: ' 用户主要在提供画像 ',
      state: ' profile_building ',
      shouldCallTools: true,
      toolCalls: [
        {
          name: ' update_ai_profile ',
          arguments: { city: '青岛', mbti: 'INFP' },
        },
        'bad tool',
      ],
      needUserConfirmation: false,
      responseGoal: ' 提醒用户画像已提取 ',
    });

    expect(plan).toMatchObject({
      userIntent: 'profile_enrichment',
      reason: '用户主要在提供画像',
      state: 'profile_building',
      shouldCallTool: true,
      needUserConfirmation: false,
      responseGoal: '提醒用户画像已提取',
      tools: [
        {
          name: 'update_ai_profile',
          arguments: { city: '青岛', mbti: 'INFP' },
        },
      ],
    });
  });

  it('falls back unknown planner intent and ignores malformed tools', () => {
    const plan = normalizeSocialAgentBrainLlmPlan({
      userIntent: 'delete_user_data',
      shouldCallTool: true,
      tools: [{ name: 123, arguments: 'bad' }, null],
    });

    expect(plan.userIntent).toBe('unknown');
    expect(plan.shouldCallTool).toBe(true);
    expect(plan.tools).toEqual([]);
  });

  it('canonicalizes aliases and keeps profile tools only for profile intents', () => {
    const tools = normalizeSocialAgentBrainPlannedTools({
      intent: 'profile_enrichment',
      availableTools,
      tools: [
        { name: 'update_ai_profile', arguments: { city: 'Qingdao' } },
        { name: 'save_profile_memory', arguments: { note: 'slow warm-up' } },
        { name: 'search_candidates', arguments: {} },
      ],
    });

    expect(tools).toEqual([
      expect.objectContaining({
        name: 'update_profile_from_agent_context',
      }),
      expect.objectContaining({
        name: 'update_profile_from_agent_context',
      }),
    ]);
  });

  it('keeps search tools only on matching search intents', () => {
    expect(
      normalizeSocialAgentBrainPlannedTools({
        intent: 'social_search',
        availableTools,
        tools: [
          { name: 'search_candidates', arguments: { city: '青岛' } },
          { name: 'search_public_intents', arguments: {} },
        ],
      }).map((tool) => tool.name),
    ).toEqual(['search_real_candidates']);

    expect(
      normalizeSocialAgentBrainPlannedTools({
        intent: 'activity_search',
        availableTools,
        tools: [
          { name: 'search_candidates', arguments: {} },
          { name: 'search_public_intents', arguments: { city: '青岛' } },
        ],
      }).map((tool) => tool.name),
    ).toEqual(['search_public_intents']);
  });

  it('canonicalizes model-friendly conversation history aliases into the executable message read tool', () => {
    expect(
      normalizeSocialAgentBrainPlannedTools({
        intent: 'casual_chat',
        availableTools,
        tools: [{ name: 'get_conversation_history', arguments: {} }],
      }),
    ).toEqual([
      expect.objectContaining({
        name: 'get_conversation_messages',
        arguments: {},
      }),
    ]);
  });

  it('keeps action tools only for explicit action requests', () => {
    expect(
      normalizeSocialAgentBrainPlannedTools({
        intent: 'casual_chat',
        availableTools,
        tools: [
          { name: 'send_message_to_candidate', arguments: {} },
          { name: 'connect_candidate', arguments: {} },
          { name: 'get_candidate_detail', arguments: { userId: 2 } },
        ],
      }).map((tool) => tool.name),
    ).toEqual(['get_candidate_detail']);

    expect(
      normalizeSocialAgentBrainPlannedTools({
        intent: 'action_request',
        availableTools,
        tools: [
          { name: 'request_action_confirmation', arguments: {} },
          { name: 'connect_candidate', arguments: {} },
          { name: 'create_activity', arguments: {} },
        ],
      }).map((tool) => tool.name),
    ).toEqual([
      'send_message_to_candidate',
      'connect_candidate',
      'create_activity',
    ]);
  });
});
