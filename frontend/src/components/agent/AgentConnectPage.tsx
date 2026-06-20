import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

      <section className="agent-connection-section" aria-label="Agent Gateway production entry">
        <div className="agent-section-heading">
          <span>PRODUCTION ENTRY</span>
          <h2>真实接入从 Token 和权限开始</h2>
        </div>

        <div className="agent-connection-layout">
          <div className="agent-connection-list">
            {gatewaySteps.map((step) => (
              <article key={step.title} className="agent-connection-card">
                <div className="agent-connection-card__halo" aria-hidden="true" />
                <div className="agent-connection-card__header">
                  <div className="agent-connection-card__identity">
                    <span className="agent-connection-card__mark">{step.index}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.subtitle}</p>
                    </div>
                  </div>
                </div>
                <p className="agent-connection-card__description">{step.description}</p>
              </article>
            ))}
          </div>

          <aside className="agent-selected-panel" aria-label="Selected Agent control preview">
            <span>NO DEMO CONNECTIONS</span>
            <h3>不展示虚构 Agent 状态</h3>
            <p>
              这里不再模拟 OpenClaw、Codex 或第三方 Agent 的连接状态。真实 Token、权限、审批和行为日志统一走后端 Agent Gateway。
            </p>
            <div className="agent-selected-panel__links">
              <SmartNavLink to="/agent-hub">创建 Agent Token</SmartNavLink>
              <SmartNavLink to="/agent/settings">权限设置</SmartNavLink>
              <SmartNavLink to="/agent-inbox">Agent 收件箱</SmartNavLink>
              <SiteLink to="/discover">发现</SiteLink>
            </div>
            <div className="agent-custom-guide">
              <strong>生产规则</strong>
              <p>
                任何外部或内部 Agent 只能在用户授权范围内读取 FitMeet 数据；发布约练、发送邀请、交换联系方式和公开位置都必须经过审批。
              </p>
            </div>
          </aside>
        </div>
      </section>

      <AgentSafetyPanel />
    </>
  );
}

const gatewaySteps = [
  {
    index: '01',
    title: '创建受限 Token',
    subtitle: 'Agent Hub',
    description:
      '在实名和权限边界满足后，由后端签发受限 Agent Token。Token 只展示一次，所有调用都进入审计。',
  },
  {
    index: '02',
    title: '配置权限与审批',
    subtitle: 'Human approval first',
    description:
      '读取、草稿、候选搜索和高风险动作分开授权。邀请、加好友、公开位置和联系方式交换不能绕过用户确认。',
  },
  {
    index: '03',
    title: '查看真实行为日志',
    subtitle: 'Traceable runtime',
    description:
      'Agent 调用、审批、失败补偿和 Meet Loop 推进都必须产生可追踪记录，避免前端本地状态伪装成真实能力。',
  },
] as const;

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
