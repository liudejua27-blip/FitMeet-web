import {
  redactSensitiveText,
  redactSensitiveValue,
  REDACTED_VALUE,
} from '../common/privacy-redaction.util';
import {
  LifeGraphDataTier,
  LifeGraphFieldCategory,
  LifeGraphSignalType,
} from './life-graph.enums';

const USER_SECRET_KEYS = new Set([
  'contactSharing',
  'contactSharingRequiresApproval',
  'paymentBoundary',
  'paymentAutoExecution',
  'privacyBoundary',
]);

const SENSITIVE_KEYS = new Set([
  'birthDate',
  'preciseLocationSharing',
  'healthDataEnabled',
  'periodCycleEnabled',
  'unacceptableBehaviors',
  'rejectRules',
]);

const PRIVATE_MATCHING_KEYS = new Set([
  'ageRange',
  'gender',
  'region',
  'timezone',
  'availableTimes',
  'weekendAvailability',
  'activeHours',
  'activityRadius',
  'acceptsNightMeet',
  'preferredMeetingTime',
  'preferredPeople',
  'relationshipGoal',
  'preferredSocialStyle',
  'nearbyArea',
  'company',
  'school',
  'requiresStrictConfirmation',
  'publicPlaceOnly',
  'realNameRequired',
]);

export function classifyLifeGraphField(input: {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  signalType?: LifeGraphSignalType | null;
}): LifeGraphDataTier {
  if (
    input.category === LifeGraphFieldCategory.PrivacyBoundary ||
    USER_SECRET_KEYS.has(input.fieldKey)
  ) {
    return LifeGraphDataTier.UserSecret;
  }
  if (
    input.signalType === LifeGraphSignalType.Sensitive ||
    SENSITIVE_KEYS.has(input.fieldKey)
  ) {
    return LifeGraphDataTier.Sensitive;
  }
  if (
    input.category === LifeGraphFieldCategory.InteractionMemory ||
    PRIVATE_MATCHING_KEYS.has(input.fieldKey)
  ) {
    return LifeGraphDataTier.PrivateMatching;
  }
  return LifeGraphDataTier.PublicProfile;
}

export function shouldExposeInMatching(dataTier: LifeGraphDataTier): boolean {
  return (
    dataTier === LifeGraphDataTier.PublicProfile ||
    dataTier === LifeGraphDataTier.PrivateMatching
  );
}

export function redactLifeGraphValueForTier(
  value: unknown,
  dataTier: LifeGraphDataTier,
): unknown {
  if (dataTier === LifeGraphDataTier.UserSecret) return REDACTED_VALUE;
  if (dataTier === LifeGraphDataTier.Sensitive) {
    return redactSensitiveValue(value);
  }
  if (typeof value === 'string') return redactSensitiveText(value);
  return redactSensitiveValue(value);
}
