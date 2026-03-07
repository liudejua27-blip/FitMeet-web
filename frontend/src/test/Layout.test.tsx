import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('Layout', () => {
  it('renders the brand name', () => {
    renderWithRouter(<Layout><div>test</div></Layout>);
    expect(screen.getByText('MATE')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderWithRouter(<Layout><div>test</div></Layout>);
    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('🔥 发现')).toBeInTheDocument();
    expect(screen.getByText('📍 约练')).toBeInTheDocument();
    expect(screen.getByText('🏋️ 教练')).toBeInTheDocument();
  });

  it('marks current page link with aria-current', () => {
    renderWithRouter(<Layout><div>test</div></Layout>, { route: '/discover' });
    const discoverLinks = screen.getAllByText('🔥 发现');
    const activeLink = discoverLinks.find(el => el.getAttribute('aria-current') === 'page');
    expect(activeLink).toBeTruthy();
  });

  it('has a skip-to-content link', () => {
    renderWithRouter(<Layout><div>test</div></Layout>);
    expect(screen.getByText('跳到主要内容')).toBeInTheDocument();
  });

  it('renders children inside main', () => {
    renderWithRouter(<Layout><div data-testid="child">Hello</div></Layout>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
