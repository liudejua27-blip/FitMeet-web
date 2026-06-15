import type { NavigateFunction, NavigateOptions } from 'react-router-dom';

export const DISCOVER_PATH = '/discover';
const DISCOVER_SCROLL_STATE_KEY = '__fitmeet_scroll_top_on_navigate';
export const DISCOVER_ALIAS_ROUTES = [
  '/human',
  '/nearby',
  '/meet',
  '/hall',
  '/social-hall',
  '/agent-connect/social-hall',
];

export const ENTRY_ALIAS_ROUTES: Record<string, string> = {
  ...Object.fromEntries(DISCOVER_ALIAS_ROUTES.map((path) => [path, DISCOVER_PATH])),
  '/app': '/download',
  '/app/': '/download',
  '/download-app': '/download',
  '/download-app/': '/download',
};

type ScrollBehaviorValue = ScrollBehavior;

type DiscoverPathFilters = Record<string, string | number | boolean | undefined>;

export type DiscoverNavigationState = {
  [DISCOVER_SCROLL_STATE_KEY]: true;
  [key: string]: unknown;
};

export type DiscoverNavigationOptions = {
  focusScene?: string;
  filters?: DiscoverPathFilters;
  state?: Record<string, unknown>;
  replace?: boolean;
  search?: string;
  behavior?: ScrollBehaviorValue;
};

export type NavigateWithScrollResetOptions = Omit<NavigateOptions, 'state'> & {
  state?: Record<string, unknown>;
  search?: string;
  scrollBehavior?: ScrollBehaviorValue;
  shouldResetScroll?: boolean;
};

export const normalizeRoutePath = (target: string) => {
  const withoutHash = target.split('#')[0] ?? '';
  const path = withoutHash.split('?')[0] ?? '';

  if (!path || path === '/') {
    return path;
  }

  return path.endsWith('/') ? path.slice(0, -1) : path;
};

type ParsedRoute = {
  path: string;
  query: string;
  hash: string;
};

export const parseRoutePath = (target: string): ParsedRoute => {
  const [pathWithQuery, hash = ''] = target.split('#');
  const [path, query = ''] = pathWithQuery.split('?');

  return {
    path: normalizeRoutePath(path),
    query: query ? `?${query}` : '',
    hash: hash ? `#${hash}` : '',
  };
};

export const isInternalDiscoverRoute = (target: string) => {
  const { path } = parseRoutePath(resolveNavigationAlias(target));

  if (path === DISCOVER_PATH) {
    return true;
  }

  return path.startsWith(`${DISCOVER_PATH}/`);
};

const buildQueryParams = (search = '', filters?: DiscoverPathFilters) => {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      params.set(key, String(value));
    });
  }

  return params;
};

export const scrollToTopBeforeNavigate = (behavior: ScrollBehaviorValue = 'auto') => {
  if (typeof window === 'undefined') {
    return;
  }

  window.requestAnimationFrame(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior,
    });
  });
};

export const resolveNavigationAlias = (target: string) => {
  const { path, query, hash } = parseRoutePath(target);

  if (!path.startsWith('/')) {
    return target;
  }

  const canonicalPath = ENTRY_ALIAS_ROUTES[path] || path;
  if (canonicalPath === path) {
    return target;
  }

  return `${canonicalPath}${query}${hash}`;
};

export const buildDiscoverPath = (options?: {
  focusScene?: string;
  filters?: DiscoverPathFilters;
  search?: string;
}) => {
  const searchParams = buildQueryParams(options?.search, options?.filters);
  if (options?.focusScene) {
    searchParams.set('focusScene', options.focusScene);
  }

  const query = searchParams.toString();
  if (!query) {
    return DISCOVER_PATH;
  }

  return `${DISCOVER_PATH}?${query}`;
};

export const buildAbsoluteRouteUrl = (origin: string, target: string) => {
  const normalizedOrigin = origin.replace(/\/$/, '');
  const resolvedTarget = resolveNavigationAlias(target);

  if (!resolvedTarget.startsWith('/')) {
    return resolvedTarget;
  }

  return `${normalizedOrigin}${resolvedTarget}`;
};

const appendSearchToTarget = (target: string, search?: string) => {
  if (!search) {
    return target;
  }

  const normalizedSearch = search.startsWith('?') ? search.slice(1) : search;
  if (!normalizedSearch) {
    return target;
  }

  const { path, query, hash } = parseRoutePath(target);
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const extraParams = new URLSearchParams(normalizedSearch);
  extraParams.forEach((value, key) => {
    params.set(key, value);
  });

  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
};

export const navigateWithScrollReset = (
  navigate: NavigateFunction,
  to: string,
  options: NavigateWithScrollResetOptions = {},
) => {
  const { scrollBehavior = 'auto', shouldResetScroll = true, state, search, ...navigateOptions } = options;
  const resolvedTo = appendSearchToTarget(resolveNavigationAlias(to), search);

  if (shouldResetScroll) {
    scrollToTopBeforeNavigate(scrollBehavior);
  }

  const nextState = shouldResetScroll
    ? {
        ...(state || {}),
        [DISCOVER_SCROLL_STATE_KEY]: true,
      }
    : state;

  navigate(resolvedTo, {
    ...navigateOptions,
    state: nextState,
  });
};

export const navigateToRouteWithScrollReset = (
  navigate: NavigateFunction,
  to: string,
  options: Omit<NavigateWithScrollResetOptions, 'shouldResetScroll'> & {
    shouldResetScroll?: boolean;
  } = {},
) => {
  const { shouldResetScroll, ...rest } = options;
  const resolvedTo = resolveNavigationAlias(to);
  navigateWithScrollReset(navigate, to, {
    ...rest,
    shouldResetScroll: shouldResetScroll ?? isInternalDiscoverRoute(resolvedTo),
  });
  return resolvedTo;
};

export const navigateToDiscoverWithScrollReset = (
  navigate: NavigateFunction,
  options: DiscoverNavigationOptions = {},
) => {
  const {
    focusScene,
    filters,
    state,
    replace = false,
    search = '',
    behavior = 'auto',
  } = options;

  const target = buildDiscoverPath({
    focusScene,
    filters,
    search,
  });

  navigateWithScrollReset(navigate, target, {
    replace,
    state,
    scrollBehavior: behavior,
  });

  return target;
};
