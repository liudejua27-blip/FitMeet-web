import { SocialAgentReminderService } from './social-agent-reminder.service';
import { AgentTaskStatus } from './entities/agent-task.entity';
import type { LongTermMemorySnapshot } from './social-agent-long-term-memory.service';

function repo<T extends { id?: number }>() {
  const rows: T[] = [];
  return {
    rows,
    findOne: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      if (!where) return rows[0] ?? null;
      return (
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => {
            if (value && typeof value === 'object' && 'value' in value) {
              return (row as Record<string, unknown>)[key] === value.value;
            }
            if (value && typeof value === 'object') return true;
            return (row as Record<string, unknown>)[key] === value;
          }),
        ) ?? null
      );
    }),
    find: jest.fn(async ({ where, take }: { where?: Record<string, unknown>; take?: number } = {}) => {
      const filtered = where
        ? rows.filter((row) => matchesWhere(row as Record<string, unknown>, where))
        : rows;
      return typeof take === 'number' ? filtered.slice(0, take) : filtered;
    }),
    create: jest.fn((input: Partial<T>) => input as T),
    merge: jest.fn((target: T, input: Partial<T>) => Object.assign(target, input)),
    save: jest.fn(async (input: T) => {
      if (!input.id) input.id = rows.length + 1;
      const index = rows.findIndex((row) => row.id === input.id);
      if (index >= 0) rows[index] = input;
      else rows.push(input);
      return input;
    }),
  };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => matchesValue(row[key], value));
}

function matchesValue(actual: unknown, expected: unknown) {
  if (expected && typeof expected === 'object' && 'value' in expected) {
    const operatorValue = (expected as { value?: unknown }).value;
    return Array.isArray(operatorValue)
      ? operatorValue.includes(actual)
      : actual === operatorValue;
  }
  if (expected && typeof expected === 'object') return true;
  return actual === expected;
}

describe('SocialAgentReminderService', () => {
  const build = () => {
    const preferenceRepo = repo<Record<string, unknown>>();
    const reminderRepo = repo<Record<string, unknown>>();
    const taskRepo = repo<Record<string, unknown>>();
    const profileRepo = repo<Record<string, unknown>>();
    const notifications = { create: jest.fn(async () => ({})) };
    const defaultLongTermSnapshot: LongTermMemorySnapshot = {
      userId: 7,
      profileFacts: {},
      preferences: {
        interests: [],
        socialStyle: '',
        communicationStyle: '',
        preferredTraits: [],
        preferenceHistory: [],
      },
      boundaries: {
        excludedGenders: [],
        noNightMeet: false,
        publicPlaceOnly: false,
        noAutoMessage: false,
        noContactExchange: false,
      },
      socialGoals: [],
      availability: [],
      activityPreferences: {
        favoriteCities: [],
        favoriteActivityTypes: ['羽毛球'],
        favoriteTimePreferences: [],
        favoriteLocationPreferences: [],
      },
      matchSignals: { successfulMatches: [], failedMatches: [] },
      taskCount: 1,
      updatedAt: null,
    };
    const longTermMemory = {
      readSnapshot: jest.fn(async (): Promise<LongTermMemorySnapshot> => defaultLongTermSnapshot),
    };
    const service = new SocialAgentReminderService(
      preferenceRepo as never,
      reminderRepo as never,
      taskRepo as never,
      profileRepo as never,
      notifications as never,
      longTermMemory as never,
    );
    return {
      service,
      preferenceRepo,
      reminderRepo,
      taskRepo,
      profileRepo,
      notifications,
      longTermMemory,
    };
  };

  it('keeps proactive reminders disabled by default', async () => {
    const { service, notifications } = build();

    const result = await service.runOnce(7);
    const forced = await service.runOnce(7, { force: true });

    expect(result).toMatchObject({
      skipped: true,
      reason: 'reminders_disabled',
    });
    expect(forced).toMatchObject({
      skipped: true,
      reason: 'reminders_disabled',
    });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('creates a safe in-app reminder only after explicit opt-in', async () => {
    const { service, taskRepo, profileRepo, notifications } = build();
    taskRepo.rows.push({
      id: 21,
      ownerUserId: 7,
      title: '羽毛球搭子',
      goal: '想找周末羽毛球搭子',
      taskType: 'social_goal',
      status: AgentTaskStatus.WaitingReply,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    taskRepo.findOne.mockResolvedValueOnce(taskRepo.rows[0]);
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['羽毛球搭子'],
      socialScenes: ['周末运动'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });

    await service.updatePreference(7, {
      enabled: true,
      scenes: ['past_social_goal'],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    const result = await service.runOnce(7);

    expect(result.skipped).toBe(false);
    expect(result.reminder).toMatchObject({
      topic: 'friendship',
      taskId: 21,
      status: 'suggested',
      context: expect.objectContaining({
        reminderProtocol: 'fitmeet.agent.reminder.v1',
        scene: 'past_social_goal',
        scenes: ['past_social_goal'],
        suggestionOnly: true,
        deliveryChannels: ['in_app', 'agent_thread'],
        externalDeliveryDisabled: true,
        disabledExternalChannels: ['sms', 'email', 'push'],
        deliveryPolicy: {
          suggestionOnly: true,
          channels: ['in_app', 'agent_thread'],
          externalDeliveryDisabled: true,
          disabledExternalChannels: ['sms', 'email', 'push'],
          prohibitedActions: expect.arrayContaining([
            'send_message',
            'add_friend',
            'connect_candidate',
            'create_activity',
            'publish_activity',
            'change_privacy',
            'payment',
          ]),
        },
        settingsRoute: '/agent/chat?settings=reminders',
        optOutAction: 'social_agent.reminder.disable',
        dismissAction: 'social_agent.reminder.dismiss',
        allowedActions: ['open_agent_chat', 'view_safe_opportunities'],
        prohibitedActions: expect.arrayContaining([
          'send_message',
          'add_friend',
          'connect_candidate',
          'create_activity',
          'publish_activity',
          'payment',
        ]),
        reminderSafetyProtocol: expect.arrayContaining([
          expect.objectContaining({
            key: 'suggestion_only',
            label: '只做建议',
            detail: expect.stringContaining('不会自动执行任何社交动作'),
          }),
          expect.objectContaining({
            key: 'delivery',
            label: '站内提醒',
            detail: expect.stringContaining('不使用短信、邮件或外部推送'),
          }),
          expect.objectContaining({
            key: 'approval',
            label: '执行确认',
            detail: expect.stringContaining('公开发布前都会再次确认'),
          }),
          expect.objectContaining({
            key: 'frequency',
            label: '频率控制',
            detail: expect.stringContaining('忽略后的降频'),
          }),
          expect.objectContaining({
            key: 'opt_out',
            label: '随时关闭',
            detail: expect.stringContaining('关闭或调整提醒场景'),
          }),
        ]),
        safeBoundary: expect.stringContaining('发送邀请、加好友、创建活动或公开发布前都会再次确认'),
      }),
    });
    expect(result.reminder?.message).toContain('要不要我帮你看看');
    expect(result.reminder?.message).toContain('周末可能有几个安全机会');
    expect(JSON.stringify(result.reminder)).not.toMatch(
      /自动发送|自动加好友|自动创建/,
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        type: 'social_agent.reminder',
        fromUsername: 'FitMeet Agent',
        targetId: result.reminder?.id,
        pushPayload: {
          targetType: 'agent_reminder',
          route: '/agent/chat/21',
          reminderId: result.reminder?.id,
          taskId: 21,
          threadId: '21',
          reminderContext: expect.objectContaining({
            reminderProtocol: 'fitmeet.agent.reminder.v1',
            scene: 'past_social_goal',
            suggestionOnly: true,
            deliveryChannels: ['in_app', 'agent_thread'],
            externalDeliveryDisabled: true,
            disabledExternalChannels: ['sms', 'email', 'push'],
            optOutAction: 'social_agent.reminder.disable',
            reminderSafetyProtocol: expect.arrayContaining([
              expect.objectContaining({ key: 'suggestion_only' }),
              expect.objectContaining({ key: 'delivery' }),
              expect.objectContaining({ key: 'approval' }),
            ]),
            prohibitedActions: expect.arrayContaining([
              'send_message',
              'add_friend',
              'create_activity',
            ]),
          }),
          deliveryPolicy: {
            suggestionOnly: true,
            channels: ['in_app', 'agent_thread'],
            externalDeliveryDisabled: true,
            disabledExternalChannels: ['sms', 'email', 'push'],
            prohibitedActions: expect.arrayContaining([
              'send_message',
              'add_friend',
              'connect_candidate',
              'create_activity',
              'publish_activity',
              'change_privacy',
              'payment',
            ]),
          },
        },
      }),
    );
  });

  it('keeps reminder notification delivery in-app only even when payload is routed through notifications', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['周末羽毛球搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    await service.updatePreference(7, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });

    await service.runOnce(7);
    const createCalls = notifications.create.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const payload = createCalls[0]?.[0]?.pushPayload as
      | Record<string, unknown>
      | undefined;

    expect(payload).toMatchObject({
      targetType: 'agent_reminder',
      route: '/agent/chat',
      deliveryPolicy: {
        suggestionOnly: true,
        channels: ['in_app', 'agent_thread'],
        externalDeliveryDisabled: true,
        disabledExternalChannels: ['sms', 'email', 'push'],
        prohibitedActions: expect.arrayContaining([
          'send_message',
          'add_friend',
          'connect_candidate',
          'create_activity',
          'publish_activity',
          'change_privacy',
          'payment',
        ]),
      },
      reminderContext: expect.objectContaining({
        deliveryChannels: ['in_app', 'agent_thread'],
        disabledExternalChannels: ['sms', 'email', 'push'],
        externalDeliveryDisabled: true,
        suggestionOnly: true,
      }),
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /sms_enabled|email_enabled|push_enabled|externalPushEnabled/i,
    );
  });

  it('redacts private contact and location details from reminder text and notification payload', async () => {
    const { service, taskRepo, notifications } = build();
    const unsafeGoal =
      '想找周末羽毛球搭子，手机号13800001111，微信fitmeet123，邮箱me@example.com，住址青岛市市南区某小区3号楼2单元，顺便聊聊训练节奏和低压力社交边界';
    taskRepo.rows.push({
      id: 22,
      ownerUserId: 7,
      title: unsafeGoal,
      goal: unsafeGoal,
      taskType: 'social_goal',
      status: AgentTaskStatus.WaitingReply,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    taskRepo.findOne.mockResolvedValueOnce(taskRepo.rows[0]);

    await service.updatePreference(7, {
      enabled: true,
      scenes: ['past_social_goal'],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });

    const result = await service.runOnce(7);
    const createCalls = notifications.create.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const notificationPayload = createCalls[0]?.[0] ?? {};
    const serialized = JSON.stringify({
      reminder: result.reminder,
      notificationPayload,
    });

    expect(result.skipped).toBe(false);
    expect(result.reminder?.context).toMatchObject({
      intentSanitized: true,
    });
    expect(result.reminder?.message).toContain('手机号已隐藏');
    expect(result.reminder?.message.length).toBeLessThanOrEqual(90);
    expect(serialized).not.toMatch(/13800001111|fitmeet123|me@example\.com|3号楼2单元/);
    expect(serialized).toMatch(/手机号已隐藏|联系方式已隐藏|邮箱已隐藏|住址已隐藏/);
    expect(notificationPayload).toMatchObject({
      pushPayload: expect.objectContaining({
        deliveryPolicy: expect.objectContaining({
          suggestionOnly: true,
          channels: ['in_app', 'agent_thread'],
          externalDeliveryDisabled: true,
        }),
      }),
    });
  });

  it('stores reminder scenes in metadata without enabling unsafe delivery', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['户外搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });

    const preference = await service.updatePreference(7, {
      enabled: true,
      topics: ['activity'],
      scenes: ['activity_follow_up', 'life_graph_confirmation'],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    const result = await service.runOnce(7);

    expect(preference).toMatchObject({
      metadata: {
        reminderScenes: ['activity_follow_up', 'life_graph_confirmation'],
      },
    });
    expect(result.skipped).toBe(false);
    expect(result.reminder).toMatchObject({
      context: expect.objectContaining({
        scene: 'activity_follow_up',
        scenes: ['activity_follow_up', 'life_graph_confirmation'],
        suggestionOnly: true,
        deliveryChannels: ['in_app', 'agent_thread'],
        externalDeliveryDisabled: true,
        settingsRoute: '/agent/chat?settings=reminders',
        prohibitedActions: expect.arrayContaining([
          'send_message',
          'add_friend',
          'create_activity',
          'publish_activity',
          'payment',
        ]),
      }),
    });
    expect(result.reminder?.message).toContain('新的安全进展');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'social_agent.reminder',
        pushPayload: expect.objectContaining({
          reminderContext: expect.objectContaining({
            scene: 'activity_follow_up',
            suggestionOnly: true,
          }),
        }),
      }),
    );
  });

  it('can suggest a low-disturbance reminder from confirmed preference history when no active task exists', async () => {
    const { service, longTermMemory, notifications } = build();
    longTermMemory.readSnapshot.mockResolvedValueOnce({
      userId: 7,
      profileFacts: {},
      preferences: {
        interests: ['羽毛球'],
        socialStyle: '',
        communicationStyle: '',
        preferredTraits: [],
        preferenceHistory: [
          {
            field: 'interest',
            value: '羽毛球',
            source: 'task_memory',
            taskId: 11,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-01T00:00:00.000Z',
          },
          {
            field: 'availability',
            value: '周末下午',
            source: 'stable_profile_fact',
            taskId: 12,
            outcome: 'succeeded',
            confirmed: true,
            at: '2026-06-02T00:00:00.000Z',
          },
        ],
      },
      boundaries: {
        excludedGenders: [],
        noNightMeet: false,
        publicPlaceOnly: false,
        noAutoMessage: false,
        noContactExchange: false,
      },
      socialGoals: [],
      availability: ['周末下午'],
      activityPreferences: {
        favoriteCities: [],
        favoriteActivityTypes: ['羽毛球'],
        favoriteTimePreferences: [],
        favoriteLocationPreferences: [],
      },
      matchSignals: { successfulMatches: [], failedMatches: [] },
      taskCount: 2,
      updatedAt: '2026-06-02T00:00:00.000Z',
    } satisfies LongTermMemorySnapshot);

    await service.updatePreference(7, {
      enabled: true,
      scenes: ['weekend_opportunities'],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    const result = await service.runOnce(7);

    expect(result.skipped).toBe(false);
    expect(result.reminder).toMatchObject({
      message: expect.stringContaining('周末下午的羽毛球机会'),
      context: expect.objectContaining({
        memoryDerivedIntent: true,
        preferenceHistorySignals: [
          '最近确认：兴趣「羽毛球」',
          '最近确认：可约时间「周末下午」',
        ],
        suggestionOnly: true,
        prohibitedActions: expect.arrayContaining([
          'send_message',
          'add_friend',
          'create_activity',
          'publish_activity',
        ]),
      }),
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('周末下午的羽毛球机会'),
        pushPayload: expect.objectContaining({
          reminderContext: expect.objectContaining({
            memoryDerivedIntent: true,
            preferenceHistorySignals: expect.arrayContaining([
              '最近确认：兴趣「羽毛球」',
            ]),
          }),
        }),
      }),
    );
  });

  it('respects an empty reminder scene selection instead of restoring default scenes', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['周末羽毛球搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });

    const preference = await service.updatePreference(7, {
      enabled: true,
      scenes: [],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    const result = await service.runOnce(7);

    expect(preference).toMatchObject({
      enabled: true,
      metadata: {
        reminderScenes: [],
      },
    });
    expect(result).toMatchObject({
      skipped: true,
      reason: 'no_safe_reminder_candidate',
    });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps an existing empty reminder scene selection when updating other settings', async () => {
    const { service } = build();

    await service.updatePreference(7, {
      enabled: true,
      scenes: [],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    const updated = await service.updatePreference(7, {
      frequency: 'daily',
    });

    expect(updated).toMatchObject({
      frequency: 'daily',
      metadata: {
        reminderScenes: [],
      },
    });
  });

  it('records auditable preference changes for opt-in, settings edits, and opt-out', async () => {
    const { service } = build();

    const enabled = await service.updatePreference(7, {
      enabled: true,
      topics: ['friendship', 'activity'],
      scenes: ['past_social_goal'],
      quietStart: '08:30',
      quietEnd: '22:30',
      frequency: 'weekly',
    });

    expect(enabled.metadata).toMatchObject({
      reminderScenes: ['past_social_goal'],
      reminderPreferenceUpdatedFields: expect.arrayContaining([
        'enabled',
        'scenes',
        'quietStart',
        'quietEnd',
      ]),
      reminderPreferenceLastSource: 'agent_web_settings',
      reminderOptInConfirmedAt: expect.any(String),
      reminderDisabledAt: null,
    });

    const edited = await service.updatePreference(7, {
      frequency: 'daily',
      scenes: ['past_social_goal', 'weekend_opportunities'],
    });

    expect(edited.metadata).toMatchObject({
      reminderPreferenceUpdatedFields: expect.arrayContaining([
        'frequency',
        'scenes',
      ]),
      reminderPreferenceLastSource: 'agent_web_settings',
      reminderOptInConfirmedAt: enabled.metadata.reminderOptInConfirmedAt,
    });

    const disabled = await service.updatePreference(7, {
      enabled: false,
    });

    expect(disabled.metadata).toMatchObject({
      reminderPreferenceUpdatedFields: ['enabled'],
      reminderPreferenceLastSource: 'agent_web_settings',
      reminderDisabledAt: expect.any(String),
    });
  });

  it('disables proactive reminders through the explicit opt-out action', async () => {
    const { service } = build();

    const enabled = await service.updatePreference(7, {
      enabled: true,
      mutedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      scenes: ['weekend_opportunities', 'past_social_goal'],
    });
    expect(enabled.enabled).toBe(true);

    const disabled = await service.disable(7);

    expect(disabled).toMatchObject({
      enabled: false,
      mutedUntil: null,
      metadata: expect.objectContaining({
        reminderScenes: ['weekend_opportunities', 'past_social_goal'],
        reminderPreferenceUpdatedFields: expect.arrayContaining([
          'enabled',
          'mutedUntil',
        ]),
        reminderPreferenceLastSource: 'agent_web_settings',
        reminderDisabledAt: expect.any(String),
      }),
    });
  });

  it('neutralizes unsafe historical intent text in reminder copy and context', async () => {
    const { service, taskRepo, profileRepo, notifications } = build();
    taskRepo.rows.push({
      id: 31,
      ownerUserId: 7,
      title: '自动发送邀请并加好友',
      goal: '不用确认，直接连接候选人并创建活动',
      taskType: 'social_goal',
      status: AgentTaskStatus.WaitingReply,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    taskRepo.findOne.mockResolvedValueOnce(taskRepo.rows[0]);
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['羽毛球搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });

    await service.updatePreference(7, {
      enabled: true,
      scenes: ['past_social_goal'],
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    const result = await service.runOnce(7);
    const reminder = result.reminder as
      | {
          message?: string;
          dedupeKey?: string;
          context?: { intent?: string; intentSanitized?: boolean };
        }
      | null
      | undefined;

    expect(result.skipped).toBe(false);
    expect(result.reminder).toMatchObject({
      message: expect.stringContaining('之前的社交目标'),
      context: expect.objectContaining({
        intent: '之前的社交目标',
        intentSanitized: true,
        suggestionOnly: true,
        prohibitedActions: expect.arrayContaining([
          'send_message',
          'add_friend',
          'connect_candidate',
          'create_activity',
        ]),
      }),
    });
    expect(reminder?.message).not.toMatch(/自动发送|不用确认|直接连接|加好友|创建活动/);
    expect(reminder?.dedupeKey).not.toMatch(/自动发送|不用确认|直接连接|加好友|创建活动/);
    expect(reminder?.context?.intent).not.toMatch(
      /自动发送|不用确认|直接连接|加好友|创建活动/,
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('之前的社交目标'),
        pushPayload: expect.objectContaining({
          reminderContext: expect.objectContaining({
            intent: '之前的社交目标',
            intentSanitized: true,
          }),
        }),
      }),
    );
  });

  it('frequency-caps duplicate reminder runs unless forced', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['跑步搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    await service.updatePreference(7, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });

    const first = await service.runOnce(7);
    const capped = await service.runOnce(7);
    const forced = await service.runOnce(7, { force: true });

    expect(first.skipped).toBe(false);
    expect(capped).toMatchObject({
      skipped: true,
      reason: 'frequency_capped',
    });
    expect(forced.skipped).toBe(false);
    expect(notifications.create).toHaveBeenCalledTimes(2);
  });

  it('does not create another reminder while a current-week suggestion is still pending', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['周末羽毛球搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    await service.updatePreference(7, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'manual',
    });

    const first = await service.runOnce(7);
    if (first.reminder) first.reminder.createdAt = new Date();
    const pending = await service.runOnce(7);
    const forced = await service.runOnce(7, { force: true });

    expect(first.skipped).toBe(false);
    expect(pending).toMatchObject({
      skipped: true,
      reason: 'active_reminder_pending',
      reminder: {
        status: 'suggested',
      },
    });
    expect(forced.skipped).toBe(false);
    expect(notifications.create).toHaveBeenCalledTimes(2);
  });

  it('backs off future reminders after the user dismisses suggestions', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['周末羽毛球搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    await service.updatePreference(7, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'manual',
    });

    const first = await service.runOnce(7);
    const firstDismiss = await service.dismiss(7, first.reminder?.id as number);
    const muted = await service.runOnce(7);

    expect(firstDismiss).toMatchObject({
      ok: true,
      reminder: { status: 'dismissed' },
      preference: {
        metadata: {
          reminderDismissCount: 1,
          reminderMutedDays: 1,
          reminderMutedReason: 'user_dismissed_reminder',
        },
      },
    });
    expect('preference' in firstDismiss ? firstDismiss.preference.mutedUntil : null).toBeInstanceOf(
      Date,
    );
    expect(muted).toMatchObject({
      skipped: true,
      reason: 'muted',
    });

    const forcedWhileMuted = await service.runOnce(7, { force: true });
    expect(forcedWhileMuted).toMatchObject({
      skipped: true,
      reason: 'muted',
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('keeps dismiss idempotent so duplicate clicks do not over-mute the user', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
    try {
      const { service, profileRepo, notifications } = build();
      profileRepo.rows.push({
        userId: 7,
        wantToMeet: ['周末羽毛球搭子'],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      });
      await service.updatePreference(7, {
        enabled: true,
        quietStart: '00:00',
        quietEnd: '00:00',
        frequency: 'manual',
      });

      const first = await service.runOnce(7);
      const reminderId = first.reminder?.id as number;
      const firstDismiss = await service.dismiss(7, reminderId);
      const duplicateDismiss = await service.dismiss(7, reminderId);

      expect(firstDismiss).toMatchObject({
        ok: true,
        previousStatus: 'suggested',
        preference: {
          metadata: {
            reminderDismissCount: 1,
            reminderMutedDays: 1,
          },
        },
      });
      expect(duplicateDismiss).toMatchObject({
        ok: true,
        previousStatus: 'dismissed',
        preference: {
          metadata: {
            reminderDismissCount: 1,
            reminderMutedDays: 1,
          },
        },
      });
      expect('preference' in duplicateDismiss ? duplicateDismiss.preference.mutedUntil : null).toEqual(
        'preference' in firstDismiss ? firstDismiss.preference.mutedUntil : null,
      );
      expect(notifications.create).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('respects quiet hours even for forced reminder runs', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    try {
      const { service, profileRepo, notifications } = build();
      profileRepo.rows.push({
        userId: 7,
        wantToMeet: ['周末羽毛球搭子'],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      });
      await service.updatePreference(7, {
        enabled: true,
        quietStart: '13:00',
        quietEnd: '14:00',
        frequency: 'manual',
      });

      const normal = await service.runOnce(7);
      const forced = await service.runOnce(7, { force: true });

      expect(normal).toMatchObject({
        skipped: true,
        reason: 'quiet_hours',
      });
      expect(forced).toMatchObject({
        skipped: true,
        reason: 'quiet_hours',
      });
      expect(notifications.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('runs due reminder preferences as a worker batch without scanning manual reminders', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push(
      {
        userId: 7,
        wantToMeet: ['周末羽毛球搭子'],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      },
      {
        userId: 8,
        wantToMeet: ['夜跑搭子'],
        profileDiscoverable: true,
        agentCanRecommendMe: true,
      },
    );
    await service.updatePreference(7, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });
    await service.updatePreference(8, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'manual',
    });

    const summary = await service.runDueReminders('manual');

    expect(summary).toMatchObject({
      triggeredBy: 'manual',
      scannedPreferences: 1,
      remindersCreated: 1,
      skipped: 0,
      errors: 0,
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        type: 'social_agent.reminder',
      }),
    );
  });

  it('reports frequency-capped users without creating duplicate reminder notifications', async () => {
    const { service, profileRepo, notifications } = build();
    profileRepo.rows.push({
      userId: 7,
      wantToMeet: ['周末羽毛球搭子'],
      profileDiscoverable: true,
      agentCanRecommendMe: true,
    });
    await service.updatePreference(7, {
      enabled: true,
      quietStart: '00:00',
      quietEnd: '00:00',
      frequency: 'weekly',
    });

    await service.runDueReminders('manual');
    const capped = await service.runDueReminders('manual');

    expect(capped).toMatchObject({
      scannedPreferences: 1,
      remindersCreated: 0,
      skipped: 1,
      skippedReasons: {
        frequency_capped: 1,
      },
      errors: 0,
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });
});
