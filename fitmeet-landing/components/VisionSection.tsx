'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

const KEYWORDS = [
  { en: 'Unified Ecosystem',       zh: '一体化生态' },
  { en: 'Intelligent Companionship', zh: '智能陪伴' },
  { en: 'Cross-species Wellness',  zh: '跨物种健康' },
  { en: 'Future-ready',            zh: '面向未来' },
];

export function VisionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section
      id="vision"
      ref={sectionRef}
      aria-labelledby="vision-title"
      className="relative py-[22vh] px-6 md:px-10 overflow-hidden"
      style={{ background: 'linear-gradient(to bottom, rgba(10,10,9,0.92), #0A0A09)' }}
    >
      {/* Top border glow */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-moss/30 to-transparent" />

      {/* Parallax rings */}
      <motion.div
        style={{ y }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden
      >
        <div className="w-[85vmin] h-[85vmin] rounded-full border border-ivory/[0.06]" />
        <div className="absolute w-[55vmin] h-[55vmin] rounded-full border border-moss/12" />
        <div className="absolute w-[30vmin] h-[30vmin] rounded-full border border-ivory/[0.08]" />
      </motion.div>

      <div className="relative max-w-[1100px] mx-auto text-center">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="text-[10px] tracking-[0.38em] uppercase text-ivory/42"
        >
          04 — Vision
        </motion.p>

        <motion.h2
          id="vision-title"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className="mt-8 font-display font-light tracking-ultra text-balance text-[clamp(2.2rem,4.8vw,4.4rem)] leading-[1.02]"
        >
          A unified ecosystem for<br className="hidden md:block" />
          the next era of wellness.
        </motion.h2>

        {/* Animated underline */}
        <motion.div
          initial={{ scaleX: 0, originX: 0.5 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="mt-8 mx-auto w-20 h-px bg-moss/55"
          aria-hidden
        />

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
          className="mt-8 text-ivory/60 text-balance text-[clamp(1rem,1.3vw,1.18rem)] leading-relaxed max-w-2xl mx-auto"
        >
          FitMeet brings together physical health, emotional companionship, intelligent
          assistance, and adaptive AI into one living system.
        </motion.p>

        {/* Keyword grid */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-px max-w-3xl mx-auto">
          {KEYWORDS.map((k, i) => (
            <motion.div
              key={k.en}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-8%' }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.4 + i * 0.1 }}
              className="border border-ivory/[0.08] px-4 py-7 flex flex-col gap-1 hover:border-ivory/20 transition-colors duration-500"
            >
              <span className="text-[10px] tracking-[0.24em] uppercase text-ivory/65">{k.en}</span>
              <span className="text-[10px] tracking-wide text-ivory/32">{k.zh}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
