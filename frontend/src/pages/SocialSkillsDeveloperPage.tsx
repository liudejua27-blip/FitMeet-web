import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { agentInboxApi, type OpenClawSetupStatus } from '../api/agentInboxApi';

const socialSkillsRepo = 'https://github.com/LiuChong27/social-skills.git';

const watchedEvents = [
  'message.received',
  'contact.request.received',
  'contact.request.accepted',
  'contact.request.declined',
  'profile.match.recommended',
  'social_request.match.recommended',
  'agent.inbox.updated',
];

const setupSteps = [
  {
    title: '安装 social-skills',
    body: 'social-skills 作为 OpenClaw 外部技能包维护，不会打进 FitMeet 网站部署包。',
    action: `git clone ${socialSkillsRepo}`,
  },
  {
    title: '填写 Agent Token',
    body: '在 FitMeet 获取 Personal Agent Token 后，写入 OpenClaw 的 FITMEET_AGENT_TOKEN。',
    action: 'FITMEET_AGENT_TOKEN=<your_fitmeet_agent_token>',
  },
  {
    title: '启用心跳收信',
    body: '后台每 30-60 秒拉取未读事件，通知主人后再调用 ack，避免重复报告。',
    action: 'fitmeet_get_agent_inbox_events({ unreadOnly: true, limit: 20 })',
  },
  {
    title: '完善 AI 人物画像',
    body: '画像确认后进入匹配池，潜意识循环会自动寻找候选并请求双方确认。',
    action: 'fitmeet_generate_profile_draft -> fitmeet_confirm_profile',
  },
  {
    title: '运行潜意识循环',
    body: '自动检查私信、好友申请、画像推荐和卡片推荐，但不会绕过用户同意。',
    action: 'fitmeet_run_profile_match_autopilot_once',
  },
];

export const SocialSkillsDeveloperPage = memo(
  function SocialSkillsDeveloperPage() {
    const [status, setStatus] = useState<OpenClawSetupStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      document.title = 'Social Skills - OpenClaw 安装与心跳配置';
      let alive = true;
      agentInboxApi
        .openClawStatus()
        .then((data) => {
          if (alive) setStatus(data);
        })
        .catch(() => {
          if (alive) setStatus(null);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, []);

    return (
      <div className="min-h-screen overflow-x-hidden bg-[#0b0c0d] text-[#f6efe5]">
        <section className="border-b border-white/10 bg-[#111315] px-4 py-14 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-1 text-xs font-black tracking-[0.2em] text-[#ffb36e]">
                <span className="h-2 w-2 rounded-full bg-[#18b98f]" />
                OPENCLAW SOCIAL SKILLS
              </div>
              <h1 className="mt-5 max-w-4xl text-3xl font-black leading-tight text-white sm:text-5xl">
                安装后自然完成收信、画像和 AI 撮合
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-[#c9b9a7] sm:text-base">
                OpenClaw 只保存 Agent Token 和事件状态；用户画像、匹配分数、好友申请和聊天边界仍由
                FitMeet 的 AI 与安全机制统一控制。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="rounded-lg bg-[#ff6a00] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff8128]" to="/agent-hub">
                  获取 Agent Token
                </Link>
                <Link className="rounded-lg border border-white/15 px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#18b98f]/50 hover:text-[#8ff0d1]" to="/ai-profile">
                  完善 AI 画像
                </Link>
                <Link className="rounded-lg border border-white/15 px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#22d3ee]/50 hover:text-[#8be9ff]" to="/match-confirmations">
                  好友 / 推荐确认
                </Link>
              </div>
            </div>

            <StatusPanel loading={loading} status={status} />
          </div>
        </section>

        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <section>
            <SectionHeader
              eyebrow="SETUP"
              title="安装完成后的 5 步引导"
              desc="这些步骤会和 agent manifest 保持一致，OpenClaw 可以据此提示用户完成配置。"
            />
            <div className="mt-6 grid gap-4 lg:grid-cols-5">
              {setupSteps.map((step, index) => (
                <article key={step.title} className="rounded-lg border border-white/10 bg-[#151719] p-5">
                  <div className="font-mono text-xs font-black text-[#ffb36e]">STEP {index + 1}</div>
                  <h3 className="mt-3 text-lg font-black text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#c9b9a7]">{step.body}</p>
                  <code className="mt-4 block break-words rounded-md bg-black/30 px-3 py-2 text-xs font-bold leading-6 text-[#dffcf3]">
                    {step.action}
                  </code>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <SectionHeader
                eyebrow="EVENTS"
                title="一个心跳监听所有待办"
                desc="私信、好友申请、画像推荐和约练卡片推荐都会进入 Agent Inbox event 流。"
              />
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {watchedEvents.map((event) => (
                  <div key={event} className="rounded-lg border border-white/10 bg-[#151719] px-4 py-3 text-sm font-black text-[#f6efe5]">
                    {event}
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-[#18b98f]/25 bg-[#18b98f]/8 p-5">
              <h2 className="text-base font-black text-[#8ff0d1]">事件处理规则</h2>
              <div className="mt-4 space-y-3 text-sm font-bold leading-7 text-[#dffcf3]">
                <p>webhook 是实时推送，失败不阻断主流程。</p>
                <p>心跳轮询是兜底来源，通知主人后调用 ack。</p>
                <p>完整会话内容只在用户要求查看时读取。</p>
              </div>
            </aside>
          </section>
        </main>
      </div>
    );
  },
);

function StatusPanel({
  loading,
  status,
}: {
  loading: boolean;
  status: OpenClawSetupStatus | null;
}) {
  const loop = status?.subconsciousLoop;
  return (
    <aside className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-base font-black text-white">OpenClaw 配置状态</h2>
      <div className="mt-4 grid gap-3">
        <StatusRow label="Agent Token" ok={Boolean(status?.tokenConfigured)} loading={loading} />
        <StatusRow label="Webhook URL" ok={Boolean(status?.webhookConfigured)} loading={loading} soft />
        <StatusRow label="Heartbeat" ok={Boolean(status?.heartbeatConfigured)} loading={loading} />
        <StatusRow label="潜意识循环" ok={Boolean(loop?.enabled)} loading={loading} />
      </div>
      <div className="mt-5 rounded-lg border border-white/10 bg-black/25 p-4 text-xs font-bold leading-6 text-[#c9b9a7]">
        <p>最近心跳成功：{formatTime(status?.heartbeatLastSuccessAt)}</p>
        <p>循环上次运行：{formatTime(loop?.lastRunAt ?? null)}</p>
        <p>循环状态：{loop?.running ? '运行中' : loop?.enabled ? '已启用' : '未启用'}</p>
      </div>
    </aside>
  );
}

function StatusRow({
  label,
  ok,
  loading,
  soft = false,
}: {
  label: string;
  ok: boolean;
  loading: boolean;
  soft?: boolean;
}) {
  const text = loading ? '检测中' : ok ? '已配置' : soft ? '未配置，可用轮询兜底' : '未配置';
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#151719] px-4 py-3">
      <span className="text-sm font-black text-white">{label}</span>
      <span className={ok ? 'text-sm font-black text-[#8ff0d1]' : 'text-sm font-black text-[#c9b9a7]'}>
        {text}
      </span>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div>
      <div className="text-xs font-black tracking-[0.2em] text-[#ffb36e]">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-black text-white">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#a99b8d]">{desc}</p>
    </div>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString();
}
