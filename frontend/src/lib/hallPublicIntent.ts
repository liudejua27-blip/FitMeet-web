import type { PublicSocialIntent } from '../types';

export function isPublicHallIntent(intent: PublicSocialIntent): boolean {
  return intent.mode === 'public' && intent.status === 'active';
}
