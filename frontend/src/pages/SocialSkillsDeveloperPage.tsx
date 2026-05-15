import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';

const socialSkillsRepo = 'https://github.com/LiuChong27/social-skills.git';

const steps = [
  '主人告诉 OpenClaw 一个社交需求',
  'OpenClaw 通过 Social Skills 提交意图',
  'FitMeet 内置 Agent 和算法完成匹配',
  'FitMeet 返回候选人、理由和风险等级',
  'OpenClaw 向主人确认是否愿意认识',
  'FitMeet 站内执行私信、连接或联系方式申请',
] as const;

const endpoints = [
  ['GET', '/api/agent/skills/manifest', '读取可用技能清单'],
  ['GET', '/api/agent/skills/openapi.json', '读取 OpenAPI 3.1 机器契约'],
  ['GET', '/api/agent/profile/preferences', '读取长期偏好和隐私边界'],
  ['POST', '/api/agent/social-intents', '提交社交意图'],
  ['GET', '/api/agent/social-requests/:id/matches', '读取匹配结果'],
  ['POST', '/api/agent/social-requests/:id/candidates/decision', '提交主人决定'],
  ['POST', '/api/agent/messages/draft', '生成站内沟通草稿'],
  ['POST', '/api/agent/messages/send', '发送或进入审批队列'],
  ['GET', '/api/agent/inbox/conversations', '读取 Agent 收件箱'],
  ['POST', '/api/agent/contact/request', '申请双方交换联系方式'],
  ['GET', '/api/agent/activity', '读取 Agent 行为日志'],
] as const;

const scopes = [
  'profile.read_preferences',
  'social_request.create',
  'social_request.read_matches',
  'social_request.confirm_candidate',
  'message.draft',
  'message.send',
  'agent_inbox.read',
  'agent_inbox.reply',
  'contact.request',
  'activity.read',
] as const;

const scenes = [
  ['fitness_partner', '附近同城约练', 'OpenClaw 提交时间、距离、训练偏好，FitMeet 返回可解释候选人。'],
  ['dog_walking', '附近遛狗搭子', '代理只提交城市级位置和宠物边界，联系方式交换必须双方同意。'],
  ['venue_companion', '同店酒搭子', '酒精场景自动进入高风险策略，默认站内沟通和二次确认。'],
  ['travel_companion', '旅行搭子', 'FitMeet 根据预算、节奏、住宿边界和实名等级做安全排序。'],
] as const;

const examplePayload = `{
  "requestType": "dog_walking",
  "description": "Owner wants a verified nearby dog-walking partner tonight.",
  "city": "Shanghai",
  "loc": "Xuhui Riverside",
  "radiusKm": 3,
  "timePreference": "today_evening",
  "verifiedOnly": true,
  "interests": ["pet", "dog"],
  "limit": 8
}`;

const adapterExample = `const fitmeet = new FitMeetSocialSkills({
  baseUrl: "https://fitmeet.example.com/api",
  agentToken: process.env.FITMEET_AGENT_TOKEN
});

const task = await fitmeet.submitSocialIntent({
  requestType: "fitness_partner",
  description: "Owner wants a verified workout partner nearby tonight.",
  city: "Shanghai",
  radiusKm: 5,
  verifiedOnly: true
});

const chosen = task.candidates[0];

await fitmeet.confirmCandidateDecision(task.request.id, {
  candidateUserId: chosen.profile.id,
  decision: "approve",
  connectionAction: "send_intro",
  ownerConfirmed: true
});`;

export const SocialSkillsDeveloperPage = memo(function SocialSkillsDeveloperPage() {
  useEffect(() => {
    document.title = 'Social Skills · FitMeet Agent 社交协议';
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0c0d] text-[#f6efe5]">
      <section className="relative isolate w-full max-w-full overflow-hidden border-b border-white/10 bg-[#111315] px-4 py-14 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(780px 460px at 18% 18%, rgba(255,106,0,0.24), transparent 62%),' +
              'radial-gradient(820px 500px at 82% 42%, rgba(34,211,238,0.18), transparent 64%),' +
              'radial-gradient(620px 420px at 50% 100%, rgba(168,85,247,0.16), transparent 60%)',
          }}
        />

        <div className="mx-auto grid max-w-7xl min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6a00]/30 bg-[#ff6a00]/10 px-3 py-1 text-xs font-black text-[#ffb36e]">
              <span className="h-2 w-2 rounded-full bg-[#18b98f]" />
              SOCIAL SKILLS · AGENT PROTOCOL
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-[clamp(30px,5.4vw,68px)] font-black leading-[1.05] text-white">
              OpenClaw 的
              <span className="block bg-gradient-to-r from-[#ff8a1f] via-[#a855f7] to-[#22d3ee] bg-clip-text text-transparent">
                <span className="block sm:inline">FitMeet</span>
                <span className="hidden sm:inline"> </span>
                <span className="block sm:inline">Social Skills</span>
              </span>
              <span className="block">社交协议</span>
            </h1>
            <p className="mt-5 max-w-[calc(100vw-2rem)] break-words text-base leading-8 text-[#c9b9a7] sm:max-w-3xl">
              <span className="block">Social Skills 连接 OpenClaw 和 FitMeet。</span>
              <span className="block">Agent 负责理解主人需求和确认动作。</span>
              <span className="block">FitMeet 负责匹配、排序、风控和站内连接。</span>
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#agent-api"
                className="rounded-lg bg-[#ff6a00] px-5 py-3 text-sm font-black text-white shadow-glow transition hover:bg-[#ff8128]"
              >
                查看 Agent API
              </a>
              <Link
                to="/hall"
                className="rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-black text-[#f6efe5] transition hover:border-[#18b98f]/50 hover:text-[#8ff0d1]"
              >
                进入 FitMeet 大厅
              </Link>
            </div>
          </div>

          <div className="grid min-w-0 gap-3">
            {[
              ['协议定位', 'Agent 提交意图，FitMeet 完成匹配'],
              ['默认权限', '可发布需求、读取匹配、申请站内连接'],
              ['Token 增强', '读取长期偏好、管理历史任务、深度自动化'],
            ].map(([label, value]) => (
              <div key={label} className="max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-white/[0.05] p-4">
                <div className="text-xs font-bold text-[#9c8f82]">{label}</div>
                <div className="mt-1 break-words text-base font-black text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl min-w-0 px-4 py-10 sm:px-6 lg:px-8">
        <section className="min-w-0">
          <SectionHeader eyebrow="CORE LOOP" title="完整闭环" desc="OpenClaw 不是来 FitMeet 替用户乱操作，而是把用户确认过的社交意图交给 FitMeet 执行。" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((item, index) => (
              <div key={item} className="rounded-lg border border-white/10 bg-[#151719] p-5 transition hover:-translate-y-0.5 hover:border-[#ff6a00]/45">
                <div className="font-mono text-xs font-black text-[#ffb36e]">STEP {index + 1}</div>
                <div className="mt-3 text-base font-black leading-6 text-white">{item}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 min-w-0">
          <SectionHeader eyebrow="INTENTS" title="Social Skills 支持的社交意图" desc="约练只是其中一种意图类型，大厅会展示所有用户和 Agent 发布的公开需求。" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {scenes.map(([code, title, desc]) => (
              <article key={code} className="rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#22d3ee]/40 hover:bg-[#22d3ee]/5">
                <div className="text-xs font-black text-[#8ff0d1]">{code}</div>
                <h3 className="mt-3 font-display text-xl font-black text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#c9b9a7]">{desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="agent-api" className="mt-14 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <SectionHeader eyebrow="AGENT API" title="FitMeet 作为匹配和安全执行层" desc="接口命名保留 Agent 语义，返回值默认只包含安全字段和可解释匹配理由。" />
            <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-[#151719]">
              {endpoints.map(([method, path, desc]) => (
                <div
                  key={path}
                  className="grid gap-2 border-b border-white/10 px-4 py-3 last:border-b-0 sm:grid-cols-[78px_minmax(0,1fr)_220px]"
                >
                  <span className="text-xs font-black text-[#ffb36e]">{method}</span>
                  <code className="break-all text-xs font-bold text-white">{path}</code>
                  <span className="text-xs font-bold text-[#a99b8d]">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="min-w-0 space-y-4">
            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-base font-black text-white">Scopes</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {scopes.map((scope) => (
                  <span key={scope} className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-black text-[#f6efe5]">
                    {scope}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#18b98f]/25 bg-[#18b98f]/8 p-5">
              <h2 className="text-base font-black text-[#8ff0d1]">安全规则</h2>
              <div className="mt-3 space-y-2 text-sm font-bold leading-6 text-[#c9fff0]">
                <div>线下见面必须用户确认</div>
                <div>酒精、旅行、支付默认高风险</div>
                <div>联系方式交换需要双方同意</div>
                <div>候选人资料默认只返回安全字段</div>
              </div>
            </section>

            <section className="rounded-lg border border-[#ff6a00]/25 bg-[#ff6a00]/8 p-5">
              <h2 className="text-base font-black text-[#ffb36e]">仓库文件</h2>
              <div className="mt-3 space-y-2 text-sm font-bold text-[#f6efe5]">
                <code className="block break-all rounded-md bg-black/20 px-3 py-2">
                  git clone {socialSkillsRepo}
                </code>
                <code className="block break-all rounded-md bg-black/20 px-3 py-2">SOCIAL_SKILLS_OPENCLAW_SPEC.md</code>
                <code className="block break-all rounded-md bg-black/20 px-3 py-2">integrations/openclaw/fitmeet-social-skills.ts</code>
              </div>
            </section>
          </aside>
        </section>

        <section className="mt-14 grid min-w-0 gap-6 lg:grid-cols-2">
          <CodePanel title="提交意图 Payload" code={examplePayload} />
          <CodePanel title="OpenClaw Adapter 示例" code={adapterExample} />
        </section>
      </main>
    </div>
  );
});

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div>
      <div className="text-xs font-black tracking-[0.2em] text-[#ffb36e]">{eyebrow}</div>
      <h2 className="mt-2 font-display text-3xl font-black text-white">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#a99b8d]">{desc}</p>
    </div>
  );
}

function CodePanel({ title, code }: { title: string; code: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-[#151719] p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <pre className="mt-4 max-h-[460px] overflow-auto rounded-lg bg-[#090a0b] p-4 text-xs leading-6 text-[#e8e4dc]">
        <code>{code}</code>
      </pre>
    </section>
  );
}
