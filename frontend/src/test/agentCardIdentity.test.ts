import { describe, expect, it } from 'vitest';

import type { FitMeetAlphaCard, FitMeetAlphaCardType } from '../api/socialAgentApi';
import {
  agentCardDedupKeys,
  agentCardIdentityHints,
  mergeUniqueAgentCards,
} from '../components/agent-workspace/agentCardIdentity';

describe('agent card identity', () => {
  it('dedupes exact card id replays', () => {
    const card = fitmeetCard({
      id: 'opportunity-card-qdu-walk',
      schemaType: 'social_match.activity',
      data: { taskId: 88, opportunityId: 'qdu-walk' },
    });

    expect(mergeUniqueAgentCards([card], [card])).toHaveLength(1);
  });

  it('dedupes approval cards by approval id across stream replay', () => {
    const first = fitmeetCard({
      id: 'approval-send-1',
      schemaType: 'safety.approval',
      data: {
        approvalId: 9001,
        actionType: 'send_invite',
        candidateRecordId: 501,
      },
    });
    const replay = fitmeetCard({
      id: 'approval-send-1-replayed',
      schemaType: 'safety.approval',
      data: {
        approval: { id: 9001, actionType: 'send_invite' },
        candidateRecordId: 501,
      },
    });

    expect(mergeUniqueAgentCards([first], [replay])).toEqual([first]);
  });

  it('keeps different high-risk candidate actions while deduping the same action', () => {
    const sendInvite = fitmeetCard({
      id: 'candidate-501-send',
      schemaType: 'safety.approval',
      data: {
        candidateRecordId: 501,
        actionType: 'send_invite',
      },
    });
    const replayedSendInvite = fitmeetCard({
      id: 'candidate-501-send-replayed',
      schemaType: 'safety.approval',
      data: {
        candidateRecordId: 501,
        actionType: 'send_invite',
      },
    });
    const connectCandidate = fitmeetCard({
      id: 'candidate-501-connect',
      schemaType: 'safety.approval',
      data: {
        candidateRecordId: 501,
        actionType: 'connect_candidate',
      },
    });

    expect(
      mergeUniqueAgentCards([sendInvite], [replayedSendInvite, connectCandidate]).map(
        (card) => card.id,
      ),
    ).toEqual(['candidate-501-send', 'candidate-501-connect']);
  });

  it('dedupes opportunity cards by task and opportunity ids', () => {
    const draft = fitmeetCard({
      id: 'draft-v1',
      schemaType: 'social_match.activity',
      data: {
        taskId: 88,
        opportunityId: 'qdu-walk-tonight',
      },
    });
    const replayedDraft = fitmeetCard({
      id: 'draft-v2-from-result-replay',
      schemaType: 'social_match.activity',
      data: {
        taskId: 88,
        opportunity: { id: 'qdu-walk-tonight' },
      },
    });

    expect(mergeUniqueAgentCards([draft], [replayedDraft])).toEqual([draft]);
    expect(agentCardDedupKeys(draft)).toContain(
      'social_match.activity:task-opportunity:88:qdu-walk-tonight',
    );
  });

  it('dedupes replayed opportunity drafts by stable task and draft content when ids are missing', () => {
    const draft = fitmeetCard({
      id: 'draft-stream-v1',
      schemaType: 'social_match.activity',
      data: {
        taskId: 88,
        activityTitle: '青岛大学散步约练',
        activityType: '散步',
        locationName: '青岛大学附近',
        timePreference: '今天上午',
        intensity: '轻松',
      },
    });
    const replayedDraft = fitmeetCard({
      id: 'draft-result-v2',
      schemaType: 'social_match.activity',
      data: {
        taskId: 88,
        opportunity: {
          title: '青岛大学散步约练',
          activityType: '散步',
          location: '青岛大学附近',
          time: '今天上午',
          intensity: '轻松',
        },
      },
    });
    const changedTimeDraft = fitmeetCard({
      id: 'draft-result-v3',
      schemaType: 'social_match.activity',
      data: {
        taskId: 88,
        opportunity: {
          title: '青岛大学散步约练',
          activityType: '散步',
          location: '青岛大学附近',
          time: '周末下午',
          intensity: '轻松',
        },
      },
    });

    expect(mergeUniqueAgentCards([draft], [replayedDraft])).toEqual([draft]);
    expect(mergeUniqueAgentCards([draft], [changedTimeDraft]).map((card) => card.id)).toEqual([
      'draft-stream-v1',
      'draft-result-v3',
    ]);
    expect(agentCardDedupKeys(draft).some((key) => key.startsWith('opportunity-draft:88:'))).toBe(
      true,
    );
  });

  it('exposes raw identity hints for inline approval placement', () => {
    const candidate = fitmeetCard({
      id: 'candidate-card-chen',
      schemaType: 'social_match.candidate',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        approval: { id: 8801 },
      },
    });

    expect(agentCardIdentityHints(candidate)).toEqual(
      expect.arrayContaining(['candidate-card-chen', '8801', '501', '22']),
    );
  });

  it('keeps one candidate card while deduping replayed per-action cards', () => {
    const baseCandidate = fitmeetCard({
      id: 'candidate-card-chen',
      schemaType: 'social_match.candidate',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        name: '陈砚',
      },
    });
    const openerDraft = fitmeetCard({
      id: 'candidate-card-chen-opener-v1',
      schemaType: 'social_match.candidate',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        actionType: 'generate_opener',
        openerDraftReady: true,
        suggestedOpener: '你好，我也在青岛大学附近散步。',
      },
    });
    const openerReplay = fitmeetCard({
      id: 'candidate-card-chen-opener-v2-replay',
      schemaType: 'social_match.candidate',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        actionType: 'generate_opener',
        openerText: '你好，我也在青岛大学附近散步。',
      },
    });
    const inviteApproval = fitmeetCard({
      id: 'candidate-card-chen-invite-approval',
      schemaType: 'safety.approval',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        actionType: 'send_invite',
        approvalId: 9001,
      },
    });
    const inviteApprovalReplay = fitmeetCard({
      id: 'candidate-card-chen-invite-approval-replay',
      schemaType: 'safety.approval',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        actionType: 'send_invite',
        approval: { id: 9001 },
      },
    });
    const connectApproval = fitmeetCard({
      id: 'candidate-card-chen-connect-approval',
      schemaType: 'safety.approval',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
        actionType: 'connect_candidate',
        approvalId: 9002,
      },
    });

    expect(
      mergeUniqueAgentCards([baseCandidate], [
        openerDraft,
        openerReplay,
        inviteApproval,
        inviteApprovalReplay,
        connectApproval,
      ]).map((card) => card.id),
    ).toEqual([
      'candidate-card-chen',
      'candidate-card-chen-opener-v1',
      'candidate-card-chen-invite-approval',
      'candidate-card-chen-connect-approval',
    ]);
  });
});

function fitmeetCard(input: {
  id: string;
  schemaType: NonNullable<FitMeetAlphaCard['schemaType']>;
  data: Record<string, unknown>;
}): FitMeetAlphaCard {
  return {
    id: input.id,
    type: legacyTypeForSchema(input.schemaType),
    schemaType: input.schemaType,
    title: input.id,
    body: input.id,
    status: 'ready',
    data: input.data,
    actions: [],
  };
}

function legacyTypeForSchema(
  schemaType: NonNullable<FitMeetAlphaCard['schemaType']>,
): FitMeetAlphaCardType {
  if (schemaType === 'social_match.candidate') return 'candidate_card';
  if (schemaType === 'social_match.activity') return 'activity_plan';
  if (schemaType === 'life_graph.diff') return 'profile_proposal';
  if (schemaType === 'meet_loop.timeline') return 'review_card';
  if (schemaType === 'safety.approval') return 'safety_boundary';
  return 'audit_update';
}
