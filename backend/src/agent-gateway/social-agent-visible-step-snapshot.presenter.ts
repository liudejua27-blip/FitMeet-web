import { cleanDisplayText } from '../common/display-text.util';
import type { SocialAgentVisibleStep } from './social-agent-chat.types';

export function normalizeSocialAgentVisibleStepSnapshot(
  value: unknown,
): SocialAgentVisibleStep['snapshot'] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.schemaVersion !== 'fitmeet.step-snapshot.v1') return undefined;
  const observation = Array.isArray(value.observation)
    ? value.observation
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const critique = cleanDisplayText(value.critique, '');
  const result = cleanDisplayText(value.result, '');
  if (observation.length === 0 && !critique && !result) return undefined;
  return {
    schemaVersion: 'fitmeet.step-snapshot.v1',
    observation,
    critique,
    result,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
