export const publicWebsiteRoutes = [
  '/',
  '/discover',
  '/features',
  '/download',
  '/demo',
  '/safety',
  '/about',
  '/admin/safety',
  '/admin/waitlist',
  '/admin/agent-l5',
  '/login',
] as const;

export const agentWorkspaceRoutes = ['/agent', '/agent/profile'] as const;
export const agentWorkspaceRoutePrefixes = ['/agent/chat'] as const;
export const agentOnboardingRoutePrefixes = [] as const;

export const socialInteractionRoutePrefixes = ['/messages', '/user', '/public-intent'] as const;

export function isPublicWebsiteRoute(pathname: string): boolean {
  return publicWebsiteRoutes.includes(pathname as (typeof publicWebsiteRoutes)[number]);
}

export function isAgentWorkspaceRoute(pathname: string): boolean {
  return (
    agentWorkspaceRoutes.includes(pathname as (typeof agentWorkspaceRoutes)[number]) ||
    pathMatchesPrefixes(pathname, agentWorkspaceRoutePrefixes)
  );
}

export function isAgentOnboardingRoute(pathname: string): boolean {
  return pathMatchesPrefixes(pathname, agentOnboardingRoutePrefixes);
}

export function isSocialInteractionRoute(pathname: string): boolean {
  return pathMatchesPrefixes(pathname, socialInteractionRoutePrefixes);
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
