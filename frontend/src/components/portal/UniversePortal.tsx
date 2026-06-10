import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * UniversePortal — OurFitMeet 三界入口
 * Human Realm · Pet Realm · AI Realm
 *
 * 这是整个网站的灵魂入口：让用户在 3 秒内理解
 * 「这不是一个普通的社交网站，而是一个跨物种的连接宇宙」
 */

type RealmKey = 'human' | 'pet' | 'ai';

const realms: Array<{
  key: RealmKey;
  emoji: string;
  zh: string;
  en: string;
  tagline: string;
  desc: string;
  href: string;
  cta: string;
  signals: string[];
  /** Tailwind utility presets per realm */
  accent: string;
  ring: string;
  glowShadow: string;
  bgGrad: string;
  textGrad: string;
  ctaBg: string;
}> = [
  {
    key: 'human',
    emoji: '🏃',
    zh: '人类',
    en: 'Human Realm',
    tagline: '让汗水成为社交货币',
    desc: '约练、动态、教练、城市同好。和真实的人在真实的空间里相遇。',
    href: '/discover',
    cta: '进入约练',
    signals: ['12,486 个进行中的约练', '本周新增 4,231 位伙伴', '覆盖 187 座城市'],
    accent: 'human',
    ring: 'ring-human',
    glowShadow: 'shadow-humanGlow',
    bgGrad: 'from-human/40 via-human/10 to-transparent',
    textGrad: 'from-humanBright via-amber to-human',
    ctaBg: 'bg-human-grad',
  },
  {
    key: 'pet',
    emoji: '🐾',
    zh: '宠物',
    en: 'Pet Realm',
    tagline: '它们值得一个朋友',
    desc: '为狗子约一次遛弯、为猫主子找一个室友、为兔子找一片草地。宠物也有社交需求。',
    href: '/pet',
    cta: '进入宠物界',
    signals: ['8,912 只活跃毛孩', '本周遛狗局 2,108 场', '37 种支持物种'],
    accent: 'petBright',
    ring: 'ring-petBright',
    glowShadow: 'shadow-petGlow',
    bgGrad: 'from-petBright/40 via-pet/10 to-transparent',
    textGrad: 'from-petBright via-petWarm to-pet',
    ctaBg: 'bg-pet-grad',
  },
  {
    key: 'ai',
    emoji: '🤖',
    zh: 'AI',
    en: 'AI Realm',
    tagline: '当你睡着时,它在帮你交朋友',
    desc: 'AI 代理代替你浏览、匹配、破冰、维系。社交不再是体力活,而是心意。',
    href: '/ai',
    cta: '进入 AI 界',
    signals: ['16,733 个 AI 代理在线', '日均成功匹配 1,892 次', '多模态对话模型'],
    accent: 'aiBright',
    ring: 'ring-aiBright',
    glowShadow: 'shadow-aiGlow',
    bgGrad: 'from-aiBright/40 via-ai/10 to-transparent',
    textGrad: 'from-aiCyan via-aiBright to-ai',
    ctaBg: 'bg-ai-grad',
  },
];

export const UniversePortal = memo(function UniversePortal() {
  const [hovered, setHovered] = useState<RealmKey | null>(null);
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const d = new Date();
      const h = d.getHours();
      const greet = h < 6 ? '深夜好' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 22 ? '晚上好' : '深夜好';
      setTime(`${greet} · ${d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}`);
    };
    update();
    const t = window.setInterval(update, 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <section className="relative isolate overflow-hidden bg-[#080807]">
      {/* === Cosmic backdrop === */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Aurora mesh */}
        <div
          className="absolute inset-0 opacity-[0.35] blur-3xl"
          style={{
            background:
              'radial-gradient(900px 600px at 18% 28%, #FF6B35 0%, transparent 60%),' +
              'radial-gradient(800px 600px at 50% 78%, #52B788 0%, transparent 60%),' +
              'radial-gradient(900px 700px at 82% 22%, #A855F7 0%, transparent 60%)',
          }}
        />
        {/* Star field */}
        <StarField />
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:px-8 lg:pb-28">
        {/* === Tagline strip === */}
        <div className="mb-8 flex flex-wrap items-center justify-center gap-3 text-xs font-semibold tracking-[0.18em] text-textMuted">
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 backdrop-blur">
            {time || 'OURFITMEET · 多物种社交宇宙'}
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-white/40 sm:inline" />
          <span className="hidden sm:inline">v3.0 · 三界互通</span>
        </div>

        {/* === Hero Headline === */}
        <h2 className="text-center font-display text-5xl font-black leading-[1.05] tracking-tight text-cream sm:text-6xl lg:text-[88px]">
          今天,
          <span className="relative ml-3 inline-block">
            <span className="bg-gradient-to-r from-humanBright via-petBright to-aiBright bg-clip-text text-transparent [background-size:200%_auto] animate-gradient-x">
              你想连接谁
            </span>
            <span className="absolute -bottom-2 left-0 h-1 w-full rounded-full bg-gradient-to-r from-human via-petBright to-aiBright opacity-60 blur-sm" />
          </span>
          ?
        </h2>

        <p className="mt-6 max-w-2xl text-center text-base leading-relaxed text-textMuted sm:text-lg">
          人类、宠物、AI —— 三个平行的社交世界,在这里第一次互通。
          <br className="hidden sm:block" />
          选择你今天的入口,或让三界自然交叠,创造前所未有的连接。
        </p>

        {/* === Three Realms Grid === */}
        <div className="mt-14 grid w-full grid-cols-1 gap-5 lg:mt-20 lg:grid-cols-3 lg:gap-6">
          {realms.map((r) => (
            <RealmCard
              key={r.key}
              realm={r}
              isHovered={hovered === r.key}
              onHover={() => setHovered(r.key)}
              onLeave={() => setHovered((cur) => (cur === r.key ? null : cur))}
            />
          ))}
        </div>

        {/* === Bottom: cross-realm signal === */}
        <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { num: '38,131', label: '此刻在线灵魂', dot: 'bg-human' },
            { num: '2.3M+', label: '已连接关系', dot: 'bg-petBright' },
            { num: '187', label: '支持城市 / 47 国', dot: 'bg-aiBright' },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 backdrop-blur"
            >
              <span className={`relative flex h-2.5 w-2.5 ${s.dot} rounded-full`}>
                <span className={`absolute inset-0 ${s.dot} rounded-full opacity-60 animate-ping`} />
              </span>
              <div className="flex flex-1 items-baseline justify-between gap-3">
                <span className="font-display text-2xl font-black text-cream">{s.num}</span>
                <span className="text-xs font-semibold text-textMuted">{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

// ----------------------------------------------------------------------------
// RealmCard
// ----------------------------------------------------------------------------
function RealmCard({
  realm,
  isHovered,
  onHover,
  onLeave,
}: {
  realm: (typeof realms)[number];
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  return (
    <Link
      to={realm.href}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      className={[
        'group relative isolate flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md transition-all duration-500',
        'hover:-translate-y-1 hover:border-white/30',
        isHovered ? realm.glowShadow : '',
        'min-h-[440px]',
      ].join(' ')}
      aria-label={`进入 ${realm.zh}界 - ${realm.en}`}
    >
      {/* Layer 1: realm background gradient */}
      <div
        className={`pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br ${realm.bgGrad} opacity-60 transition-opacity duration-500 group-hover:opacity-100`}
      />
      {/* Layer 2: scanlines / texture */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 mix-blend-overlay">
        {realm.key === 'human' && <HumanTexture />}
        {realm.key === 'pet' && <PetTexture />}
        {realm.key === 'ai' && <AiTexture />}
      </div>

      {/* Top: emoji + en label */}
      <div className="flex items-start justify-between">
        <span className="text-6xl drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-transform duration-700 group-hover:scale-110">
          {realm.emoji}
        </span>
        <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-cream/80 backdrop-blur">
          {realm.en}
        </span>
      </div>

      {/* Title */}
      <div className="mt-8">
        <h2
          className={`bg-gradient-to-r ${realm.textGrad} bg-clip-text font-display text-5xl font-black leading-none tracking-tight text-transparent`}
        >
          {realm.zh}界
        </h2>
        <p className="mt-3 font-display text-lg font-bold text-cream">{realm.tagline}</p>
        <p className="mt-2 text-sm leading-relaxed text-cream/70">{realm.desc}</p>
      </div>

      {/* Live signals */}
      <ul className="mt-6 space-y-2">
        {realm.signals.map((s, i) => {
          const dotCls =
            realm.key === 'human'
              ? 'bg-human'
              : realm.key === 'pet'
              ? 'bg-petBright'
              : 'bg-aiBright';
          return (
            <li key={i} className="flex items-center gap-2 text-xs font-semibold text-cream/75">
              <span className={`h-1.5 w-1.5 rounded-full ${dotCls} animate-pulse-soft`} />
              {s}
            </li>
          );
        })}
      </ul>

      {/* CTA */}
      <div className="mt-auto pt-8">
        <span
          className={`inline-flex items-center gap-2 rounded-2xl ${realm.ctaBg} px-5 py-3 font-display text-sm font-black uppercase tracking-wider text-white shadow-lg transition-all duration-300 group-hover:gap-3 group-hover:shadow-2xl`}
        >
          {realm.cta}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>

      {/* Corner glyph */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/5 blur-2xl transition-all duration-700 group-hover:scale-150" />
    </Link>
  );
}

// ----------------------------------------------------------------------------
// Realm Textures (decorative SVGs, pure CSS no deps)
// ----------------------------------------------------------------------------
function HumanTexture() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      {/* concentric energy rings = 心跳波 */}
      {[60, 110, 170, 240].map((r, i) => (
        <circle
          key={i}
          cx="320"
          cy="80"
          r={r}
          fill="none"
          stroke="#FF6B35"
          strokeWidth="1"
          strokeDasharray="2 8"
          opacity={0.4 - i * 0.07}
        />
      ))}
    </svg>
  );
}

function PetTexture() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      {/* paw prints scattered */}
      {Array.from({ length: 8 }).map((_, i) => {
        const x = 60 + ((i * 47) % 320);
        const y = 80 + ((i * 73) % 280);
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${0.6 + (i % 3) * 0.2})`} opacity={0.6}>
            <circle cx="0" cy="0" r="8" fill="#52B788" />
            <circle cx="-10" cy="-12" r="4" fill="#52B788" />
            <circle cx="10" cy="-12" r="4" fill="#52B788" />
            <circle cx="-14" cy="-2" r="4" fill="#52B788" />
            <circle cx="14" cy="-2" r="4" fill="#52B788" />
          </g>
        );
      })}
    </svg>
  );
}

function AiTexture() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      {/* neural network nodes */}
      <defs>
        <radialGradient id="nodeGrad">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[
        [60, 80], [180, 60], [320, 110], [100, 200], [240, 180], [340, 240], [80, 320], [220, 320], [330, 340],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="14" fill="url(#nodeGrad)" />
          <circle cx={x} cy={y} r="4" fill="#22D3EE" />
        </g>
      ))}
      {/* connections */}
      {[
        [60, 80, 180, 60], [180, 60, 320, 110], [60, 80, 100, 200], [180, 60, 240, 180],
        [100, 200, 240, 180], [240, 180, 340, 240], [100, 200, 80, 320], [240, 180, 220, 320],
        [340, 240, 330, 340], [220, 320, 330, 340],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#A855F7" strokeWidth="1" opacity="0.4" />
      ))}
    </svg>
  );
}

// ----------------------------------------------------------------------------
// StarField — twinkling background dots
// ----------------------------------------------------------------------------
function StarField() {
  const stars = Array.from({ length: 60 }).map((_, i) => ({
    left: (i * 137.5) % 100,
    top: (i * 89.7) % 100,
    size: 1 + ((i * 13) % 3),
    delay: (i * 0.3) % 4,
  }));
  return (
    <div className="absolute inset-0">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-pulse-soft"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            opacity: 0.3 + (i % 5) * 0.1,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export default UniversePortal;
