import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { numberFromUnknown } from './agentWorkspaceRuntime';

export type AgentView = 'home' | 'chat' | 'settings' | 'projects' | 'history';

export function useAgentWorkspaceRoute(view: AgentView) {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const shellView = view === 'chat' || params.taskId ? 'chat' : view;
  const routeTaskId = numberFromUnknown(params.taskId);
  const focusReminderSettings =
    new URLSearchParams(location.search).get('settings') === 'reminders';

  useEffect(() => {
    document.title = 'FitMeet Agent - 全球社交 AI 助手';
  }, []);

  useEffect(() => {
    if (shellView !== 'chat') {
      navigate('/agent/chat', { replace: true });
    }
  }, [navigate, shellView]);

  return {
    location,
    navigate,
    routeTaskId,
    shellView,
    focusReminderSettings,
  };
}
