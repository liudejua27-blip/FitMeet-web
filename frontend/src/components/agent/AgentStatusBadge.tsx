import type {
  AgentConnectionStatus,
  AgentRiskStatus,
  AgentTokenStatus,
} from '@/types/agent';

type BadgeValue = AgentConnectionStatus | AgentRiskStatus | AgentTokenStatus | 'Online' | 'Stable';

type AgentStatusBadgeProps = {
  value: BadgeValue;
  compact?: boolean;
};

const toneByValue: Record<string, string> = {
  Connected: 'stable',
  Online: 'stable',
  Stable: 'stable',
  'Token Active': 'stable',
  'Low Risk': 'stable',
  'Pending Approval': 'review',
  'Needs Review': 'review',
  'OAuth Required': 'review',
  'Medium Risk': 'warning',
  Disabled: 'disabled',
  'Token Expired': 'warning',
  'Not Connected': 'idle',
  'Not Generated': 'idle',
  'Create Required': 'review',
  Unknown: 'idle',
  'High Risk': 'danger',
};

export function AgentStatusBadge({ value, compact = false }: AgentStatusBadgeProps) {
  const tone = toneByValue[value] ?? 'idle';

  return (
    <span className={`agent-status-badge agent-status-badge--${tone} ${compact ? 'agent-status-badge--compact' : ''}`}>
      <i aria-hidden="true" />
      {value}
    </span>
  );
}
