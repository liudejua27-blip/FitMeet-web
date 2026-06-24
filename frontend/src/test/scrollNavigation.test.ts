import { describe, expect, it, vi } from 'vitest';
import {
  buildAbsoluteRouteUrl,
  buildDiscoverPath,
  isInternalDiscoverRoute,
  navigateToRouteWithScrollReset,
  resolveNavigationAlias,
} from '../lib/scrollNavigation';

describe('scrollNavigation', () => {
  it('leaves retired route aliases untouched so AppRoutes can 404 them', () => {
    expect(resolveNavigationAlias('/human')).toBe('/human');
    expect(resolveNavigationAlias('/nearby')).toBe('/nearby');
    expect(resolveNavigationAlias('/meet')).toBe('/meet');
    expect(resolveNavigationAlias('/hall')).toBe('/hall');
    expect(resolveNavigationAlias('/social-hall')).toBe('/social-hall');
    expect(resolveNavigationAlias('/agent-connect/social-hall')).toBe('/agent-connect/social-hall');
  });

  it('preserves retired route query and hash without normalizing them', () => {
    expect(resolveNavigationAlias('/human?focusScene=run#top')).toBe('/human?focusScene=run#top');
    expect(resolveNavigationAlias('/hall?tab=match#section')).toBe('/hall?tab=match#section');
  });

  it('builds discover share URLs through canonical route helpers', () => {
    expect(buildDiscoverPath({ filters: { id: 42 } })).toBe('/discover?id=42');
    expect(buildAbsoluteRouteUrl('https://www.ourfitmeet.cn/', '/discover?id=42')).toBe(
      'https://www.ourfitmeet.cn/discover?id=42',
    );
  });

  it('identifies discover routes for scroll-reset path decisioning', () => {
    expect(isInternalDiscoverRoute('/discover')).toBe(true);
    expect(isInternalDiscoverRoute('/discover?city=beijing')).toBe(true);
    expect(isInternalDiscoverRoute('/human')).toBe(false);
    expect(isInternalDiscoverRoute('/social-hall')).toBe(false);
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

    navigateToRouteWithScrollReset(navigate, '/discover', {
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
