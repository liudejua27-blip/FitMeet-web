import { safetyProtocols } from '@/data/agentStaticContent';

export function AgentSafetyPanel() {
  return (
    <section className="agent-safety-panel" aria-label="Agent safety protocol">
      <div className="agent-safety-panel__header">
        <span>SAFETY PROTOCOL</span>
        <h2>安全、隐私与可控边界</h2>
      </div>

      <div className="agent-safety-panel__grid">
        {safetyProtocols.map((item, index) => (
          <div key={item} className="agent-safety-rule">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
