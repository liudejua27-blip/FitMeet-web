import { memo, type ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { WebsiteLayout } from '../components/website/WebsitePlatform';

const socialSkillsRepo = 'https://github.com/LiuChong27/social-skills.git';

const capabilities = [
  ['create_social_request', '声明现实社交任务的目标、场景、边界和期望结果。'],
  ['search_candidates', '在用户授权范围内搜索候选人、活动、教练或服务。'],
  ['request_approval', '为发消息、交换联系方式、线下见面等动作创建待确认请求。'],
  ['read_inbox_events', '读取 Agent Inbox 事件流，处理消息、推荐和审批状态。'],
  ['write_audit_log', '写入工具调用摘要、审批状态、推荐解释和执行结果。'],
  ['update_life_graph', '提交画像更新建议，等待用户确认后再写入。'],
];

const setupSteps = [
  {
    title: 'Install social-skills',
    body: 'social-skills 作为 OpenClaw 外部技能包维护，不进入 FitMeet 网站部署包。',
    action: `git clone ${socialSkillsRepo}`,
  },
  {
    title: 'Issue Agent Token',
    body: '从 FitMeet 获取受限 Agent Token，只开放声明过的 scope。',
    action: 'FITMEET_AGENT_TOKEN=<your_fitmeet_agent_token>',
  },
  {
    title: 'Connect webhook',
    body: '订阅消息、审批、候选、活动结果和 Agent Inbox 事件。',
    action: 'fitmeet_get_agent_inbox_events({ unreadOnly: true, limit: 20 })',
  },
  {
    title: 'Test in Sandbox',
    body: '在受控环境里测试推荐、确认、撤回和异常路径。',
    action: 'fitmeet_run_profile_match_autopilot_once',
  },
  {
    title: 'Ship with audit',
    body: '每个真实动作都写入可追溯日志，并在高风险节点请求用户确认。',
    action: 'fitmeet_write_agent_audit_log',
  },
];

const watchedEvents = [
  'message.received',
  'contact.request.received',
  'contact.request.accepted',
  'profile.match.recommended',
  'social_request.match.recommended',
  'agent.approval.pending',
  'agent.inbox.updated',
];

export const SocialSkillsDeveloperPage = memo(function SocialSkillsDeveloperPage() {
  useEffect(() => {
    document.title = 'FitMeet social-skills - Developer Preview';
  }, []);

  return (
    <WebsiteLayout>
      <div className="developer-detail-page">
        <section className="developer-detail-hero">
          <div>
            <span className="platform-label">SOCIAL-SKILLS</span>
            <h1>Developer skills for real-world agent tasks.</h1>
            <p>
              social-skills connects OpenClaw, Custom Agents and external tools to FitMeet.
              The package exposes social capabilities, while FitMeet keeps permissions,
              high-risk approval and audit logs inside the platform.
            </p>
            <div className="developer-detail-hero__actions">
              <a href={socialSkillsRepo} target="_blank" rel="noreferrer">
                View repository
              </a>
              <Link to="/developers">Developer platform</Link>
            </div>
          </div>
          <StatusPanel />
        </section>

        <DeveloperSection
          label="CAPABILITIES"
          title="Capabilities are scoped, auditable and permissioned."
          body="External agents receive composable social tools, not unlimited account authority."
        >
          <div className="doc-rows doc-rows--capabilities">
            {capabilities.map(([title, body]) => (
              <article key={title}>
                <strong>{title}</strong>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </DeveloperSection>

        <DeveloperSection
          label="SETUP"
          title="Five steps from external skill to governed action."
          body="The setup flow mirrors the agent manifest: install, authorize, subscribe, test and audit."
        >
          <div className="setup-rail">
            {setupSteps.map((step, index) => (
              <article key={step.title}>
                <span>STEP {index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
                <code>{step.action}</code>
              </article>
            ))}
          </div>
        </DeveloperSection>

        <DeveloperSection
          label="EVENTS"
          title="One event stream for inbox, approval and matching state."
          body="Webhook delivery is preferred. Heartbeat polling is a fallback when webhooks are unavailable."
        >
          <div className="event-grid">
            {watchedEvents.map((event) => (
              <code key={event}>{event}</code>
            ))}
          </div>
        </DeveloperSection>
      </div>
    </WebsiteLayout>
  );
});

function DeveloperSection({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="developer-detail-section">
      <div className="developer-detail-section__header">
        <div>
          <span>{label}</span>
          <h2>{title}</h2>
        </div>
        <p>{body}</p>
      </div>
      {children}
    </section>
  );
}

function StatusPanel() {
  return (
    <aside className="developer-status-panel">
      <span>OPENCLAW STATUS</span>
      <strong>Public developer preview</strong>
      <div>
        <StatusRow label="Agent Token" state="private" />
        <StatusRow label="Webhook URL" state="optional" />
        <StatusRow label="Sandbox" state="ready" />
        <StatusRow label="Audit logs" state="required" />
      </div>
      <p>Runtime configuration is checked inside the authenticated Agent workspace.</p>
    </aside>
  );
}

function StatusRow({
  label,
  state,
}: {
  label: string;
  state: 'ready' | 'required' | 'optional' | 'private';
}) {
  const text = {
    ready: 'Ready',
    required: 'Required',
    optional: 'Optional',
    private: 'Private',
  }[state];

  return (
    <div className="developer-status-row">
      <span>{label}</span>
      <strong data-state={state}>{text}</strong>
    </div>
  );
}
