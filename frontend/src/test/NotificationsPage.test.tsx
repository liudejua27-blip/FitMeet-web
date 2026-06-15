import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { socialAgentApi } from '../api/socialAgentApi';
import { NotificationsPage } from '../pages/NotificationsPage';
import * as dataService from '../services/dataService';
import { useNotificationStore } from '../stores';

function LocationEcho() {
  const location = useLocation();
  return (
    <div>
      <div data-testid="location">{location.pathname}</div>
      <pre data-testid="location-state">{JSON.stringify(location.state ?? {})}</pre>
    </div>
  );
}

describe('NotificationsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  });

  it('opens proactive Agent reminders back into the Agent chat thread', async () => {
    const openReminderSpy = vi
      .spyOn(socialAgentApi, 'openReminder')
      .mockResolvedValue({
        ok: true,
        reminder: null,
      });
    vi.spyOn(dataService, 'markNotificationAsRead').mockResolvedValue(undefined);
    useNotificationStore.setState({
      unreadCount: 1,
      notifications: [
        {
          id: 1,
          backendId: 'mongo-reminder-1',
          type: 'system',
          username: 'FitMeet Agent',
          avatar: 'AI',
          color: '#18181b',
          text: '你之前想找羽毛球搭子，周末有几个安全机会。要我帮你看看吗？',
          time: '刚刚',
          read: false,
          targetId: 88,
          targetType: 'agent_reminder',
          reminderId: 88,
          taskId: 21,
          route: '/agent/chat/21',
          reminderContext: {
            reminderProtocol: 'fitmeet.agent.reminder.v1',
            suggestionOnly: true,
            deliveryChannels: ['in_app', 'agent_thread'],
            externalDeliveryDisabled: true,
            settingsRoute: '/agent/chat?settings=reminders',
            optOutAction: 'social_agent.reminder.disable',
            prohibitedActions: ['send_message', 'add_friend', 'create_activity'],
          },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/agent/chat/:taskId" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /你之前想找羽毛球搭子，周末有几个安全机会/,
      }),
    );

    await waitFor(() => expect(openReminderSpy).toHaveBeenCalledWith(88));
    expect(screen.getByTestId('location')).toHaveTextContent('/agent/chat/21');
    expect(screen.getByTestId('location-state')).toHaveTextContent('"agentReminder"');
    expect(screen.getByTestId('location-state')).toHaveTextContent(
      '你之前想找羽毛球搭子',
    );
    expect(screen.getByTestId('location-state')).toHaveTextContent('"suggestionOnly":true');
    expect(screen.getByTestId('location-state')).toHaveTextContent('send_message');
    expect(useNotificationStore.getState().notifications[0]?.read).toBe(true);
  });
});
