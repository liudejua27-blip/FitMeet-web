import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type { ExtractedProfileFields } from './social-agent-chat.types';

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

export function buildSocialAgentProfileExtractionMessages(
  task: AgentTask,
  sourceMessage: string,
): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You extract FitMeet user profile facts.',
        'Return only one valid JSON object.',
        'Allowed keys: gender, age, heightCm, weightKg, city, school, area, mbti, zodiac, personality, targetPreference, activityType, availableTimes, boundaries.',
        'Use strings or string arrays only. Do not invent missing facts.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        taskId: task.id,
        message: sourceMessage,
        outputSchema: {
          city: 'Qingdao',
          school: 'Qingdao University',
          mbti: 'INFP',
          targetPreference: 'same-school women',
        },
      }),
    },
  ];
}

export function parseSocialAgentProfileExtractionContent(
  content: string,
): ExtractedProfileFields {
  const parsed = JSON.parse(content) as unknown;
  return profileFieldsFromRecord(isRecord(parsed) ? parsed : {});
}

export function profileFieldsFromRecord(
  value: Record<string, unknown>,
): ExtractedProfileFields {
  const fields: ExtractedProfileFields = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      const text = cleanDisplayText(raw, '');
      if (text) fields[key] = text;
      continue;
    }
    if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
      const list = raw
        .map((item) => cleanDisplayText(item, ''))
        .filter(Boolean);
      if (list.length > 0) fields[key] = list;
    }
  }
  return fields;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
