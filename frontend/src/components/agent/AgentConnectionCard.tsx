import type { AgentConnection } from '@/types/agent';
import { AgentStatusBadge } from './AgentStatusBadge';

type AgentConnectionCardProps = {
  agent: AgentConnection;
  selected: boolean;
  confirmRevoke: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onRevoke: () => void;
  onCancelRevoke: () => void;
  onShowCustomGuide: () => void;
};

export function AgentConnectionCard({
  agent,
  selected,
  confirmRevoke,
  onSelect,
  onConnect,
  onRevoke,
  onCancelRevoke,
  onShowCustomGuide,
}: AgentConnectionCardProps) {
  const isCustom = agent.provider === 'Custom';

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  return (
    <article
      className={`agent-connection-card ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      aria-label={`${agent.name} connection`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect();
      }}
    >
      <div className="agent-connection-card__halo" aria-hidden="true" />
      <div className="agent-connection-card__header">
        <div className="agent-connection-card__identity">
          <span className="agent-connection-card__mark">{agent.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <h3>{agent.name}</h3>
            <p>{agent.type}</p>
          </div>
        </div>
        <AgentStatusBadge value={agent.status} />
      </div>

      <p className="agent-connection-card__description">{agent.description}</p>

      <dl className="agent-connection-card__meta">
        <div>
          <dt>权限等级</dt>
          <dd>{agent.permissionMode}</dd>
        </div>
        <div>
          <dt>Token 状态</dt>
          <dd>
            <AgentStatusBadge value={agent.tokenStatus} compact />
          </dd>
        </div>
        <div>
          <dt>最近活动</dt>
          <dd>{agent.lastActiveAt}</dd>
        </div>
        <div>
          <dt>安全风险</dt>
          <dd>
            <AgentStatusBadge value={agent.riskStatus} compact />
          </dd>
        </div>
      </dl>

      {confirmRevoke && (
        <div className="agent-revoke-confirm" onClick={(event) => event.stopPropagation()}>
          <p>确认撤销 {agent.name} 的 FitMeet Gateway 访问边界？</p>
          <div>
            <button type="button" onClick={onRevoke}>
              Confirm Revoke
            </button>
            <button type="button" onClick={onCancelRevoke}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="agent-connection-card__actions">
        {isCustom ? (
          <button type="button" className="agent-action agent-action--primary" onClick={(event) => {
            handleButtonClick(event);
            onShowCustomGuide();
          }}>
            Create Custom Agent
          </button>
        ) : (
          <button type="button" className="agent-action agent-action--primary" onClick={(event) => {
            handleButtonClick(event);
            onConnect();
          }}>
            Connect
          </button>
        )}
        <a className="agent-action" href="/agent-connect/permissions" onClick={handleButtonClick}>
          Configure
        </a>
        <a className="agent-action" href="/agent-connect/activity" onClick={handleButtonClick}>
          View Activity
        </a>
        <button type="button" className="agent-action agent-action--ghost" onClick={(event) => {
          handleButtonClick(event);
          onRevoke();
        }}>
          Revoke Access
        </button>
      </div>
    </article>
  );
}
