import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentBrainTurnDecision } from './social-agent-brain.service';
import {
  readSocialAgentConversationBrainDecision,
  readSocialAgentConversationBrainLastToolResult,
  readSocialAgentConversationBrainMode,
  readSocialAgentConversationBrainPlannedTools,
  readSocialAgentConversationBrainToolArguments,
  readSocialAgentConversationBrainToolNames,
  readSocialAgentCurrentAgentState,
  rememberSocialAgentConversationBrainDecision,
  rememberSocialAgentConversationBrainToolResult,
  socialAgentFinalResponseSafetyRules,
} from './social-agent-chat-brain-memory.presenter';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    goal: '帮我找青岛跑步搭子',
    memory: {},
    ...overrides,
  } as AgentTask;
}

function decision(
  overrides: Partial<SocialAgentBrainTurnDecision> = {},
): SocialAgentBrainTurnDecision {
  return {
    route: {
      intent: 'profile_enrichment',
      replyStrategy: 'conversational_answer',
    },
    conversationMode: 'profile_update_tool',
    shouldExecuteTool: true,
    shouldAskClarifyingQuestion: false,
    plannerSource: 'rules',
    userIntent: 'profile_enrichment',
    reason: 'user asked to save profile',
    responseGoal: 'save profile and ask for next missing fields',
    needUserConfirmation: false,
    tools: [
      {
        name: 'update_profile_from_agent_context',
        arguments: { city: '青岛', school: '青岛大学' },
      },
    ],
    notes: ['profile facts detected'],
    ...overrides,
  } as SocialAgentBrainTurnDecision;
}

describe('social-agent-chat-brain-memory.presenter', () => {
  it('persists and reads conversation brain decisions and planned tools', () => {
    const agentTask = task();

    rememberSocialAgentConversationBrainDecision(agentTask, decision());

    expect(readSocialAgentConversationBrainMode(agentTask)).toBe(
      'profile_update_tool',
    );
    expect(readSocialAgentConversationBrainDecision(agentTask)).toMatchObject({
      intent: 'profile_enrichment',
      replyStrategy: 'conversational_answer',
      conversationMode: 'profile_update_tool',
      shouldExecuteTool: true,
      tools: [
        {
          name: 'update_profile_from_agent_context',
          arguments: { city: '青岛', school: '青岛大学' },
        },
      ],
    });
    expect(readSocialAgentConversationBrainToolNames(agentTask)).toEqual([
      'update_profile_from_agent_context',
    ]);
    expect(readSocialAgentConversationBrainPlannedTools(agentTask)).toEqual([
      {
        name: 'update_profile_from_agent_context',
        arguments: { city: '青岛', school: '青岛大学' },
      },
    ]);
    expect(
      readSocialAgentConversationBrainToolArguments(
        agentTask,
        'update_profile_from_agent_context',
      ),
    ).toEqual({ city: '青岛', school: '青岛大学' });
  });

  it('stores the latest brain tool result without losing the decision', () => {
    const agentTask = task();
    rememberSocialAgentConversationBrainDecision(agentTask, decision());

    rememberSocialAgentConversationBrainToolResult(agentTask, {
      name: 'update_profile_from_agent_context',
      status: 'succeeded',
      output: { success: true, missingFields: ['availableTimes'] },
    });

    expect(readSocialAgentConversationBrainDecision(agentTask)).toMatchObject({
      conversationMode: 'profile_update_tool',
      lastToolResult: expect.objectContaining({
        name: 'update_profile_from_agent_context',
        status: 'succeeded',
        completedAt: expect.any(String),
      }),
    });
    expect(readSocialAgentConversationBrainLastToolResult(agentTask)).toEqual(
      expect.objectContaining({
        output: { success: true, missingFields: ['availableTimes'] },
      }),
    );
  });

  it('reads agent state from explicit memory or task memory fallback', () => {
    expect(
      readSocialAgentCurrentAgentState(
        task({ memory: { agentState: 'workflow_help' } }),
      ),
    ).toBe('workflow_help');
    expect(
      readSocialAgentCurrentAgentState(
        task({
          memory: {
            taskMemory: {
              currentTask: { state: 'profile_building' },
            },
          },
        }),
      ),
    ).toBe('profile_building');
    expect(readSocialAgentCurrentAgentState(task())).toBe('idle');
  });

  it('keeps final response safety rules centralized', () => {
    expect(socialAgentFinalResponseSafetyRules()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('不得编造候选人'),
        expect.stringContaining('不要暴露 DeepSeek'),
      ]),
    );
  });
});
