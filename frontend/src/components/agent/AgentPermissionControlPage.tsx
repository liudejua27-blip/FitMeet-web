import { useMemo, useState } from 'react';
import { agentConnections, permissionModeProfiles } from '@/data/agentMockData';
import type { AgentPermissionMode } from '@/types/agent';
import { AgentStatusBadge } from './AgentStatusBadge';

const controlledModes = ['Basic Mode', 'Standard Mode', 'Open Mode'] as const;

export function AgentPermissionControlPage() {
  const [selectedAgentId, setSelectedAgentId] = useState(agentConnections[0]?.id ?? '');
  const [agentModes, setAgentModes] = useState<Record<string, AgentPermissionMode>>(() =>
    Object.fromEntries(agentConnections.map((agent) => [agent.id, agent.permissionMode])),
  );
  const selectedAgent = useMemo(
    () => agentConnections.find((agent) => agent.id === selectedAgentId) ?? agentConnections[0],
    [selectedAgentId],
  );
  const activeMode = selectedAgent ? agentModes[selectedAgent.id] : 'Basic Mode';

  return (
    <div className="agent-subpage agent-permission-page">
      <section className="agent-subpage-hero">
        <div>
          <span>PERMISSION CONTROL</span>
          <h1>
            权限控制舱
            <small>PERMISSION CONTROL</small>
          </h1>
          <p>为每个 Agent 设置明确的行动边界。所有高风险行为必须由用户确认。</p>
        </div>
        <div className="permission-radar" aria-hidden="true">
          <span />
          <i />
          <strong>{activeMode}</strong>
        </div>
      </section>

      <section className="permission-agent-strip" aria-label="Agent permission assignment">
        {agentConnections.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={selectedAgentId === agent.id ? 'is-selected' : undefined}
            onClick={() => setSelectedAgentId(agent.id)}
          >
            <span>{agent.name.slice(0, 2).toUpperCase()}</span>
            <strong>{agent.name}</strong>
            <small>{agentModes[agent.id]}</small>
          </button>
        ))}
      </section>

      <section className="permission-mode-grid" aria-label="Permission modes">
        {permissionModeProfiles.map((mode) => {
          const isActive = activeMode === mode.id;

          return (
            <article key={mode.id} className={`permission-mode-card ${isActive ? 'is-active' : ''}`}>
              <div className="permission-mode-card__top">
                <div>
                  <span>{mode.titleEn}</span>
                  <h2>{mode.titleZh}</h2>
                </div>
                <AgentStatusBadge
                  value={mode.riskLevel === '低风险' ? 'Low Risk' : mode.riskLevel === '中风险' ? 'Medium Risk' : 'Needs Review'}
                  compact
                />
              </div>
              <p>{mode.description}</p>
              <div className="permission-mode-card__label">{mode.englishLabel}</div>

              <div className="permission-behavior-grid">
                <div>
                  <h3>允许行为</h3>
                  <ul>
                    {mode.allowed.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>禁止行为</h3>
                  <ul>
                    {mode.blocked.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="permission-mode-card__footer">
                <p>
                  <strong>适合场景</strong>
                  {mode.scenarios}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAgent) {
                      setAgentModes((current) => ({ ...current, [selectedAgent.id]: mode.id }));
                    }
                  }}
                >
                  {isActive ? 'Current Boundary' : 'Apply to Agent'}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="permission-boundary-console">
        <div>
          <span>BOUNDARY MATRIX</span>
          <h2>{selectedAgent?.name} 行动边界</h2>
          <p>
            当前模式为 {activeMode}. 该 Agent 可以生成建议、草稿与低风险辅助动作，但触达真人、
            联系方式、关系承诺和高风险内容始终需要用户确认。
          </p>
        </div>
        <div className="permission-toggle-matrix">
          {controlledModes.map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                checked={activeMode === mode}
                onChange={() => {
                  if (selectedAgent) {
                    setAgentModes((current) => ({ ...current, [selectedAgent.id]: mode }));
                  }
                }}
              />
              <span>{mode}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
