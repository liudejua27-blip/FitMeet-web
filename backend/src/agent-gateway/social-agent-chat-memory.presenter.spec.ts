import type { AgentTask } from './entities/agent-task.entity';
import {
  appendSocialAgentConversationTurn,
  buildSocialAgentLlmConversationHistory,
  readSocialAgentConversationHistory,
  summarizeSocialAgentTaskMemoryForLlm,
} from './social-agent-chat-memory.presenter';

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 101,
    goal: '帮我找青岛跑步搭子',
    memory: {},
    ...overrides,
  } as AgentTask;
}

describe('social-agent-chat-memory.presenter', () => {
  it('appends conversation turns with duplicate suppression and max history', () => {
    const agentTask = task();

    appendSocialAgentConversationTurn(agentTask, {
      role: 'user',
      text: '你好',
      at: '2026-06-05T00:00:00.000Z',
    });
    appendSocialAgentConversationTurn(agentTask, {
      role: 'user',
      text: '你好',
      at: '2026-06-05T00:01:00.000Z',
    });
    appendSocialAgentConversationTurn(
      agentTask,
      {
        role: 'assistant',
        text: '我在',
        at: '2026-06-05T00:02:00.000Z',
      },
      2,
    );
    appendSocialAgentConversationTurn(
      agentTask,
      {
        role: 'user',
        text: '帮我找人',
        at: '2026-06-05T00:03:00.000Z',
      },
      2,
    );

    expect(readSocialAgentConversationHistory(agentTask)).toEqual([
      {
        role: 'assistant',
        text: '我在',
        at: '2026-06-05T00:02:00.000Z',
      },
      {
        role: 'user',
        text: '帮我找人',
        at: '2026-06-05T00:03:00.000Z',
      },
    ]);
  });

  it('builds a compact LLM-safe history from text or content fields', () => {
    const agentTask = task({
      memory: {
        socialAgentConversation: {
          turns: [
            { role: 'user', content: '  我想找跑步搭子  ' },
            { role: 'assistant', text: '可以，在哪个城市？' },
          ],
        },
      },
    });

    expect(buildSocialAgentLlmConversationHistory(agentTask)).toEqual([
      { role: 'user', text: '我想找跑步搭子' },
      { role: 'assistant', text: '可以，在哪个城市？' },
    ]);
  });

  it('summarizes task memory for final response context', () => {
    const agentTask = task({
      memory: {
        taskMemory: {
          preferences: { interests: ['跑步'] },
          boundaries: { publicPlaceOnly: true },
          activeEntities: { city: '青岛' },
        },
        shortTerm: {
          candidates: [{ userId: 2 }, { userId: 3 }],
        },
      },
    });

    expect(summarizeSocialAgentTaskMemoryForLlm(agentTask)).toEqual({
      goal: '帮我找青岛跑步搭子',
      preferences: { interests: ['跑步'] },
      boundaries: { publicPlaceOnly: true },
      activeEntities: { city: '青岛' },
      candidateCount: 2,
    });
  });
});
