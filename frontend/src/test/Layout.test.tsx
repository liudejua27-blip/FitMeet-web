import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';

function renderWithRouter(ui: React.ReactElement, { route = '/messages' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('Layout', () => {
  it('renders the brand name on app routes', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
    );
    expect(screen.getByLabelText('FitMeet 首页')).toBeInTheDocument();
  });

  it('renders the simplified FitMeet discovery navigation', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
    );
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByRole('link', { name: '发现' })).toHaveAttribute('href', '/discover');
    expect(within(nav).queryByText('附近机会')).not.toBeInTheDocument();
    expect(within(nav).queryByText('约练')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Agent')).not.toBeInTheDocument();
    expect(within(nav).queryByText('开发者')).not.toBeInTheDocument();
  });

  it('keeps the discovery link available without marking unrelated app routes current', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
      { route: '/messages' },
    );
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByRole('link', { name: '发现' })).not.toHaveAttribute('aria-current');
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

  it('uses a chrome-free shell on the enterprise discovery page', () => {
    renderWithRouter(
      <Layout>
        <div data-testid="discover-child">Discover</div>
      </Layout>,
      { route: '/discover' },
    );
    expect(screen.getByTestId('discover-child')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '主导航' })).not.toBeInTheDocument();
  });
});
