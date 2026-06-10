import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * AboutPage — 关于我们 (主站章节页)
 *
 * 平台愿景 + 时间线 + 价值观 + 团队来源 + 联系方式
 */

const beliefs = [
  {
    no: '01',
    title: '附近优先',
    desc: '物理距离永远是第一过滤器。我们不打算让你跨城市谈恋爱。',
  },
  {
    no: '02',
    title: 'AI 是工具',
    desc: 'AI 不替你做决定，只替你做筛选。重要的事，永远由你点击确认。',
  },
  {
    no: '03',
    title: '宠物有发言权',
    desc: '一只狗、一只猫、一只兔子，也是社交关系的合法主体。',
  },
  {
    no: '04',
    title: '安全大于增长',
    desc: '如果一个匹配可能导致伤害，我们宁可不做这个匹配。',
  },
];

const timeline = [
  { year: '2024', event: '人的约练子站上线，覆盖 10+ 城市，月活突破 5 万' },
  { year: '2025 Q1', event: 'AI 匹配引擎接入，AI 与 AI 对话原型测试' },
  { year: '2025 Q3', event: '宠物子站启动，引入宠物档案、附近约遛、借狗体验' },
  { year: '2026 Q1', event: '主站升级，正式定位为「人 + 宠物 + AI」三合一附近社交网络' },
  {
    year: '2026 Q2',
    event: 'Social Agent 与 Profile Match Autopilot 全量开放，覆盖城市拓展至 187+',
  },
];

const team = [
  { dept: '产品', desc: '来自字节、小红书、Keep 的产品同行。' },
  { dept: '工程', desc: '来自蚂蚁、腾讯、Shopee 的全栈与算法工程师。' },
  { dept: '安全', desc: '前公检法、反诈中心顾问，以及 OWASP 社区贡献者。' },
  { dept: '宠物', desc: '兼职宠物医生、训犬师、流浪动物救助站合作者。' },
];

export const AboutPage = memo(function AboutPage() {
  useEffect(() => {
    document.title = '关于我们 · OurFitMeet — 让附近的人、宠物和 AI 形成更自然的连接';
  }, []);

  return (
    <div className="bg-[#080807] text-cream">
      {/* HERO */}
      <section className="relative isolate overflow-hidden px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(800px 500px at 30% 30%, rgba(255,107,53,0.20), transparent 60%),' +
              'radial-gradient(800px 500px at 70% 70%, rgba(168,85,247,0.20), transparent 60%),' +
              'radial-gradient(800px 500px at 50% 100%, rgba(82,183,136,0.18), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-bold text-textMuted">
            ABOUT · 关于我们
          </span>
          <h1 className="mt-5 font-display text-[clamp(40px,7vw,72px)] font-black leading-[1.05] text-white">
            让附近的
            <span className="bg-gradient-to-r from-human via-petBright to-aiBright bg-clip-text text-transparent">
              {' '}
              人、宠物和 AI{' '}
            </span>
            ，
            <br />
            形成更自然的连接。
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-textMuted">
            我们相信社交不该是体力活。在一个被算法切割成碎片、被陌生感稀释了温度的城市里， AI
            可以成为「先开口的那一个」、宠物可以成为「破冰的那一个」、附近可以成为「最自然的那一个」。
          </p>
        </div>
      </section>

      {/* 4 BELIEFS */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="WE BELIEVE" title="我们相信的四件事" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {beliefs.map((b) => (
            <div
              key={b.no}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-lime/40"
            >
              <div className="font-mono text-xs font-bold text-lime">BELIEF · {b.no}</div>
              <h3 className="mt-3 font-display text-2xl font-black text-white">{b.title}</h3>
              <p className="mt-3 text-sm leading-7 text-textMuted">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TIMELINE */}
      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-30"
          style={{
            background:
              'radial-gradient(700px 400px at 50% 50%, rgba(255,107,53,0.10), transparent 60%)',
          }}
        />
        <div className="mx-auto max-w-4xl">
          <SectionHeader eyebrow="TIMELINE" title="我们走到这里" />
          <ol className="relative mt-12 border-l border-white/10 pl-8">
            {timeline.map((t, i) => (
              <li key={t.year} className="relative pb-8 last:pb-0">
                <span className="absolute -left-[37px] top-1 flex h-4 w-4 items-center justify-center rounded-full border border-lime/40 bg-[#080807]">
                  <span className="h-2 w-2 rounded-full bg-lime" />
                </span>
                <div className="text-xs font-mono font-bold text-lime">{t.year}</div>
                <div className="mt-1 text-base leading-7 text-cream">{t.event}</div>
                {i === timeline.length - 1 && (
                  <span className="ml-2 inline-block rounded-md border border-lime/40 bg-lime/10 px-2 py-0.5 text-[10px] font-bold text-lime">
                    NOW
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* TEAM */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="TEAM" title="一群想把附近做轻的人" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((t) => (
            <div key={t.dept} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="font-display text-base font-black text-white">{t.dept}</div>
              <p className="mt-2 text-sm leading-6 text-textMuted">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section className="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0e08] to-[#0a0a08] p-10 text-center">
          <h2 className="font-display text-2xl font-black text-white sm:text-3xl">联系我们</h2>
          <p className="mt-3 text-sm text-textMuted">联系我们 15253005312@163.com</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3 text-sm font-black text-white shadow-glow transition hover:bg-brand2"
            >
              返回首页
            </Link>
            <Link
              to="/safety"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-black text-cream transition hover:border-lime/40"
            >
              安全与信任
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
});

const SectionHeader = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <div className="mx-auto max-w-3xl text-center">
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-bold tracking-wide text-textMuted">
      {eyebrow}
    </span>
    <h2 className="mt-4 font-display text-3xl font-black leading-tight text-white sm:text-4xl">
      {title}
    </h2>
  </div>
);
