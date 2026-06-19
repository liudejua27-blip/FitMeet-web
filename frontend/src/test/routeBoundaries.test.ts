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
    expect(isPublicWebsiteRoute('/features')).toBe(true);
    expect(isPublicWebsiteRoute('/download')).toBe(true);
    expect(isPublicWebsiteRoute('/contact')).toBe(true);
    expect(isPublicWebsiteRoute('/developers/social-skills')).toBe(true);
    expect(isPublicWebsiteRoute('/admin/agent-l5')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent/chat/123')).toBe(true);
    expect(usesFullBleedExperience('/agent/settings')).toBe(true);
  });

  it('treats discover as a public website experience', () => {
    expect(isPublicWebsiteRoute('/discover')).toBe(true);
    expect(isSocialFeedRoute('/discover')).toBe(false);
    expect(isSocialFeedRoute('/hall')).toBe(false);
    expect(isSocialFeedRoute('/meet/42')).toBe(false);
    expect(usesFullBleedExperience('/discover')).toBe(true);
  });
});
