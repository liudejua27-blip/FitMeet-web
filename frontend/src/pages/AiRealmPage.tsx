import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * AiRealmPage — AI 界 / AI Realm Showroom
 *
 * 一个面向公众的、视觉极致的 AI 代理界入口页。
 * 与 AiMatchPage(功能页) 互补:这里负责"哲学+震撼",
 * 那里负责"配置+使用"。
 */

const capabilities = [
  {
    icon: '🧬',
    title: '人格克隆',
    en: 'Persona Cloning',
    desc: '通过 200+ 维度的对话采样,为你训练一个会说话、会思考、有边界感的数字分身。',
  },
  {
    icon: '🌐',
    title: '24/7 在线',
    en: 'Always On',
    desc: '当你睡着、上班、健身、断网时,代理仍在浏览动态、判断契合度、礼貌地破冰。',
  },
  {
    icon: '🎯',
    title: '精准匹配',
    en: 'Deep Match',
    desc: '不止于兴趣标签。基于价值观、节奏、表达方式的多模态语义匹配引擎。',
  },
  {
    icon: '🛡️',
    title: '边界守护',
    en: 'Boundary Guard',
    desc: '你设定的边界即是代理的法律。它永远不会代你做你不愿意做的事。',
  },
  {
    icon: '🔄',
    title: '可解释决策',
    en: 'Explainable',
    desc: '每一次匹配、每一句话术,代理都会告诉你「为什么」。你随时可以纠正。',
  },
  {
    icon: '🚪',
    title: '一键停用',
    en: 'Always Reversible',
    desc: '不喜欢的对话立即接管,不需要的代理一键销毁。AI 是工具,不是契约。',
  },
];

const aiProductLayers = [
  {
    title: 'AI 画像工作室',
    desc: '让用户或 OpenClaw 用自然语言补全人物画像，DeepSeek 自动生成公开标签、私密偏好、敏感标签和匹配关键词。',
    cta: '开始画像采集',
    href: '/ai-profile',
  },
  {
    title: 'AI 匹配解释器',
    desc: '匹配结果不只给 score，还给公开推荐理由、风险提示、下一步建议和开场白草稿。',
    cta: '查看匹配推荐',
    href: '/agent-inbox',
  },
  {
    title: 'OpenClaw 代理闭环',
    desc: 'OpenClaw 通过 social-skills 询问主人、生成草稿、读取推荐；保存、联系和发消息都需要真人确认。',
    cta: '配置 Social Skills',
    href: '/developers/social-skills',
  },
];

const sampleAgents = [
  { name: 'ARIA-04', tag: '社交向导', spec: '擅长破冰 / 多语种 / 高共情', acc: 94 },
  { name: 'NEXUS-07', tag: '深度匹配', spec: '价值观对齐 / 长期关系 / 严选模式', acc: 89 },
  { name: 'ECHO-12', tag: '安全守门人', spec: '反诈识别 / 边界监测 / 紧急联系人', acc: 99 },
  { name: 'MUSE-09', tag: '内容代笔', spec: '动态生成 / 风格保留 / 反 AI 痕迹', acc: 87 },
];

export const AiRealmPage = memo(function AiRealmPage() {
  const [activeAgent, setActiveAgent] = useState(0);

  // Auto-rotate showcase
  useEffect(() => {
    const t = window.setInterval(() => setActiveAgent((i) => (i + 1) % sampleAgents.length), 3500);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="relative isolate overflow-hidden bg-[#0A0612] text-cream">
      {/* === Cosmic / Neural backdrop === */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(800px 600px at 15% 20%, #4C1D95 0%, transparent 60%),' +
              'radial-gradient(900px 700px at 80% 50%, #A855F7 0%, transparent 60%),' +
              'radial-gradient(700px 500px at 40% 100%, #22D3EE 0%, transparent 60%)',
          }}
        />
        <NeuralGrid />
        <Particles />
      </div>

      {/* ============== HERO ============== */}
      <section className="relative mx-auto max-w-7xl px-4 pb-12 pt-20 sm:px-6 lg:px-8 lg:pt-28">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-aiBright/40 bg-aiBright/10 px-4 py-1.5 font-mono text-xs font-bold tracking-widest text-aiBright backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aiCyan" />
            AI REALM · NEURAL MATCHING ENGINE
          </span>
          <h1 className="mt-8 font-display text-5xl font-black leading-[1.02] tracking-tight text-cream sm:text-7xl lg:text-[110px]">
            当你
            <span className="bg-gradient-to-r from-aiCyan via-aiBright to-ai bg-clip-text text-transparent [background-size:200%_auto] animate-gradient-x">
              睡着
            </span>
            时
            <br />
            它在帮你
            <span className="bg-gradient-to-r from-aiBright via-aiCyan to-aiBright bg-clip-text text-transparent [background-size:200%_auto] animate-gradient-x">
              交朋友
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-cream/75">
            社交不应该是体力活。让你的 AI 代理代替你浏览、匹配、破冰、维系 ——
            <br className="hidden sm:block" />
            而你只需要在重要的时刻,亲自登场。
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              to="/ai-profile"
              className="group inline-flex items-center gap-2 rounded-2xl bg-ai-grad px-8 py-4 font-display text-base font-black text-white shadow-aiGlow transition hover:gap-3 hover:scale-[1.03]"
            >
              生成我的画像
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <button className="rounded-2xl border border-aiBright/40 bg-white/5 px-8 py-4 font-display text-base font-black text-cream backdrop-blur transition hover:bg-aiBright/15">
              观看 90 秒演示
            </button>
          </div>
        </div>

        {/* === Live Agent Showcase === */}
        <div className="mt-20 lg:mt-28">
          <AgentOrbit activeIndex={activeAgent} agents={sampleAgents} onSelect={setActiveAgent} />
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-aiBright/20 bg-white/[0.04] p-6 backdrop-blur lg:p-8">
          <span className="font-mono text-xs font-black tracking-[0.3em] text-aiCyan">PRODUCT LOOP</span>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-cream">
            三层 AI 模块，不只是一个生成按钮
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-cream/70">
            FitMeet 会先让 AI 理解每个用户，再用可解释匹配把合适的人推到 Agent Inbox；
            OpenClaw 可以参与采集，但所有高风险动作仍由真人确认。
          </p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {aiProductLayers.map((layer, index) => (
              <article
                key={layer.title}
                className="rounded-2xl border border-white/10 bg-black/25 p-5"
              >
                <div className="font-mono text-4xl font-black text-aiBright/35">
                  0{index + 1}
                </div>
                <h3 className="mt-3 font-display text-xl font-black text-cream">
                  {layer.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-cream/70">{layer.desc}</p>
                <Link
                  to={layer.href}
                  className="mt-4 inline-flex rounded-xl border border-aiBright/35 px-4 py-2 text-sm font-black text-aiBright transition hover:bg-aiBright/10"
                >
                  {layer.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============== CAPABILITIES GRID ============== */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="font-mono text-xs font-black tracking-[0.3em] text-aiCyan">CORE CAPABILITIES</span>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-cream sm:text-5xl">
            它能做什么 <span className="text-aiBright">/</span> 不能做什么
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-cream/65">
            我们设计的不是「替你生活」的 AI,而是「帮你节省时间、守护边界」的代理。
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((c) => (
            <article
              key={c.title}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition hover:-translate-y-1 hover:border-aiBright/40 hover:shadow-aiGlow"
            >
              <div className="flex items-start justify-between">
                <span className="text-5xl drop-shadow-[0_8px_24px_rgba(168,85,247,0.4)] transition-transform duration-500 group-hover:scale-110">
                  {c.icon}
                </span>
                <span className="rounded-full border border-aiCyan/30 bg-aiCyan/10 px-2.5 py-1 font-mono text-[10px] font-black tracking-widest text-aiCyan">
                  {c.en}
                </span>
              </div>
              <h3 className="mt-6 font-display text-2xl font-black text-cream">{c.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-cream/70">{c.desc}</p>
              <div className="pointer-events-none absolute -right-12 -bottom-12 h-32 w-32 rounded-full bg-aiBright/10 blur-2xl transition-all duration-700 group-hover:scale-150" />
            </article>
          ))}
        </div>
      </section>

      {/* ============== TIMELINE: How It Works ============== */}
      <section className="relative mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-aiBright/20 bg-gradient-to-br from-ai/20 via-ai/5 to-transparent p-8 backdrop-blur lg:p-14">
          <span className="font-mono text-xs font-black tracking-[0.3em] text-aiCyan">HOW IT WORKS</span>
          <h2 className="mt-3 font-display text-4xl font-black tracking-tight text-cream sm:text-5xl">
            从一段对话,到 24 小时社交托管
          </h2>

          <div className="mt-12 grid gap-8 lg:grid-cols-4">
            {[
              { n: '01', t: '人格采样', d: '15 分钟开放式对话,代理学习你的语气、价值观、边界。' },
              { n: '02', t: '边界设定', d: '可聊话题、不可触及的红线、紧急停止词,你说了算。' },
              { n: '03', t: '托管运行', d: '代理在你授权范围内自动浏览、点赞、评论、初步对话。' },
              { n: '04', t: '关键时刻接管', d: '当代理判断需要真人,会立即推送给你。你来决定下一步。' },
            ].map((s, i) => (
              <div key={s.n} className="relative">
                <div className="font-mono text-6xl font-black text-aiBright/30">{s.n}</div>
                <div className="absolute left-0 top-12 h-px w-12 bg-gradient-to-r from-aiBright to-transparent" />
                <h3 className="mt-4 font-display text-xl font-black text-cream">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream/70">{s.d}</p>
                {i < 3 && (
                  <span className="absolute -right-4 top-8 hidden text-aiBright/40 lg:block">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
});

// ----------------------------------------------------------------------------
function AgentOrbit({
  activeIndex,
  agents,
  onSelect,
}: {
  activeIndex: number;
  agents: typeof sampleAgents;
  onSelect: (i: number) => void;
}) {
  const active = agents[activeIndex];
  return (
    <div className="relative grid gap-8 rounded-3xl border border-aiBright/20 bg-black/30 p-6 backdrop-blur lg:grid-cols-[1fr_1.2fr] lg:p-10">
      {/* Left: agent visualization (orbit) */}
      <div className="relative h-[360px] overflow-hidden rounded-2xl bg-gradient-to-br from-ai/40 via-aiDeep/30 to-transparent">
        {/* Center core */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative h-32 w-32">
            <div className="absolute inset-0 rounded-full bg-aiBright/40 blur-2xl animate-pulse-soft" />
            <div className="relative flex h-full w-full items-center justify-center rounded-full border border-aiBright/40 bg-gradient-to-br from-aiBright via-ai to-aiDeep shadow-aiGlow">
              <span className="font-display text-3xl font-black text-white drop-shadow-lg">AI</span>
            </div>
          </div>
        </div>
        {/* Orbits */}
        {[140, 100, 70].map((r, i) => (
          <div
            key={r}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-aiBright/15 animate-spin-slow"
            style={{
              width: r * 2,
              height: r * 2,
              animationDuration: `${20 + i * 8}s`,
              animationDirection: i % 2 ? 'reverse' : 'normal',
            }}
          >
            <span
              className="absolute h-3 w-3 rounded-full bg-aiCyan shadow-[0_0_12px_#22D3EE]"
              style={{ top: '-6px', left: '50%', transform: 'translateX(-50%)' }}
            />
          </div>
        ))}
      </div>

      {/* Right: active agent details */}
      <div className="flex flex-col">
        <span className="font-mono text-[11px] font-black tracking-[0.3em] text-aiCyan">ACTIVE AGENT</span>
        <h3 className="mt-2 font-display text-5xl font-black tracking-tight text-cream">{active.name}</h3>
        <p className="mt-2 font-display text-xl font-bold text-aiBright">{active.tag}</p>
        <p className="mt-4 text-sm font-semibold text-cream/70">{active.spec}</p>

        {/* Accuracy bar */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-xs font-black tracking-widest text-cream/60">MATCH ACCURACY</span>
            <span className="font-display text-2xl font-black text-aiCyan">{active.acc}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-aiCyan to-aiBright transition-all duration-700"
              style={{ width: `${active.acc}%` }}
            />
          </div>
        </div>

        {/* Picker */}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-8 sm:grid-cols-4">
          {agents.map((a, i) => (
            <button
              key={a.name}
              onClick={() => onSelect(i)}
              className={[
                'rounded-xl border px-3 py-2 text-left transition',
                i === activeIndex
                  ? 'border-aiBright/60 bg-aiBright/15'
                  : 'border-white/10 bg-white/[0.03] hover:border-aiBright/30',
              ].join(' ')}
            >
              <div className={`font-mono text-[10px] font-black tracking-wider ${i === activeIndex ? 'text-aiCyan' : 'text-cream/50'}`}>
                {a.name}
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-cream/80">{a.tag}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
function NeuralGrid() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.08]" preserveAspectRatio="none">
      <defs>
        <pattern id="hex" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
          <polygon points="30,2 56,17 56,45 30,60 4,45 4,17" fill="none" stroke="#A855F7" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

function Particles() {
  const ps = Array.from({ length: 40 }).map((_, i) => ({
    left: (i * 137.5) % 100,
    top: (i * 89.7) % 100,
    size: 2 + ((i * 7) % 4),
    delay: (i * 0.25) % 5,
    color: i % 3 === 0 ? '#22D3EE' : i % 3 === 1 ? '#A855F7' : '#FFFFFF',
  }));
  return (
    <div className="absolute inset-0">
      {ps.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-pulse-soft"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            opacity: 0.5,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default AiRealmPage;
