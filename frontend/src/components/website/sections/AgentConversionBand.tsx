import { Link } from 'react-router-dom';

export function AgentConversionBand() {
  return (
    <section className="fm-agent-band" aria-label="FitMeet Agent 转化入口">
      <div>
        <span>FitMeet Agent</span>
        <h2>让 Agent 先把需求变成可匹配的卡片。</h2>
        <p>
          说一句目标，Agent
          会整理当前需求、匹配理由和下一步。确认之前，不会发布到发现，也不会替你联系任何人。
        </p>
      </div>
      <div className="fm-agent-band__actions">
        <Link to="/agent" className="fm-button fm-button--primary">
          体验 Agent
        </Link>
        <Link to="/features" className="fm-button fm-button--ghost">
          看产品功能
        </Link>
      </div>
    </section>
  );
}
