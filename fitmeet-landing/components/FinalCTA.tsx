'use client';

import { motion } from 'framer-motion';
import { GATEWAYS } from '@/data/gateways';

export function FinalCTA() {
  return (
    <section
      id="enter"
      aria-labelledby="final-title"
      className="relative py-[24vh] px-6 md:px-10 overflow-hidden"
      style={{ background: '#0A0A09' }}
    >
      {/* Top border glow */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ivory/10 to-transparent" />

      {/* Radial bloom at center-bottom */}
      <div
        aria-hidden
        className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[80vmin] h-[60vmin] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(107,122,90,0.18) 0%, transparent 70%)' }}
      />

      <div className="relative max-w-[1100px] mx-auto text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="text-[10px] tracking-[0.38em] uppercase text-ivory/40 mb-8"
        >
          Begin your journey
        </motion.p>

        <motion.h2
          id="final-title"
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
          className="font-display font-light tracking-ultra text-balance text-[clamp(2.6rem,6vw,5.5rem)] leading-[0.98]"
        >
          Enter the FitMeet<br />Ecosystem
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
          className="mt-6 text-ivory/45 text-[clamp(0.92rem,1.2vw,1.05rem)]"
        >
          进入 FitMeet 共生健康生态。
        </motion.p>

        {/* Gateway buttons */}
        <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-3">
          {GATEWAYS.map((g, i) => (
            <motion.a
              key={g.id}
              href={g.href}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.28 + i * 0.1 }}
              className="group relative inline-flex items-center px-7 py-3.5 text-[11px] tracking-[0.24em] uppercase border border-ivory/18 hover:border-ivory/60 transition-all duration-600 ease-brand overflow-hidden"
            >
              <span className="relative z-10">{g.cta}</span>
              <span
                aria-hidden
                className="ml-3 relative z-10 inline-block h-px bg-ivory/35 group-hover:bg-ivory transition-all duration-500 ease-brand"
                style={{ width: '1.5rem' }}
              />
              <span aria-hidden className="absolute inset-0 bg-ivory/0 group-hover:bg-ivory/[0.04] transition-colors duration-600" />
            </motion.a>
          ))}
        </div>

        {/* Fine print */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-8%' }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
          className="mt-16 text-[9px] tracking-[0.28em] uppercase text-ivory/22"
        >
          © 2025 FitMeet · One Earth · Every body · Every being
        </motion.p>
      </div>
    </section>
  );
}
