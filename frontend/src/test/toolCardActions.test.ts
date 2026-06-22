import { describe, expect, it } from 'vitest';

import {
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  type SchemaDrivenAssistantCard,
} from '../components/assistant-ui/tool-ui-schema';
import {
  cardActionNavigationHrefForTests,
  cardActionRuntimeKey,
  cardActionRuntimeScope,
  visibleCardActions,
} from '../components/assistant-ui/tool-card-actions';
import { TOOL_UI_CARD_ACTION_COPY } from '../components/assistant-ui/tool-ui-action-copy';

describe('tool-card-actions runtime identity', () => {
  it('isolates local card action state by thread, run, message, and card', () => {
    const base = cardActionRuntimeKey(
      cardActionRuntimeScope({
        threadId: 'thread-a',
        runId: 'run-a',
        messageId: 'assistant-message-a',
      }),
      'candidate-card-a',
    );

    expect(
      cardActionRuntimeKey(
        cardActionRuntimeScope({
          threadId: 'thread-b',
          runId: 'run-a',
          messageId: 'assistant-message-a',
        }),
        'candidate-card-a',
      ),
    ).not.toBe(base);
    expect(
      cardActionRuntimeKey(
        cardActionRuntimeScope({
          threadId: 'thread-a',
          runId: 'run-b',
          messageId: 'assistant-message-a',
        }),
        'candidate-card-a',
      ),
    ).not.toBe(base);
    expect(
      cardActionRuntimeKey(
        cardActionRuntimeScope({
          threadId: 'thread-a',
          runId: 'run-a',
          messageId: 'assistant-message-b',
        }),
        'candidate-card-a',
      ),
    ).not.toBe(base);
    expect(
      cardActionRuntimeKey(
        cardActionRuntimeScope({
          threadId: 'thread-a',
          runId: 'run-a',
          messageId: 'assistant-message-a',
        }),
        'candidate-card-b',
      ),
    ).not.toBe(base);
  });

  it('keeps save and opener generation as low-risk candidate buttons even if backend marks them as confirmable', () => {
    const actions = visibleCardActions(
      {
        id: 'candidate-chen',
        type: 'candidate_card',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          candidateRecordId: 501,
          targetUserId: 22,
        },
        actions: [
          {
            id: 'save-chen',
            label: '收藏',
            action: 'save_candidate',
            requiresConfirmation: true,
          },
          {
            id: 'opener-chen',
            label: '生成开场白',
            action: 'generate_opener',
            requiresConfirmation: true,
          },
        ],
      },
      [
        {
          id: 'save-chen',
          label: '收藏',
          action: 'save_candidate',
          requiresConfirmation: true,
        },
        {
          id: 'opener-chen',
          label: '生成开场白',
          action: 'generate_opener',
          requiresConfirmation: true,
        },
      ],
    );

    expect(actions.find((action) => action.action === 'save_candidate')).toMatchObject({
      label: '收藏',
      requiresConfirmation: false,
    });
    expect(actions.find((action) => action.action === 'generate_opener')).toMatchObject({
      label: '生成开场白',
      requiresConfirmation: false,
    });
  });

  it('keeps opener generation copy in draft mode instead of approval mode', () => {
    expect(TOOL_UI_CARD_ACTION_COPY['candidate.generate_opener'].result).toBe(
      '开场白草稿已准备好，不会自动发送给对方。',
    );
    expect(TOOL_UI_CARD_ACTION_COPY['opener.regenerate'].result).toBe(
      '已重新生成开场白草稿，不会自动发送给对方。',
    );
    expect(TOOL_UI_CARD_ACTION_COPY['candidate.generate_opener'].result).not.toMatch(
      /真正发送前|等你确认|审批/,
    );
  });

  it('upgrades sending, connecting, and publishing to confirmation actions even if backend omits the flag', () => {
    const candidateActions = visibleCardActions(
      {
        id: 'candidate-chen',
        type: 'candidate_card',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          candidateRecordId: 501,
          targetUserId: 22,
        },
        actions: [
          {
            id: 'send-chen',
            label: '发送邀请',
            action: 'send_invite',
            requiresConfirmation: false,
          },
          {
            id: 'connect-chen',
            label: '加好友并聊天',
            action: 'connect_candidate',
            requiresConfirmation: false,
          },
        ],
      },
      [
        {
          id: 'send-chen',
          label: '发送邀请',
          action: 'send_invite',
          requiresConfirmation: false,
        },
        {
          id: 'connect-chen',
          label: '加好友并聊天',
          action: 'connect_candidate',
          requiresConfirmation: false,
        },
      ],
    );
    const activityActions = visibleCardActions(
      {
        id: 'activity-walk',
        type: 'activity_plan',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '青岛大学散步约练',
        data: {
          taskId: 77,
          opportunityId: 'walk-qdu',
        },
        actions: [
          {
            id: 'publish-walk',
            label: '发布到发现',
            action: 'publish_social_request',
            requiresConfirmation: false,
          },
        ],
      },
      [
        {
          id: 'publish-walk',
          label: '发布到发现',
          action: 'publish_social_request',
          requiresConfirmation: false,
        },
      ],
    );

    expect(candidateActions.find((action) => action.action === 'send_invite')).toMatchObject({
      label: '发送邀请',
      requiresConfirmation: true,
    });
    expect(candidateActions.find((action) => action.action === 'connect_candidate')).toMatchObject({
      label: '加好友并聊天',
      requiresConfirmation: true,
    });
    expect(activityActions.find((action) => action.action === 'publish_social_request')).toMatchObject({
      label: '发布到发现',
      requiresConfirmation: true,
    });
  });

  it('dedupes raw backend candidate actions against default product actions', () => {
    const actions = visibleCardActions(
      {
        id: 'candidate-chen',
        type: 'candidate_card',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.candidate',
        title: '陈砚',
        data: {
          candidateRecordId: 501,
          targetUserId: 22,
        },
        actions: [
          { id: 'raw-view', label: 'view_candidate', action: 'view_candidate' },
          { id: 'raw-save', label: 'save_candidate', action: 'save_candidate' },
          { id: 'raw-opener', label: 'generate_opener', action: 'generate_opener' },
          { id: 'raw-send', label: 'send_invite', action: 'send_invite' },
          { id: 'raw-connect', label: 'connect_candidate', action: 'connect_candidate' },
        ],
      },
      [
        { id: 'raw-view', label: 'view_candidate', action: 'view_candidate' },
        { id: 'raw-save', label: 'save_candidate', action: 'save_candidate' },
        { id: 'raw-opener', label: 'generate_opener', action: 'generate_opener' },
        { id: 'raw-send', label: 'send_invite', action: 'send_invite' },
        { id: 'raw-connect', label: 'connect_candidate', action: 'connect_candidate' },
      ],
    );

    expect(actions.map((action) => action.label)).toEqual([
      '查看详情',
      '收藏',
      '生成开场白',
      '发送邀请',
      '加好友并聊天',
    ]);
    expect(actions).toHaveLength(5);
    expect(actions.filter((action) => action.label === '发送邀请')).toHaveLength(1);
    expect(actions.filter((action) => action.label === '加好友并聊天')).toHaveLength(1);
    expect(actions.find((action) => action.label === '收藏')).toMatchObject({
      requiresConfirmation: false,
    });
    expect(actions.find((action) => action.label === '生成开场白')).toMatchObject({
      requiresConfirmation: false,
    });
    expect(actions.find((action) => action.label === '发送邀请')).toMatchObject({
      requiresConfirmation: true,
    });
    expect(actions.find((action) => action.label === '加好友并聊天')).toMatchObject({
      requiresConfirmation: true,
    });
  });

  it('dedupes raw backend opportunity actions against default product actions', () => {
    const actions = visibleCardActions(
      {
        id: 'activity-walk',
        type: 'activity_plan',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '青岛大学散步约练',
        data: {
          taskId: 77,
          opportunityId: 'walk-qdu',
        },
        actions: [
          { id: 'raw-publish', label: 'publish_social_request', action: 'publish_social_request' },
          { id: 'raw-modify', label: 'modify_activity', action: 'modify_activity' },
          { id: 'raw-skip', label: 'skip_publish', action: 'skip_publish' },
        ],
      },
      [
        { id: 'raw-publish', label: 'publish_social_request', action: 'publish_social_request' },
        { id: 'raw-modify', label: 'modify_activity', action: 'modify_activity' },
        { id: 'raw-skip', label: 'skip_publish', action: 'skip_publish' },
      ],
    );

    expect(actions.map((action) => action.label)).toEqual([
      '发布到发现',
      '修改',
      '暂不发布',
    ]);
    expect(actions).toHaveLength(3);
    expect(actions.find((action) => action.label === '发布到发现')).toMatchObject({
      requiresConfirmation: true,
    });
    expect(actions.find((action) => action.label === '修改')).toMatchObject({
      requiresConfirmation: false,
    });
    expect(actions.find((action) => action.label === '暂不发布')).toMatchObject({
      requiresConfirmation: false,
    });
  });

  it('keeps location modification actions separate from time modification actions', () => {
    const actions = visibleCardActions(
      {
        id: 'activity-walk',
        type: 'activity_plan',
        schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
        schemaType: 'social_match.activity',
        title: '青岛大学散步约练',
        data: {
          taskId: 77,
          opportunityId: 'walk-qdu',
        },
        actions: [
          { id: 'raw-location', label: '改地点', action: 'change_location' },
        ],
      },
      [
        { id: 'raw-location', label: '改地点', action: 'change_location' },
      ],
    );

    expect(actions.find((action) => action.action === 'change_location')).toMatchObject({
      schemaAction: 'activity.modify_location',
      label: '修改',
    });
  });

  it('routes candidate detail actions to the public user profile page', () => {
    const card: SchemaDrivenAssistantCard = {
      id: 'candidate-chen',
      type: 'candidate_card',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.candidate',
      title: '陈砚',
      data: {
        candidateRecordId: 501,
        targetUserId: 22,
      },
      actions: [],
    };
    const detailAction = visibleCardActions(card, [])[0];

    expect(detailAction).toMatchObject({
      label: '查看详情',
      schemaAction: 'candidate.view_detail',
      requiresConfirmation: false,
    });
    expect(cardActionNavigationHrefForTests(card, detailAction)).toBe('/user/22');
  });

  it('keeps published discover detail actions visible and routes them to the public intent page', () => {
    const card: SchemaDrivenAssistantCard = {
      id: 'publish_to_discover:77:intent_302',
      type: 'activity_status',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'social_match.activity',
      title: '已发布到发现',
      data: {
        taskId: 77,
        publicIntentId: 'intent_302',
        discoverHref: '/public-intent/intent_302',
      },
      actions: [
        {
          id: 'view_public_intent',
          label: '查看详情',
          action: 'activity.view_detail',
          schemaAction: 'activity.view_detail',
          requiresConfirmation: false,
          payload: {
            taskId: 77,
            publicIntentId: 'intent_302',
            discoverHref: '/public-intent/intent_302',
          },
        },
      ],
    };
    const actions = visibleCardActions(card, card.actions);

    expect(actions.map((action) => action.label)).toContain('查看详情');
    const detailAction = actions.find((action) => action.schemaAction === 'activity.view_detail');
    expect(detailAction).toBeTruthy();
    expect(cardActionNavigationHrefForTests(card, detailAction!)).toBe('/public-intent/intent_302');
  });
});
