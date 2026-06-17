import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../..');

describe('assistant-ui selection toolbar', () => {
  it('keeps quote actions above selected text instead of covering message content', () => {
    const threadSource = readFileSync(
      resolve(repoRoot, 'src/components/assistant-ui/thread.tsx'),
      'utf8',
    );

    expect(threadSource).toContain("data-overlap-policy=\"avoid-message-text\"");
    expect(threadSource).toContain("data-placement=\"above-selection\"");
    expect(threadSource).toContain("data-offset-y=\"14\"");
    expect(threadSource).toContain("translate(-50%, calc(-100% - 14px))");
  });

  it('keeps selected assistant text readable while the toolbar is visible', () => {
    const globalCss = readFileSync(resolve(repoRoot, 'src/global.css'), 'utf8');

    expect(globalCss).toContain("[data-testid='assistant-ui-message'] *::selection");
    expect(globalCss).toContain('background: rgba(0, 115, 230, 0.16);');
    expect(globalCss).toContain('color: #0d0d0d;');
    expect(globalCss).toContain('text-shadow: none;');
  });
});
