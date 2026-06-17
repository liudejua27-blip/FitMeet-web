import { SocialAgentEventV2Service } from './social-agent-event-v2.service';

describe('SocialAgentEventV2Service', () => {
  it('derives taskId from checkpoint-style thread ids for stable replay', () => {
    const service = new SocialAgentEventV2Service();

    const event = service.envelope({
      type: 'visible_process.delta',
      userId: 7,
      threadId: 'agent-task:44',
      taskId: null,
      runId: 'run-44',
      stage: 'hydrate_context',
      display: { title: '正在读取你的偏好', state: 'running' },
    });

    expect(event).toMatchObject({
      threadId: 'agent-task:44',
      taskId: 44,
      runId: 'run-44',
      seq: 1,
    });
  });

  it('keeps sequence numbers scoped to each run', () => {
    const service = new SocialAgentEventV2Service();

    const first = service.envelope({
      type: 'run.started',
      userId: 7,
      threadId: 44,
      runId: 'run-a',
      stage: 'detect_social_intent',
    });
    const second = service.envelope({
      type: 'run.completed',
      userId: 7,
      threadId: 44,
      runId: 'run-a',
      stage: 'life_graph_writeback',
    });
    const otherRun = service.envelope({
      type: 'run.started',
      userId: 7,
      threadId: 44,
      runId: 'run-b',
      stage: 'detect_social_intent',
    });

    expect([first.seq, second.seq, otherRun.seq]).toEqual([1, 2, 1]);
  });
});
