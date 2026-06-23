import { describe, expect, it } from 'vitest';
import {
  isAgentWorkspaceRoute,
  isPublicWebsiteRoute,
  isSocialInteractionRoute,
  usesFullBleedExperience,
} from '../routes/routeBoundaries';

describe('route boundaries', () => {
  it('keeps the public website and Agent workspace full-bleed', () => {
    expect(isPublicWebsiteRoute('/')).toBe(true);
    expect(isPublicWebsiteRoute('/features')).toBe(true);
    expect(isPublicWebsiteRoute('/download')).toBe(true);
    expect(isPublicWebsiteRoute('/about')).toBe(true);
    expect(isPublicWebsiteRoute('/contact')).toBe(false);
    expect(isPublicWebsiteRoute('/developers/social-skills')).toBe(false);
    expect(isPublicWebsiteRoute('/admin/safety')).toBe(true);
    expect(isPublicWebsiteRoute('/admin/agent-l5')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent/chat/123')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent/profile')).toBe(true);
    expect(isAgentWorkspaceRoute('/agent/settings')).toBe(false);
    expect(usesFullBleedExperience('/agent/settings')).toBe(false);
  });

  it('treats discover as a public website experience', () => {
    expect(isPublicWebsiteRoute('/discover')).toBe(true);
    expect(isSocialInteractionRoute('/discover')).toBe(false);
    expect(isSocialInteractionRoute('/hall')).toBe(false);
    expect(isSocialInteractionRoute('/meet/42')).toBe(false);
    expect(usesFullBleedExperience('/discover')).toBe(true);
  });
});
