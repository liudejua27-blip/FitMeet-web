import { describe, expect, it, vi } from 'vitest';

import { buildAgentAssistantProps } from '../components/agent-workspace/buildAgentAssistantProps';

describe('buildAgentAssistantProps', () => {
  function baseInput(): Parameters<typeof buildAgentAssistantProps>[0] {
    return {
      messages: [],
      threads: [],
      threadsLoading: false,
      activeThreadId: null,
      steps: [],
      isRunning: false,
      sessionRestoring: false,
      abortRef: { current: null },
      startNewThread: vi.fn(),
      loadThread: vi.fn(),
      onSubmit: vi.fn(),
      onStop: vi.fn(),
      onReloadLast: vi.fn(),
      onFeedback: vi.fn(),
      onBranchSwitch: vi.fn(),
      onThreadRename: vi.fn(),
      onThreadDelete: vi.fn(),
    };
  }

  it('aborts the current run before starting a new thread', () => {
    const controller = new AbortController();
    const input = baseInput();
    input.abortRef.current = controller;

    const props = buildAgentAssistantProps(input);
    props.onNewConversation();

    expect(controller.signal.aborted).toBe(true);
    expect(input.startNewThread).toHaveBeenCalledTimes(1);
  });

  it('loads the selected thread without creating a new one', () => {
    const input = baseInput();
    const props = buildAgentAssistantProps(input);

    props.onThreadSelect('agent-task:42');

    expect(input.loadThread).toHaveBeenCalledWith('agent-task:42');
    expect(input.startNewThread).not.toHaveBeenCalled();
  });
});
