import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitlistApi } from '../api/waitlistApi';
import { AppWaitlistPage } from '../pages/AppWaitlistPage';

vi.mock('../api/waitlistApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/waitlistApi')>();
  return {
    ...actual,
    waitlistApi: {
      submitApp: vi.fn(),
      validateInvite: vi.fn(),
      track: vi.fn(),
      listAdmin: vi.fn(),
      getStats: vi.fn(),
      createInviteCode: vi.fn(),
      listInviteCodes: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(waitlistApi);

function renderPage() {
  return render(
    <MemoryRouter>
      <AppWaitlistPage />
    </MemoryRouter>,
  );
}

function fillRequiredInputs(container: HTMLElement) {
  const inputs = container.querySelectorAll('input');
  fireEvent.change(inputs[0], { target: { value: 'runner@example.com' } });
  fireEvent.change(inputs[3], { target: { value: '青岛' } });
}

describe('AppWaitlistPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.track.mockResolvedValue({ ok: true });
    mockedApi.validateInvite.mockResolvedValue({ valid: true, code: 'QDU2026' });
  });

  it('submits the app waitlist form and shows a success state', async () => {
    mockedApi.submitApp.mockResolvedValue({
      id: 1,
      email: 'ru***@example.com',
      phone: null,
      country: '中国',
      region: '',
      city: '青岛',
      preferredLanguage: 'zh-CN',
      timezone: 'Asia/Shanghai',
      deviceType: 'ios',
      scenarios: ['跑步搭子'],
      interests: ['跑步'],
      userRole: 'fitness_user',
      interviewWilling: true,
      inviteCode: null,
      source: 'app_page',
      qualityScore: 88,
      qualityLevel: 'high',
      qualityReasons: ['场景明确'],
      status: 'pending',
      createdAt: '2026-05-27T00:00:00.000Z',
    });

    const { container } = renderPage();
    fillRequiredInputs(container);
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => expect(mockedApi.submitApp).toHaveBeenCalledTimes(1));
    expect(mockedApi.submitApp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'runner@example.com',
        city: '青岛',
        deviceType: 'ios',
        source: 'app_page',
      }),
    );
    expect(await screen.findByText(/你已加入 FitMeet App 内测等待名单/)).toBeInTheDocument();
  });

  it('does not render backend stack or raw JSON when submit fails', async () => {
    mockedApi.submitApp.mockRejectedValue(new Error('{"stack":"trace","message":"boom"}'));

    const { container } = renderPage();
    fillRequiredInputs(container);
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => expect(mockedApi.submitApp).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const text = document.body.textContent ?? '';
      expect(text).not.toContain('{"stack"');
      expect(text).not.toContain('trace');
      expect(text).not.toContain('boom');
    });
  });
});
