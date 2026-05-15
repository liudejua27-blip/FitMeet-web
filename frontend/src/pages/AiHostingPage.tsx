import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * AiHostingPage — AI 托管 (主站章节页)
 *
 * 强调三句话：
 *   1. AI 不替你做决定，只替你做筛选
 *   2. AI 与对方的 AI 先沟通
 *   3. 所有重要操作仍由你确认
 */

const principles = [
  {
    no: '01',
    title: '不替你决定',
    desc: 'AI 可以扫描、判断、推荐，但每一次见面、每一次破冰、每一次表达都需要你亲自点击确认。',
  },
  {
    no: '02',
    title: '先 AI 后真人',
    desc: '你的 AI 与对方的 AI 先聊一轮，剔除明显不合适的对象，再把高匹配度的人选交给你。',
  },
  {
    no: '03',
    title: '可解释、可纠正',
    desc: '每一次匹配建议都附带原因。觉得 AI 理解错了，一句话就能纠正它的判断模型。',
  },
  {
    no: '04',
    title: '随时可暂停',
    desc: 'AI 托管不是契约。一键暂停、一键销毁、一键回收数据 —— 控制权 100% 在你手里。',
  },
];

const useCases = [
  {
    icon: '🌙',
    title: '你睡觉的时候',
    desc: 'AI 在后台扫描附近新加入的用户、判断契合度、礼貌地破冰、整理成摘要等你醒来。',
  },
  {
    icon: '💼',
    title: '你工作的时候',
    desc: '不被骚扰、不被打断。AI 把所有匹配压成 1 条通知，午休 5 分钟就能浏览。',
  },
  {
    icon: '🎯',
    title: '你想约练的时候',
    desc: '"今晚 7 点 5km 跑步" → AI 30 秒内筛出附近匹配最高的 3 位，自带破冰话术。',
  },
  {
    icon: '🐕',
    title: '你想遛狗的时候',
    desc: 'AI 综合评估宠物性格、距离、主人时间、活动强度，给出"适合一起遛"的精准列表。',
  },
];

const boundary = [
  '不会代替你回复敏感话题',
  '不会代替你做金钱、关系决定',
  '不会主动暴露你的位置和联系方式',
  '不会在你未授权时跨账户分享数据',
  '不会假装是真人欺骗对方',
  '不会突破你设定的话术边界',
];

const faqs = [
  {
    q: 'AI 会不会替我谈恋爱？',
    a: '不会。AI 只做筛选和初步沟通。一旦涉及任何关系性、金钱性或情感性决定，必须由你本人在 App 内点击确认。',
  },
  {
    q: '对方知道是 AI 在和他聊吗？',
    a: '我们要求所有 AI 代理在对话开头明确标识"AI 代理 · 代 [用户名] 进行预筛选"。透明是默认设置，无法关闭。',
  },
  {
    q: 'AI 会泄露我的隐私吗？',
    a: 'AI 仅使用你授权的最小信息子集。位置精确到城市级而非街道级，联系方式默认不可见，行程信息按场景披露。',
  },
  {
    q: '我能让 AI 学会我的语气吗？',
    a: '可以。在「AI 成长」中导入你的历史动态和聊天样本（仅你的，不会读取对方），AI 会逐步贴近你的表达风格。',
  },
];

export const AiHostingPage = memo(function AiHostingPage() {
  useEffect(() => {
    document.title = 'AI 托管 · OurFitMeet — 让 AI 替你筛选，不替你决定';
  }, []);

  return (
    <div className="bg-[#0a0a14] text-cream">
      {/* HERO */}
      <section className="relative isolate overflow-hidden px-4 pt-20 pb-24 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(800px 500px at 20% 20%, #4C1D95 0%, transparent 60%),' +
              'radial-gradient(800px 500px at 80% 60%, #22D3EE 0%, transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-aiBright/40 bg-aiBright/10 px-4 py-1.5 text-xs font-bold tracking-wide text-aiBright">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-aiCyan" />
            AI HOSTING · 智能托管
          </span>
          <h1 className="mt-5 font-display text-[clamp(40px,7vw,72px)] font-black leading-[1.05] text-white">
            让 AI 替你
            <span className="bg-gradient-to-r from-aiCyan via-aiBright to-ai bg-clip-text text-transparent">
              {' '}筛选{' '}
            </span>
            ，
            <br />
            不替你
            <span className="bg-gradient-to-r from-aiCyan via-aiBright to-ai bg-clip-text text-transparent">
              {' '}决定{' '}
            </span>
            。
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-textMuted">
            AI 托管不是替代你，而是帮你减少筛选成本。它先扫描、先沟通、先推荐，
            把"可以见的人"递到你面前 —— 真正的决定权永远在你手里。
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/ai"
              className="inline-flex items-center gap-2 rounded-xl bg-ai-grad px-7 py-4 text-sm font-black text-white shadow-aiGlow transition hover:-translate-y-0.5"
            >
              创建我的 AI 代理 →
            </Link>
            <Link
              to="/safety"
              className="inline-flex items-center gap-2 rounded-xl border border-aiBright/40 bg-aiBright/10 px-7 py-4 text-sm font-black text-aiBright transition hover:bg-aiBright/20"
            >
              查看安全边界
            </Link>
          </div>
        </div>
      </section>

      {/* 4 PRINCIPLES */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="PRINCIPLES"
          title="四条原则，定义"
          highlight="AI 托管的边界"
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {principles.map((p) => (
            <div
              key={p.no}
              className="rounded-2xl border border-aiBright/20 bg-gradient-to-br from-aiDeep/20 to-transparent p-7 transition hover:border-aiBright/50"
            >
              <div className="font-mono text-xs font-bold text-aiBright">P · {p.no}</div>
              <h3 className="mt-3 font-display text-2xl font-black text-white">{p.title}</h3>
              <p className="mt-3 text-sm leading-7 text-textMuted">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* USE CASES */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            background:
              'radial-gradient(700px 400px at 50% 50%, rgba(168,85,247,0.15), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="USE CASES" title="它会在" highlight="什么时候帮你" />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {useCases.map((u) => (
              <div
                key={u.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-0.5 hover:border-aiBright/40 hover:bg-aiBright/5"
              >
                <div className="text-3xl">{u.icon}</div>
                <h3 className="mt-3 font-display text-lg font-black text-white">{u.title}</h3>
                <p className="mt-2 text-sm leading-6 text-textMuted">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOUNDARY */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-mint/40 bg-mint/10 px-3 py-1 text-xs font-bold text-mint">
              BOUNDARY · 不可逾越
            </span>
            <h2 className="mt-4 font-display text-4xl font-black leading-tight text-white">
              这些事，
              <br />
              AI 托管
              <span className="text-mint"> 永远不会做</span>
              。
            </h2>
            <p className="mt-5 text-sm leading-7 text-textMuted">
              我们把"AI 不能做什么"写得比"AI 能做什么"更清楚。
              因为前者是底线，后者只是能力。
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {boundary.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-cream"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-mint">
                  ✕
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="FAQ" title="你可能想问的" highlight="几个问题" />
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-aiBright/30 open:border-aiBright/40 open:bg-aiBright/5"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-base font-black text-white">
                {f.q}
                <span className="text-aiBright transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-textMuted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-aiBright/30 bg-gradient-to-br from-aiDeep/40 via-[#0e0a1c] to-[#0a0b14] p-10 text-center sm:p-14">
          <h2 className="font-display text-3xl font-black leading-tight text-white sm:text-4xl">
            准备好让 AI
            <br />
            <span className="bg-gradient-to-r from-aiCyan to-aiBright bg-clip-text text-transparent">
              替你跑腿，但不替你做决定？
            </span>
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/ai"
              className="inline-flex items-center gap-2 rounded-xl bg-ai-grad px-7 py-4 text-sm font-black text-white shadow-aiGlow transition hover:-translate-y-0.5"
            >
              进入 AI 界 →
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-7 py-4 text-sm font-black text-cream transition hover:border-aiBright/40"
            >
              返回首页
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
});

const SectionHeader = ({
  eyebrow,
  title,
  highlight,
}: {
  eyebrow: string;
  title: string;
  highlight: string;
}) => (
  <div className="mx-auto max-w-3xl text-center">
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-bold tracking-wide text-textMuted">
      {eyebrow}
    </span>
    <h2 className="mt-4 font-display text-3xl font-black leading-tight text-white sm:text-4xl">
      {title}{' '}
      <span className="bg-gradient-to-r from-aiCyan via-aiBright to-ai bg-clip-text text-transparent">
        {highlight}
      </span>
    </h2>
  </div>
);
