import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { agentConnections } from '@/data/agentMockData';
import type { AgentConnection } from '@/types/agent';
import { AgentConnectionCard } from './AgentConnectionCard';
import { AgentGatewayOverview } from './AgentGatewayOverview';
import { AgentLiveControlPanel } from './AgentLiveControlPanel';
import { AgentMiniGatewayVisual } from './AgentMiniGatewayVisual';
import { AgentSafetyPanel } from './AgentSafetyPanel';
import { SiteLink } from '../navigation/SiteLink';

const navLinks = [
  { href: '/', label: '返回首页', en: 'HOME' },
  { href: '/agent-control', label: '权限控制', en: 'PERMISSIONS' },
  { href: '/ai-profile', label: '偏好画像', en: 'PREFERENCES' },
  { href: '/agent-activity', label: '行为日志', en: 'ACTIVITY' },
  { href: '/discover', label: '发现', en: 'DISCOVER' },
] as const;

export function AgentConnectPage() {
  const location = useLocation();

  useEffect(() => {
    document.title = 'FitMeet Agent Connect';
  }, []);

  return (
    <div className="agent-connect-page">
      <div className="agent-connect-page__noise" aria-hidden="true" />
      <header className="agent-connect-nav">
        <Link to="/" className="agent-connect-nav__brand">
          <span aria-hidden="true">
            <img src="/favicon-192.png" alt="" width="34" height="34" />
          </span>
          <strong>FitMeet</strong>
          <em>Agent Gateway</em>
        </Link>
        <nav aria-label="Agent Connect navigation">
          {navLinks.map((link) => (
            <SmartNavLink
              key={link.href}
              to={link.href}
              ariaCurrent={location.pathname === link.href ? 'page' : undefined}
            >
              <span>{link.label}</span>
              <small>{link.en}</small>
            </SmartNavLink>
          ))}
        </nav>
        <div className="agent-connect-nav__lang" aria-label="Language selector">
          <button type="button" className="is-active">
            中文
          </button>
          <button type="button">EN</button>
        </div>
      </header>

      <main>
        <AgentConnectHome />
      </main>
    </div>
  );
}

function AgentConnectHome() {
  const [agents, setAgents] = useState<AgentConnection[]>(agentConnections);
  const [selectedAgentId, setSelectedAgentId] = useState(agentConnections[0]?.id ?? '');
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [showCustomGuide, setShowCustomGuide] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0],
    [agents, selectedAgentId],
  );

  const connectAgent = (agentId: string) => {
    setAgents((currentAgents) =>
      currentAgents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              status: 'Connected',
              tokenStatus:
                agent.provider === 'Custom' || agent.tokenStatus === 'Token Expired'
                  ? 'Token Active'
                  : agent.tokenStatus,
              lastActiveAt: 'Just now',
              riskStatus: agent.riskStatus === 'Unknown' ? 'Low Risk' : agent.riskStatus,
            }
          : agent,
      ),
    );
    setSelectedAgentId(agentId);
  };

  const revokeAgent = (agentId: string) => {
    if (confirmRevokeId !== agentId) {
      setConfirmRevokeId(agentId);
      return;
    }

    setAgents((currentAgents) =>
      currentAgents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              status: 'Disabled',
              tokenStatus: 'Token Expired',
              lastActiveAt: 'Revoked just now',
              riskStatus: 'Medium Risk',
            }
          : agent,
      ),
    );
    setConfirmRevokeId(null);
  };

  return (
    <>
      <section className="agent-connect-hero">
        <motion.div
          className="agent-connect-hero__copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="agent-connect-hero__eyeline">AGENT CONNECT</span>
          <h1>
            智能体接入
            <small>AGENT CONNECT</small>
          </h1>
          <p>连接你的 AI Agent，让它在授权边界内进入 FitMeet 社交宇宙。</p>
          <p>
            Connect your AI Agent to FitMeet and let it operate within clear permissions, safety
            boundaries, and human approval.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <AgentMiniGatewayVisual />
        </motion.div>
      </section>

      <AgentGatewayOverview />

      <AgentLiveControlPanel />

      <section className="agent-connection-section" aria-label="Supported Agent list">
        <div className="agent-section-heading">
          <span>SUPPORTED AGENTS</span>
          <h2>支持接入的 Agent</h2>
        </div>

        <div className="agent-connection-layout">
          <div className="agent-connection-list">
            {agents.map((agent) => (
              <AgentConnectionCard
                key={agent.id}
                agent={agent}
                selected={selectedAgent?.id === agent.id}
                confirmRevoke={confirmRevokeId === agent.id}
                onSelect={() => {
                  setSelectedAgentId(agent.id);
                  setShowCustomGuide(agent.provider === 'Custom');
                }}
                onConnect={() => connectAgent(agent.id)}
                onRevoke={() => revokeAgent(agent.id)}
                onCancelRevoke={() => setConfirmRevokeId(null)}
                onShowCustomGuide={() => {
                  setSelectedAgentId(agent.id);
                  setShowCustomGuide(true);
                }}
              />
            ))}
          </div>

          <aside className="agent-selected-panel" aria-label="Selected Agent control preview">
            <span>SELECTED AGENT</span>
            <h3>{selectedAgent?.name}</h3>
            <p>
              当前接入边界：{selectedAgent?.permissionMode}. 所有自动化行为都需要遵循 Human-led,
              AI-assisted, permission-based 原则。
            </p>
            <div className="agent-selected-panel__links">
              <SmartNavLink to="/agent-control">权限设置</SmartNavLink>
              <SmartNavLink to="/ai-profile">偏好画像</SmartNavLink>
              <SmartNavLink to="/agent-activity">行为日志</SmartNavLink>
              <SiteLink to="/discover">发现</SiteLink>
            </div>
            {showCustomGuide && (
              <div className="agent-custom-guide">
                <strong>Custom Agent 接入说明</strong>
                <p>
                  准备 Agent 名称、回调端点、权限范围与审核联系人。下一轮可以在这里扩展 API token
                  创建、scope 选择和 webhook 校验流程。
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>

      <AgentSafetyPanel />
    </>
  );
}

function SmartNavLink({
  ariaCurrent,
  children,
  to,
}: {
  ariaCurrent?: React.AriaAttributes['aria-current'];
  children: React.ReactNode;
  to: string;
}) {
  return (
    <SiteLink to={to} aria-current={ariaCurrent}>
      {children}
    </SiteLink>
  );
}
