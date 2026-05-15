import { useState } from 'react';
import type { CSSProperties } from 'react';
import { preferenceCalibrations, preferenceSignals } from '@/data/agentMockData';

export function AgentPreferenceStudioPage() {
  const [values, setValues] = useState(() =>
    Object.fromEntries(preferenceCalibrations.map((item) => [item.id, item.value])),
  );
  const [selectedSignal, setSelectedSignal] = useState<string>(preferenceSignals[0]);

  return (
    <div className="agent-subpage agent-preference-page">
      <section className="agent-subpage-hero preference-hero">
        <div>
          <span>PREFERENCE STUDIO</span>
          <h1>
            偏好工作室
            <small>PREFERENCE STUDIO</small>
          </h1>
          <p>校准 Agent 对你的理解：社交节奏、表达语气、匹配深度、隐私边界与不可触碰的个人规则。</p>
        </div>
        <div className="preference-orbit" aria-hidden="true">
          <span />
          <span />
          <strong>YOU</strong>
          <i>AGENT MODEL</i>
        </div>
      </section>

      <section className="preference-studio-layout">
        <div className="preference-calibration-panel">
          <div className="agent-section-heading">
            <span>CALIBRATION SURFACE</span>
            <h2>偏好校准</h2>
          </div>

          <div className="preference-slider-list">
            {preferenceCalibrations.map((item) => (
              <label key={item.id} className="preference-slider">
                <span>
                  <strong>{item.labelZh}</strong>
                  <small>{item.labelEn}</small>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={values[item.id]}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [item.id]: Number(event.target.value) }))
                  }
                />
                <em>
                  <small>{item.leftLabel}</small>
                  <b>{values[item.id]}</b>
                  <small>{item.rightLabel}</small>
                </em>
              </label>
            ))}
          </div>
        </div>

        <aside className="preference-memory-panel">
          <span>AGENT MEMORY PREVIEW</span>
          <h2>用户理解轮廓</h2>
          <p>
            Agent 会优先学习这些高层偏好，而不是替用户做决定。所有建议都必须保留人工确认边界。
          </p>
          <div className="preference-memory-orbit">
            {Object.entries(values).map(([key, value], index) => (
              <i key={key} style={{ '--value': `${value}%`, '--delay': `${index * -0.8}s` } as CSSProperties} />
            ))}
          </div>
        </aside>
      </section>

      <section className="preference-signal-section">
        <div className="agent-section-heading">
          <span>BEHAVIOR SIGNALS</span>
          <h2>Agent 应该记住的偏好信号</h2>
        </div>
        <div className="preference-signal-grid">
          {preferenceSignals.map((signal) => (
            <button
              key={signal}
              type="button"
              className={selectedSignal === signal ? 'is-selected' : undefined}
              onClick={() => setSelectedSignal(signal)}
            >
              {signal}
            </button>
          ))}
        </div>
      </section>

      <section className="preference-boundary-note">
        <span>HUMAN-LED MODEL</span>
        <h2>偏好不是自动化许可</h2>
        <p>
          偏好工作室只帮助 Agent 更好地理解你。它不会授予 Agent 自动私信、承诺关系、索要联系方式
          或绕过平台安全规则的权限。
        </p>
      </section>
    </div>
  );
}
