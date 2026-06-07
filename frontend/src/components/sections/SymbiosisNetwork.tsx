import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ecosystemNodes } from '@/data/ecosystemNodes';
import { SectionHeading } from '@/components/ui/SectionHeading';

export function SymbiosisNetwork() {
  const [activeId, setActiveId] = useState(ecosystemNodes[0].id);
  const activeNode = ecosystemNodes.find((node) => node.id === activeId) ?? ecosystemNodes[0];
  const nodes = useMemo(
    () =>
      ecosystemNodes.map((node) => {
        const radians = (node.angle * Math.PI) / 180;
        return {
          ...node,
          x: 50 + Math.cos(radians) * 39,
          y: 50 + Math.sin(radians) * 39,
        };
      }),
    [],
  );

  return (
    <section
      id="symbiosis"
      className="relative z-10 overflow-hidden px-5 py-[17vh] sm:px-8 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1400px] items-center gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow="03 / Symbiosis Network"
            title="Five forms of life and intelligence. One quiet network."
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNode.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="mt-12 max-w-md border-l border-[#f4efe6]/14 pl-6"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#b8b5ac]/64">
                {activeNode.label}
              </p>
              <p className="mt-3 text-2xl font-light text-[#f4efe6]">{activeNode.caption}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-7"
        >
          <div className="relative mx-auto aspect-square w-full max-w-[640px]">
            <div className="absolute inset-[32%] rounded-full bg-[radial-gradient(circle,rgba(244,239,230,0.22),rgba(107,122,90,0.12)_42%,transparent_72%)]" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(244,239,230,0.11)" strokeWidth="0.18" />
              <circle cx="50" cy="50" r="25" fill="none" stroke="rgba(107,122,90,0.16)" strokeWidth="0.14" />
              {nodes.map((node) => (
                <line
                  key={node.id}
                  x1="50"
                  y1="50"
                  x2={node.x}
                  y2={node.y}
                  stroke={node.id === activeId ? node.accent : 'rgba(244,239,230,0.08)'}
                  strokeWidth={node.id === activeId ? '0.34' : '0.14'}
                  style={{ transition: 'stroke 300ms ease, stroke-width 300ms ease' }}
                />
              ))}
              {nodes.map((node, index) => {
                const next = nodes[(index + 1) % nodes.length];
                return (
                  <line
                    key={`${node.id}-${next.id}`}
                    x1={node.x}
                    y1={node.y}
                    x2={next.x}
                    y2={next.y}
                    stroke="rgba(244,239,230,0.065)"
                    strokeWidth="0.12"
                    strokeDasharray="0.6 1.5"
                  />
                );
              })}
              <circle cx="50" cy="50" r="1.6" fill="#f4efe6" />
              <circle cx="50" cy="50" r="4.6" fill="none" stroke="rgba(244,239,230,0.16)" strokeWidth="0.18" />
            </svg>

            {nodes.map((node) => {
              const isActive = node.id === activeId;
              return (
                <button
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-left focus:outline-none"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  onMouseEnter={() => setActiveId(node.id)}
                  onFocus={() => setActiveId(node.id)}
                  onClick={() => setActiveId(node.id)}
                >
                  <span
                    className="relative block rounded-full transition duration-300"
                    style={{
                      width: isActive ? 18 : 11,
                      height: isActive ? 18 : 11,
                      background: node.accent,
                      boxShadow: isActive ? `0 0 0 9px ${node.accent}18, 0 0 32px ${node.accent}70` : 'none',
                    }}
                  />
                  <span
                    className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.23em] transition duration-300"
                    style={{ color: isActive ? '#f4efe6' : 'rgba(244,239,230,0.42)' }}
                  >
                    {node.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
