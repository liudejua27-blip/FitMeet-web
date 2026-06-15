import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Gateway } from '@/data/gateways';
import { SiteLink } from '@/components/navigation/SiteLink';

type GatewayPortalCardProps = {
  gateway: Gateway;
  delay?: number;
};

export function GatewayPortalCard({ gateway, delay = 0 }: GatewayPortalCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const glow = useMemo(
    () =>
      `radial-gradient(70% 54% at 50% 110%, ${gateway.accent}42 0%, rgba(20,20,19,0.72) 62%, rgba(20,20,19,0.28) 100%)`,
    [gateway.accent],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 34, rotateX: 5 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 1200 }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        setTilt({ x: y * -7, y: x * 8 });
      }}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <SiteLink
        to={gateway.href}
        className="group relative block min-h-[520px] overflow-hidden border border-[#f4efe6]/10 bg-[#11110f]/70 p-7 text-[#f4efe6] backdrop-blur-xl transition duration-500 hover:border-[#f4efe6]/30"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: 'transform 180ms ease-out, border-color 500ms ease',
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 opacity-70 transition duration-700 group-hover:opacity-100"
          style={{ background: glow }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#f4efe6]/60 to-transparent opacity-40"
        />
        <span
          aria-hidden="true"
          className="absolute -right-24 top-20 h-64 w-64 rounded-full border border-[#f4efe6]/10 transition duration-700 group-hover:scale-110"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#b8b5ac]/42 to-transparent"
        />

        <div className="relative z-10 flex min-h-[464px] flex-col">
          <div className="flex items-start justify-between gap-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8b5ac]/70">
              {gateway.index}
            </span>
            <span className="max-w-36 text-right font-mono text-[9px] uppercase tracking-[0.22em] text-[#b8b5ac]/42">
              {gateway.coordinates}
            </span>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div
              aria-hidden="true"
              className="relative h-44 w-44 rounded-full border border-[#f4efe6]/14"
            >
              <span className="absolute inset-[18%] rounded-full border border-dashed border-[#f4efe6]/18" />
              <span
                className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: gateway.accent,
                  boxShadow: `0 0 34px ${gateway.accent}80`,
                }}
              />
              <span className="absolute left-[18%] top-[35%] h-2 w-2 rounded-full bg-[#f4efe6]/70" />
              <span className="absolute right-[22%] top-[58%] h-1.5 w-1.5 rounded-full bg-[#f4efe6]/55" />
              <span className="absolute left-[48%] top-[12%] h-1 w-1 rounded-full bg-[#f4efe6]/45" />
            </div>
          </div>

          <div>
            <h3 className="font-display text-[clamp(2.25rem,4vw,4rem)] font-light leading-[0.92] tracking-[-0.04em]">
              {gateway.title}
            </h3>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-[#b8b5ac]/78">
              {gateway.subtitle}
            </p>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#f4efe6]/58">{gateway.description}</p>
            <span className="mt-8 inline-flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#f4efe6]/72 transition group-hover:text-[#f4efe6]">
              {gateway.cta}
              <span className="h-px w-9 bg-current transition duration-500 group-hover:w-14" />
            </span>
          </div>
        </div>
      </SiteLink>
    </motion.div>
  );
}
