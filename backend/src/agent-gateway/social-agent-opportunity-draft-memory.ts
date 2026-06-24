import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentOpportunityDraft } from './social-agent-opportunity-card-draft';
import {
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { withSocialAgentOpportunityGuard } from './social-agent-opportunity-production-guard';

export function rememberSocialAgentOpportunityDraft(
  task: AgentTask,
  draft: SocialAgentOpportunityDraft,
): void {
  const now = new Date().toISOString();
  const guardedDraft = withSocialAgentOpportunityGuard(draft);
  const memory = record(task.memory);
  const socialAgentChat = record(memory.socialAgentChat);
  const result = record(task.result);
  const chatRun = record(result.chatRun);
  const activityDraft = record(result.activityDraft);

  task.memory = {
    ...memory,
    socialAgentChat: {
      ...socialAgentChat,
      socialRequestDraft: guardedDraft,
      publishStatus: 'draft',
      updatedAt: now,
    },
  };
  task.result = {
    ...result,
    chatRun: {
      ...chatRun,
      socialRequestDraft: guardedDraft,
      publishStatus: 'draft',
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
    },
    activityDraft: {
      ...activityDraft,
      ...guardedDraft,
      visibility: 'draft',
      autoPublished: false,
      publishStatus: 'draft',
      updatedAt: now,
    },
  };
  rememberSocialAgentShortTerm(task, {
    socialRequestDraft: guardedDraft,
    publishStatus: 'draft',
    publicIntentId: null,
    discoverHref: null,
    publicIntentHref: null,
  });
  transitionSocialAgentState(task, 'activity_planning', {
    objective: 'meet_loop',
    nextStep: '等待用户确认是否发布到发现',
    shouldSearchNow: false,
    awaitingSearchConfirmation: false,
    waitingFor: 'publish_confirmation',
    lastCompletedStep: 'activity_draft_created',
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
