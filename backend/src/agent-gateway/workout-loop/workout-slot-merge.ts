import type { WorkoutSlots } from './workout-loop.types';

const MERGEABLE_SLOT_KEYS = [
  'activityType',
  'timePreference',
  'locationText',
  'city',
  'district',
  'poiName',
  'radiusKm',
  'intensity',
  'candidatePreference',
] as const;

type MergeableSlotKey = (typeof MERGEABLE_SLOT_KEYS)[number];
type SlotMeta = NonNullable<WorkoutSlots['slotMeta']>[MergeableSlotKey];
type SlotSource = NonNullable<SlotMeta>['source'];

type WorkoutSlotMergeSource = {
  slots?: Partial<WorkoutSlots> | null;
  fallbackSource: SlotSource;
  fallbackConfidence?: number;
};

const SOURCE_PRIORITY: Record<SlotSource, number> = {
  default: 0,
  memory: 10,
  rule: 20,
  llm: 30,
  geo: 40,
  user_confirmed: 50,
  user: 60,
};

export function mergeWorkoutSlotsBySource(
  sources: WorkoutSlotMergeSource[],
): WorkoutSlots {
  const merged: WorkoutSlots = {};
  const slotMeta: NonNullable<WorkoutSlots['slotMeta']> = {};

  for (const key of MERGEABLE_SLOT_KEYS) {
    const selected = selectSlotValue(sources, key);
    if (!selected) continue;
    setSlotValue(merged, key, selected.value);
    slotMeta[key] = selected.meta;
  }

  const geo = selectGeoResolution(sources);
  if (geo) {
    merged.geoResolution = geo;
    if (geo.lat !== undefined) merged.lat = geo.lat;
    if (geo.lng !== undefined) merged.lng = geo.lng;
    for (const key of [
      'locationText',
      'city',
      'district',
      'poiName',
    ] as const) {
      const value = geo[key];
      if (!value) continue;
      const current = slotMeta[key];
      if (!current || SOURCE_PRIORITY[current.source] <= SOURCE_PRIORITY.geo) {
        merged[key] = value;
        slotMeta[key] = { source: 'geo', confidence: geo.confidence };
      }
    }
  } else {
    const latestLatLng = [...sources]
      .reverse()
      .map((source) => source.slots)
      .find((slots) => slots?.lat !== undefined || slots?.lng !== undefined);
    if (latestLatLng?.lat !== undefined) merged.lat = latestLatLng.lat;
    if (latestLatLng?.lng !== undefined) merged.lng = latestLatLng.lng;
  }

  for (const source of sources) {
    if (!source.slots) continue;
    if (source.slots.safetyBoundary !== undefined) {
      merged.safetyBoundary = source.slots.safetyBoundary;
    }
    if (source.slots.visibilityPreference !== undefined) {
      merged.visibilityPreference = source.slots.visibilityPreference;
    }
  }

  if (Object.keys(slotMeta).length > 0) merged.slotMeta = slotMeta;
  return merged;
}

function selectSlotValue(
  sources: WorkoutSlotMergeSource[],
  key: MergeableSlotKey,
): {
  value: NonNullable<WorkoutSlots[MergeableSlotKey]>;
  meta: NonNullable<SlotMeta>;
} | null {
  return (
    sources
      .map((source, order) => {
        const value = source.slots?.[key];
        if (value === undefined || value === null || value === '') return null;
        const meta = source.slots?.slotMeta?.[key] ?? {
          source: source.fallbackSource,
          confidence: source.fallbackConfidence ?? defaultConfidence(source),
        };
        return {
          value: value as NonNullable<WorkoutSlots[MergeableSlotKey]>,
          meta,
          order,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> =>
        Boolean(candidate),
      )
      .sort((left, right) => compareSlotCandidate(left, right))[0] ?? null
  );
}

function selectGeoResolution(
  sources: WorkoutSlotMergeSource[],
): WorkoutSlots['geoResolution'] | undefined {
  return sources
    .map((source, order) => {
      const geo = source.slots?.geoResolution;
      if (!geo) return null;
      const sourceName: SlotSource =
        geo.source === 'user_confirmed'
          ? 'user_confirmed'
          : geo.source === 'unknown'
            ? source.fallbackSource
            : 'geo';
      return {
        geo,
        source: sourceName,
        confidence: geo.confidence,
        order,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    )
    .sort((left, right) => compareRank(left, right))[0]?.geo;
}

function compareSlotCandidate(
  left: {
    meta: NonNullable<SlotMeta>;
    order: number;
  },
  right: {
    meta: NonNullable<SlotMeta>;
    order: number;
  },
) {
  return compareRank(
    {
      source: left.meta.source,
      confidence: left.meta.confidence,
      order: left.order,
    },
    {
      source: right.meta.source,
      confidence: right.meta.confidence,
      order: right.order,
    },
  );
}

function compareRank(
  left: { source: SlotSource; confidence: number; order: number },
  right: { source: SlotSource; confidence: number; order: number },
) {
  return (
    SOURCE_PRIORITY[right.source] - SOURCE_PRIORITY[left.source] ||
    safeConfidence(right.confidence) - safeConfidence(left.confidence) ||
    right.order - left.order
  );
}

function defaultConfidence(source: WorkoutSlotMergeSource): number {
  switch (source.fallbackSource) {
    case 'user':
      return 0.95;
    case 'user_confirmed':
      return 1;
    case 'geo':
      return 0.85;
    case 'llm':
      return 0.78;
    case 'rule':
      return 0.68;
    case 'memory':
      return 0.5;
    case 'default':
      return 0.1;
  }
}

function safeConfidence(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}

function setSlotValue(
  slots: WorkoutSlots,
  key: MergeableSlotKey,
  value: NonNullable<WorkoutSlots[MergeableSlotKey]>,
) {
  (slots as Record<MergeableSlotKey, unknown>)[key] = value;
}
