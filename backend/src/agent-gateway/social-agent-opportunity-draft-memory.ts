import type { AgentTask } from './entities/agent-task.entity';
import type { SocialAgentOpportunityDraft } from './social-agent-opportunity-card-draft';
import {
  rememberSocialAgentShortTerm,
  transitionSocialAgentState,
} from './social-agent-memory.util';
import { withSocialAgentOpportunityGuard } from './social-agent-opportunity-production-guard';

/**
 * @deprecated Legacy opportunity draft memory.
 *
 * New loop memory should live under the loop-specific task memory namespace,
 * such as `task.memory.workoutLoop`.
 */
export type SocialAgentOpportunityDraftClarification = {
  status: 'collecting_slots';
  missing: string[];
  sourceText: string;
  updatedAt: string;
};

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
      pendingOpportunityDraft: null,
      publishStatus: 'draft',
      updatedAt: now,
    },
  };
  task.result = {
    ...result,
    chatRun: {
      ...chatRun,
      socialRequestDraft: guardedDraft,
      pendingOpportunityDraft: null,
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

export function rememberSocialAgentOpportunityDraftClarification(
  task: AgentTask,
  input: { missing: string[]; sourceText: string },
): void {
  const now = new Date().toISOString();
  const pending: SocialAgentOpportunityDraftClarification = {
    status: 'collecting_slots',
    missing: input.missing,
    sourceText: input.sourceText,
    updatedAt: now,
  };
  const memory = record(task.memory);
  const socialAgentChat = record(memory.socialAgentChat);
  const result = record(task.result);
  const chatRun = record(result.chatRun);

  task.memory = {
    ...memory,
    socialAgentChat: {
      ...socialAgentChat,
      pendingOpportunityDraft: pending,
      publishStatus: 'collecting_slots',
      updatedAt: now,
    },
  };
  task.result = {
    ...result,
    chatRun: {
      ...chatRun,
      pendingOpportunityDraft: pending,
      publishStatus: 'collecting_slots',
    },
  };
  rememberSocialAgentShortTerm(task, {
    pendingOpportunityDraft: pending,
    publishStatus: 'collecting_slots',
  });
  transitionSocialAgentState(task, 'activity_planning', {
    objective: 'meet_loop',
    nextStep: `等待用户补充：${input.missing.join('、')}`,
    shouldSearchNow: false,
    awaitingSearchConfirmation: false,
    waitingFor: 'opportunity_slot_completion',
    lastCompletedStep: 'activity_slots_partial',
  });
}

export function readSocialAgentOpportunityDraftClarification(
  task: AgentTask,
): SocialAgentOpportunityDraftClarification | null {
  const memory = record(task.memory);
  const result = record(task.result);
  const candidates = [
    record(memory.socialAgentChat).pendingOpportunityDraft,
    record(record(result.chatRun).pendingOpportunityDraft),
    record(memory.shortTerm).pendingOpportunityDraft,
  ];
  for (const candidate of candidates) {
    const pending = record(candidate);
    if (pending.status !== 'collecting_slots') continue;
    const missing = Array.isArray(pending.missing)
      ? pending.missing.map((item) => String(item)).filter(Boolean)
      : [];
    return {
      status: 'collecting_slots',
      missing,
      sourceText:
        typeof pending.sourceText === 'string' ? pending.sourceText : '',
      updatedAt: typeof pending.updatedAt === 'string' ? pending.updatedAt : '',
    };
  }
  return null;
}

export function clearSocialAgentOpportunityDraftClarification(
  task: AgentTask,
): void {
  const now = new Date().toISOString();
  const memory = record(task.memory);
  const socialAgentChat = record(memory.socialAgentChat);
  const shortTerm = record(memory.shortTerm);
  const result = record(task.result);
  const chatRun = record(result.chatRun);
  task.memory = {
    ...memory,
    socialAgentChat: {
      ...socialAgentChat,
      pendingOpportunityDraft: null,
      publishStatus:
        socialAgentChat.publishStatus === 'collecting_slots'
          ? 'cancelled'
          : socialAgentChat.publishStatus,
      updatedAt: now,
    },
    shortTerm: {
      ...shortTerm,
      pendingOpportunityDraft: null,
      publishStatus:
        shortTerm.publishStatus === 'collecting_slots'
          ? 'cancelled'
          : shortTerm.publishStatus,
    },
  };
  task.result = {
    ...result,
    chatRun: {
      ...chatRun,
      pendingOpportunityDraft: null,
      publishStatus:
        chatRun.publishStatus === 'collecting_slots'
          ? 'cancelled'
          : chatRun.publishStatus,
    },
  };
  transitionSocialAgentState(task, 'activity_planning', {
    objective: 'meet_loop',
    nextStep: '已取消本次约练卡补槽',
    shouldSearchNow: false,
    awaitingSearchConfirmation: false,
    waitingFor: '',
    lastCompletedStep: 'activity_slots_cancelled',
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
