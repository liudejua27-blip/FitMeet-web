'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ECOSYSTEM_NODES } from '@/data/ecosystemNodes';

export function SymbiosisStory() {
  const [activeId, setActiveId] = useState(ECOSYSTEM_NODES[0].id);
  const active = ECOSYSTEM_NODES.find((n) => n.id === activeId)!;

  const nodes = useMemo(() => {
    const r = 40; // % radius
    return ECOSYSTEM_NODES.map((n) => {
      const rad = (n.angle * Math.PI) / 180;
      return {
        ...n,
        x: 50 + Math.cos(rad) * r,
        y: 50 + Math.sin(rad) * r,
      };
    });
  }, []);

  return (
    <section
      id="symbiosis"
      aria-labelledby="symbiosis-title"
      className="relative py-[16vh] px-6 md:px-10 overflow-hidden"
      style={{ background: 'rgba(10,10,9,0.90)' }}
    >
      {/* Top border glow */}
      <div aria-hidden className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ivory/12 to-transparent" />

      <div className="max-w-[1440px] mx-auto grid md:grid-cols-12 gap-10">

        {/* ── Left: info panel ── */}
        <div className="md:col-span-4 flex flex-col">
          <motion.p
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[10px] tracking-[0.35em] uppercase text-ivory/42"
          >
            03 — Symbiosis
          </motion.p>

          <motion.h2
            id="symbiosis-title"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="mt-6 font-display font-light tracking-ultra text-balance text-[clamp(1.8rem,3.2vw,2.8rem)] leading-[1.04]"
          >
            Five lives.<br />One quiet network.
          </motion.h2>

          {/* Active node info */}
          <div className="mt-10 flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Active indicator dot */}
                <span
                  className="inline-block w-2 h-2 rounded-full mb-3"
                  style={{ background: '#F4EFE6', boxShadow: '0 0 8px rgba(244,239,230,0.5)' }}
                  aria-hidden
                />
                <p className="text-[10px] tracking-[0.30em] uppercase text-ivory/45 mb-2">
                  {active.label}
                </p>
                <p className="text-ivory/85 text-[clamp(1rem,1.4vw,1.35rem)] leading-relaxed max-w-xs">
                  {active.caption}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Node list */}
          <div className="mt-8 flex flex-col gap-2">
            {ECOSYSTEM_NODES.map((n) => (
              <button
                key={n.id}
                onMouseEnter={() => setActiveId(n.id)}
                onClick={() => setActiveId(n.id)}
                className="flex items-center gap-3 text-left group"
                aria-label={n.label}
              >
                <span
                  className="inline-block rounded-full flex-none transition-all duration-400"
                  style={{
                    width: n.id === activeId ? 8 : 5,
                    height: n.id === activeId ? 8 : 5,
                    background: '#F4EFE6',
                    opacity: n.id === activeId ? 1 : 0.3,
                    boxShadow: n.id === activeId ? '0 0 8px rgba(244,239,230,0.5)' : 'none',
                  }}
                />
                <span
                  className="text-[10px] tracking-[0.24em] uppercase transition-colors duration-300"
                  style={{ color: n.id === activeId ? 'rgba(244,239,230,0.9)' : 'rgba(244,239,230,0.38)' }}
                >
                  {n.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: orbital node diagram ── */}
        <div className="md:col-span-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-8%' }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative aspect-square max-w-[580px] mx-auto"
          >
            {/* Center pulse */}
            <div
              aria-hidden
              className="absolute inset-[36%] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(107,122,90,0.22) 0%, transparent 70%)' }}
            />

            {/* SVG overlay — orbit ring + connection lines */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" aria-hidden>
              {/* Outer orbit ring */}
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(244,239,230,0.10)" strokeWidth="0.18" />
              {/* Inner accent ring */}
              <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(107,122,90,0.10)" strokeWidth="0.12" />

              {/* Connection lines from center to nodes */}
              {nodes.map((n) => (
                <line
                  key={n.id}
                  x1="50" y1="50"
                  x2={n.x} y2={n.y}
                  stroke={n.id === activeId ? 'rgba(244,239,230,0.55)' : 'rgba(244,239,230,0.08)'}
                  strokeWidth="0.18"
                  style={{ transition: 'stroke 500ms cubic-bezier(0.22,1,0.36,1)' }}
                />
              ))}

              {/* Dashed lines between adjacent nodes */}
              {nodes.map((n, i) => {
                const next = nodes[(i + 1) % nodes.length];
                return (
                  <line
                    key={`edge-${n.id}`}
                    x1={n.x} y1={n.y}
                    x2={next.x} y2={next.y}
                    stroke="rgba(244,239,230,0.06)"
                    strokeWidth="0.12"
                    strokeDasharray="0.5 1.5"
                  />
                );
              })}

              {/* Center dot */}
              <circle cx="50" cy="50" r="1.8" fill="#F4EFE6" opacity="0.85" />
              <circle cx="50" cy="50" r="3.5" fill="none" stroke="rgba(244,239,230,0.18)" strokeWidth="0.18" />
            </svg>

            {/* Interactive node buttons */}
            {nodes.map((n) => {
              const isActive = n.id === activeId;
              return (
                <button
                  key={n.id}
                  onMouseEnter={() => setActiveId(n.id)}
                  onClick={() => setActiveId(n.id)}
                  aria-label={n.label}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group focus:outline-none"
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                >
                  {/* Outer glow ring */}
                  <span
                    className="absolute inset-1/2 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
                    style={{
                      width: isActive ? 32 : 0,
                      height: isActive ? 32 : 0,
                      background: 'radial-gradient(circle, rgba(244,239,230,0.12) 0%, transparent 70%)',
                    }}
                    aria-hidden
                  />
                  {/* Node dot */}
                  <span
                    className="relative block rounded-full transition-all duration-500"
                    style={{
                      width:  isActive ? 14 : 8,
                      height: isActive ? 14 : 8,
                      background: '#F4EFE6',
                      opacity: isActive ? 1 : 0.55,
                      boxShadow: isActive ? '0 0 0 5px rgba(244,239,230,0.06), 0 0 18px rgba(244,239,230,0.35)' : 'none',
                    }}
                  />
                  {/* Label */}
                  <span
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tracking-[0.25em] uppercase transition-all duration-400"
                    style={{
                      color: isActive ? 'rgba(244,239,230,0.92)' : 'rgba(244,239,230,0.38)',
                    }}
                  >
                    {n.label}
                  </span>
                </button>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
