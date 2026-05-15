import { heroCopy, type HeroLanguage } from '@/data/heroCopy';

type AgentGatewayPanelProps = {
  currentLang: HeroLanguage;
};

export function AgentGatewayPanel({ currentLang }: AgentGatewayPanelProps) {
  const panel = heroCopy[currentLang].gatewayPanel;
  const label = heroCopy[currentLang].gatewayLabel;

  return (
    <aside className="agent-gateway-cluster" aria-label={panel.subtitle}>
      <div className="gateway-callout">
        <span className="gateway-callout__line" aria-hidden="true" />
        <div>
          <p>
            {label.title} <span>{label.subtitle}</span>
          </p>
          <small>{label.description}</small>
          <small>{label.english}</small>
        </div>
      </div>

      <a className="agent-gateway-panel" href="/agent-connect">
        <span className="agent-gateway-panel__status" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="agent-gateway-panel__icon" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path d="M32 8l22 12-22 12L10 20 32 8z" />
            <path d="M54 30L32 42 10 30" />
            <path d="M54 40L32 52 10 40" />
          </svg>
        </span>
        <span className="agent-gateway-panel__body">
          <strong>{panel.title}</strong>
          <em>{panel.subtitle}</em>
          <span>{panel.description}</span>
          <span>{panel.english}</span>
        </span>
        <span className="agent-gateway-panel__cta">
          {panel.cta}
          <i aria-hidden="true">→</i>
        </span>
      </a>
    </aside>
  );
}
