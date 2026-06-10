import { lazy, memo, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import { FitMeetHero } from '@/components/hero/FitMeetHero';
import { AiSocialRequestCta } from '@/components/social-request/AiSocialRequestCta';
import { BrandPhilosophy } from '@/components/sections/BrandPhilosophy';
import { EcosystemGateways } from '@/components/sections/EcosystemGateways';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { SymbiosisNetwork } from '@/components/sections/SymbiosisNetwork';
import { VisionSection } from '@/components/sections/VisionSection';
import { ProductMotionShowcase } from '@/components/showcase';

const EarthScene = lazy(() =>
  import('@/components/three/EarthScene').then((module) => ({ default: module.EarthScene })),
);

export const HomePage = memo(function HomePage() {
  useEffect(() => {
    document.title = 'FitMeet - Agent-native social universe';
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return undefined;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (time: number) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
      smoothWheel: true,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return (
    <div
      id="top"
      className="living-orbit-home relative min-h-screen overflow-hidden bg-[#090908] text-[#f4efe6]"
    >
      <Suspense
        fallback={
          <div className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_42%,rgba(107,122,90,0.2),transparent_58%),#090908]" />
        }
      >
        <EarthScene />
      </Suspense>
      <main className="relative z-10">
        <FitMeetHero />
        <AiSocialRequestCta variant="hero" />
        <ProductMotionShowcase />
        <PlatformRoleStrip />
        <BrandPhilosophy />
        <EcosystemGateways />
        <SymbiosisNetwork />
        <VisionSection />
        <section className="relative px-6 py-24">
          <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-[#C8FF80]/30 bg-gradient-to-br from-[#15150f] to-[#0d0d0b] p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-12">
            <div className="text-[10px] uppercase tracking-[0.4em] text-[#C8FF80]">
              Investor / Tester Demo
            </div>
            <h2 className="text-2xl font-light leading-snug text-[#F4EFE6] sm:text-3xl">
              一句话需求 → AI 匹配 → 人工确认 → 线下完成 → 信任沉淀
            </h2>
            <p className="mx-auto max-w-xl text-sm leading-7 text-[#C7C2B0]">
              这是 FitMeet 的核心闭环。点开下方按钮，3 分钟内看完一个真实用户从输入到完成线下社交的全过程。
            </p>
            <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
              <Link
                to="/social-agent"
                className="rounded-full bg-[#C8FF80] px-6 py-3 text-sm font-medium text-[#0d0d0b] hover:bg-[#b8ef70]"
              >
                进入 FitMeet Agent
              </Link>
              <Link
                to="/social-request/new"
                className="rounded-full border border-[#C8FF80]/40 px-6 py-3 text-sm text-[#C8FF80] hover:bg-[#C8FF80]/10"
              >
                直接发起一次真实任务
              </Link>
            </div>
          </div>
        </section>
        <FinalCTA />
      </main>
    </div>
  );
});

const platformRoles = [
  {
    title: 'FitMeet 自研 Agent 入口',
    body: '一句话需求、画像补全、候选推荐、开场白和安全见面建议都从 FitMeet Agent 闭环展示。',
  },
  {
    title: '用户画像与权限控制台',
    body: '用户可以管理 Life Graph、隐私边界、确认门槛和 Agent 可执行能力。',
  },
  {
    title: 'App / 小程序 / 手表账户后台',
    body: '网站承接统一账户、内测预约、设备能力说明和多端数据权限。',
  },
  {
    title: '企业级展示平台',
    body: '给投资人、合作方和早期用户看清楚 FitMeet 的 Agent 安全闭环与真实生活网络能力。',
  },
];

function PlatformRoleStrip() {
  return (
    <section className="relative px-6 py-10">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[#C8FF80]/18 bg-[#0d0d0b]/82 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur">
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <div>
            <h2 className="font-display text-2xl font-black leading-tight text-[#F4EFE6]">
              FitMeet Agent Platform
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#C7C2B0]">
              网站端承担 Agent 展示、画像权限、内测增长和多端账户后台；核心社交执行由 FitMeet 自研 Agent 控制。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/social-agent"
                className="rounded-lg bg-[#C8FF80] px-4 py-2 text-sm font-black text-[#0d0d0b]"
              >
                进入 Agent
              </Link>
              <Link
                to="/app"
                className="rounded-lg border border-[#C8FF80]/35 px-4 py-2 text-sm font-black text-[#DFFF9F]"
              >
                App 内测
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {platformRoles.map((role) => (
              <article key={role.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <h3 className="text-sm font-black text-[#F4EFE6]">{role.title}</h3>
                <p className="mt-2 text-xs font-bold leading-6 text-[#A9A595]">{role.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
