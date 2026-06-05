import { describe, expect, it } from 'vitest';
import {
  isAgentWorkspaceRoute,
  isPublicWebsiteRoute,
  isSocialFeedRoute,
  usesFullBleedExperience,
} from '../routes/routeBoundaries';

describe('route boundaries', () => {
  it('keeps the public website and Agent workspace full-bleed', () => {
    expect(isPublicWebsiteRoute('/')).toBe(true);
    expect(isPublicWebsiteRoute('/developers/social-skills')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent/chat/123')).toBe(true);
    expect(usesFullBleedExperience('/agent/settings')).toBe(true);
  });

  it('keeps the real social feed inside the app shell', () => {
    expect(isSocialFeedRoute('/hall')).toBe(true);
    expect(isSocialFeedRoute('/discover')).toBe(true);
    expect(isSocialFeedRoute('/meet/42')).toBe(true);
    expect(usesFullBleedExperience('/hall')).toBe(false);
    expect(usesFullBleedExperience('/discover')).toBe(false);
  });
});
