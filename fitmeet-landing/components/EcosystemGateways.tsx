'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GATEWAYS } from '@/data/gateways';
import clsx from 'clsx';

export function EcosystemGateways() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <section
      id="gateways"
      aria-labelledby="gateways-title"
      className="relative py-[14vh] px-6 md:px-10"
      style={{ background: 'rgba(10,10,9,0.88)' }}
    >
      {/* Top hairline with radial glow */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ivory/14 to-transparent" />

      <div className="max-w-[1440px] mx-auto">

        {/* Header row */}
        <div className="grid md:grid-cols-12 gap-10 mb-16">
          <motion.div
            className="md:col-span-4"
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[10px] tracking-[0.35em] uppercase text-ivory/42">
              02 — Three Worlds
            </p>
          </motion.div>
          <motion.div
            className="md:col-span-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            <h2
              id="gateways-title"
              className="font-display font-light tracking-ultra text-balance text-[clamp(1.8rem,3.6vw,3.2rem)] leading-[1.05]"
            >
              Three gateways. One ecosystem.
            </h2>
          </motion.div>
        </div>

        {/* Cards grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-px"
          onMouseLeave={() => setActive(null)}
        >
          {GATEWAYS.map((g, i) => {
            const isActive = active === g.id;
            const isDim    = active !== null && !isActive;
            return (
              <motion.a
                key={g.id}
                href={g.href}
                onMouseEnter={() => setActive(g.id)}
                onFocus={() => setActive(g.id)}
                onBlur={() => setActive(null)}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-8%' }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: i * 0.14 }}
                className={clsx(
                  'group relative block min-h-[62vh] overflow-hidden transition-all duration-700 ease-brand',
                  'border border-ivory/[0.07]',
                  isDim ? 'opacity-45' : 'opacity-100',
                )}
                style={{
                  background: isActive
                    ? `radial-gradient(70% 55% at 50% 105%, ${g.accent}28 0%, rgba(10,10,9,0.82) 65%)`
                    : 'rgba(10,10,9,0.72)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                {/* Corner accent */}
                <div
                  className="absolute top-0 right-0 w-16 h-px transition-all duration-700"
                  style={{ background: isActive ? g.accent : 'transparent', opacity: 0.6 }}
                  aria-hidden
                />
                <div
                  className="absolute top-0 right-0 w-px h-16 transition-all duration-700"
                  style={{ background: isActive ? g.accent : 'transparent', opacity: 0.6 }}
                  aria-hidden
                />

                <div className="absolute inset-8 md:inset-10 flex flex-col">
                  {/* Top meta */}
                  <div className="flex items-start justify-between text-[10px] tracking-[0.30em] uppercase text-ivory/38">
                    <span>{g.index}</span>
                    <span>{g.eyebrow}</span>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Bottom content */}
                  <div>
                    <h3 className="font-display font-light tracking-ultra text-[clamp(2.2rem,3.5vw,3.2rem)] leading-[0.96]">
                      {g.titleEn}
                    </h3>
                    <p className="mt-2 text-ivory/48 text-sm tracking-wide">{g.title}</p>

                    {/* Expandable description */}
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.div
                          key="desc"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden mt-5"
                        >
                          <p className="text-ivory/70 text-[0.92rem] leading-relaxed max-w-xs">
                            {g.descriptionEn}
                          </p>
                          <p className="text-ivory/38 text-[0.82rem] leading-relaxed max-w-xs mt-2">
                            {g.description}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* CTA row */}
                    <div className="mt-8 flex items-center gap-3 text-[10px] tracking-[0.30em] uppercase text-ivory/55 group-hover:text-ivory transition-colors duration-500">
                      <span>{g.cta}</span>
                      <span
                        aria-hidden
                        className="inline-block h-px bg-ivory/35 group-hover:bg-ivory transition-all duration-500"
                        style={{ width: isActive ? '3.5rem' : '2rem' }}
                      />
                    </div>
                  </div>
                </div>
              </motion.a>
            );
          })}
        </div>
      </div>

      {/* Bottom hairline */}
      <div aria-hidden className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ivory/10 to-transparent" />
    </section>
  );
}
