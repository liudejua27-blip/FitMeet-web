import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AiProfileBuilderPage } from '../pages/AiProfileBuilderPage';

vi.mock('../api/socialProfileApi', () => ({
  socialProfileApi: {
    questions: vi.fn(() => new Promise(() => undefined)),
    privacy: vi.fn(() => new Promise(() => undefined)),
    pendingSensitiveTags: vi.fn(() => new Promise(() => undefined)),
  },
}));

describe('AiProfileBuilderPage', () => {
  it('shows a structured skeleton while profile questions load', () => {
    render(
      <MemoryRouter>
        <AiProfileBuilderPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('ai-profile-loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('AI 画像工作室加载中...')).not.toBeInTheDocument();
  });
});
