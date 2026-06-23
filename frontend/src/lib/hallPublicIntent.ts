import type { PublicSocialIntent } from '../types';

export function isPublicHallIntent(intent: PublicSocialIntent): boolean {
  return intent.status === 'active' && !isInternalFixtureIntent(intent);
}

function isInternalFixtureIntent(intent: PublicSocialIntent) {
  return [intent.id, intent.title, intent.description, ...(intent.interestTags ?? [])].some(
    (value) => /agent[_\s-]*smoke|smoke|fixture|seed|mock/i.test(`${value ?? ''}`),
  );
}
