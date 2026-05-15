'use client';

import { motion } from 'framer-motion';

const PILLARS = [
  { num: '01', en: 'Interconnected',  zh: '互联共生' },
  { num: '02', en: 'Intelligent',     zh: '智能感知' },
  { num: '03', en: 'Sustainable',     zh: '可持续' },
];

const reveal = {
  hidden: { opacity: 0, y: 32 },
  show:   { opacity: 1, y: 0,  transition: { duration: 1.15, ease: [0.22, 1, 0.36, 1] } },
};

export function BrandPhilosophy() {
  return (
    <section
      id="philosophy"
      aria-labelledby="philosophy-title"
      className="relative py-[18vh] px-6 md:px-10 overflow-hidden"
      style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(10,10,9,0.78) 18%, rgba(10,10,9,0.92) 100%)' }}
    >
      {/* Subtle left accent line */}
      <div aria-hidden className="absolute left-0 top-[10%] w-px h-[80%] bg-gradient-to-b from-transparent via-ivory/12 to-transparent" />

      <div className="max-w-[1200px] mx-auto grid md:grid-cols-12 gap-10">

        {/* ── Left label ── */}
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-12%' }}
          className="md:col-span-4 flex flex-col justify-between"
        >
          <p className="text-[10px] tracking-[0.35em] uppercase text-ivory/42">
            01 — Philosophy
          </p>
          <div className="mt-12 md:mt-0 grid grid-cols-3 md:grid-cols-1 gap-4 md:gap-6">
            {PILLARS.map((p) => (
              <div key={p.num} className="border-t border-ivory/10 pt-4">
                <p className="text-[9px] tracking-[0.28em] uppercase text-ivory/35 mb-1">{p.num}</p>
                <p className="text-ivory/80 text-sm font-light">{p.en}</p>
                <p className="text-ivory/35 text-[11px]">{p.zh}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Right content ── */}
        <div className="md:col-span-8">
          <motion.h2
            id="philosophy-title"
            variants={reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-12%' }}
            className="font-display font-light tracking-ultra text-balance text-[clamp(2rem,4.8vw,4.2rem)] leading-[1.04]"
          >
            Wellness is no longer<br className="hidden md:block" /> human-only.
          </motion.h2>

          <motion.div
            initial={{ scaleX: 0, originX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-12%' }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="mt-8 w-24 h-px bg-moss/60"
            aria-hidden
          />

          <motion.p
            variants={reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-12%' }}
            transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
            className="mt-7 text-ivory/68 text-balance text-[clamp(1rem,1.35vw,1.22rem)] leading-relaxed max-w-[62ch]"
          >
            FitMeet connects human movement, companion care, animal understanding,
            robotics assistance, and virtual AI guidance into one calm, intelligent
            wellness ecosystem.
          </motion.p>

          <motion.p
            variants={reveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-12%' }}
            transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1], delay: 0.32 }}
            className="mt-5 text-ivory/40 text-[0.92rem] leading-relaxed max-w-[58ch]"
          >
            健康不再只属于人类。FitMeet 将人、宠物、动物、机器人与虚拟 AI
            连接成一个温和、智能、可持续的共生系统。
          </motion.p>
        </div>
      </div>
    </section>
  );
}
