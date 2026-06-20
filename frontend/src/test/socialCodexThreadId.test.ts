import { describe, expect, it } from 'vitest';

import {
  socialCodexTaskIdFromThreadId,
  socialCodexThreadIdForTask,
  socialCodexThreadIdOrExisting,
} from '../components/agent-workspace/socialCodexThreadId';

describe('socialCodexThreadId helpers', () => {
  it('normalizes task-backed thread ids into the canonical Social Codex shape', () => {
    expect(socialCodexThreadIdForTask(42)).toBe('agent-task:42');
    expect(socialCodexThreadIdForTask('42')).toBe('agent-task:42');
    expect(socialCodexThreadIdForTask('task:42')).toBe('agent-task:42');
    expect(socialCodexThreadIdForTask('thread:42')).toBe('agent-task:42');
    expect(socialCodexThreadIdForTask('social-thread:42')).toBe('agent-task:42');
    expect(socialCodexThreadIdForTask('agent-task:42')).toBe('agent-task:42');
  });

  it('keeps non-task external thread ids while still canonicalizing parseable ids', () => {
    expect(socialCodexThreadIdOrExisting('42', null)).toBe('agent-task:42');
    expect(socialCodexThreadIdOrExisting('thread:42', null)).toBe('agent-task:42');
    expect(socialCodexThreadIdOrExisting('social-thread:42', null)).toBe(
      'agent-task:42',
    );
    expect(socialCodexThreadIdOrExisting('external-thread-id', 42)).toBe(
      'external-thread-id',
    );
    expect(socialCodexThreadIdOrExisting(null, 42)).toBe('agent-task:42');
  });

  it('extracts task ids from canonical and legacy thread ids', () => {
    expect(socialCodexTaskIdFromThreadId('agent-task:88')).toBe(88);
    expect(socialCodexTaskIdFromThreadId('task:88')).toBe(88);
    expect(socialCodexTaskIdFromThreadId('thread:88')).toBe(88);
    expect(socialCodexTaskIdFromThreadId('social-thread:88')).toBe(88);
    expect(socialCodexTaskIdFromThreadId('88')).toBe(88);
    expect(Number.isNaN(socialCodexTaskIdFromThreadId('external'))).toBe(true);
  });
});
