import {
  agentLoopStepStreamEvent,
  progressFromStep,
  toolCallStreamEvent,
  userFacingStreamErrorEvent,
} from './social-agent-chat-stream.presenter';

describe('social-agent-chat-stream.presenter', () => {
  it('uses natural user-facing copy for tool progress', () => {
    const running = toolCallStreamEvent({
      label: 'search_real_candidates tool call traceId=hidden',
      status: 'running',
    });
    const done = toolCallStreamEvent({
      label: 'search_real_candidates tool call traceId=hidden',
      status: 'done',
    });
    const failed = toolCallStreamEvent({
      label: 'search_real_candidates tool call traceId=hidden',
      status: 'failed',
    });
    const progress = progressFromStep({
      id: 'tool:search',
      label: 'search_real_candidates tool call traceId=hidden',
      status: 'running',
    });

    expect(running).toMatchObject({
      type: 'tool_call',
      stepId: 'step-analysis',
      title: '正在筛选公开可发现的人',
    });
    expect(done).toMatchObject({
      type: 'tool_result',
      stepId: 'step-analysis',
      title: '已筛选公开可发现的人',
    });
    expect(failed).toMatchObject({
      type: 'tool_result',
      stepId: 'step-analysis',
      title: '刚才连接不稳',
      detail: '这段需求还在，可以继续处理。',
    });
    expect(progress).toMatchObject({
      type: 'progress',
      id: 'tool:search',
      title: '正在筛选公开可发现的人',
      detail: undefined,
    });
  });

  it('preserves stable step identities across loop, tool, and progress events', () => {
    const step = {
      id: 'rank.candidates:2',
      label: 'rank candidates with safety boundary',
      status: 'done' as const,
      agentName: 'Social Match Agent',
      toolName: 'social_match_search_turn',
    };

    expect(agentLoopStepStreamEvent(step)).toMatchObject({
      type: 'agent_loop_step',
      stepId: 'rank.candidates:2',
      phase: 'observe',
      agentName: 'Social Match Agent',
      toolName: 'social_match_search_turn',
    });
    expect(toolCallStreamEvent(step)).toMatchObject({
      type: 'tool_result',
      stepId: 'rank.candidates:2',
      agentName: 'Social Match Agent',
      toolName: 'social_match_search_turn',
    });
    expect(progressFromStep(step)).toMatchObject({
      type: 'progress',
      id: 'rank.candidates:2',
      kind: 'tool',
      metadata: {
        stepId: 'rank.candidates:2',
        agentName: 'Social Match Agent',
        toolName: 'social_match_search_turn',
      },
    });
  });

  it('keeps generic analysis copy neutral', () => {
    expect(
      progressFromStep({
        id: 'analysis',
        label: 'understand user request',
        status: 'running',
      }),
    ).toMatchObject({
      type: 'progress',
      kind: 'analysis',
      title: '正在理解你的需求',
    });
  });

  it('does not expose internal backend errors in stream failure messages', () => {
    const missingConnection = userFacingStreamErrorEvent(
      new Error('BadRequestException: agentConnectionId is required'),
    );
    const missingTable = userFacingStreamErrorEvent(
      new Error('QueryFailedError: relation "agent_tasks" does not exist'),
    );
    const foreignKey = userFacingStreamErrorEvent(
      new Error(
        'insert or update on table "agent_activity_logs" violates foreign key constraint "fk_agent_activity_logs_connection"',
      ),
    );

    for (const event of [missingConnection, missingTable, foreignKey]) {
      expect(event).toMatchObject({
        type: 'error',
        code: 'AGENT_STREAM_FAILED',
        message:
          '连接刚才中断了。这段需求还在，可以直接继续。',
        recoveryNotice: expect.objectContaining({
          retryable: true,
          source: 'stream_error',
        }),
      });
    }
  });

  it('keeps timeout recovery copy lightweight instead of showing a failure-like title', () => {
    const timeout = userFacingStreamErrorEvent(new Error('deepseek_timeout'));

    expect(timeout).toMatchObject({
      type: 'error',
      code: 'AGENT_STREAM_FAILED',
      message: '处理比平时久一点。这段需求还在，可以继续。',
      recoveryNotice: expect.objectContaining({
        kind: 'timeout',
        title: '这段需求还在',
        message: '刚才处理比平时久一点，可以继续处理；不会重复执行已确认的高风险动作。',
      }),
    });
    expect(JSON.stringify(timeout)).not.toContain('这次处理时间有点久');
  });
});
