import {
  normalizeTaskBoundSocialAgentEvent,
  parseSocialAgentThreadTaskId,
} from './social-agent-thread-id.util';

describe('social-agent-thread-id.util', () => {
  it.each([
    ['44', 44],
    ['agent-task:44', 44],
    ['social-thread:44', 44],
    ['task:44', 44],
    ['thread:44', 44],
    [44, 44],
    ['user-7', null],
    ['', null],
  ])('parses %p as %p', (value, expected) => {
    expect(parseSocialAgentThreadTaskId(value)).toBe(expected);
  });

  it('normalizes legacy task replay events that were persisted before task binding', () => {
    expect(
      normalizeTaskBoundSocialAgentEvent(
        {
          type: 'visible_process.delta',
          taskId: null,
          threadId: 'user-7',
        },
        44,
      ),
    ).toMatchObject({
      taskId: 44,
      threadId: 'agent-task:44',
    });
  });

  it('preserves already task-addressable replay thread ids', () => {
    expect(
      normalizeTaskBoundSocialAgentEvent(
        {
          type: 'run.started',
          taskId: null,
          threadId: 'task:44',
        },
        44,
      ),
    ).toMatchObject({
      taskId: 44,
      threadId: 'task:44',
    });
  });
});
