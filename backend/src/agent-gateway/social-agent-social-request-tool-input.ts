import { sanitizeCity } from '../common/city.util';
import { CreateSocialRequestDto } from '../social-requests/dto/create-social-request.dto';
import { SocialRequestType } from '../social-requests/social-request.entity';
import { AgentTask } from './entities/agent-task.entity';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';

export type SocialAgentSocialRequestToolInput = {
  mode: string | undefined;
  rawText: string;
  dto: CreateSocialRequestDto;
  socialRequestId: number | undefined;
  shouldCreateDraft: boolean;
  shouldCreateFromNaturalLanguage: boolean;
  shouldSyncPublicIntent: boolean;
};

export function buildSocialAgentSocialRequestToolInput(
  task: AgentTask,
  input: Record<string, unknown>,
  toolInput: SocialAgentToolInputParserService,
): SocialAgentSocialRequestToolInput {
  const mode = toolInput.string(input.mode ?? input.intent);
  const rawText =
    toolInput.string(input.rawText ?? input.goal ?? task.goal) ?? task.goal;
  const socialRequestId = toolInput.number(
    input.socialRequestId ?? input.requestId,
  );
  const dto: CreateSocialRequestDto = {
    ...(input as Partial<CreateSocialRequestDto>),
    type: toolInput.socialRequestType(input.type) ?? SocialRequestType.Custom,
    rawText,
    title: toolInput.string(input.title ?? task.title),
    description: toolInput.string(input.description ?? task.goal),
    city: sanitizeCity(input.city),
    radiusKm: toolInput.number(input.radiusKm) ?? undefined,
    activityType: toolInput.string(input.activityType),
    interestTags: toolInput.stringArray(input.interestTags ?? input.tags),
    metadata: {
      ...(toolInput.isRecord(input.metadata) ? input.metadata : {}),
      agentTaskId: task.id,
    },
  };

  return {
    mode,
    rawText,
    dto,
    socialRequestId,
    shouldCreateDraft: mode === 'ai_draft' || mode === 'draft_only',
    shouldCreateFromNaturalLanguage:
      !toolInput.string(input.type) && Boolean(rawText),
    shouldSyncPublicIntent:
      mode === 'publish' ||
      toolInput.bool(input.publish) === true ||
      toolInput.bool(input.syncPublicIntent) === true,
  };
}
