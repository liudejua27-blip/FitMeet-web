import { UpdateSocialProfileDto } from '../users/dto/update-social-profile.dto';

export type SocialAgentProfileContextPatch = {
  dto: UpdateSocialProfileDto;
  extractedProfile: Record<string, unknown>;
  updatedFields: string[];
  memoryFields: string[];
  missingFields: string[];
  sourceMessage: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function trimmedStringList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw
    .map((item) => trimmedString(item))
    .filter((item): item is string => Boolean(item));
}

function setDtoField(
  dto: UpdateSocialProfileDto,
  field: keyof UpdateSocialProfileDto,
  value: unknown,
): void {
  (dto as Record<string, unknown>)[field] = value;
}

export function buildSocialAgentProfileContextPatch(
  input: Record<string, unknown>,
): SocialAgentProfileContextPatch {
  const extractedProfile = isRecord(input.extractedProfile)
    ? input.extractedProfile
    : {};
  const sourceMessage = trimmedString(input.sourceMessage) ?? '';
  const dto: UpdateSocialProfileDto = {};
  const updatedFields: string[] = [];
  const memoryFields: string[] = [];
  const missingFields: string[] = [];
  const setString = (field: keyof UpdateSocialProfileDto, value: unknown) => {
    const text = trimmedString(value);
    if (!text) return;
    setDtoField(dto, field, text);
    updatedFields.push(field);
  };
  const setList = (field: keyof UpdateSocialProfileDto, value: unknown) => {
    const list = trimmedStringList(value);
    if (list.length === 0) return;
    setDtoField(dto, field, list);
    updatedFields.push(field);
  };

  setString('gender', extractedProfile.gender);
  setString('ageRange', extractedProfile.ageRange);
  setString('city', extractedProfile.city);
  setString('nearbyArea', extractedProfile.nearbyArea);
  setString('zodiac', extractedProfile.zodiac);
  setString('mbti', extractedProfile.mbti);
  setList('traits', extractedProfile.traits ?? extractedProfile.personality);
  setList('interestTags', extractedProfile.interestTags);
  setList('availableTimes', extractedProfile.availableTimes);
  setList(
    'wantToMeet',
    extractedProfile.wantToMeet ?? extractedProfile.socialGoal,
  );
  setList(
    'preferredTraits',
    extractedProfile.preferredTraits ?? extractedProfile.targetPreference,
  );
  setString('rejectRules', extractedProfile.rejectRules);
  setString('privacyBoundary', extractedProfile.privacyBoundary);

  const supplemental: Record<string, unknown> = {};
  for (const field of [
    'height',
    'weight',
    'school',
    'targetPreference',
    'socialGoal',
  ]) {
    const value = extractedProfile[field];
    if (value === undefined || value === null || value === '') continue;
    supplemental[field] = value;
    memoryFields.push(field);
  }

  if (Object.keys(supplemental).length > 0 || sourceMessage) {
    dto.matchSignals = {
      agentProfileMemory: supplemental,
      sourceMessage,
      updatedAt: new Date().toISOString(),
    };
    updatedFields.push('matchSignals');
  }

  for (const field of [
    'availableTimes',
    'privacyBoundary',
    'interestTags',
    'wantToMeet',
  ]) {
    if (!updatedFields.includes(field)) missingFields.push(field);
  }

  return {
    dto,
    extractedProfile,
    updatedFields,
    memoryFields,
    missingFields,
    sourceMessage,
  };
}
