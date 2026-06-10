export const publicWebsiteRoutes = [
  '/',
  '/legacy-home',
  '/discover',
  '/features',
  '/ecosystem',
  '/download',
  '/app',
  '/demo',
  '/developers',
  '/developers/social-skills',
  '/safety',
  '/about',
  '/contact',
  '/life-graph',
  '/profile/life-graph',
  '/admin/waitlist',
  '/admin/agent-l5',
  '/login',
] as const;

export const agentWorkspaceRoutePrefixes = ['/agent'] as const;
export const agentOnboardingRoutePrefixes = ['/agent-connect'] as const;

export const socialFeedRoutePrefixes = [
  '/activity',
  '/social-requests',
  '/messages',
  '/notifications',
  '/profile',
  '/user',
  '/topic',
] as const;

export function isPublicWebsiteRoute(pathname: string): boolean {
  return publicWebsiteRoutes.includes(pathname as (typeof publicWebsiteRoutes)[number]);
}

export function isAgentWorkspaceRoute(pathname: string): boolean {
  return pathMatchesPrefixes(pathname, agentWorkspaceRoutePrefixes);
}

export function isAgentOnboardingRoute(pathname: string): boolean {
  return pathMatchesPrefixes(pathname, agentOnboardingRoutePrefixes);
}

export function isSocialFeedRoute(pathname: string): boolean {
  return pathMatchesPrefixes(pathname, socialFeedRoutePrefixes);
}

export function usesFullBleedExperience(pathname: string): boolean {
  return (
    isPublicWebsiteRoute(pathname) ||
    isAgentWorkspaceRoute(pathname) ||
    isAgentOnboardingRoute(pathname)
  );
}

function pathMatchesPrefixes(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
