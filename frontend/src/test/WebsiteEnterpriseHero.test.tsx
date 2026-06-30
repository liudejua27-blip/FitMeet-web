import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WebsitePlatform, type WebsitePage } from '../components/website/WebsitePlatform';

const splitPages: WebsitePage[] = ['home', 'features', 'safety', 'download', 'about'];
const centerPages: WebsitePage[] = ['demo'];
const websitePages: WebsitePage[] = [...splitPages, ...centerPages];

function renderWebsite(page: WebsitePage, route = page === 'home' ? '/' : `/${page}`) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <WebsitePlatform page={page} />
    </MemoryRouter>,
  );
}

describe('Website enterprise hero system', () => {
  it.each(websitePages)('renders %s with the unified EnterpriseHero shell', (page) => {
    const { container } = renderWebsite(page);

    expect(container.querySelector('.fm-enterprise-hero-system')).toBeInTheDocument();
    expect(container.querySelector('.fm-enterprise-hero')).not.toBeInTheDocument();
    expect(container.querySelector('.fm-page-hero')).not.toBeInTheDocument();
    expect(container.querySelector('.fm-cinematic-showcase__beams')).not.toBeInTheDocument();
    expect(container.querySelector('.fm-cinematic-showcase__cards')).not.toBeInTheDocument();
  });

  it.each(splitPages)('renders %s with one integrated product proof visual', (page) => {
    const { container } = renderWebsite(page);
    const hero = container.querySelector('.fm-enterprise-hero-system');

    expect(hero).toHaveClass('fm-enterprise-hero-system--split');
    expect(hero?.querySelectorAll('.fm-product-proof-visual')).toHaveLength(1);
    expect(hero?.querySelectorAll('.fm-product-proof-visual__chips span').length).toBeGreaterThan(0);
    expect(
      hero?.querySelectorAll('.fm-product-proof-visual__chips span').length,
    ).toBeLessThanOrEqual(4);
  });

  it.each(centerPages)('renders %s as a centered hero without forced visual art', (page) => {
    const { container } = renderWebsite(page);
    const hero = container.querySelector('.fm-enterprise-hero-system');

    expect(hero).toHaveClass('fm-enterprise-hero-system--center');
    expect(hero?.querySelector('.fm-product-proof-visual')).not.toBeInTheDocument();
  });

  it('keeps website code and enterprise CSS off the retired hero implementations', () => {
    const platformSource = readFileSync(
      join(process.cwd(), 'src', 'components', 'website', 'WebsitePlatform.tsx'),
      'utf8',
    );
    const cssSource = readFileSync(
      join(process.cwd(), 'src', 'styles', 'website-enterprise.css'),
      'utf8',
    );

    expect(platformSource).not.toMatch(/function\s+PageHero\b/);
    expect(platformSource).not.toMatch(/function\s+CinematicShowcase\b/);
    expect(cssSource).not.toMatch(/\.fm-enterprise-site\s+\.fm-enterprise-hero(?!-system)/);
    expect(cssSource).not.toContain('.fm-page-hero');
    expect(cssSource).not.toContain('.fm-cinematic-showcase');
    expect(cssSource).not.toContain('rgba(0, 226, 223');
    expect(cssSource).not.toContain('#54f6ec');
  });

  it('keeps static website metadata aligned to the canonical production domain', () => {
    const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

    expect(indexHtml).toContain('https://www.ourfitmeet.cn/');
    expect(indexHtml).not.toContain('https://ourfitmeet.cn/');
    expect(indexHtml).not.toContain('/press');
    expect(indexHtml).not.toContain('/search?q=');
    expect(indexHtml).not.toContain('Life Graph');
  });

  it('renders a four-column enterprise footer with product, company, legal, and contact groups', () => {
    renderWebsite('home');

    expect(screen.getByRole('heading', { name: '产品' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '公司' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '安全与法律' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '联系' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '152530005312@163.com' })).toHaveAttribute(
      'href',
      'mailto:152530005312@163.com',
    );
  });

  it('uses the direction-one Social World product hero asset', () => {
    renderWebsite('home');

    expect(screen.getByRole('heading', { name: 'Social World' })).toBeInTheDocument();
    expect(screen.getAllByText(/让社交更简单/).length).toBeGreaterThan(0);

    const heroVisual = screen.getByRole('img', {
      name: 'FitMeet Social World 黑金 App 需求流产品预览',
    });

    expect(heroVisual).toHaveAttribute(
      'src',
      '/images/fitmeet/website/social-world-direction-one-product.jpg',
    );
  });

  it('uses the direction-one product system asset outside the homepage and about globe', () => {
    renderWebsite('features', '/features');

    expect(
      screen.getByRole('img', {
        name: 'FitMeet Agent、Discover、Matching、Messages 和 Safety 产品能力图',
      }),
    ).toHaveAttribute('src', '/images/fitmeet/website/social-world-features-system-v1.jpg');
  });

  it('keeps the globe visual exclusive to the About page hero', () => {
    renderWebsite('about', '/about');

    const aboutVisual = screen.getByRole('img', {
      name: 'FitMeet Social World 全球真实社交愿景黑金视觉',
    });

    expect(aboutVisual).toHaveAttribute(
      'src',
      '/images/fitmeet/website/social-world-about-earth-v3.jpg',
    );
  });

  it('renames the download product showcase away from screenshot claims', () => {
    renderWebsite('download', '/download');

    expect(screen.getByText('核心产品流程')).toBeInTheDocument();
    expect(screen.queryByText('核心截图')).not.toBeInTheDocument();
    expect(screen.getByText('Agent 生成 Social Card')).toBeInTheDocument();
    expect(screen.getByText('Discover 真实可见')).toBeInTheDocument();
    expect(screen.getByText('Messages 承接后续')).toBeInTheDocument();
  });

  it('exposes the public demo as an accessible tab interface', () => {
    renderWebsite('demo', '/demo');

    expect(screen.getByRole('tablist', { name: 'FitMeet 30 秒 Demo 步骤' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[0].id);
  });
});
