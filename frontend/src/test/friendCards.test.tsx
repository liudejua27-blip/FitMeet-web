import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FriendDraftCard, FriendIntakeCard } from '../components/assistant-ui/tool-friend-cards';
import { FitMeetToolUIActionsProvider } from '../components/assistant-ui/tool-ui-actions';
import {
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  type SchemaDrivenAssistantCard,
} from '../components/assistant-ui/tool-ui-schema';

describe('Friend loop cards', () => {
  it('submits dynamic local form state as friend slots', async () => {
    const onCardAction = vi.fn().mockResolvedValue({ assistantMessage: '已生成交友卡' });
    const card: SchemaDrivenAssistantCard = {
      id: 'friend_intake:101:missing',
      type: 'friend_intake',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'friend.intake',
      title: '填写本次交友需求',
      body: '补齐本次交友需要的信息即可生成交友卡。',
      data: {
        taskId: 101,
        missingFields: ['friendGoal', 'city'],
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <FriendIntakeCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('认识新朋友 / 聊天搭子'), {
      target: { value: '认识新朋友' },
    });
    fireEvent.change(screen.getByPlaceholderText('青岛 / 上海 / 成都'), {
      target: { value: '青岛' },
    });
    fireEvent.change(screen.getByPlaceholderText('市南区 / 学校附近 / 公司附近'), {
      target: { value: '市南区' },
    });
    fireEvent.change(screen.getByPlaceholderText('咖啡、电影、摄影'), {
      target: { value: '咖啡、电影' },
    });
    fireEvent.change(screen.getByPlaceholderText('不限性别 / 女生优先 / 男生优先'), {
      target: { value: '不限性别' },
    });
    fireEvent.change(screen.getByPlaceholderText('身材不限 / 爱运动 / 健康体型'), {
      target: { value: '身材不限' },
    });
    fireEvent.change(screen.getByPlaceholderText('外貌不限 / 清爽 / 照片真实'), {
      target: { value: '外貌不限，看聊得来' },
    });
    fireEvent.change(screen.getByPlaceholderText('先站内聊天 / 同城低压力认识'), {
      target: { value: '先站内聊天' },
    });
    fireEvent.change(screen.getByPlaceholderText('下班后 / 周末 / 晚上'), {
      target: { value: '周末' },
    });
    fireEvent.change(screen.getByPlaceholderText('例如：兴趣相近、低压力、资料公开完整的人优先'), {
      target: { value: '兴趣相近' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成交友卡' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'friend_intake:101:missing',
        action: 'friend_intake.submit',
        schemaAction: 'friend_intake.submit',
        payload: expect.objectContaining({
          slots: expect.objectContaining({
            friendGoal: '认识新朋友',
            city: '青岛',
            locationText: '市南区',
            topicTags: ['咖啡', '电影'],
            genderPreference: '不限性别',
            bodyPreference: '身材不限',
            appearancePreference: '外貌不限，看聊得来',
            scenePreference: '先站内聊天',
            timePreference: '周末',
            candidatePreference: '兴趣相近',
            visibilityPreference: 'private',
          }),
        }),
      }),
    );
  });

  it('starts private matching from friend draft without publishing', async () => {
    const onCardAction = vi.fn().mockResolvedValue({ assistantMessage: '已进入私密匹配' });
    const card: SchemaDrivenAssistantCard = {
      id: 'friend_draft:101:701',
      type: 'friend_draft',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'friend.draft',
      title: '青岛认识新朋友',
      body: '确认后进入私密匹配。',
      data: {
        taskId: 101,
        socialRequestId: 701,
        friendGoal: '认识新朋友',
        city: '青岛',
        locationText: '市南区',
        topicTags: ['咖啡'],
        genderPreference: '不限性别',
        bodyPreference: '身材不限',
        appearancePreference: '外貌不限，看聊得来',
        scenePreference: '先站内聊天',
        safetyBoundary: '站内先聊，不交换联系方式',
        socialRequestDraft: { title: '青岛认识新朋友' },
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <FriendDraftCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '不公开，开始私密匹配' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'friend_draft:101:701',
        action: 'friend_draft.private_match',
        schemaAction: 'friend_draft.private_match',
        payload: expect.objectContaining({
          socialRequestId: 701,
          socialRequestDraft: expect.objectContaining({
            title: '青岛认识新朋友',
          }),
        }),
      }),
    );
  });

  it('publishes friend draft to Discover from the draft card', async () => {
    const onCardAction = vi
      .fn()
      .mockResolvedValue({ assistantMessage: '已发布到发现，并进入交友匹配队列' });
    const card: SchemaDrivenAssistantCard = {
      id: 'friend_draft:101:701',
      type: 'friend_draft',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'friend.draft',
      title: '上海认识新朋友',
      body: '可以发布到发现，也可以不公开继续私密匹配。',
      data: {
        taskId: 101,
        socialRequestId: 701,
        friendGoal: '认识新朋友',
        city: '上海',
        locationText: '上海市区',
        topicTags: ['咖啡'],
        genderPreference: '不限性别',
        bodyPreference: '身材不限',
        appearancePreference: '外貌不限，看聊得来',
        scenePreference: '先站内聊天',
        safetyBoundary: '站内先聊，不交换联系方式',
        socialRequestDraft: { title: '上海认识新朋友', city: '上海' },
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <FriendDraftCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '发布到发现' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'friend_draft:101:701',
        action: 'friend_draft.publish',
        schemaAction: 'friend_draft.publish',
        payload: expect.objectContaining({
          socialRequestId: 701,
          socialRequestDraft: expect.objectContaining({
            title: '上海认识新朋友',
            city: '上海',
          }),
        }),
      }),
    );
  });
});
