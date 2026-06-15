import { gateways } from '@/data/gateways';
import { PremiumButton } from '@/components/ui/PremiumButton';

export function FinalCTA() {
  return (
    <section id="enter" className="relative z-10 overflow-hidden px-5 pb-14 pt-[16vh] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px] text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#b8b5ac]/54">
          Begin inside the orbit
        </p>
        <h2 className="mx-auto mt-8 max-w-4xl font-display text-[clamp(3rem,8vw,8rem)] font-light leading-[0.88] tracking-[-0.065em] text-[#f4efe6]">
          Enter the FitMeet Ecosystem
        </h2>
        <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {gateways.map((gateway) => (
            <PremiumButton key={gateway.id} to={gateway.href} variant="secondary">
              {gateway.cta}
            </PremiumButton>
          ))}
        </div>
      </div>
      <footer className="mx-auto mt-24 flex max-w-[1500px] flex-col items-center justify-between gap-5 border-t border-[#f4efe6]/10 pt-8 text-center text-[10px] uppercase tracking-[0.24em] text-[#b8b5ac]/42 md:flex-row">
        <span>© 2026 FitMeet</span>
        <span>One Earth. Every body. Every being.</span>
      </footer>
    </section>
  );
}
