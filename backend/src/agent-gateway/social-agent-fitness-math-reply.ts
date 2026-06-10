import { cleanDisplayText } from '../common/display-text.util';

export function socialAgentFitnessMathReply(message: string): string {
  const text = cleanDisplayText(message, '');
  const pace = readDistanceMinutes(text);
  if (pace) {
    const secondsPerKm = Math.round((pace.minutes * 60) / pace.distanceKm);
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = secondsPerKm % 60;
    return `按 ${formatNumber(pace.distanceKm)} 公里、${formatNumber(pace.minutes)} 分钟估算，平均配速约 ${minutes}'${String(seconds).padStart(2, '0')}"/公里。这个结果只做运动节奏参考，不会写入你的画像；如果你告诉我目标距离、目标时间或当前体重，我也可以继续帮你估算训练节奏或粗略热量。`;
  }

  const calories = readCalorieEstimate(text);
  if (calories) {
    return `按 ${formatNumber(calories.weightKg)}kg、${formatNumber(calories.minutes)} 分钟${calories.activityLabel}粗略估算，消耗约 ${calories.kcal} 千卡。不同配速、坡度、心率和个人状态会有明显差异，这里只做非医疗参考，不会写入你的画像。`;
  }

  const bmi = readBmiEstimate(text);
  if (bmi) {
    return `按身高 ${formatNumber(bmi.heightCm)}cm、体重 ${formatNumber(bmi.weightKg)}kg 计算，BMI 约 ${bmi.bmi}，属于${bmi.category}区间。BMI 只适合做粗略参考，不能替代体脂率、围度或医生建议；这次计算不会写入你的画像。`;
  }

  const heartRateZones = readHeartRateZones(text);
  if (heartRateZones) {
    return `按 ${heartRateZones.age} 岁估算，最大心率约 ${heartRateZones.maxHeartRate} 次/分。轻松热身区约 ${heartRateZones.zones.easy}，有氧基础区约 ${heartRateZones.zones.aerobic}，节奏训练区约 ${heartRateZones.zones.tempo}，高强度区约 ${heartRateZones.zones.hard}。心率区间受设备、睡眠、压力和健康状况影响明显，只做非医疗参考。`;
  }

  const trainingLoad = readTrainingLoad(text);
  if (trainingLoad) {
    const distancePart = trainingLoad.weeklyDistanceKm
      ? `每周总距离约 ${formatNumber(trainingLoad.weeklyDistanceKm)} 公里`
      : '';
    const durationPart = trainingLoad.weeklyMinutes
      ? `每周总时长约 ${formatNumber(trainingLoad.weeklyMinutes)} 分钟`
      : '';
    const joined = [distancePart, durationPart].filter(Boolean).join('，');
    return `按每周 ${trainingLoad.sessionsPerWeek} 次、每次${trainingLoad.perSessionLabel}估算，${joined}。如果这是新计划，建议先稳定 2-3 周，再小幅增加训练量；这只是训练节奏参考，不会创建活动或写入画像。`;
  }

  return '可以，我可以做轻量运动计算，比如“5 公里 30 分钟配速是多少”“70kg 跑步 30 分钟大概消耗多少热量”“身高 175cm 体重 70kg BMI 多少”或“30 岁心率区间”。这类计算只给参考结果，不会写入画像，也不会触发找人、发消息或创建活动。';
}

function readDistanceMinutes(
  text: string,
): { distanceKm: number; minutes: number } | null {
  const compact = text.replace(/\s+/g, '');
  const match =
    compact.match(/(\d+(?:\.\d+)?)公里.{0,8}?(\d+(?:\.\d+)?)(?:分钟|分)/) ??
    compact.match(/(\d+(?:\.\d+)?)(?:分钟|分).{0,8}?(\d+(?:\.\d+)?)公里/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const firstIsDistance = compact.includes(`${match[1]}公里`);
  const distanceKm = firstIsDistance ? first : second;
  const minutes = firstIsDistance ? second : first;
  if (distanceKm <= 0 || minutes <= 0) return null;
  return { distanceKm, minutes };
}

function readCalorieEstimate(text: string): {
  weightKg: number;
  minutes: number;
  kcal: number;
  activityLabel: string;
} | null {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  const weightMatch = compact.match(/(\d+(?:\.\d+)?)(?:kg|公斤)/);
  const minutesMatch = compact.match(/(\d+(?:\.\d+)?)(?:分钟|分)/);
  if (
    !weightMatch ||
    !minutesMatch ||
    !/(热量|卡路里|消耗|估算)/i.test(compact)
  ) {
    return null;
  }
  const weightKg = Number(weightMatch[1]);
  const minutes = Number(minutesMatch[1]);
  if (!Number.isFinite(weightKg) || !Number.isFinite(minutes)) return null;
  if (weightKg <= 0 || minutes <= 0) return null;
  const activityLabel = /骑行|单车/.test(compact)
    ? '骑行'
    : /游泳/.test(compact)
      ? '游泳'
      : /走|散步/.test(compact)
        ? '快走'
        : '跑步';
  const met =
    activityLabel === '骑行'
      ? 7.5
      : activityLabel === '游泳'
        ? 8
        : activityLabel === '快走'
          ? 4.3
          : 8.3;
  const kcal = Math.round(met * weightKg * (minutes / 60));
  return { weightKg, minutes, kcal, activityLabel };
}

function readBmiEstimate(text: string): {
  heightCm: number;
  weightKg: number;
  bmi: string;
  category: string;
} | null {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  if (!/(bmi|体重指数)/i.test(compact)) return null;
  const weightMatch = compact.match(/(\d+(?:\.\d+)?)(?:kg|公斤)/);
  const heightMatch =
    compact.match(/(\d+(?:\.\d+)?)(?:cm|厘米|公分)/) ??
    compact.match(/身高(\d(?:\.\d+)?)(?:m|米)?/);
  if (!weightMatch || !heightMatch) return null;
  const weightKg = Number(weightMatch[1]);
  const rawHeight = Number(heightMatch[1]);
  if (!Number.isFinite(weightKg) || !Number.isFinite(rawHeight)) return null;
  const heightCm = rawHeight < 3 ? rawHeight * 100 : rawHeight;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  return {
    heightCm,
    weightKg,
    bmi: bmi.toFixed(1),
    category:
      bmi < 18.5 ? '偏低' : bmi < 24 ? '正常' : bmi < 28 ? '超重' : '偏高',
  };
}

function readHeartRateZones(text: string): {
  age: number;
  maxHeartRate: number;
  zones: {
    easy: string;
    aerobic: string;
    tempo: string;
    hard: string;
  };
} | null {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  if (!/(心率区间|心率zone|心率zones|训练心率)/i.test(compact)) return null;
  const ageMatch = compact.match(/(\d{2})(?:岁|周岁|age)/);
  if (!ageMatch) return null;
  const age = Number(ageMatch[1]);
  if (!Number.isFinite(age) || age < 12 || age > 90) return null;
  const maxHeartRate = 220 - age;
  const zone = (low: number, high: number) =>
    `${Math.round(maxHeartRate * low)}-${Math.round(maxHeartRate * high)} 次/分`;
  return {
    age,
    maxHeartRate,
    zones: {
      easy: zone(0.5, 0.6),
      aerobic: zone(0.6, 0.7),
      tempo: zone(0.7, 0.8),
      hard: zone(0.8, 0.9),
    },
  };
}

function readTrainingLoad(text: string): {
  sessionsPerWeek: number;
  weeklyDistanceKm: number | null;
  weeklyMinutes: number | null;
  perSessionLabel: string;
} | null {
  const compact = text.replace(/\s+/g, '').toLowerCase();
  if (!/(训练量|周跑量|每周|一周)/i.test(compact)) return null;
  const sessionsMatch =
    compact.match(/(?:每周|一周)(\d+(?:\.\d+)?)(?:次|练|跑|骑|游)/) ??
    compact.match(/(?:每周|一周)(?:跑|骑|游|练)(\d+(?:\.\d+)?)次/);
  if (!sessionsMatch) return null;
  const sessionsPerWeek = Number(sessionsMatch[1]);
  if (!Number.isFinite(sessionsPerWeek) || sessionsPerWeek <= 0) return null;

  const distanceMatch = compact.match(/每次(\d+(?:\.\d+)?)(?:公里|km)/);
  const minutesMatch = compact.match(/每次(\d+(?:\.\d+)?)(?:分钟|分)/);
  const parsedDistanceKm = distanceMatch ? Number(distanceMatch[1]) : null;
  const parsedMinutes = minutesMatch ? Number(minutesMatch[1]) : null;
  const distanceKm =
    typeof parsedDistanceKm === 'number' && parsedDistanceKm > 0
      ? parsedDistanceKm
      : null;
  const minutes =
    typeof parsedMinutes === 'number' && parsedMinutes > 0
      ? parsedMinutes
      : null;
  if (distanceKm === null && minutes === null) return null;
  let perSessionLabel: string;
  if (distanceKm !== null) {
    perSessionLabel = `${formatNumber(distanceKm)} 公里`;
  } else if (minutes !== null) {
    perSessionLabel = `${formatNumber(minutes)} 分钟`;
  } else {
    return null;
  }

  return {
    sessionsPerWeek,
    weeklyDistanceKm: distanceKm !== null ? sessionsPerWeek * distanceKm : null,
    weeklyMinutes: minutes !== null ? sessionsPerWeek * minutes : null,
    perSessionLabel,
  };
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
