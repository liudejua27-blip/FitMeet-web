import { cleanDisplayText } from '../common/display-text.util';

export function buildCandidateMatchedSignals(input: {
  commonTags: string[];
  dynamicSignalReasons: string[];
}): string[] {
  return uniqueDisplayStrings([
    ...input.commonTags,
    ...input.dynamicSignalReasons,
  ]);
}

function uniqueDisplayStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = cleanDisplayText(value, '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
