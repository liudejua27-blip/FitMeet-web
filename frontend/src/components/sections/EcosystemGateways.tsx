import { gateways } from '@/data/gateways';
import { GatewayPortalCard } from '@/components/ui/GatewayPortalCard';
import { SectionHeading } from '@/components/ui/SectionHeading';

export function EcosystemGateways() {
  return (
    <section
      id="gateways"
      className="relative z-10 overflow-hidden px-5 py-[16vh] sm:px-8 lg:px-12"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f4efe6]/16 to-transparent" />
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-14 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#b8b5ac]/52">
              02 / Three Ecosystem Gateways
            </p>
          </div>
          <div className="lg:col-span-8">
            <SectionHeading
              title="Three portals. One living orbit."
              body="Each world opens from the same Earth-centered system, keeping wellness, care, and intelligence in one coherent field."
            />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {gateways.map((gateway, index) => (
            <GatewayPortalCard key={gateway.id} gateway={gateway} delay={index * 0.12} />
          ))}
        </div>
      </div>
    </section>
  );
}
