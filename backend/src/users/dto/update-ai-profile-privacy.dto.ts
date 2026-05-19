import { IsBoolean, IsOptional } from 'class-validator';

/**
 * PATCH /api/ai-profile/privacy
 *
 * Owner-only switches that control whether the user's social profile
 * participates in the matching pool and whether the AI agent may
 * recommend the owner to other users or initiate chats on their behalf.
 *
 * Sensitive-tag decisions are deliberately NOT mutable here — they go
 * through the dedicated /sensitive-tags/confirm|reject endpoints so the
 * audit trail is explicit.
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
}
