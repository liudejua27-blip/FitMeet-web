import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getFeed,
  getFeedPage,
  getPublicSocialIntents,
} from '../api/feedClient';

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

  it('reads public social intents through the shared core endpoint registry', async () => {
    const publicIntentPayload = {
      data: [
        {
          id: 'intent_1',
          mode: 'public',
          requestType: 'fitness_partner',
          title: '周末约练',
          description: '找附近跑步搭子',
          city: '青岛',
          loc: '',
          lat: null,
          lng: null,
          radiusKm: 5,
          timePreference: '周末',
          riskLevel: 'low',
          requiresUserConfirmation: true,
          filters: {},
          candidateUserIds: [],
          matchedCount: 0,
          status: 'active',
        },
      ],
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(publicIntentPayload));

    await expect(
      getPublicSocialIntents({
        page: 2,
        limit: 10,
        q: '跑步',
        city: '青岛',
        requestType: 'fitness_partner',
        status: 'active',
      }),
    ).resolves.toEqual(publicIntentPayload.data);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/social-intents?page=2&limit=10&q=%E8%B7%91%E6%AD%A5&city=%E9%9D%92%E5%B2%9B&requestType=fitness_partner&status=active',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
