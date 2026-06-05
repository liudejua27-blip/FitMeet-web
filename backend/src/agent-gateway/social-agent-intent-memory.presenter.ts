import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentIntentRouterResult,
  SocialAgentIntentType,
} from './social-agent-intent-router.service';
import {
  mergeSocialAgentActiveEntities,
  mergeSocialAgentBoundaries,
  mergeSocialAgentPreferences,
  readSocialAgentTaskMemory,
  writeSocialAgentTaskMemory,
} from './social-agent-memory.util';

export function applySocialAgentTaskMemoryForIntent(
  task: AgentTask,
  message: string,
  route: SocialAgentIntentRouterResult,
): void {
  const entities = route.entities ?? {};
  switch (route.intent) {
    case 'profile_update':
      mergeSocialAgentPreferences(task, message);
      break;
    case 'safety_or_boundary':
      mergeSocialAgentBoundaries(task, message);
      break;
    case 'social_search':
    case 'activity_search':
      mergeSocialAgentActiveEntities(task, entities, message);
      break;
    case 'candidate_followup':
      rejectCurrentRecommendationsWhenUserAsksForFreshBatch(
        task,
        message,
        route,
      );
      break;
    case 'action_request':
    case 'casual_chat':
    case 'product_help':
    case 'workflow_help':
    case 'profile_enrichment':
    case 'profile_enrichment_request':
    case 'correction_or_clarification':
    case 'unknown':
    default:
      break;
  }
}

export function profileKeyForSocialAgentIntent(
  intent: SocialAgentIntentType,
  message: string,
): string | null {
  if (intent === 'safety_or_boundary') {
    if (
      /(隐私|手机号|微信|地址|住址|单位|自动发|自动联系|夜间|晚上|男生|女生|不要|别|不想|不喜欢)/i.test(
        message,
      )
    ) {
      return 'avoidTraits';
    }
    return 'privacyBoundary';
  }
  if (intent !== 'profile_update') return null;
  if (
    /(慢热|外向|内向|主动|被动|真诚|社恐|话少|话多|安静|活泼)/i.test(message)
  ) {
    return 'traits';
  }
  if (/(时间|周末|工作日|晚上|白天|早上|下午|今晚|明天)/i.test(message)) {
    return 'availableTimes';
  }
  if (/(想认识|希望认识|偏好|更看重|喜欢.*的人)/i.test(message)) {
    return 'preferredTraits';
  }
  if (/(不喜欢|不接受|不要|拒绝|避开)/i.test(message)) {
    return 'avoidTraits';
  }
  return 'interestTags';
}

function rejectCurrentRecommendationsWhenUserAsksForFreshBatch(
  task: AgentTask,
  message: string,
  route: SocialAgentIntentRouterResult,
): void {
  if (
    !route.shouldReplan &&
    !/(换一批|再来几个|不喜欢这些|换人|不合适|不喜欢这个类型|不想要这个类型|这个类型不行)/.test(
      message,
    )
  ) {
    return;
  }

  const memory = readSocialAgentTaskMemory(task);
  const recommended = memory.candidateState.recommendedIds;
  if (recommended.length === 0) return;
  memory.candidateState.rejectedIds = Array.from(
    new Set([...memory.candidateState.rejectedIds, ...recommended]),
  ).slice(-80);
  memory.candidateState.recommendedIds = [];
  writeSocialAgentTaskMemory(task, memory);
}
