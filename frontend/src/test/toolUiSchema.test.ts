import { describe, expect, it } from 'vitest';

import {
  extractCanonicalAssistantCards,
  extractAssistantCards,
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  defaultOpportunityActionsForSchema,
  dedupeAssistantCards,
  isCanonicalAssistantCard,
  normalizeAssistantCard,
  normalizeActivityOpportunityView,
  normalizeCandidateEmptyStateView,
  normalizeCandidateOpportunityView,
  normalizeGenericCardView,
  normalizeLifeGraphDiffView,
  normalizeMeetLoopTimelineView,
  normalizeSafetyApprovalView,
  productComponentForSchemaType,
  schemaTypeFromLegacyCardType,
  summarizeToolUICardCollection,
  toolUISchemaActionFromUnknown,
  toolUISchemaTypeFromUnknown,
} from '../components/assistant-ui/tool-ui-schema';

describe('tool-ui-schema', () => {
  it('maps legacy FitMeet cards to schema-driven Tool UI cards', () => {
    expect(schemaTypeFromLegacyCardType('candidate_card')).toBe('social_match.candidate');
    expect(schemaTypeFromLegacyCardType('activity_plan')).toBe('social_match.activity');
    expect(schemaTypeFromLegacyCardType('profile_proposal')).toBe('life_graph.diff');
    expect(schemaTypeFromLegacyCardType('review_card')).toBe('meet_loop.timeline');
    expect(schemaTypeFromLegacyCardType('safety_boundary')).toBe('safety.approval');
    expect(schemaTypeFromLegacyCardType('unknown')).toBe('generic.card');
  });

  it('maps stable schemas to product Tool UI components and collection copy', () => {
    expect(productComponentForSchemaType('social_match.candidate')).toBe('CandidateCards');
    expect(productComponentForSchemaType('social_match.activity')).toBe('OpportunityCard');
    expect(productComponentForSchemaType('social_match.empty')).toBe('CandidateEmptyStateCard');
    expect(productComponentForSchemaType('life_graph.diff')).toBe('LifeGraphDiffCard');
    expect(productComponentForSchemaType('meet_loop.timeline')).toBe('MeetLoopTimeline');
    expect(productComponentForSchemaType('safety.approval')).toBe('ApprovalPanel');

    const cards = [
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '候选机会',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
        },
      }),
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '候选机会',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
        },
      }),
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.empty',
        title: '暂时没有找到合适的人',
        data: {
          schemaName: 'CandidateEmptyStateCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.empty',
        },
      }),
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '约练卡',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.activity',
        },
      }),
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '安全确认',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
        },
      }),
    ];

    expect(summarizeToolUICardCollection(cards)).toMatchObject({
      title: '2 个候选 · 1 个下一步建议 · 1 张约练卡 · 1 个待确认动作',
      candidateCount: 2,
      emptyCount: 1,
      opportunityCount: 3,
      approvalCount: 1,
      components: [
        'CandidateCards',
        'CandidateEmptyStateCard',
        'OpportunityCard',
        'ApprovalPanel',
      ],
    });
    expect(summarizeToolUICardCollection(cards).detail).toContain('结构化卡片');
  });

  it('collapses noisy approval cards into the current opportunity card action row', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'candidate-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          candidateRecordId: 501,
          targetUserId: 22,
        },
      }),
      normalizeAssistantCard({
        id: 'save-approval-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '收藏 陈砚',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'save_candidate',
          candidateRecordId: 501,
          riskLevel: 'low',
        },
      }),
      normalizeAssistantCard({
        id: 'send-approval-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发送开场白给 陈砚',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'send_invite',
          candidateRecordId: 501,
          approvalId: 8801,
          summary: '发送这条开场白前需要你确认。',
          riskLevel: 'medium',
        },
      }),
      normalizeAssistantCard({
        id: 'connect-approval-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '加好友并聊天：陈砚',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'connect_candidate',
          candidateRecordId: 501,
          approvalId: 8802,
          riskLevel: 'medium',
        },
      }),
    ];

    const deduped = dedupeAssistantCards(cards);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: 'candidate-501',
      schemaType: 'social_match.candidate',
      data: {
        inlineApprovalConfirmation: {
          id: '8801',
          actionType: 'send_invite',
          riskLevel: 'medium',
          actionKey: 'opener.confirm_send',
        },
        inlineApprovalConfirmations: {
          'opener.confirm_send': {
            id: '8801',
            actionType: 'send_invite',
            riskLevel: 'medium',
            actionKey: 'opener.confirm_send',
          },
          'candidate.connect': {
            id: '8802',
            actionType: 'connect_candidate',
            riskLevel: 'medium',
            actionKey: 'candidate.connect',
          },
        },
      },
    });
  });

  it('drops low-risk approval panels even when their safety copy mentions confirmation', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'candidate-chen',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          candidateRecordId: 501,
          targetUserId: 22,
        },
      }),
      normalizeAssistantCard({
        id: 'save-approval-chen',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '收藏 陈砚',
        body: '风险级别：medium · 动作：需要确认的操作。确认前不会自动发送、连接或发布。',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'save_candidate',
          candidateRecordId: 501,
          approvalId: 7701,
          riskLevel: 'medium',
          summary: '收藏候选陈砚，后续推荐会参考。',
        },
      }),
      normalizeAssistantCard({
        id: 'opener-approval-chen',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '生成开场白：陈砚',
        body: '确认前不会触达对方。',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'generate_opener',
          candidateRecordId: 501,
          approvalId: 7702,
          riskLevel: 'medium',
          summary: '生成开场白草稿，不会发送给对方。',
        },
      }),
    ];

    const deduped = dedupeAssistantCards(cards);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: 'candidate-chen',
      schemaType: 'social_match.candidate',
      data: expect.not.objectContaining({
        inlineApprovalConfirmation: expect.anything(),
        inlineApprovalConfirmations: expect.anything(),
      }),
    });
  });

  it('treats draft-only opener confirmations as low risk even when copy says it will not send', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'opener-draft-only',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '生成开场白草稿',
        body: '只生成草稿，不会自动发送给对方。',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          summary: '生成开场白草稿，不会发送给对方。',
          riskLevel: 'low',
        },
      }),
    ];

    expect(dedupeAssistantCards(cards)).toHaveLength(0);
  });

  it('folds publish approvals into the opportunity card instead of creating a second panel', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'activity-101',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '青岛大学散步约练',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.activity',
          taskId: 77,
          opportunityId: 'walk-qdu',
        },
      }),
      normalizeAssistantCard({
        id: 'publish-approval-101',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发布到发现',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          taskId: 77,
          opportunityId: 'walk-qdu',
          actionType: 'publish_social_request',
          approvalId: 9901,
          riskLevel: 'medium',
        },
      }),
    ];

    const deduped = dedupeAssistantCards(cards);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: 'activity-101',
      schemaType: 'social_match.activity',
      data: {
        inlineApprovalConfirmation: {
          id: '9901',
          actionType: 'publish_social_request',
          riskLevel: 'medium',
          actionKey: 'publish_to_discover',
        },
        inlineApprovalConfirmations: {
          publish_to_discover: {
            id: '9901',
            actionType: 'publish_social_request',
            riskLevel: 'medium',
            actionKey: 'publish_to_discover',
          },
        },
      },
    });
  });

  it('folds candidate approvals whose stable identity only exists in the approval payload', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'candidate-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          candidateRecordId: 501,
          targetUserId: 22,
        },
      }),
      normalizeAssistantCard({
        id: 'payload-only-send-approval',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发送邀请',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          approval: {
            id: 8810,
            payload: {
              actionType: 'send_invite',
              candidateRecordId: 501,
              targetUserId: 22,
              riskLevel: 'medium',
              summary: '发送邀请给陈砚前需要你确认。',
            },
          },
        },
      }),
    ];

    const deduped = dedupeAssistantCards(cards);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: 'candidate-501',
      schemaType: 'social_match.candidate',
      data: {
        inlineApprovalConfirmations: {
          'opener.confirm_send': {
            id: '8810',
            actionType: 'send_invite',
            riskLevel: 'medium',
            actionKey: 'opener.confirm_send',
          },
        },
      },
    });
  });

  it('folds publish approvals whose task and opportunity ids only exist in the approval payload', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'activity-202',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '青岛大学散步约练',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.activity',
          taskId: 88,
          opportunityId: 'walk-qdu-evening',
        },
      }),
      normalizeAssistantCard({
        id: 'payload-only-publish-approval',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发布到发现',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          approval: {
            id: 9910,
            payload: {
              actionType: 'publish_social_request',
              taskId: 88,
              opportunityId: 'walk-qdu-evening',
              riskLevel: 'medium',
              summary: '发布到发现前需要你确认。',
            },
          },
        },
      }),
    ];

    const deduped = dedupeAssistantCards(cards);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      id: 'activity-202',
      schemaType: 'social_match.activity',
      data: {
        inlineApprovalConfirmations: {
          publish_to_discover: {
            id: '9910',
            actionType: 'publish_social_request',
            riskLevel: 'medium',
            actionKey: 'publish_to_discover',
          },
        },
      },
    });
  });

  it('uses candidate names to fold replayed approvals into the right card when ids are missing', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'candidate-chen',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          displayName: '陈砚',
        },
      }),
      normalizeAssistantCard({
        id: 'candidate-xia',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '夏禾',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          displayName: '夏禾',
        },
      }),
      normalizeAssistantCard({
        id: 'send-approval-chen',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发送给 陈砚',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'send_invite',
          approvalId: 8805,
          summary: '发送这条开场白给陈砚前需要你确认。',
          riskLevel: 'medium',
        },
      }),
    ];

    const deduped = dedupeAssistantCards(cards);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((card) => card.id === 'send-approval-chen')).toBeUndefined();
    expect(deduped.find((card) => card.id === 'candidate-chen')).toMatchObject({
      data: {
        inlineApprovalConfirmations: {
          'opener.confirm_send': {
            id: '8805',
            actionType: 'send_invite',
            actionKey: 'opener.confirm_send',
          },
        },
      },
    });
    expect(deduped.find((card) => card.id === 'candidate-xia')).toMatchObject({
      data: expect.not.objectContaining({
        inlineApprovalConfirmations: expect.anything(),
      }),
    });
  });

  it('keeps pure approval panels when there is no opportunity card to own the action', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'publish-approval',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发布到发现',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'publish_social_request',
          approvalId: 8803,
          riskLevel: 'medium',
        },
      }),
    ];

    expect(dedupeAssistantCards(cards)).toHaveLength(1);
    expect(dedupeAssistantCards(cards)[0]).toMatchObject({
      id: 'publish-approval',
      schemaType: 'safety.approval',
    });
  });

  it('keeps different high-risk approvals for the same candidate when no card can own them', () => {
    const cards = [
      normalizeAssistantCard({
        id: 'send-approval-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发送邀请',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'send_invite',
          candidateRecordId: 501,
          approvalId: 8801,
          riskLevel: 'medium',
        },
      }),
      normalizeAssistantCard({
        id: 'send-approval-501-replay',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认发送邀请',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'send_invite',
          candidateRecordId: 501,
          approvalId: 8801,
          riskLevel: 'medium',
        },
      }),
      normalizeAssistantCard({
        id: 'connect-approval-501',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        title: '确认加好友并聊天',
        data: {
          schemaName: 'SafetyApprovalCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'safety.approval',
          actionType: 'connect_candidate',
          candidateRecordId: 501,
          approvalId: 8802,
          riskLevel: 'medium',
        },
      }),
    ];

    expect(dedupeAssistantCards(cards).map((card) => card.id)).toEqual([
      'send-approval-501',
      'connect-approval-501',
    ]);
  });

  it('provides safe default opportunity action paths when backend cards omit actions', () => {
    expect(defaultOpportunityActionsForSchema('social_match.candidate')).toEqual([
      {
        schemaAction: 'candidate.view_detail',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'candidate.like',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'candidate.generate_opener',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'opener.confirm_send',
        requiresConfirmation: true,
        source: 'default',
      },
      {
        schemaAction: 'candidate.connect',
        requiresConfirmation: true,
        source: 'default',
      },
    ]);
    expect(defaultOpportunityActionsForSchema('social_match.activity')).toEqual([
      {
        schemaAction: 'publish_to_discover',
        requiresConfirmation: true,
        source: 'default',
      },
      {
        schemaAction: 'activity.modify_time',
        requiresConfirmation: false,
        source: 'default',
      },
      {
        schemaAction: 'social_intent.decline_publish',
        requiresConfirmation: false,
        source: 'default',
      },
    ]);
    expect(defaultOpportunityActionsForSchema('life_graph.diff')).toEqual([]);
  });

  it('normalizes candidate empty-state recovery cards without fake candidate data', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_empty_state',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.empty',
      title: '暂时没有找到合适的人',
      body: 'tool_call raw JSON traceId planner debug 没有真实候选，我不会编造候选。',
      data: {
        schemaName: 'CandidateEmptyStateCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.empty',
        criteria: ['青岛大学', '今天晚上', '散步'],
        recoveryOptions: [
          {
            key: 'publish_to_discover',
            label: '发布到发现',
            detail: '公开前仍需要你确认。',
            requiresConfirmation: true,
          },
          {
            key: 'expand_radius',
            label: '扩大范围',
            detail: '只搜索公开可发现资料。',
          },
          {
            key: 'change_time',
            label: '换个时间',
            detail: '保留地点，把时间换成周末下午。',
          },
          {
            key: 'relax_preference',
            label: '放宽偏好',
            detail: '保留安全边界，先放宽非必要偏好。',
          },
        ],
        safetyBoundary: 'traceId planner debug 不会编造候选；不会公开联系方式。',
        nextBestStep: '先发布到发现，或者扩大范围再查。',
      },
      actions: [
        {
          id: 'publish',
          label: '发布到发现',
          schemaAction: 'publish_to_discover',
          requiresConfirmation: true,
          payload: { taskId: 1 },
        },
      ],
    });

    const view = normalizeCandidateEmptyStateView(card);

    expect(card.schemaType).toBe('social_match.empty');
    expect(schemaTypeFromLegacyCardType('candidate_empty_state')).toBe('social_match.empty');
    expect(toolUISchemaTypeFromUnknown('social_match.empty')).toBe('social_match.empty');
    expect(isCanonicalAssistantCard(card)).toBe(true);
    expect(view.criteria).toEqual(['青岛大学', '今天晚上', '散步']);
    expect(view.recoveryOptions).toEqual([
      {
        key: 'publish_to_discover',
        label: '发布到发现',
        detail: '公开前仍需要你确认。',
        requiresConfirmation: true,
      },
      {
        key: 'expand_radius',
        label: '扩大范围',
        detail: '只搜索公开可发现资料。',
        requiresConfirmation: false,
      },
      {
        key: 'change_time',
        label: '换个时间',
        detail: '保留地点，把时间换成周末下午。',
        requiresConfirmation: false,
      },
      {
        key: 'relax_preference',
        label: '放宽偏好',
        detail: '保留安全边界，先放宽非必要偏好。',
        requiresConfirmation: false,
      },
    ]);
    expect(JSON.stringify(view)).not.toMatch(
      /tool[_\s-]?call|traceId|planner|raw JSON|debug/i,
    );
    expect(JSON.stringify(view)).toContain('不会编造候选');
  });

  it('keeps candidate empty-state default recovery options complete', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_empty_state',
      schemaType: 'social_match.empty',
      title: '暂时没有找到合适的人',
      data: {},
      actions: [],
    });

    const view = normalizeCandidateEmptyStateView(card);

    expect(view.recoveryOptions).toEqual([
      expect.objectContaining({
        key: 'publish_to_discover',
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        key: 'expand_radius',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        key: 'change_time',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        key: 'relax_preference',
        requiresConfirmation: false,
      }),
    ]);
  });

  it('normalizes public schema cards without leaking technical wording', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_card',
      title: 'tool_call raw JSON traceId planner stack agentTrace checkpoint replay fork',
      data: { displayName: '小林' },
      actions: [
        {
          id: 'view',
          label: '查看详情',
          schemaAction: 'candidate.view_detail',
          requiresConfirmation: false,
          payload: { candidateId: 1 },
        },
      ],
    });

    expect(card.schemaType).toBe('social_match.candidate');
    expect(card.schemaVersion).toBe(FITMEET_TOOL_UI_SCHEMA_VERSION);
    expect(card.title).toBe('候选机会');
    expect(card.actions).toEqual([
      {
        id: 'view',
        label: '查看详情',
        action: undefined,
        schemaAction: 'candidate.view_detail',
        requiresConfirmation: false,
        payload: { candidateId: 1 },
      },
    ]);
  });

  it('sanitizes internal tool and trace wording from user-facing Tool UI views', () => {
    const candidate = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.candidate',
      title: '候选机会',
      body: 'planner traceId tool_call raw JSON subagent internal debug',
      data: {
        schemaName: 'OpportunityCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        opportunityCard: true,
        opportunity: {
          name: '小林',
          title: '和小林低压力认识',
          summary: 'planner traceId tool_call raw JSON subagent internal debug',
          reasons: ['兴趣接近', 'traceId raw JSON tool_result planner'],
          explanationSteps: [
            'tool_call planner traceId raw JSON subagent internal',
            '时间和边界更接近',
          ],
          discoverySafetySignals: [
            '公开可发现',
            'traceId planner tool_call raw JSON',
            '资料已脱敏',
          ],
          recommendedNextAction: '生成开场白，确认后再发送。',
        },
      },
      actions: [],
    });
    const approval = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'safety.approval',
      title: '安全确认',
      data: {
        schemaName: 'SafetyApprovalCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'safety.approval',
        approval: {
          boundary: 'planner traceId tool_call raw JSON subagent internal debug',
          reasons: ['会发送真实消息', 'traceId planner tool_call raw JSON'],
          auditNote: '发送前会保留审计记录',
        },
      },
      actions: [],
    });
    const generic = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'generic.card',
      title: '整理结果',
      data: {
        schemaName: 'GenericCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'generic.card',
        summary: 'planner traceId tool_call raw JSON subagent internal debug',
        details: ['可继续对话', 'traceId planner tool_call raw JSON'],
      },
      actions: [],
    });

    const publicText = JSON.stringify({
      candidate: normalizeCandidateOpportunityView(candidate),
      approval: normalizeSafetyApprovalView(approval),
      generic: normalizeGenericCardView(generic),
    });

    expect(publicText).not.toMatch(
      /tool[_\s-]?call|tool[_\s-]?result|traceId|planner|raw JSON|subagent|internal|debug|审计记录/i,
    );
    expect(publicText).toContain('时间和边界更接近');
    expect(publicText).toContain('会发送真实消息');
    expect(publicText).toContain('可继续对话');
  });

  it('extracts only supported schema cards from assistant-ui data parts', () => {
    const cards = extractAssistantCards({
      cards: [
        { schemaType: 'life_graph.diff', id: 'life', data: {} },
        null,
        { type: 'activity_status', id: 'activity', data: {} },
      ],
    });

    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.schemaType)).toEqual([
      'life_graph.diff',
      'social_match.activity',
    ]);
    expect(toolUISchemaTypeFromUnknown('bad.schema')).toBeUndefined();
  });

  it('keeps production Tool UI rendering on canonical schema cards only', () => {
    const legacyCard = normalizeAssistantCard({
      type: 'candidate_card',
      title: '旧候选卡',
      data: { displayName: '旧候选人' },
      actions: [],
    });
    const canonicalCard = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.candidate',
      title: '候选机会',
      data: {
        schemaName: 'OpportunityCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        opportunityCard: true,
        opportunity: {
          title: '和小林轻松跑步',
          summary: '时间、强度和边界更接近。',
        },
      },
      actions: [],
    });

    expect(legacyCard.schemaType).toBe('social_match.candidate');
    expect(isCanonicalAssistantCard(legacyCard)).toBe(false);
    expect(isCanonicalAssistantCard(canonicalCard)).toBe(true);
    expect(
      extractCanonicalAssistantCards({
        cards: [
          {
            type: 'candidate_card',
            title: '旧候选卡',
            data: { displayName: '旧候选人' },
          },
          {
            schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
            schemaType: 'social_match.candidate',
            title: '候选机会',
            data: {
              schemaName: 'OpportunityCard',
              schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
              schemaType: 'social_match.candidate',
              opportunityCard: true,
            },
          },
        ],
      }).map((card) => card.title),
    ).toEqual(['候选机会']);
  });

  it('normalizes candidate preference history signals for OpportunityCard rendering', () => {
    const card = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.candidate',
      title: '候选机会',
      data: {
        schemaName: 'OpportunityCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        opportunityCard: true,
        opportunity: {
          title: '和小林低压力认识',
          summary: '时间和边界更接近。',
          discoverySafetySignals: [
            '公开可发现',
            '已开启 Agent 匹配',
            '资料已脱敏',
            '无拉黑/投诉风险信号',
          ],
          recommendationProtocol: [
            {
              key: 'discoverability',
              label: '可发现来源',
              detail: '公开可发现且已允许 Agent 推荐',
            },
            {
              key: 'approval',
              label: '触达边界',
              detail: '发送邀请前必须由你确认',
            },
          ],
          preferenceHistorySignals: [
            '我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
          ],
          recentPublicActivity: ['公开约练：周末慢跑', '最近公开更新：2026-06-15'],
        },
      },
      actions: [],
    });

    expect(normalizeCandidateOpportunityView(card).discoverySafetySignals).toEqual([
      '公开可发现',
      '已开启 Agent 匹配',
      '资料已脱敏',
      '无拉黑/投诉风险信号',
    ]);
    expect(normalizeCandidateOpportunityView(card).recommendationProtocol).toEqual([
      {
        key: 'discoverability',
        label: '可发现来源',
        detail: '公开可发现且已允许 Agent 推荐',
      },
      {
        key: 'approval',
        label: '触达边界',
        detail: '发送邀请前必须由你确认',
      },
    ]);
    expect(normalizeCandidateOpportunityView(card).preferenceHistorySignals).toEqual([
      '我会优先参考你最近确认的可约时间变化：从「工作日晚上」调整为「周末下午」。',
    ]);
    expect(normalizeCandidateOpportunityView(card).recentPublicActivity).toEqual([
      '公开约练：周末慢跑',
      '最近公开更新：2026-06-15',
    ]);
  });

  it('normalizes degraded candidate reasoning without exposing internal errors', () => {
    const card = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.candidate',
      title: '候选机会',
      data: {
        schemaName: 'OpportunityCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        opportunity: {
          title: '和小林低压力认识',
          summary: '当前只适合作为保守候选。',
          candidateExplanation: {
            source: 'fallback',
            degraded: true,
            retryable: true,
            degradationReason: 'model_unavailable',
            confidence: 0.43,
          },
        },
      },
      actions: [],
    });

    expect(normalizeCandidateOpportunityView(card).reasoningQuality).toEqual({
      degraded: true,
      retryable: true,
      source: 'fallback',
      confidence: 0.43,
      label: '我先用公开资料保守推荐',
      detail: '更细的个性化解释稍后可重试；发送邀请前仍会等你确认。',
      actionLabel: '可稍后重新生成推荐解释',
    });
    expect(
      [
        normalizeCandidateOpportunityView(card).reasoningQuality.label,
        normalizeCandidateOpportunityView(card).reasoningQuality.detail,
        normalizeCandidateOpportunityView(card).reasoningQuality.actionLabel,
      ].join('\n'),
    ).not.toMatch(/fallback|deepseek|model_unavailable|tool|trace/i);
  });

  it('normalizes social OpportunityCard aliases into stable product fields', () => {
    const candidate = normalizeCandidateOpportunityView(
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '候选机会',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          opportunity: {
            title: '和小林轻松跑步',
            summary: '适合先从公共路线轻松认识。',
            region: '青岛市南区',
            interestTags: ['跑步', '轻松社交'],
            privacySignals: ['资料已脱敏', '不展示精确位置'],
            openerPreview: '周末下午如果方便，可以先在公共路线轻松跑一圈。',
            safetyLine: '仅站内沟通，发送邀请前必须确认。',
          },
        },
        actions: [],
      }),
    );
    const activity = normalizeActivityOpportunityView(
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '活动机会',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.activity',
          opportunity: {
            title: '周末羽毛球约练',
            summary: '公开球馆轻松两局。',
            venueName: '青岛大学体育馆',
            startsAt: '周六 16:00',
            interestTags: ['羽毛球', '公开活动'],
            privacySignals: ['公共场所', '不自动公开发布'],
            visibilityPolicy: '默认不公开发布。',
            confirmationPolicy: '创建或邀请前必须确认。',
            safetyLine: '只展示大致场馆，不展示精确定位。',
          },
        },
        actions: [],
      }),
    );

    expect(candidate.area).toBe('青岛市南区');
    expect(candidate.interests).toEqual(['跑步', '轻松社交']);
    expect(candidate.safetyBadges).toEqual(['资料已脱敏', '不展示精确位置']);
    expect(candidate.suggestedOpener).toBe(
      '周末下午如果方便，可以先在公共路线轻松跑一圈。',
    );
    expect(candidate.safetyBoundary).toBe('仅站内沟通，发送邀请前必须确认。');
    expect(activity.location).toBe('青岛大学体育馆');
    expect(activity.time).toBe('周六 16:00');
    expect(activity.tags).toEqual(['羽毛球', '公开活动']);
    expect(activity.safetyBadges).toEqual(['公共场所', '不自动公开发布']);
    expect(activity.publishPolicy).toBe('默认不公开发布。');
    expect(activity.approvalPolicy).toBe('创建或邀请前必须确认。');
    expect(activity.safetyBoundary).toBe('只展示大致场馆，不展示精确定位。');
  });

  it('falls back to confirmed context when candidate trust signals are not explicit', () => {
    const candidate = normalizeCandidateOpportunityView(
      normalizeAssistantCard({
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '候选机会',
        data: {
          schemaName: 'OpportunityCard',
          schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
          schemaType: 'social_match.candidate',
          opportunity: {
            title: '和小周先从羽毛球认识',
            summary: '城市、时间和社交边界都比较接近。',
            relationshipGoal: '先从低压力运动搭子开始',
            idealType: '同城、周末有空、愿意先站内聊',
            confirmedContext: ['青岛', '周末下午', '公共球馆'],
          },
        },
        actions: [],
      }),
    );

    expect(candidate.trustSignals).toEqual([
      '参考已确认偏好：先从低压力运动搭子开始',
      '参考已确认偏好：同城、周末有空、愿意先站内聊',
      '参考已确认偏好：青岛',
      '参考已确认偏好：周末下午',
    ]);
    expect(candidate.discoverySafetySignals).toEqual([
      '仅整理公开可发现或已授权匹配的信息',
      '资料默认脱敏，不展示精确位置或私密联系方式',
      '涉及真实触达时必须确认',
      '可跳过、重试或从确认点恢复',
    ]);
    expect(candidate.recommendationProtocol).toEqual([
      {
        key: 'source',
        label: '可见来源',
        detail: '只基于公开可发现或已允许 Agent 匹配的信息整理。',
      },
      {
        key: 'privacy',
        label: '资料边界',
        detail: '默认展示脱敏资料和模糊区域，不展示精确位置或私密联系方式。',
      },
      {
        key: 'touch',
        label: '触达边界',
        detail: '不会自动触达对方；如果下一步涉及发送或连接，会先让你确认。',
      },
      {
        key: 'recovery',
        label: '可以继续',
        detail: '你可以跳过、重试生成开场白，或从确认点继续。',
      },
    ]);
    expect(candidate.preferenceHistorySignals).toEqual([]);
  });

  it('normalizes activity protocol for product-grade Meet Loop OpportunityCard rendering', () => {
    const card = normalizeAssistantCard({
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.activity',
      title: '活动机会',
      data: {
        schemaName: 'OpportunityCard',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        opportunityCard: true,
        opportunity: {
          title: '羽毛球约练',
          summary: '轻松打两局，先熟悉节奏。',
          activityProtocol: [
            {
              key: 'public_place',
              label: '公共场所',
              detail: '优先选择公共球馆，避免第一次见面进入私密空间。',
            },
            {
              key: 'approval',
              label: '创建确认',
              detail: '创建约练前必须由你确认时间、地点和参与边界。',
            },
            {
              key: 'publish',
              label: '公开边界',
              detail: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
            },
            {
              key: 'hidden',
              label: 'traceId planner raw JSON',
              detail: 'tool_call internal debug',
            },
          ],
        },
      },
      actions: [],
    });

    expect(normalizeActivityOpportunityView(card).activityProtocol).toEqual([
      {
        key: 'public_place',
        label: '公共场所',
        detail: '优先选择公共球馆，避免第一次见面进入私密空间。',
      },
      {
        key: 'approval',
        label: '创建确认',
        detail: '创建约练前必须由你确认时间、地点和参与边界。',
      },
      {
        key: 'publish',
        label: '公开边界',
        detail: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
      },
    ]);
  });

  it('only allows known schema actions to become executable Tool UI actions', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_card',
      title: '候选人',
      data: {},
      actions: [
        {
          id: 'connect',
          label: '加好友',
          action: 'connect_candidate',
          requiresConfirmation: false,
          payload: {
            candidateId: 2,
            targetUserId: 22,
            traceId: 'trace-hidden',
          },
        },
        {
          id: 'safe',
          label: '生成开场白',
          action: 'generate_opener',
          schemaAction: 'candidate.generate_opener',
          payload: {
            candidateId: 1,
            traceId: 'trace-hidden',
            debug: true,
            nested: {
              stack: 'hidden-stack',
              safeNote: '保留',
            },
          },
        },
        {
          id: 'unknown',
          label: '内部调试动作',
          action: 'debug.raw_tool',
          schemaAction: 'debug.raw_tool',
          payload: { debug: true },
        },
      ],
    });

    expect(toolUISchemaActionFromUnknown('candidate.generate_opener')).toBe(
      'candidate.generate_opener',
    );
    expect(toolUISchemaActionFromUnknown('debug.raw_tool')).toBeUndefined();
    expect(card.actions).toEqual([
      expect.objectContaining({
        id: 'connect',
        action: 'connect_candidate',
        schemaAction: 'candidate.connect',
        requiresConfirmation: true,
        payload: {
          candidateId: 2,
          targetUserId: 22,
        },
      }),
      expect.objectContaining({
        id: 'safe',
        action: 'generate_opener',
        schemaAction: 'candidate.generate_opener',
        payload: {
          candidateId: 1,
          nested: {
            safeNote: '保留',
          },
        },
      }),
      expect.objectContaining({
        id: 'unknown',
        action: undefined,
        schemaAction: undefined,
        payload: undefined,
      }),
    ]);
  });

  it('accepts canonical schema actions from the backend action field', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_card',
      title: '候选动作',
      data: {},
      actions: [
        {
          id: 'connect',
          label: '加好友',
          action: 'candidate.connect',
          requiresConfirmation: false,
          payload: {
            candidateId: 501,
            targetUserId: 22,
            traceId: 'trace-hidden',
          },
        },
        {
          id: 'activity',
          label: '发起约练',
          action: 'activity.confirm_create',
          requiresConfirmation: false,
          payload: {
            activityId: 700,
            rawJson: { hidden: true },
          },
        },
      ],
    });

    expect(card.actions).toEqual([
      expect.objectContaining({
        id: 'connect',
        action: 'candidate.connect',
        schemaAction: 'candidate.connect',
        requiresConfirmation: true,
        payload: {
          candidateId: 501,
          targetUserId: 22,
        },
      }),
      expect.objectContaining({
        id: 'activity',
        action: 'activity.confirm_create',
        schemaAction: 'activity.confirm_create',
        requiresConfirmation: true,
        payload: {
          activityId: 700,
        },
      }),
    ]);
  });

  it('keeps Meet Loop schema actions executable through the frontend Tool UI contract', () => {
    const card = normalizeAssistantCard({
      type: 'review_card',
      title: '约练闭环动作',
      data: {},
      actions: [
        {
          id: 'check-in',
          label: '我已到达，签到',
          action: 'check_in',
          requiresConfirmation: false,
          payload: { activityId: 700, traceId: 'hidden' },
        },
        {
          id: 'complete',
          label: '活动已完成',
          action: 'activity.complete',
          requiresConfirmation: false,
          payload: { activityId: 700, rawJson: { hidden: true } },
        },
        {
          id: 'review',
          label: '提交评价',
          action: 'submit_review',
          requiresConfirmation: false,
          payload: { activityId: 700, rating: 5, stack: 'hidden' },
        },
        {
          id: 'proof',
          label: '上传证明',
          action: 'upload_proof',
          schemaAction: 'activity.upload_proof',
          requiresConfirmation: false,
          payload: { activityId: 700, proofType: 'scene_photo', debug: true },
        },
      ],
    });

    expect(card.schemaType).toBe('meet_loop.timeline');
    expect(toolUISchemaActionFromUnknown('activity.check_in')).toBe('activity.check_in');
    expect(toolUISchemaActionFromUnknown('activity.complete')).toBe('activity.complete');
    expect(toolUISchemaActionFromUnknown('review.submit')).toBe('review.submit');
    expect(toolUISchemaActionFromUnknown('activity.upload_proof')).toBe('activity.upload_proof');
    expect(card.actions).toEqual([
      expect.objectContaining({
        id: 'check-in',
        action: 'check_in',
        schemaAction: 'activity.check_in',
        requiresConfirmation: false,
        payload: { activityId: 700 },
      }),
      expect.objectContaining({
        id: 'complete',
        action: 'activity.complete',
        schemaAction: 'activity.complete',
        requiresConfirmation: false,
        payload: { activityId: 700 },
      }),
      expect.objectContaining({
        id: 'review',
        action: 'submit_review',
        schemaAction: 'review.submit',
        requiresConfirmation: false,
        payload: { activityId: 700, rating: 5 },
      }),
      expect.objectContaining({
        id: 'proof',
        action: 'upload_proof',
        schemaAction: 'activity.upload_proof',
        requiresConfirmation: false,
        payload: { activityId: 700, proofType: 'scene_photo' },
      }),
    ]);
  });

  it('marks high-risk legacy card actions as confirmation-required schema actions', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_card',
      title: '候选动作',
      data: {},
      actions: [
        {
          id: 'send',
          label: '发邀请',
          action: 'send_message',
          requiresConfirmation: false,
          payload: { targetUserId: 22, message: '周末一起跑步吗？', traceId: 'hidden' },
        },
        {
          id: 'create',
          label: '创建活动',
          action: 'create_activity',
          requiresConfirmation: false,
          payload: { activityId: 7, title: '周末轻松跑' },
        },
        {
          id: 'profile',
          label: '确认画像',
          action: 'confirm_profile_update',
          requiresConfirmation: false,
          payload: { field: 'sportPreference', traceId: 'hidden' },
        },
        {
          id: 'save',
          label: '收藏候选',
          action: 'save_candidate',
          requiresConfirmation: false,
          payload: { candidateId: 501 },
        },
        {
          id: 'skip',
          label: '不感兴趣',
          action: 'dislike_candidate',
          requiresConfirmation: false,
          payload: { candidateId: 501, targetUserId: 22 },
        },
        {
          id: 'cancel',
          label: '取消发送',
          action: 'reject_opener',
          requiresConfirmation: false,
          payload: { approvalId: 9001, traceId: 'hidden' },
        },
      ],
    });

    expect(card.actions).toEqual([
      expect.objectContaining({
        id: 'send',
        action: 'send_message',
        schemaAction: 'opener.confirm_send',
        requiresConfirmation: true,
        payload: { targetUserId: 22, message: '周末一起跑步吗？' },
      }),
      expect.objectContaining({
        id: 'create',
        action: 'create_activity',
        schemaAction: 'activity.confirm_create',
        requiresConfirmation: true,
        payload: { activityId: 7, title: '周末轻松跑' },
      }),
      expect.objectContaining({
        id: 'profile',
        action: 'confirm_profile_update',
        schemaAction: 'life_graph.accept_update',
        requiresConfirmation: true,
        payload: { field: 'sportPreference' },
      }),
      expect.objectContaining({
        id: 'save',
        action: 'save_candidate',
        schemaAction: 'candidate.like',
        requiresConfirmation: false,
        payload: { candidateId: 501 },
      }),
      expect.objectContaining({
        id: 'skip',
        action: 'dislike_candidate',
        schemaAction: 'candidate.skip',
        requiresConfirmation: false,
        payload: { candidateId: 501, targetUserId: 22 },
      }),
      expect.objectContaining({
        id: 'cancel',
        action: 'reject_opener',
        schemaAction: 'opener.reject',
        requiresConfirmation: false,
        payload: { approvalId: 9001 },
      }),
    ]);
  });

  it('does not turn candidate cards into direct send actions before an opener approval exists', () => {
    const card = normalizeAssistantCard({
      type: 'candidate_card',
      title: '候选人',
      data: { taskId: 101 },
      actions: [
        {
          id: 'opener',
          label: '生成开场白',
          action: 'generate_opener',
          schemaAction: 'candidate.generate_opener',
          requiresConfirmation: false,
        },
        {
          id: 'connect',
          label: '加好友',
          action: 'connect_candidate',
          requiresConfirmation: true,
        },
      ],
    });

    expect(card.actions).toEqual([
      expect.objectContaining({
        schemaAction: 'candidate.generate_opener',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        schemaAction: 'candidate.connect',
        requiresConfirmation: true,
      }),
    ]);
    expect(card.actions).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ schemaAction: 'opener.confirm_send' }),
      ]),
    );
  });

  it('normalizes candidate opportunity cards from stable schema fields first', () => {
    const card = normalizeAssistantCard({
      schemaType: 'social_match.candidate',
      title: '旧标题',
      body: '旧摘要',
      data: {
        displayName: '旧名字',
        recommendationLine: '旧推荐理由',
        city: '旧城市',
        matchScore: 42,
        opportunity: {
          name: '小林',
          title: '和小林轻松跑步',
          subtitle: '青岛 · 周末下午',
          summary: '你们的运动强度和社交边界更接近。',
          relationshipGoal: '先从低压力运动搭子开始',
          idealType: '同城、周末有空、愿意先站内聊',
          confirmedContext: ['青岛', '周末下午', '轻松跑步', '公共场所'],
          area: '青岛市南区',
          time: '周六下午',
          distanceKm: 2.4,
          score: 88,
          interests: ['跑步', '公共路线'],
          safetyBadges: ['公共场所优先'],
          recommendationConsent: {
            sourceLabel: '公开可发现且已允许 Agent 推荐',
            privacyLabel: '资料已脱敏，邀请前需要你确认',
            strangerPolicyLabel: '你已同意查看公开可发现的陌生人机会',
          },
          discoverySafetySignals: [
            '公开可发现',
            '已开启 Agent 匹配',
            '资料已脱敏，邀请前需要你确认',
            '无拉黑/投诉风险信号',
          ],
          reasons: ['时间一致', '强度接近'],
          explanationSteps: [
            '来源：周末跑步偏好',
            '匹配：时间和强度更接近',
            '安全：仅展示模糊区域',
          ],
          rankingBreakdown: [
            {
              key: 'location',
              label: '城市/距离',
              score: 14,
              reason: '区域在青岛市南区附近，适合先低压力了解。',
            },
            {
              key: 'interest',
              label: '共同兴趣',
              score: 18,
              reason: '共同兴趣包含跑步、公共路线。',
            },
          ],
          suggestedOpener: '周末如果方便，可以先在公共路线轻松跑一圈。',
          whyNow: '这次推荐和你最近的周末节奏、低压力边界有重合。',
          openerStrategy: '先确认时间和强度，不要一上来就给对方压力。',
          recommendedNextAction: '先生成开场白，确认后再发送。',
          safetyBoundary: '不会自动发送消息。',
        },
      },
      actions: [
        {
          id: 'connect',
          label: '确认后发邀请',
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
          payload: { targetUserId: 22 },
        },
      ],
    });

    expect(normalizeCandidateOpportunityView(card)).toEqual({
      name: '小林',
      title: '和小林轻松跑步',
      subtitle: '青岛 · 周末下午',
      avatarUrl: null,
      score: 88,
      summary: '你们的运动强度和社交边界更接近。',
      relationshipGoal: '先从低压力运动搭子开始',
      idealType: '同城、周末有空、愿意先站内聊',
      invitePolicy: '发送邀请前需要你确认',
      confirmedContext: ['青岛', '周末下午', '轻松跑步', '公共场所'],
      area: '青岛市南区',
      time: '周六下午',
      distanceLabel: '2.4km',
      interests: ['跑步', '公共路线'],
      safetyBadges: ['公共场所优先'],
      reasons: ['时间一致', '强度接近'],
      explanationSteps: ['来源：周末跑步偏好', '匹配：时间和强度更接近', '安全：仅展示模糊区域'],
      rankingBreakdown: [
        {
          key: 'location',
          label: '城市/距离',
          score: 14,
          reason: '区域在青岛市南区附近，适合先低压力了解。',
        },
        {
          key: 'interest',
          label: '共同兴趣',
          score: 18,
          reason: '共同兴趣包含跑步、公共路线。',
        },
      ],
      trustSignals: [
        '公开可发现且已允许 Agent 推荐',
        '资料已脱敏，邀请前需要你确认',
        '你已同意查看公开可发现的陌生人机会',
      ],
      coldStartSignals: [],
      discoverySafetySignals: [
        '公开可发现',
        '已开启 Agent 匹配',
        '资料已脱敏，邀请前需要你确认',
        '无拉黑/投诉风险信号',
      ],
      recommendationProtocol: [
        {
          key: 'source',
          label: '可见来源',
          detail: '只基于公开可发现或已允许 Agent 匹配的信息整理。',
        },
        {
          key: 'privacy',
          label: '资料边界',
          detail: '默认展示脱敏资料和模糊区域，不展示精确位置或私密联系方式。',
        },
        {
          key: 'touch',
          label: '触达边界',
          detail: '发送邀请、加好友或创建活动前必须由你确认。',
        },
        {
          key: 'recovery',
          label: '可以继续',
          detail: '你可以跳过、重试生成开场白，或从确认点继续。',
        },
      ],
      recentPublicActivity: [],
      preferenceHistorySignals: [],
      whyNow: '这次推荐和你最近的周末节奏、低压力边界有重合。',
      openerStrategy: '先确认时间和强度，不要一上来就给对方压力。',
      suggestedOpener: '周末如果方便，可以先在公共路线轻松跑一圈。',
      recommendedNextAction: '先生成开场白，确认后再发送。',
      safetyBoundary: '不会自动发送消息。',
      reasoningQuality: {
        degraded: false,
        retryable: false,
        source: null,
        confidence: null,
        label: null,
        detail: null,
        actionLabel: null,
      },
    });
  });

  it('normalizes activity opportunity cards from stable schema fields first', () => {
    const card = normalizeAssistantCard({
      schemaType: 'social_match.activity',
      title: '旧活动标题',
      body: '旧活动摘要',
      data: {
        activityTitle: '旧活动名',
        recommendationLine: '旧推荐',
        city: '旧城市',
        joinedCount: 1,
        maxParticipants: 9,
        opportunity: {
          title: '周末海边轻松跑',
          subtitle: '青岛 · 五四广场 · 周六下午',
          summary: '公开活动比直接连接陌生人更低压力。',
          confirmedContext: ['青岛', '周六 16:00', '轻松跑', '先站内聊'],
          imageUrl: '/activities/sea-run.png',
          city: '青岛',
          location: '五四广场',
          time: '周六 16:00',
          joinedCount: 3,
          maxParticipants: 8,
          intensity: '轻松跑',
          host: 'FitMeet 官方',
          nextAction: '先查看详情，再确认是否报名。',
          tags: ['跑步', '公开活动'],
          safetyBadges: ['公共场所', '人数上限'],
          reasons: ['时间匹配', '社交压力更低'],
          explanationSteps: [
            '召回：来自公开活动',
            '排序：时间和地点都匹配',
            '安全：先查看公开详情',
          ],
          publishPolicy: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
          approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
          meetLoopNextStep: '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
        },
      },
    });

    expect(normalizeActivityOpportunityView(card)).toEqual({
      title: '周末海边轻松跑',
      subtitle: '青岛 · 五四广场 · 周六下午',
      imageUrl: '/activities/sea-run.png',
      confirmedContext: ['青岛', '周六 16:00', '轻松跑', '先站内聊'],
      city: '青岛',
      location: '五四广场',
      time: '周六 16:00',
      capacityLabel: '3/8 人',
      intensity: '轻松跑',
      host: 'FitMeet 官方',
      summary: '公开活动比直接连接陌生人更低压力。',
      nextAction: '先查看详情，再确认是否报名。',
      tags: ['跑步', '公开活动'],
      safetyBadges: ['公共场所', '人数上限'],
      reasons: ['时间匹配', '社交压力更低'],
      explanationSteps: [
        '来源：来自公开活动',
        '匹配：时间和地点都匹配',
        '安全：先查看公开详情',
      ],
      activityProtocol: [
        {
          key: 'public_place',
          label: '公共场所',
          detail: '优先选择公共场馆或开放路线，不默认展示精确位置。',
        },
        {
          key: 'approval',
          label: '创建确认',
          detail: '创建活动、发送邀请或公开发布前必须由你确认。',
        },
        {
          key: 'publish',
          label: '公开边界',
          detail: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
        },
        {
          key: 'recovery',
          label: '连续推进',
          detail: '确认后进入等待回复、改期、确认到达、评价和画像回写流程。',
        },
      ],
      safetyBoundary: '优先公共场所和模糊位置，活动前后都保留确认与退出空间。',
      publishPolicy: '默认不公开发布；如果需要公开发起，我会单独征得你确认。',
      approvalPolicy: '创建约练前必须由你确认时间、地点和参与边界。',
      meetLoopNextStep: '确认后进入“等待回复/确认到达/评价回写”的约练闭环。',
      checkinReminder: '活动开始前我会提醒你确认是否到达，不会自动替你签到。',
      reviewPrompt: '活动结束后我会请你做一次简短评价，再决定是否写入画像。',
      lifeGraphUpdatePreview: '只有你确认后，活动结果才会作为长期偏好的更新建议。',
      trustScoreUpdatePreview: '完成、评价和守约情况会作为后续推荐可信度的弱信号。',
      autoPublished: false,
      publicIntentId: null,
      discoverHref: null,
      publicIntentHref: null,
      messagesHref: null,
    });
  });

  it('keeps candidate and activity opportunity views public-facing when backend includes internal fields', () => {
    const candidateCard = normalizeAssistantCard({
      schemaType: 'social_match.candidate',
      title: '候选机会',
      data: {
        opportunity: {
          name: '小林',
          title: '和小林轻松跑步',
          summary: '你们的时间、强度和边界更接近。',
          confirmedContext: ['青岛', '周末下午', '轻松跑', '公共场所'],
          reasons: ['时间一致', '强度接近'],
          traceId: 'hidden-candidate-trace',
          planner: 'hidden-candidate-planner',
          rawJson: { debug: 'hidden-candidate-raw' },
          stack: 'hidden-candidate-stack',
        },
        traceId: 'hidden-root-trace',
        structuredIntent: { raw: 'hidden-intent' },
      },
      actions: [
        {
          id: 'connect',
          label: '加好友',
          schemaAction: 'candidate.connect',
          requiresConfirmation: true,
          payload: {
            candidateId: 501,
            targetUserId: 22,
            traceId: 'hidden-action-trace',
            planner: 'hidden-action-planner',
            nested: {
              safeNote: '保留',
              rawJson: { debug: 'hidden-action-raw' },
              stack: 'hidden-action-stack',
            },
          },
        },
      ],
    });

    const activityCard = normalizeAssistantCard({
      schemaType: 'social_match.activity',
      title: '活动机会',
      data: {
        opportunity: {
          title: '周末海边轻松跑',
          summary: '公开活动比直接连接陌生人更低压力。',
          confirmedContext: ['青岛', '周六 16:00', '轻松跑', '先站内聊'],
          city: '青岛',
          time: '周六 16:00',
          tags: ['跑步', '公开活动'],
          traceId: 'hidden-activity-trace',
          agentTrace: 'hidden-activity-agent-trace',
          rawJson: { debug: 'hidden-activity-raw' },
        },
        runtime: { hidden: 'hidden-runtime' },
      },
      actions: [
        {
          id: 'activity',
          label: '查看详情',
          schemaAction: 'activity.view_detail',
          payload: {
            activityId: 33,
            internal: 'hidden-internal',
            metadata: { traceId: 'hidden-metadata-trace' },
          },
        },
      ],
    });

    expect(JSON.stringify(normalizeCandidateOpportunityView(candidateCard))).not.toMatch(
      /hidden-|traceId|planner|rawJson|stack|structuredIntent/,
    );
    expect(JSON.stringify(normalizeActivityOpportunityView(activityCard))).not.toMatch(
      /hidden-|traceId|agentTrace|rawJson|runtime/,
    );
    expect(candidateCard.actions).toEqual([
      expect.objectContaining({
        payload: {
          candidateId: 501,
          targetUserId: 22,
          nested: { safeNote: '保留' },
        },
      }),
    ]);
    expect(activityCard.actions).toEqual([
      expect.objectContaining({
        payload: { activityId: 33 },
      }),
    ]);
  });

  it('normalizes Life Graph diffs with conflict and confirmation boundaries', () => {
    const card = normalizeAssistantCard({
      schemaType: 'life_graph.diff',
      title: '旧画像标题',
      body: '旧建议',
      data: {
        before: '旧当前值',
        after: '旧建议值',
        sensitivityLevel: '低',
        diff: {
          title: '运动偏好更新',
          description: '确认后只写入运动偏好。',
          current: '周末偏好不明确',
          proposed: '更适合周末下午轻松跑',
          fields: ['时间偏好', '运动强度'],
          conflicts: ['之前记录过工作日晚间也可运动'],
          sensitivityLevel: '中',
          confirmationBoundary: '只更新运动偏好，不写入具体位置。',
          revokeHint: '确认后仍可撤回这条偏好。',
          sourceSignals: ['本轮对话提到周末下午', '明确选择轻松跑'],
        },
      },
    });

    expect(normalizeLifeGraphDiffView(card)).toEqual({
      title: '运动偏好更新',
      description: '确认后只写入运动偏好。',
      source: null,
      sourceLabel: '待确认的画像信号',
      currentValue: '周末偏好不明确',
      proposedValue: '更适合周末下午轻松跑',
      fields: ['时间偏好', '运动强度'],
      conflicts: ['之前记录过工作日晚间也可运动'],
      sensitivityLevel: '中',
      confirmationBoundary: '只更新运动偏好，不写入具体位置。',
      privacyBoundary: null,
      revokeHint: '确认后仍可撤回这条偏好。',
      sourceSignals: ['本轮对话提到周末下午', '明确选择轻松跑'],
    });
  });

  it('normalizes Meet Loop timelines from explicit steps or stage fallback', () => {
    const explicit = normalizeAssistantCard({
      schemaType: 'meet_loop.timeline',
      title: '旧约练进展',
      body: '旧描述',
      data: {
        timeline: {
          title: '周末邀约进展',
          description: '我会按可继续步骤推进。',
          nextAction: '等待你确认后发送邀请。',
          steps: [
            {
              key: 'draft',
              label: '发起',
              state: 'done',
              description: '已经整理好时间、地点和边界。',
              actionLabel: '已生成草稿',
              checkpointReady: true,
              resumeMode: 'resume',
            },
            {
              key: 'sent',
              label: '等待回复',
              state: 'current',
              description: '确认后发送，不重复打扰。',
              nextAction: '确认后发送',
              canResume: true,
              resumeMode: 'resume',
            },
          ],
        },
      },
    });

    const explicitView = normalizeMeetLoopTimelineView(explicit);
    expect(explicitView.title).toBe('周末邀约进展');
    expect(explicitView.description).toBe('我会按可继续步骤推进。');
    expect(explicitView.nextAction).toBe('等待你确认后发送邀请。');
    expect(explicitView.stage).toBeNull();
    expect(explicitView.connectionState).toBeNull();
    expect(explicitView.replyPreview).toBeNull();
    expect(explicitView.steps.slice(0, 2)).toEqual([
      {
        key: 'draft',
        label: '发起',
        state: 'done',
        description: '已经整理好时间、地点和边界。',
        actionLabel: '已生成草稿',
        checkpointReady: true,
        resumeMode: 'resume',
      },
      {
        key: 'sent',
        label: '等待回复',
        state: 'current',
        description: '确认后发送，不重复打扰。',
        actionLabel: '确认后发送',
        checkpointReady: true,
        resumeMode: 'resume',
      },
    ]);
    expect(explicitView.steps.map((step) => step.key)).toEqual([
      'draft',
      'sent',
      'reschedule',
      'confirmed',
      'met',
      'completed',
      'life_graph',
    ]);
    expect(explicitView.steps.find((step) => step.key === 'met')).toMatchObject({
      label: '见面',
      actionLabel: '安全见面',
      state: 'next',
    });

    const fallback = normalizeMeetLoopTimelineView(
      normalizeAssistantCard({
        schemaType: 'meet_loop.timeline',
        data: { loopStage: 'confirmed' },
      }),
    );

    expect(fallback.steps.map((step) => [step.key, step.state])).toEqual([
      ['draft', 'done'],
      ['sent', 'done'],
      ['reschedule', 'done'],
      ['confirmed', 'current'],
      ['met', 'next'],
      ['completed', 'next'],
      ['life_graph', 'next'],
    ]);
    expect(fallback.steps.find((step) => step.key === 'confirmed')).toMatchObject({
      actionLabel: '确认细节',
      checkpointReady: true,
      resumeMode: 'resume',
    });
    expect(fallback.nextAction).toBe('下一步会等你确认后继续。');

    const checkedIn = normalizeMeetLoopTimelineView(
      normalizeAssistantCard({
        schemaType: 'meet_loop.timeline',
        data: { loopStage: 'activity_checked_in' },
      }),
    );

    expect(checkedIn.steps.map((step) => [step.key, step.state])).toEqual([
      ['draft', 'done'],
      ['sent', 'done'],
      ['reschedule', 'done'],
      ['confirmed', 'done'],
      ['met', 'current'],
      ['completed', 'next'],
      ['life_graph', 'next'],
    ]);
    expect(checkedIn.steps.find((step) => step.key === 'met')).toMatchObject({
      actionLabel: '安全见面',
      checkpointReady: true,
      resumeMode: null,
    });
  });

  it('normalizes counterpart reply timeline and Life Graph weak-signal fields', () => {
    const timeline = normalizeMeetLoopTimelineView(
      normalizeAssistantCard({
        schemaType: 'meet_loop.timeline',
        data: {
          schemaName: 'MeetLoopTimelineCard',
          loopStage: 'reply_received',
          connectionState: 'reply_received',
          replyPreview: '可以呀，周末下午先轻松跑一圈。',
          timeline: {
            title: '邀约进展',
            description: '对方已经回复，可以继续站内聊。',
            nextAction: '继续站内聊天，或在你确认后发起约练。',
            recoveryProtocol: [
              {
                key: 'checkpoint',
                label: '可继续',
                detail: '当前邀约状态已保存，刷新或断线后可以回到这一步。',
              },
              {
                key: 'side_effect',
                label: '触达边界',
                detail: '不会自动追发、加好友、创建活动或公开发布。',
              },
            ],
          },
        },
      }),
    );

    expect(timeline).toMatchObject({
      title: '邀约进展',
      description: '对方已经回复，可以继续站内聊。',
      nextAction: '继续站内聊天，或在你确认后发起约练。',
      stage: 'reply_received',
      connectionState: 'reply_received',
      replyPreview: '可以呀，周末下午先轻松跑一圈。',
      recoveryProtocol: [
        {
          key: 'checkpoint',
          label: '可继续',
          detail: '当前邀约状态已保存，刷新或断线后可以回到这一步。',
        },
        {
          key: 'side_effect',
          label: '触达边界',
          detail: '不会自动追发、加好友、创建活动或公开发布。',
        },
      ],
    });
    expect(timeline.steps.find((step) => step.key === 'sent')).toMatchObject({
      state: 'current',
      actionLabel: '等待回复',
      checkpointReady: true,
    });

    const diff = normalizeLifeGraphDiffView(
      normalizeAssistantCard({
        schemaType: 'life_graph.diff',
        title: '这次回应可以作为一条弱画像信号。',
        body: '确认前不会写入长期画像。',
        data: {
          schemaName: 'LifeGraphDiffCard',
          source: 'counterpart_reply',
          loopStage: 'reply_received',
          diff: {
            title: '低压力开场互动信号',
            description: '对方已经回复，说明这类低压力开场方式有效。',
            currentValue: '不把这次回复写入长期画像',
            proposedValue: '提高低压力开场权重',
            fields: ['低压力开场', '站内聊天边界'],
            privacyBoundary: '不会写入精确位置或私聊内容。',
            sourceSignals: ['对方已回复', '先站内聊边界'],
          },
        },
      }),
    );

    expect(diff).toMatchObject({
      source: 'counterpart_reply',
      sourceLabel: '对方回复后的弱互动信号',
      title: '低压力开场互动信号',
      currentValue: '不把这次回复写入长期画像',
      proposedValue: '提高低压力开场权重',
      privacyBoundary: '不会写入精确位置或私聊内容。',
      sourceSignals: ['对方已回复', '先站内聊边界'],
    });
  });

  it('normalizes safety approvals with risk reasons and audit notes', () => {
    const card = normalizeAssistantCard({
      schemaType: 'safety.approval',
      title: '旧安全标题',
      body: '旧安全说明',
      data: {
        safetyBoundary: '旧安全边界',
        riskLevel: '旧等级',
        approval: {
          title: '发送邀请前确认',
          boundary: '这会向对方发送真实邀请，必须由你确认。',
          riskLevel: '高',
          reasons: ['会触达真实用户', '包含你的约练时间'],
          auditNote: '确认后会记录审批日志。',
          confirmationLabel: '你确认后才发送',
          checkpointLabel: '可从同一步恢复',
        },
      },
    });

    expect(normalizeSafetyApprovalView(card)).toEqual({
      title: '发送邀请前确认',
      boundary: '这会向对方发送真实邀请，必须由你确认。',
      riskLevel: '高',
      reasons: ['会触达真实用户', '包含你的约练时间'],
      auditNote: '确认后会记录审批日志。',
      confirmationLabel: '你确认后才发送',
      checkpointLabel: '可从同一步恢复',
    });
  });

  it('normalizes generic cards without leaking internal process fields', () => {
    const card = normalizeAssistantCard({
      schemaType: 'generic.card',
      title: 'planner raw JSON traceId',
      body: 'agentTrace checkpoint replay fork',
      status: 'ready',
      data: {
        statusLabel: 'tool_result complete',
        details: [
          'traceId should become public',
          'planner should become next step',
          'raw JSON should not look technical',
        ],
        traceId: 'hidden-trace',
        planner: 'hidden-plan',
        rawJson: { hidden: true },
      },
      actions: [
        {
          id: 'generic',
          label: '继续',
          schemaAction: 'debug.raw_tool',
          payload: {
            traceId: 'hidden',
            safeNote: '保留',
          },
        },
      ],
    });

    expect(normalizeGenericCardView(card)).toEqual({
      title: '整理结果',
      body: null,
      statusLabel: '已整理',
      details: [],
    });
    expect(card.actions).toEqual([
      expect.objectContaining({
        schemaAction: undefined,
        payload: undefined,
      }),
    ]);
  });
});
