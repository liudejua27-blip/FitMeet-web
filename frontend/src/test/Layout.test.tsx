import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';

function renderWithRouter(ui: React.ReactElement, { route = '/hall' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('Layout', () => {
  it('renders the brand name on app routes', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
    );
    expect(screen.getByText('Meet')).toBeInTheDocument();
  });

  it('renders agent-first app navigation links outside the homepage', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
    );
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByText('FitMeet 大厅')).toHaveAttribute('href', '/hall');
    expect(within(nav).getByText('Agent 宇宙')).toHaveAttribute('href', '/ai');
    expect(within(nav).getByText('AI 托管')).toHaveAttribute('href', '/ai-hosting');
    expect(within(nav).getByText('Social Skills')).toHaveAttribute('href', '/developers/social-skills');
    expect(within(nav).getByText('安全')).toHaveAttribute('href', '/safety');
    expect(within(nav).queryByText('Agent 接入')).not.toBeInTheDocument();
  });

  it('marks current app route link with aria-current', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
      { route: '/hall' },
    );
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByRole('link', { name: 'FitMeet 大厅' })).toHaveAttribute('aria-current', 'page');
  });

  it('has a skip-to-content link on app routes', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
    );
    expect(screen.getByText('跳到主要内容')).toBeInTheDocument();
  });

  it('renders children inside main on app routes', () => {
    renderWithRouter(
      <Layout>
        <div data-testid="child">Hello</div>
      </Layout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('uses a chrome-free shell on the homepage', () => {
    renderWithRouter(
      <Layout>
        <div data-testid="home-child">Home</div>
      </Layout>,
      { route: '/' },
    );
    expect(screen.getByTestId('home-child')).toBeInTheDocument();
    expect(screen.queryByText('Meet')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
  });
});
