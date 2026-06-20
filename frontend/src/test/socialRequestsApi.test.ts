import { beforeEach, describe, expect, it, vi } from 'vitest';

import { socialRequestsApi } from '../api/socialRequestsApi';
import { request } from '../api/client';

vi.mock('../api/client', () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

describe('socialRequestsApi', () => {
  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue({
      draft: {},
      card: {},
      suggestedTitle: '',
      profileUsed: {},
      llmEnabled: false,
      mode: 'fallback',
    });
  });

  it('keeps legacy aiDraft string calls as rawText-only requests', async () => {
    await socialRequestsApi.aiDraft('今晚青岛大学散步');

    expect(requestMock).toHaveBeenCalledWith('/social-requests/ai-draft', {
      method: 'POST',
      body: JSON.stringify({ rawText: '今晚青岛大学散步' }),
    });
  });

  it('can send taskContext to prevent AI draft context loss', async () => {
    const taskContext = {
      taskSlots: {
        activity: { value: '散步', state: 'completed' },
        time_window: { value: '今天晚上', state: 'completed' },
        location_text: { value: '青岛大学附近', state: 'completed' },
      },
      knownTaskSlotConstraints: {
        doNotAskAgainFor: ['activity', 'time_window', 'location_text'],
      },
    };

    await socialRequestsApi.aiDraft({
      rawText: '可以，继续帮我找人',
      taskContext,
    });

    expect(requestMock).toHaveBeenCalledWith('/social-requests/ai-draft', {
      method: 'POST',
      body: JSON.stringify({
        rawText: '可以，继续帮我找人',
        taskContext,
      }),
    });
  });
});
