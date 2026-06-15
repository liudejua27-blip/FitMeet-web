import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PremiumButton } from '../components/ui/PremiumButton';

describe('PremiumButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders to= path as a discover-aware router link', () => {
    render(
      <MemoryRouter>
        <PremiumButton to="/discover">进入发现</PremiumButton>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '进入发现' })).toHaveAttribute('href', '/discover');
  });

  it('triggers top scroll reset for discover links', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(16);
      return 16;
    });

    render(
      <MemoryRouter>
        <PremiumButton to="/discover">进入发现</PremiumButton>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: '进入发现' });
    fireEvent.click(link);

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  });
});
