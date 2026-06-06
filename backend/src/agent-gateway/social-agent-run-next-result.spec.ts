import { AgentTaskStatus } from './entities/agent-task.entity';
import { buildSocialAgentRunNextResult } from './social-agent-run-next-result';
import { SocialAgentToolName } from './social-agent-tool.types';
import type { SocialAgentToolCallRecord } from './social-agent-tool.types';

function toolCall(
  status: SocialAgentToolCallRecord['status'],
  stepId: string,
): SocialAgentToolCallRecord {
  return {
    id: `call_${stepId}`,
    stepId,
    toolName: SocialAgentToolName.GetCurrentTaskMemory,
    status,
    input: {},
    output: status === 'succeeded' ? { ok: true } : null,
    error: status === 'succeeded' ? null : { message: status },
    startedAt: '2026-06-06T00:00:00.000Z',
    completedAt: '2026-06-06T00:00:01.000Z',
    durationMs: 1000,
  };
}

describe('buildSocialAgentRunNextResult', () => {
  it('summarizes calls and preserves run-next reply state', () => {
    const calls = [
      toolCall('succeeded', 'read_reply'),
      toolCall('failed', 'summarize_reply'),
      toolCall('blocked', 'send_message'),
    ];
    const decision = {
      nextAction: 'send_message',
      toolName: SocialAgentToolName.SendMessage,
    };

    const result = buildSocialAgentRunNextResult({
      task: { id: 101, status: AgentTaskStatus.WaitingReply },
      calls,
      handledReply: true,
      decision,
    });

    expect(result).toEqual({
      taskId: 101,
      executedSteps: 3,
      succeededSteps: 1,
      failedSteps: 1,
      blockedSteps: 1,
      toolCalls: calls,
      status: AgentTaskStatus.WaitingReply,
      handledReply: true,
      decision,
    });
  });

  it('supports no-reply results without a decision', () => {
    const result = buildSocialAgentRunNextResult({
      task: { id: 202, status: AgentTaskStatus.WaitingReply },
      calls: [toolCall('succeeded', 'read_reply')],
      handledReply: false,
      decision: null,
    });

    expect(result).toMatchObject({
      taskId: 202,
      executedSteps: 1,
      succeededSteps: 1,
      failedSteps: 0,
      blockedSteps: 0,
      handledReply: false,
      decision: null,
    });
  });
});
