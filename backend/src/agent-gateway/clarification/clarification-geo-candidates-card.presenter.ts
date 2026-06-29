import type { GeoCandidate } from '../geo/geo-resolver.types';
import type {
  FitMeetAlphaCard,
  FitMeetAlphaCardAction,
} from '../fitmeet-alpha-agent.types';

export function buildClarificationGeoCandidatesCard(input: {
  taskId: number;
  questionKey: string;
  title?: string;
  body: string;
  inferredIntent?: 'workout' | 'friend' | 'travel' | 'profile';
  inferredSlots?: Record<string, unknown>;
  candidates: GeoCandidate[];
  noFallback?:
    | 'workout_intake'
    | 'friend_intake'
    | 'travel_intake'
    | 'casual_chat';
}): FitMeetAlphaCard {
  const candidates = input.candidates.slice(0, 5);
  const selectActions: FitMeetAlphaCardAction[] = candidates.map(
    (candidate, index): FitMeetAlphaCardAction => {
      const selectedPatch = candidateToSelectedPatch(candidate);
      return {
        id: `select_${index + 1}`,
        label: candidateLabel(candidate),
        action: 'clarification.select',
        schemaAction: 'clarification.select',
        requiresConfirmation: false,
        payload: {
          taskId: input.taskId,
          questionKey: input.questionKey,
          inferredIntent: input.inferredIntent,
          inferredSlots: input.inferredSlots ?? {},
          selectedIndex: index,
          selectedCandidate: candidate,
          selectedPatch,
          noFallback: input.noFallback ?? 'workout_intake',
        },
      };
    },
  );
  const actions: FitMeetAlphaCardAction[] = [
    ...selectActions,
    {
      id: 'manual',
      label: '都不是，我自己填写',
      action: 'clarification.no',
      schemaAction: 'clarification.no',
      requiresConfirmation: false,
      payload: {
        taskId: input.taskId,
        questionKey: input.questionKey,
        noFallback: input.noFallback ?? 'workout_intake',
      },
    },
  ];

  return {
    id: `clarification_geo:${input.questionKey}:${input.taskId}`,
    type: 'clarification_geo_candidates',
    schemaVersion: 'fitmeet.tool-ui.v1',
    schemaType: 'clarification.geo_candidates',
    title: input.title ?? '选择约练地点',
    body: input.body,
    status: 'waiting_confirmation',
    data: {
      taskId: input.taskId,
      questionKey: input.questionKey,
      questionText: input.body,
      inferredIntent: input.inferredIntent,
      inferredSlots: input.inferredSlots ?? {},
      candidates,
      noFallback: input.noFallback ?? null,
    },
    actions,
  };
}

function candidateToSelectedPatch(candidate: GeoCandidate) {
  const locationText = [candidate.city, candidate.district, candidate.name]
    .filter(Boolean)
    .join('');
  return {
    locationText: locationText || candidate.name,
    city: candidate.city ?? null,
    district: candidate.district ?? null,
    poiName: candidate.name,
    lat: candidate.lat ?? null,
    lng: candidate.lng ?? null,
    geoResolution: {
      rawText: candidate.name,
      locationText: locationText || candidate.name,
      city: candidate.city ?? null,
      district: candidate.district ?? null,
      poiName: candidate.name,
      province: candidate.province ?? null,
      lat: candidate.lat ?? null,
      lng: candidate.lng ?? null,
      source: 'user_confirmed',
      confidence: 1,
      needsConfirmation: false,
      candidates: [candidate],
    },
  };
}

function candidateLabel(candidate: GeoCandidate) {
  return [candidate.city, candidate.district, candidate.name]
    .filter(Boolean)
    .join(' · ');
}
