import { motion } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';

const visions = [
  'Unified ecosystem',
  'Intelligent companionship',
  'Cross-species wellness',
  'Future-ready interaction',
];

export function VisionSection() {
  return (
    <section id="vision" className="relative z-10 overflow-hidden px-5 py-[18vh] sm:px-8 lg:px-12">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(9,9,8,0.2),rgba(9,9,8,0.84))]" />
      <div className="relative mx-auto max-w-[1300px]">
        <SectionHeading
          eyebrow="04 / Immersive Vision"
          title="A future interface that feels alive, not loud."
          body="The FitMeet universe is designed as a calm spatial system: subtle data flows, living orbits, and companion intelligence around a single planetary center."
          align="center"
        />
        <div className="relative mx-auto mt-16 grid max-w-5xl gap-px overflow-hidden border border-[#f4efe6]/10 bg-[#f4efe6]/10 md:grid-cols-4">
          {visions.map((vision, index) => (
            <motion.div
              key={vision}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ duration: 0.85, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }}
              className="relative min-h-48 overflow-hidden bg-[#11110f]/82 p-6"
            >
              <div className="absolute right-4 top-4 h-24 w-24 rounded-full border border-[#f4efe6]/10" />
              <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-[#6b7a5a]/70 to-transparent" />
              <p className="relative z-10 font-mono text-[10px] uppercase tracking-[0.25em] text-[#b8b5ac]/58">
                0{index + 1}
              </p>
              <h3 className="relative z-10 mt-20 max-w-[12rem] text-xl font-light leading-tight text-[#f4efe6]">
                {vision}
              </h3>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
