import {
  createSocialCodexRuntimeIdentity,
  socialCodexThreadIdForTask,
  socialCodexThreadTaskId,
} from './social-codex-runtime-model';

describe('social-codex-runtime-model', () => {
  it('creates canonical task-bound thread ids', () => {
    expect(socialCodexThreadIdForTask(202)).toBe('agent-task:202');
    expect(() => socialCodexThreadIdForTask(0)).toThrow(
      'Social Codex thread id requires a positive task id.',
    );
  });

  it('parses task ids from compatible thread ids', () => {
    expect(socialCodexThreadTaskId('agent-task:202')).toBe(202);
    expect(socialCodexThreadTaskId('thread:303')).toBe(303);
    expect(socialCodexThreadTaskId('ordinary-chat')).toBeNull();
  });

  it('normalizes the runtime identity for thread/task/run/session boundaries', () => {
    expect(
      createSocialCodexRuntimeIdentity({
        threadId: 'agent-task:202',
        runId: 'sar_run_1',
      }),
    ).toEqual({
      threadId: 'agent-task:202',
      taskId: 202,
      runId: 'sar_run_1',
      sessionId: 'social-codex:agent-task:202:sar_run_1',
    });

    expect(createSocialCodexRuntimeIdentity({ taskId: 303 })).toEqual({
      threadId: 'agent-task:303',
      taskId: 303,
      runId: null,
      sessionId: 'social-codex:agent-task:303:latest',
    });
  });
});
