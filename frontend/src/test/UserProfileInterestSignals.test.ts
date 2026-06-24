import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('User profile interest signals', () => {
  it('records profile views and dwell time for recommendation learning', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/UserProfilePage.tsx'), 'utf8');

    expect(source).toContain('recordInterestEvent');
    expect(source).toContain("eventType: 'view_profile'");
    expect(source).toContain("source: 'user_profile_page'");
    expect(source).toContain("source: 'user_profile_dwell'");
    expect(source).toContain('dwellMs');
    expect(source).toContain('8000');
  });
});
