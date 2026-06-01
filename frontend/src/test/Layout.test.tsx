import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';

function renderWithRouter(ui: React.ReactElement, { route = '/social-agent' } = {}) {
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

  it('renders the simplified FitMeet Agent navigation', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
    );
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByText('首页')).toHaveAttribute('href', '/');
    expect(within(nav).getByText('社交')).toHaveAttribute('href', '/social-agent');
    expect(within(nav).getByText('我的')).toHaveAttribute('href', '/profile');
    expect(within(nav).queryByText('开发者')).not.toBeInTheDocument();
  });

  it('marks current app route link with aria-current', () => {
    renderWithRouter(
      <Layout>
        <div>test</div>
      </Layout>,
      { route: '/social-agent' },
    );
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByRole('link', { name: '社交' })).toHaveAttribute(
      'aria-current',
      'page',
    );
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
    expect(
      screen.queryByRole('navigation', { name: '主导航' }),
    ).not.toBeInTheDocument();
  });
});
