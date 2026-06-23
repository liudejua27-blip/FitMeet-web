import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscoverPage } from '../pages/DiscoverPage';
import type { PublicSocialIntent } from '../types';

const dataServiceMock = vi.hoisted(() => ({
  getMeets: vi.fn(),
  getPublicSocialIntents: vi.fn(),
  joinMeet: vi.fn(),
}));

const socialAgentApiMock = vi.hoisted(() => ({
  recordInterestEvent: vi.fn(),
}));

vi.mock('../services/dataService', () => dataServiceMock);

vi.mock('../api/socialAgentApi', () => ({
  socialAgentApi: socialAgentApiMock,
}));

vi.mock('../stores', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    openLogin: vi.fn(),
  }),
  useNotificationStore: () => ({
    addNotification: vi.fn(),
  }),
}));

describe('DiscoverPage public intent readback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    dataServiceMock.getMeets.mockResolvedValue([]);
    dataServiceMock.getPublicSocialIntents.mockImplementation(
      ({ status }: { status?: string } = {}) =>
        Promise.resolve(status === 'active' ? [publishedIntent()] : []),
    );
  });

  it('shows a newly published public intent from the discover link and focuses it first', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/discover?publicIntentId=social_request_401']}>
        <DiscoverPage />
      </MemoryRouter>,
    );

    const target = await waitFor(() => {
      const element = container.querySelector<HTMLAnchorElement>(
        '[data-public-intent-id="social_request_401"]',
      );
      expect(element).not.toBeNull();
      return element;
    });

    const cards = Array.from(container.querySelectorAll<HTMLAnchorElement>('.match-card-link'));
    expect(cards[0]).toBe(target);
    expect(target).toHaveAttribute('href', '/public-intent/social_request_401');
    expect(target).toHaveTextContent('青岛大学晨跑搭子');
    expect(target).toHaveTextContent('青岛大学操场');
    expect(target).toHaveTextContent('公开社交意图');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});

function publishedIntent(): PublicSocialIntent {
  return {
    id: 'social_request_401',
    userId: 88,
    linkedSocialRequestId: 401,
    source: 'ai_social_request',
    mode: 'public',
    requestType: 'running',
    title: '青岛大学晨跑搭子',
    description: '今天早上在青岛大学操场一起轻松跑，先站内沟通。',
    interestTags: ['跑步', '轻松'],
    city: '青岛',
    loc: '青岛大学操场',
    locationPreference: '青岛大学操场',
    socialGoal: '找 1 位轻松晨跑搭子',
    lat: null,
    lng: null,
    radiusKm: 3,
    timePreference: '今天 06:00',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    filters: {},
    candidateUserIds: [],
    matchedCount: 0,
    matchSignal: {
      score: 82,
      confidence: 'high',
      source: 'fitmeet',
      reasons: ['同城', '活动匹配'],
      updatedAt: '2026-06-23T00:00:00.000Z',
    },
    status: 'active',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
  };
}
