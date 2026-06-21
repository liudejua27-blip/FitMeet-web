import { describe, expect, it } from 'vitest';

import { attachPendingConfirmationsToAssistantCards } from '../components/agent-workspace/FitMeetAssistantUI';

describe('FitMeetAssistantUI pending approval attachment', () => {
  it('folds candidate pending confirmations into the current CandidateCard and drops low-risk noise', () => {
    const { cards, standaloneConfirmations } = attachPendingConfirmationsToAssistantCards(
      [
        {
          id: 'candidate-card-chen',
          schemaType: 'social_match.candidate',
          data: {
            schemaType: 'social_match.candidate',
            candidateRecordId: 501,
            displayName: '陈砚',
          },
        },
      ],
      [
        {
          id: 'save-chen',
          type: 'save_candidate',
          actionType: 'save_candidate',
          summary: '收藏 陈砚',
          riskLevel: 'medium',
          expiresAt: null,
        },
        {
          id: 8801,
          type: 'send_invite',
          actionType: 'send_invite',
          summary: '确认发送给 陈砚',
          riskLevel: 'medium',
          expiresAt: null,
        },
        {
          id: 8802,
          type: 'connect_candidate',
          actionType: 'connect_candidate',
          summary: '加好友并聊天：陈砚',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    );

    expect(standaloneConfirmations).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(cards[0].data).toMatchObject({
      inlineApprovalConfirmations: {
        'opener.confirm_send': expect.objectContaining({
          id: 8801,
          actionType: 'send_invite',
          actionKey: 'opener.confirm_send',
        }),
        'candidate.connect': expect.objectContaining({
          id: 8802,
          actionType: 'connect_candidate',
          actionKey: 'candidate.connect',
        }),
      },
    });
    expect(
      JSON.stringify((cards[0].data as Record<string, unknown>).inlineApprovalConfirmations),
    ).not.toContain('save-chen');
  });

  it('folds publish confirmations into the current OpportunityCard', () => {
    const { cards, standaloneConfirmations } = attachPendingConfirmationsToAssistantCards(
      [
        {
          id: 'activity-plan-101',
          schemaType: 'social_match.activity',
          data: {
            schemaType: 'social_match.activity',
            taskId: 101,
            approvalId: 9901,
            opportunity: {
              id: 'opportunity:101:activity:9901',
              title: '青岛大学散步约练',
            },
          },
        },
      ],
      [
        {
          id: 9901,
          type: 'publish_social_request',
          actionType: 'publish_social_request',
          summary: '确认发布到发现：青岛大学散步约练',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    );

    expect(standaloneConfirmations).toEqual([]);
    expect(cards[0].data).toMatchObject({
      inlineApprovalConfirmation: expect.objectContaining({
        id: 9901,
        actionType: 'publish_social_request',
        actionKey: 'activity.confirm_create',
      }),
      inlineApprovalConfirmations: {
        'activity.confirm_create': expect.objectContaining({
          id: 9901,
          actionType: 'publish_social_request',
        }),
      },
    });
  });

  it('keeps orphan high-risk confirmations standalone when no card can own the action', () => {
    const { cards, standaloneConfirmations } = attachPendingConfirmationsToAssistantCards(
      [],
      [
        {
          id: 8801,
          type: 'send_invite',
          actionType: 'send_invite',
          summary: '确认发送邀请',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    );

    expect(cards).toEqual([]);
    expect(standaloneConfirmations).toHaveLength(1);
    expect(standaloneConfirmations[0]).toMatchObject({ id: 8801 });
  });

  it('drops orphan low-risk confirmations when replay has no owning card', () => {
    const { cards, standaloneConfirmations } = attachPendingConfirmationsToAssistantCards(
      [],
      [
        {
          id: 'save-chen',
          type: 'save_candidate',
          actionType: 'save_candidate',
          summary: '收藏 陈砚，后续推荐会参考。',
          riskLevel: 'medium',
          expiresAt: null,
        },
        {
          id: 'opener-chen',
          type: 'candidate.generate_opener',
          actionType: 'candidate.generate_opener',
          summary: '生成开场白草稿，不会发送给对方。',
          riskLevel: 'medium',
          expiresAt: null,
        },
      ],
    );

    expect(cards).toEqual([]);
    expect(standaloneConfirmations).toEqual([]);
  });

  it('dedupes replayed pending confirmations before attaching them to cards', () => {
    const { cards, standaloneConfirmations } = attachPendingConfirmationsToAssistantCards(
      [
        {
          id: 'candidate-card-chen',
          schemaType: 'social_match.candidate',
          data: {
            schemaType: 'social_match.candidate',
            candidateRecordId: 501,
            displayName: '陈砚',
          },
        },
      ],
      [
        {
          id: 8801,
          type: 'send_invite',
          actionType: 'send_invite',
          summary: '确认发送给 陈砚',
          riskLevel: 'medium',
          payload: { candidateRecordId: 501 },
          expiresAt: null,
        },
        {
          id: 8801,
          type: 'send_invite',
          actionType: 'send_invite',
          summary: '确认发送给 陈砚',
          riskLevel: 'medium',
          payload: { candidateRecordId: 501 },
          expiresAt: null,
        },
        {
          id: null,
          type: 'send_invite',
          actionType: 'send_invite',
          summary: '确认发送给 陈砚',
          riskLevel: 'medium',
          payload: { candidateRecordId: 501 },
          expiresAt: null,
        },
        {
          id: null,
          type: 'send_invite',
          actionType: 'send_invite',
          summary: '确认发送给 陈砚',
          riskLevel: 'medium',
          payload: { candidateRecordId: 501 },
          expiresAt: null,
        },
      ],
    );

    expect(standaloneConfirmations).toEqual([]);
    const inlineApprovals = (cards[0].data as Record<string, unknown>)
      .inlineApprovalConfirmations as Record<string, unknown>;
    expect(Object.keys(inlineApprovals)).toEqual(['opener.confirm_send']);
    expect(inlineApprovals['opener.confirm_send']).toMatchObject({
      id: 8801,
      actionType: 'send_invite',
      actionKey: 'opener.confirm_send',
    });
  });

  it('dedupes orphan confirmations by action target when no card owns them', () => {
    const { cards, standaloneConfirmations } = attachPendingConfirmationsToAssistantCards(
      [],
      [
        {
          id: null,
          type: 'publish_social_request',
          actionType: 'publish_social_request',
          summary: '确认发布到发现',
          riskLevel: 'medium',
          payload: { taskId: 101, opportunityId: 'qdu-walk' },
          expiresAt: null,
        },
        {
          id: null,
          type: 'publish_social_request',
          actionType: 'publish_social_request',
          summary: '确认发布到发现',
          riskLevel: 'medium',
          payload: { taskId: 101, opportunityId: 'qdu-walk' },
          expiresAt: null,
        },
      ],
    );

    expect(cards).toEqual([]);
    expect(standaloneConfirmations).toHaveLength(1);
    expect(standaloneConfirmations[0]).toMatchObject({
      actionType: 'publish_social_request',
      payload: { taskId: 101, opportunityId: 'qdu-walk' },
    });
  });
});
