import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/users/me/social-profile/privacy
 *
 * Owner-only switches that control whether the user's social profile
 * participates in the matching pool and whether the AI agent may
 * recommend the owner to other users or initiate chats on their behalf.
 *
 * Sensitive-tag decisions are deliberately NOT mutable here — they go
 * through the dedicated social-profile sensitive-tag endpoints so the audit
 * trail is explicit.
 */
export class UpdateProfilePrivacyDto {
  @IsOptional()
  @IsBoolean()
  profileDiscoverable?: boolean;

  @IsOptional()
  @IsBoolean()
  agentCanRecommendMe?: boolean;

  @IsOptional()
  @IsBoolean()
  agentCanStartChatAfterApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  hideSensitiveTags?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  candidateDisplayMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  candidateAvatarVisibility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  candidateCoarseArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactDisclosurePolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preciseLocationPolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  strangerOpenerPolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  strangerInvitePolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  strangerFriendPolicy?: string;

  @IsOptional()
  @IsBoolean()
  ownerConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  matchingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  profileVisibilityConsent?: boolean;
}
