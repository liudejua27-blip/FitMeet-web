import {
  defaultWorkoutSafetyBoundary,
  extractWorkoutSlots,
  validateWorkoutSlots,
} from './workout-slot-extractor';

describe('workout slot extraction', () => {
  it('extracts activity, time, place, city, radius and intensity', () => {
    const slots = extractWorkoutSlots({
      message: '今晚青岛大学附近 5 公里轻松跑步，想找同校一起',
    });

    expect(slots).toMatchObject({
      activityType: '跑步',
      timePreference: '今晚',
      locationText: '青岛大学附近',
      city: '青岛',
      radiusKm: 5,
      intensity: '轻松',
      safetyBoundary: defaultWorkoutSafetyBoundary(),
      visibilityPreference: 'public',
    });
    expect(slots.candidatePreference).toContain('同校');
    expect(validateWorkoutSlots(slots)).toEqual({ valid: true, missing: [] });
  });

  it('merges previous slots and reports missing required fields', () => {
    const slots = extractWorkoutSlots({
      message: '今晚可以',
      previousSlots: { activityType: '羽毛球' },
    });

    expect(slots.activityType).toBe('羽毛球');
    expect(validateWorkoutSlots(slots)).toEqual({
      valid: false,
      missing: ['locationText'],
    });
  });
});
