'use client';

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';

const EarthScene = dynamic(
  () => import('./earth/EarthScene').then((m) => m.EarthScene),
  { ssr: false },
);

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.5 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show:   { opacity: 1, y: 0, transition: { duration: 1.3, ease: [0.22, 1, 0.36, 1] } },
};

export function HeroSection() {
  return (
    <>
      {/* Fixed 3D canvas — persists across entire page */}
      <EarthScene />

      <section
        id="top"
        aria-labelledby="hero-title"
        className="relative min-h-[100svh] flex items-end md:items-center justify-center overflow-hidden pb-28 md:pb-0"
        style={{ background: 'transparent' }}
      >
        {/* Bottom fade-to-dark so text stays readable */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-48 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #0A0A09)' }}
        />

        <div className="relative z-10 max-w-[1200px] w-full px-6 md:px-10 text-center">
          <motion.div variants={stagger} initial="hidden" animate="show">

            {/* Eyebrow */}
            <motion.p
              variants={fadeUp}
              className="mb-7 text-[10px] tracking-[0.40em] uppercase text-ivory/48"
            >
              One Earth · Every body · Every being
            </motion.p>

            {/* Brand mark */}
            <motion.h1
              id="hero-title"
              variants={fadeUp}
              className="font-display font-light tracking-ultra leading-[0.90] text-[clamp(4.5rem,11vw,10rem)]"
            >
              FitMeet
            </motion.h1>

            {/* Divider line */}
            <motion.div
              variants={fadeUp}
              className="mt-10 mx-auto w-16 h-px bg-ivory/22"
              aria-hidden
            />

            {/* Chinese tagline */}
            <motion.p
              variants={fadeUp}
              className="mt-8 text-ivory/72 text-balance text-[clamp(1rem,1.6vw,1.42rem)] leading-relaxed max-w-lg mx-auto"
            >
              一个地球，连接每一种生命与智能。
            </motion.p>

            {/* English sub-copy */}
            <motion.p
              variants={fadeUp}
              className="mt-3 text-ivory/38 text-[clamp(0.80rem,1vw,0.92rem)] max-w-md mx-auto"
            >
              The connected wellness ecosystem for humans, pets, animals, robotics, and virtual AI.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={fadeUp}
              className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <a
                href="#gateways"
                className="group relative inline-flex items-center px-8 py-4 text-[11px] tracking-[0.28em] uppercase border border-ivory/20 hover:border-ivory/60 transition-all duration-700 ease-brand overflow-hidden"
              >
                <span className="relative z-10">Explore Ecosystem</span>
                <span
                  aria-hidden
                  className="absolute inset-0 bg-ivory/0 group-hover:bg-ivory/[0.04] transition-colors duration-700"
                />
              </a>
              <a
                href="#philosophy"
                className="text-[11px] tracking-[0.28em] uppercase text-ivory/42 hover:text-ivory/90 transition-colors duration-500"
              >
                Our Philosophy →
              </a>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll pulse indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 1.4 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
          aria-hidden
        >
          <span className="text-[9px] tracking-[0.38em] uppercase text-ivory/32">Scroll</span>
          <span className="scroll-line" />
        </motion.div>
      </section>
    </>
  );
}
