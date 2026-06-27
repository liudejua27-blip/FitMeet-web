export function buildExplanationTemplate(input: {
  scoreBreakdown: Record<string, number>;
  city?: string | null;
  commonTags?: string[];
  timePreference?: string | null;
}): { explanationSteps: string[]; whyYouMayLike: string } {
  const steps: string[] = [];
  const score = input.scoreBreakdown;
  if ((score.reciprocity ?? score.preferenceFit ?? 0) > 0) {
    steps.push('你们的活动偏好和互动目标比较一致，适合先从低压力沟通开始。');
  }
  if ((score.freshness ?? 0) > 0) {
    steps.push('TA 最近有公开可发现的活动信号，回复和成行概率更高。');
  }
  if ((score.diversity ?? 0) > 0) {
    steps.push('我做了多样化排序，避免只反复推荐同一种类型的人。');
  }
  if ((score.time ?? 0) > 0 || input.timePreference) {
    steps.push(
      input.timePreference
        ? `时间上接近你提到的「${input.timePreference}」。`
        : '时间偏好比较接近。',
    );
  }
  if ((score.distance ?? 0) > 0 || input.city) {
    steps.push(
      input.city
        ? `地点上优先选择了${input.city}附近、适合公共场所见面的候选。`
        : '地点上更适合从公共场所见面开始。',
    );
  }
  if (steps.length === 0) {
    steps.push('我按活动、时间、地点和安全边界综合排序后，把 TA 放在前面。');
  }
  const tags = (input.commonTags ?? []).slice(0, 2).join('、');
  const whyYouMayLike = tags
    ? `推荐 TA 是因为你们都提到了「${tags}」，并且当前约练条件更容易安全推进。`
    : steps[0];
  return { explanationSteps: steps.slice(0, 4), whyYouMayLike };
}
