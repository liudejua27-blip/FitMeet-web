import { describe, expect, it } from 'vitest';

import {
  TOOL_UI_CARD_ACTION_COPY,
  TOOL_UI_SCHEMA_ACTIONS,
} from '../components/assistant-ui/tool-ui-action-copy';
import { toolUISchemaActionFromUnknown } from '../components/assistant-ui/tool-ui-schema';

const INTERNAL_WORDING_PATTERN =
  /tool[_\s-]?call|tool[_\s-]?result|traceId|planner|raw JSON|subagent|internal|debug|schema|payload|checkpoint/i;

describe('tool-ui-action-copy', () => {
  it('keeps every supported schema action mapped to product copy', () => {
    expect(TOOL_UI_SCHEMA_ACTIONS.length).toBeGreaterThan(0);

    for (const action of TOOL_UI_SCHEMA_ACTIONS) {
      expect(toolUISchemaActionFromUnknown(action)).toBe(action);
      expect(TOOL_UI_CARD_ACTION_COPY[action]).toMatchObject({
        busy: expect.any(String),
        done: expect.any(String),
        result: expect.any(String),
      });
    }

    expect(Object.keys(TOOL_UI_CARD_ACTION_COPY).sort()).toEqual(
      [...TOOL_UI_SCHEMA_ACTIONS].sort(),
    );
  });

  it('uses user-facing action copy instead of debug or trace language', () => {
    for (const action of TOOL_UI_SCHEMA_ACTIONS) {
      const copy = TOOL_UI_CARD_ACTION_COPY[action];
      const publicCopy = `${copy.busy}\n${copy.done}\n${copy.result}`;

      expect(copy.busy.trim()).toBeTruthy();
      expect(copy.done.trim()).toBeTruthy();
      expect(copy.result.trim()).toBeTruthy();
      expect(publicCopy).not.toMatch(INTERNAL_WORDING_PATTERN);
    }
  });
});
