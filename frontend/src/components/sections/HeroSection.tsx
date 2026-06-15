import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { PremiumButton } from '@/components/ui/PremiumButton';
import { navigateToDiscoverWithScrollReset } from '@/lib/scrollNavigation';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export function HeroSection() {
  const navigate = useNavigate();

  const jumpToDiscover = () => {
    navigateToDiscoverWithScrollReset(navigate);
  };

  return (
    <section className="relative z-10 flex min-h-[100svh] items-end overflow-hidden px-5 pb-20 pt-28 sm:px-8 md:items-center md:pb-0 lg:px-12">
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-[#090908]" />
      <div className="relative mx-auto grid w-full max-w-[1500px] items-end gap-10 md:grid-cols-[0.94fr_1.06fr]">
        <motion.div
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.12, delayChildren: 0.32 }}
          className="max-w-3xl"
        >
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(4.2rem,13vw,13rem)] font-light leading-[0.82] tracking-[-0.07em] text-[#f4efe6]"
          >
            FitMeet
          </motion.h1>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 max-w-2xl text-[clamp(1.35rem,2.8vw,2.5rem)] font-light leading-tight tracking-[-0.025em] text-[#f4efe6]/86"
          >
            一个地球，连接每一种生命与智能。
          </motion.p>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 w-[18.5rem] max-w-full whitespace-normal break-all text-sm leading-7 md:w-auto md:max-w-xl md:break-words md:text-lg md:leading-8"
            style={{ color: 'rgba(244, 239, 230, 0.78)' }}
          >
            面向人类、宠物、动物、机器人与虚拟 AI 的共生健康生态。
          </motion.p>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 font-mono text-[11px] uppercase tracking-[0.32em] text-[#b8b5ac]/72"
          >
            One Earth. Every body. Every being.
          </motion.p>
          <motion.div
            variants={fadeUp}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 flex flex-col gap-3 sm:flex-row"
          >
            <PremiumButton href="#gateways">Explore Ecosystem</PremiumButton>
            <PremiumButton variant="secondary" onClick={jumpToDiscover}>
              Enter FitMeet
            </PremiumButton>
            <PremiumButton href="#gateways" variant="ghost">
              Discover the Three Worlds
            </PremiumButton>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="hidden justify-end md:flex"
        >
          <div className="max-w-sm border-l border-[#f4efe6]/12 pl-7 text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#b8b5ac]/52">
              FitMeet Living Orbit System
            </p>
            <p className="mt-5 text-sm leading-7 text-[#f4efe6]/52">
              A calm orbital interface where human wellness, companion care, animal
              understanding, robotics, and virtual AI share one gravitational center.
            </p>
          </div>
        </motion.div>
      </div>

      <div
        className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-3 text-[9px] uppercase tracking-[0.34em] text-[#f4efe6]/36 md:flex"
        aria-hidden="true"
      >
        <span>Scroll</span>
        <span className="h-10 w-px origin-top bg-gradient-to-b from-[#f4efe6]/45 to-transparent living-scroll-line" />
      </div>
    </section>
  );
}
