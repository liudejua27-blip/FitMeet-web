import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /api/users/me/social-profile/sensitive-tags/confirm
 * POST /api/users/me/social-profile/sensitive-tags/reject
 *
 * Sensitive-tag confirmation is per-tag. The endpoint identifies the tag
 * by its raw label (the same string stored in
 * `matchSignals.sensitivePrivateTags`).
 */
export class SensitiveTagActionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  tag: string;
}
