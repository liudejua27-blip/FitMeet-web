import { motion } from 'framer-motion';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { SectionHeading } from '@/components/ui/SectionHeading';

export function BrandPhilosophy() {
  return (
    <section
      id="philosophy"
      className="relative z-10 min-h-[95vh] overflow-hidden px-5 py-[18vh] sm:px-8 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1400px] items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SectionHeading
            eyebrow="01 / Brand Philosophy"
            title="Wellness is no longer human-only."
            body="FitMeet connects human movement, companion care, animal understanding, robotics assistance, and virtual AI guidance into one calm, intelligent wellness ecosystem."
          />
        </div>
        <motion.div
          initial={{ opacity: 0, x: 26 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-14%' }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-5"
        >
          <GlassPanel className="relative overflow-hidden p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_8%,rgba(107,122,90,0.22),transparent_36%)]" />
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#b8b5ac]/58">
                Connected wellness ecosystem
              </p>
              <div className="mt-12 grid gap-7">
                {[
                  ['Human movement', 'Recovery, training, social connection.'],
                  ['Companion care', 'Pets and animals understood as living signals.'],
                  ['Intelligent assistance', 'Robotics and AI supporting daily wellbeing.'],
                ].map(([title, body]) => (
                  <div key={title} className="border-t border-[#f4efe6]/10 pt-5">
                    <h3 className="text-lg font-semibold text-[#f4efe6]">{title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#f4efe6]/54">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </GlassPanel>
        </motion.div>
      </div>
    </section>
  );
}
