import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TravelDraftCard, TravelIntakeCard } from '../components/assistant-ui/tool-travel-cards';
import { FitMeetToolUIActionsProvider } from '../components/assistant-ui/tool-ui-actions';
import {
  FITMEET_TOOL_UI_SCHEMA_VERSION,
  type SchemaDrivenAssistantCard,
} from '../components/assistant-ui/tool-ui-schema';

describe('Travel loop cards', () => {
  it('submits dynamic local form state as travel slots', async () => {
    const onCardAction = vi.fn().mockResolvedValue({ assistantMessage: '已生成旅行寻伴卡' });
    const card: SchemaDrivenAssistantCard = {
      id: 'travel_intake:101:missing',
      type: 'travel_intake',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'travel.intake',
      title: '填写本次旅行寻伴需求',
      body: '补齐本次旅行寻伴需要的信息即可生成旅行寻伴卡。',
      data: {
        taskId: 101,
        missingFields: ['destination', 'departureTime', 'budgetRange', 'transportMode'],
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <TravelIntakeCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('成都 / 大理 / 三亚'), {
      target: { value: '成都' },
    });
    fireEvent.change(screen.getByPlaceholderText('周末 / 下周末 / 国庆'), {
      target: { value: '周末' },
    });
    fireEvent.change(screen.getByPlaceholderText('两天一晚 / 三天两晚'), {
      target: { value: '两天一晚' },
    });
    fireEvent.change(screen.getByPlaceholderText('人均1000元 / AA / 穷游'), {
      target: { value: '人均1000元' },
    });
    fireEvent.change(screen.getByPlaceholderText('高铁 / 飞机 / 自驾'), {
      target: { value: '高铁' },
    });
    fireEvent.change(screen.getByPlaceholderText('美食、拍照、徒步'), {
      target: { value: '美食、拍照' },
    });
    fireEvent.change(screen.getByPlaceholderText('不限 / 女生 / 男生'), {
      target: { value: '不限' },
    });
    fireEvent.change(screen.getByPlaceholderText('会拍照优先 / 低拍照需求'), {
      target: { value: '会拍照优先' },
    });
    fireEvent.change(screen.getByPlaceholderText('不拼房 / 酒店 / 青旅'), {
      target: { value: '不拼房' },
    });
    fireEvent.change(screen.getByPlaceholderText('美食探店 / 能吃辣 / 清淡'), {
      target: { value: '美食探店' },
    });
    fireEvent.change(screen.getByPlaceholderText('例如：预算相近、同城出发、不赶路、会拍照'), {
      target: { value: '预算相近' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成旅行寻伴卡' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'travel_intake:101:missing',
        action: 'travel_intake.submit',
        schemaAction: 'travel_intake.submit',
        payload: expect.objectContaining({
          slots: expect.objectContaining({
            destination: '成都',
            departureTime: '周末',
            duration: '两天一晚',
            budgetRange: '人均1000元',
            transportMode: '高铁',
            tags: ['美食', '拍照'],
            genderPreference: '不限',
            photoPreference: '会拍照优先',
            accommodationPreference: '不拼房',
            foodPreference: '美食探店',
            candidatePreference: '预算相近',
            visibilityPreference: 'private',
          }),
        }),
      }),
    );
  });

  it('starts private matching from travel draft without publishing', async () => {
    const onCardAction = vi.fn().mockResolvedValue({ assistantMessage: '已进入私密旅行匹配' });
    const card: SchemaDrivenAssistantCard = {
      id: 'travel_draft:101:801',
      type: 'travel_companion_draft',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'travel.companion_draft',
      title: '成都旅行寻伴',
      body: '确认后进入私密匹配。',
      data: {
        taskId: 101,
        socialRequestId: 801,
        destination: '成都',
        departureTime: '周末',
        duration: '两天一晚',
        budgetRange: '人均1000元',
        transportMode: '高铁',
        tags: ['美食'],
        safetyBoundary: '站内先聊，不交换联系方式',
        socialRequestDraft: { title: '成都旅行寻伴' },
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <TravelDraftCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '不公开，开始私密匹配' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'travel_draft:101:801',
        action: 'travel_draft.private_match',
        schemaAction: 'travel_draft.private_match',
        payload: expect.objectContaining({
          socialRequestId: 801,
          socialRequestDraft: expect.objectContaining({
            title: '成都旅行寻伴',
          }),
        }),
      }),
    );
  });

  it('publishes travel draft to Discover from the draft card', async () => {
    const onCardAction = vi
      .fn()
      .mockResolvedValue({ assistantMessage: '已发布到发现，并进入旅行寻伴匹配队列' });
    const card: SchemaDrivenAssistantCard = {
      id: 'travel_draft:101:801',
      type: 'travel_companion_draft',
      schemaVersion: FITMEET_TOOL_UI_SCHEMA_VERSION,
      schemaType: 'travel.companion_draft',
      title: '成都旅行寻伴',
      body: '可以发布到发现，也可以不公开继续私密旅行搭子匹配。',
      data: {
        taskId: 101,
        socialRequestId: 801,
        destination: '成都',
        departureTime: '周末',
        duration: '两天一晚',
        budgetRange: '人均1000元',
        transportMode: '高铁',
        tags: ['美食'],
        safetyBoundary: '站内先聊，不交换联系方式',
        socialRequestDraft: { title: '成都旅行寻伴', city: '成都' },
      },
      actions: [],
    };

    render(
      <FitMeetToolUIActionsProvider value={{ onCardAction }}>
        <TravelDraftCard card={card} />
      </FitMeetToolUIActionsProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '发布到发现' }));

    await waitFor(() => expect(onCardAction).toHaveBeenCalledTimes(1));
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 101,
        cardId: 'travel_draft:101:801',
        action: 'travel_draft.publish',
        schemaAction: 'travel_draft.publish',
        payload: expect.objectContaining({
          socialRequestId: 801,
          socialRequestDraft: expect.objectContaining({
            title: '成都旅行寻伴',
            city: '成都',
          }),
        }),
      }),
    );
  });
});
