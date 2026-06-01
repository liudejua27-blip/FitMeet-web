import { AgentWorkspace } from '../components/agent-workspace/AgentWorkspace';

export function AgentWorkspacePage({
  view = 'home',
}: {
  view?: 'home' | 'chat' | 'settings' | 'projects' | 'history';
}) {
  return <AgentWorkspace view={view} />;
}
