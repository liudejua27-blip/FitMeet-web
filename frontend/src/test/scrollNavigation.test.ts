import { describe, expect, it, vi } from 'vitest';
import {
  buildAbsoluteRouteUrl,
  buildDiscoverPath,
  isInternalDiscoverRoute,
  navigateToRouteWithScrollReset,
  resolveNavigationAlias,
} from '../lib/scrollNavigation';

describe('scrollNavigation', () => {
  it('keeps discover alias routes in a single canonical target', () => {
    expect(resolveNavigationAlias('/human')).toBe('/discover');
    expect(resolveNavigationAlias('/nearby')).toBe('/discover');
    expect(resolveNavigationAlias('/meet')).toBe('/discover');
    expect(resolveNavigationAlias('/hall')).toBe('/discover');
    expect(resolveNavigationAlias('/social-hall')).toBe('/discover');
    expect(resolveNavigationAlias('/agent-connect/social-hall')).toBe('/discover');
  });

  it('preserves discover query and hash while normalizing alias routes', () => {
    expect(resolveNavigationAlias('/human?focusScene=run#top')).toBe('/discover?focusScene=run#top');
    expect(resolveNavigationAlias('/hall?tab=match#section')).toBe('/discover?tab=match#section');
  });

  it('builds discover share URLs through canonical route helpers', () => {
    expect(buildDiscoverPath({ filters: { id: 42 } })).toBe('/discover?id=42');
    expect(buildAbsoluteRouteUrl('https://www.ourfitmeet.cn/', '/meet?id=42')).toBe(
      'https://www.ourfitmeet.cn/discover?id=42',
    );
  });

  it('identifies discover routes for scroll-reset path decisioning', () => {
    expect(isInternalDiscoverRoute('/discover')).toBe(true);
    expect(isInternalDiscoverRoute('/discover?city=beijing')).toBe(true);
    expect(isInternalDiscoverRoute('/human')).toBe(true);
    expect(isInternalDiscoverRoute('/social-hall')).toBe(true);
    expect(isInternalDiscoverRoute('/download')).toBe(false);
  });

  it('drives navigate helper through canonical route with scroll state', () => {
    const navigate = vi.fn();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(16);
      return 1;
    });

    const state = { custom: 'value' };

    navigateToRouteWithScrollReset(navigate, '/human', {
      state,
      search: '?city=beijing',
      replace: true,
      scrollBehavior: 'auto',
    });

    expect(navigate).toHaveBeenCalledWith(
      '/discover?city=beijing',
      expect.objectContaining({
        replace: true,
        state: expect.objectContaining({
          custom: 'value',
          __fitmeet_scroll_top_on_navigate: true,
        }),
      }),
    );

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
