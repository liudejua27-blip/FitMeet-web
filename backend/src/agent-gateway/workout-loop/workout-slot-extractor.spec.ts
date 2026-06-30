import {
  defaultWorkoutSafetyBoundary,
  extractWorkoutSlots,
  validateWorkoutSlots,
  validateWorkoutSlotsForPublish,
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

  it('extracts screenshot workout wording without matching an empty time string', () => {
    const slots = extractWorkoutSlots({
      message: '我想在青岛大学找个搭子，健身，明天晚上',
    });

    expect(slots).toMatchObject({
      activityType: '健身',
      timePreference: '明天晚上',
      locationText: expect.stringContaining('青岛大学'),
      city: '青岛',
    });
    expect(validateWorkoutSlots(slots)).toEqual({ valid: true, missing: [] });
  });

  it('extracts direct publish workout card wording from the production failure case', () => {
    const slots = extractWorkoutSlots({
      message:
        '我想发布约练，我明天在北京大学有一场篮球赛，想找个朋友一块，最好是男生，明天下午3点',
    });

    expect(slots).toMatchObject({
      activityType: '篮球',
      timePreference: '明天下午3点',
      locationText: '北京大学',
      city: '北京',
      candidatePreference: '男生',
      safetyBoundary: defaultWorkoutSafetyBoundary(),
      visibilityPreference: 'public',
    });
    expect(validateWorkoutSlots(slots)).toEqual({ valid: true, missing: [] });
  });

  it('supports non-Qingdao city and night run wording', () => {
    const slots = extractWorkoutSlots({
      message: '苏州金鸡湖夜跑',
    });

    expect(slots).toMatchObject({
      activityType: '跑步',
      timePreference: '夜间',
      locationText: '苏州金鸡湖',
      city: '苏州',
    });
  });

  it('does not invent Qingdao when a local POI has no city signal', () => {
    const slots = extractWorkoutSlots({
      message: '明晚陆家嘴健身',
    });

    expect(slots).toMatchObject({
      activityType: '健身',
      timePreference: '明晚',
    });
    expect(slots.city).toBeUndefined();
    expect(slots.locationText).toBeUndefined();
    expect(validateWorkoutSlots(slots)).toEqual({
      valid: false,
      missing: ['locationText'],
    });
    expect(
      validateWorkoutSlotsForPublish({
        ...slots,
        locationText: '陆家嘴附近',
      }),
    ).toEqual({
      valid: false,
      missing: ['city'],
    });
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
