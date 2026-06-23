import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicIntentDetailPage } from '../pages/PublicIntentDetailPage';
import type { PublicSocialCandidate, PublicSocialIntent } from '../types';

const dataServiceMock = vi.hoisted(() => ({
  getPublicSocialIntent: vi.fn(),
  getPublicSocialIntentMatches: vi.fn(),
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
  }),
}));

describe('PublicIntentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socialAgentApiMock.recordInterestEvent.mockResolvedValue(undefined);
    dataServiceMock.getPublicSocialIntent.mockResolvedValue(smokeIntent());
    dataServiceMock.getPublicSocialIntentMatches.mockResolvedValue({
      request: smokeIntent(),
      matchedBy: 'fitmeet_matching_engine',
      candidates: [
        candidate({ id: 7, name: 'Agent Smoke Owner', bio: 'agent_api_smoke owner', score: 90 }),
        candidate({ id: 8, name: 'Agent Smoke Candidate', bio: 'fixture smoke candidate' }),
        candidate({ id: 9, name: '林一舟', bio: '周末喜欢轻松跑步' }),
      ],
    });
  });

  it('keeps the direct smoke detail route product-safe without self or fixture candidates', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/public-intent/public_agent_api_smoke_qingdao_walk']}>
        <Routes>
          <Route path="/public-intent/:id" element={<PublicIntentDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '青岛同频约练' })).toBeInTheDocument();
    expect(screen.getByText('周末下午找散步搭子')).toBeInTheDocument();
    expect(screen.getByText('正在匹配')).toBeInTheDocument();
    expect(screen.getByText('林一舟')).toBeInTheDocument();

    const pageText = container.textContent ?? '';
    expect(pageText).toContain('匹配度：较高');
    expect(pageText).not.toMatch(/Agent Smoke|agent_api_smoke|smoke|fixture|seed/i);
    expect(pageText).not.toMatch(/Public Intent|matched|90%/i);
    expect(pageText).not.toContain('发起人自己');
    expect(screen.queryByText('Agent Smoke Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent Smoke Candidate')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(dataServiceMock.getPublicSocialIntentMatches).toHaveBeenCalledWith(
        'public_agent_api_smoke_qingdao_walk',
      );
    });
  });
});

function smokeIntent(): PublicSocialIntent {
  return {
    id: 'public_agent_api_smoke_qingdao_walk',
    userId: 7,
    linkedSocialRequestId: null,
    mode: 'public',
    requestType: 'custom',
    title: '青岛同频约练',
    description: '周末下午找散步搭子',
    interestTags: ['散步'],
    city: '青岛',
    loc: '市南区公共路线',
    locationPreference: '市南区公共路线',
    socialGoal: '周末下午找散步搭子',
    lat: null,
    lng: null,
    radiusKm: 5,
    timePreference: '周末下午',
    riskLevel: 'low',
    requiresUserConfirmation: false,
    matchedCount: 1,
    matchSignal: {
      score: 82,
      confidence: 'high',
      updatedAt: '2026-06-23T00:00:00.000Z',
    },
    status: 'matched',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
  };
}

function candidate({
  id,
  name,
  bio,
  score = 82,
}: {
  id: number;
  name: string;
  bio: string;
  score?: number;
}): PublicSocialCandidate {
  return {
    profile: {
      id,
      name,
      avatar: '',
      color: '#18b98f',
      city: '青岛',
      bio,
      interestTags: ['跑步'],
    },
    score,
    reasonTags: ['same_city'],
    reasonText: '同在青岛，建议先站内沟通。',
    nextAction: 'draft_invitation',
  };
}
