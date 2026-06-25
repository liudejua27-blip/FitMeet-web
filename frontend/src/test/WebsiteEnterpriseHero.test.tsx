import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WebsitePlatform, type WebsitePage } from '../components/website/WebsitePlatform';

const splitPages: WebsitePage[] = ['home', 'features', 'safety', 'download'];
const centerPages: WebsitePage[] = ['about', 'demo'];
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
    expect(hero?.querySelectorAll('.fm-product-proof-visual__chips span').length).toBeLessThanOrEqual(
      2,
    );
  });

  it.each(centerPages)('renders %s as a centered hero without forced visual art', (page) => {
    const { container } = renderWebsite(page);
    const hero = container.querySelector('.fm-enterprise-hero-system');

    expect(hero).toHaveClass('fm-enterprise-hero-system--center');
    expect(hero?.querySelector('.fm-product-proof-visual')).not.toBeInTheDocument();
  });

  it('keeps the website page component off the retired hero implementations', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'components', 'website', 'WebsitePlatform.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/function\s+PageHero\b/);
    expect(source).not.toMatch(/function\s+CinematicShowcase\b/);
    expect(source).not.toContain('fm-cinematic-showcase__beams');
    expect(source).not.toContain('fm-cinematic-showcase__cards');
  });
});
