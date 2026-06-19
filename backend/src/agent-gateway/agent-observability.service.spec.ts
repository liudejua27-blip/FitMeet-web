import { AgentObservabilityService } from './agent-observability.service';

describe('AgentObservabilityService', () => {
  it('records production metrics and raises alert snapshots', () => {
    const service = new AgentObservabilityService();
    const traceId = service.createTraceId('agent');

    service.recordAgentRun({
      traceId,
      runId: 'loop:1',
      taskId: 1,
      status: 'started',
    });
    for (let index = 0; index < 11; index += 1) {
      service.recordLlmCall({
        traceId,
        taskId: 1,
        useCase: 'final_response',
        model: 'deepseek',
        success: index < 9,
        latencyMs: 1000,
        firstTokenLatencyMs: index === 0 ? 3000 : 2600,
        tokenCount: 10,
        failureReason: index < 9 ? null : 'deepseek_timeout',
      });
      service.recordToolCall({
        traceId,
        runId: 'loop:1',
        toolName: 'search_real_candidates',
        status: index < 9 ? 'observed' : 'failed',
        latencyMs: 120,
        failureReason: index < 9 ? null : 'tool_failed',
      });
      service.recordSse({
        streamName: 'message_stream',
        status: 'started',
      });
    }
    service.recordSse({
      streamName: 'message_stream',
      status: 'interrupted',
      failureReason: 'client_disconnected',
      latencyMs: 50,
    });
    service.recordDbQuery({
      operation: 'agent_tasks.find',
      latencyMs: 800,
      success: true,
    });
    service.recordQueueSnapshot([
      { queueName: 'fitmeet.subagent.social-match-agent', queueDepth: 30 },
    ]);

    const snapshot = service.snapshot();

    expect(snapshot.counters).toEqual(
      expect.objectContaining({
        'agent_run.started': 1,
        'llm.total': 11,
        'llm.failed': 2,
        'tool.failed': 2,
        'sse.interrupted': 1,
        'db.slow_query': 1,
      }),
    );
    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'llm_failure_rate_high' }),
        expect.objectContaining({ code: 'tool_failure_rate_high' }),
        expect.objectContaining({ code: 'db_slow_query_detected' }),
        expect.objectContaining({ code: 'queue_backlog_high' }),
        expect.objectContaining({ code: 'token_latency_high' }),
      ]),
    );
  });
});
