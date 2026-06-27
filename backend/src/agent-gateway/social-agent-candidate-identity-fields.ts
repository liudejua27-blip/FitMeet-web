import { cleanDisplayText } from '../common/display-text.util';

type CandidateIdentityUser = {
  id: number;
  avatar?: unknown;
  color?: unknown;
  updatedAt?: Date | null;
};

export type CandidateIdentityFields = {
  targetUserId: number;
  candidateUserId: number;
  userId: number;
  displayName: string;
  nickname: string;
  avatar: string;
  color: string;
  city: string;
  updatedAt: string | null;
};

export function buildCandidateIdentityFields(input: {
  user: CandidateIdentityUser;
  displayName: string;
  city: string;
  avatar?: string;
}): CandidateIdentityFields {
  return {
    targetUserId: input.user.id,
    candidateUserId: input.user.id,
    userId: input.user.id,
    displayName: input.displayName,
    nickname: input.displayName,
    avatar: cleanDisplayText(input.avatar ?? input.user.avatar, ''),
    color: cleanDisplayText(input.user.color, '#202124'),
    city: input.city,
    updatedAt: input.user.updatedAt ? input.user.updatedAt.toISOString() : null,
  };
}
