import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for `POST /social-requests/ai-draft`.
 *
 * One free-text field — the user describes (in natural language) the kind of
 * social partner they're looking for. The server combines this with the
 * caller's profile and returns a structured draft (without persisting it),
 * which the frontend renders as an editable form.
 */
export class AiDraftSocialRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  rawText!: string;
}
