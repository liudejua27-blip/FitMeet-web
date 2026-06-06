import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFeed, getFeedPage } from '../api/feedClient';

const feedPayload = {
  data: [
    {
      id: 501,
      type: 'log',
      sport: 'run',
      title: 'FitMeet staging E2E run',
      text: 'Published',
      username: 'Lin',
      gender: '',
      age: 0,
      city: 'Qingdao',
      color: '#38BDF8',
      colorBg: '#E0F2FE',
      emoji: 'run',
      tags: ['staging-e2e'],
      likes: 0,
      comments: 0,
      viewCount: 0,
      slots: null,
      cert: false,
    },
  ],
  metadata: {
    total: 1,
    page: 2,
    lastPage: 3,
  },
};

describe('feedClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('returns the shared FeedPage contract when pagination metadata is needed', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(feedPayload));

    const page = await getFeedPage({
      category: 'log',
      page: 2,
      pageSize: 10,
      lat: 36.1,
      lng: 120.3,
    });

    expect(page).toEqual(feedPayload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feed?category=log&page=2&limit=10&lat=36.1&lng=120.3',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    );
  });

  it('keeps the legacy feed helper returning only posts for existing pages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(feedPayload));

    await expect(getFeed({ category: 'all', page: 1, pageSize: 5 })).resolves.toEqual(
      feedPayload.data,
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
