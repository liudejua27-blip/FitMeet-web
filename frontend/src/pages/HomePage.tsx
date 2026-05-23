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
        <BrandPhilosophy />
        <EcosystemGateways />
        <SymbiosisNetwork />
        <VisionSection />
        <section className="relative py-24 px-6">
          <div className="max-w-3xl mx-auto rounded-3xl border border-[#C8FF80]/30 bg-gradient-to-br from-[#15150f] to-[#0d0d0b] p-8 sm:p-12 text-center space-y-6">
            <div className="text-[10px] uppercase tracking-[0.4em] text-[#C8FF80]">
              Investor / Tester Demo
            </div>
            <h2 className="text-2xl sm:text-3xl font-light text-[#F4EFE6] leading-snug">
              一句话需求 → AI 匹配 → 人工确认 → 线下完成 → 信任沉淀
            </h2>
            <p className="text-sm text-[#C7C2B0] max-w-xl mx-auto leading-7">
              这是 FitMeet 的核心闭环。点开下方按钮，3 分钟内看完一个真实用户从输入到完成线下社交的全过程。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                to="/social-request/ai"
                className="px-6 py-3 rounded-full bg-[#C8FF80] text-[#0d0d0b] text-sm font-medium hover:bg-[#b8ef70]"
              >
                ✨ AI 帮我发布需求 →
              </Link>
              <Link
                to="/social-request/new"
                className="px-6 py-3 rounded-full border border-[#C8FF80]/40 text-[#C8FF80] text-sm hover:bg-[#C8FF80]/10"
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
