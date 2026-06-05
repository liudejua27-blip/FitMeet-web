import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GATEWAYS, type Gateway } from '@/data/gateways';

const DETAILS: Record<
  Gateway['id'],
  {
    promise: string;
    pillars: string[];
    proof: string;
  }
> = {
  human: {
    promise:
      'FitMeet Human focuses on training, recovery, social matching, and growth for real people with clear consent boundaries.',
    pillars: ['Training companion', 'Recovery rhythm', 'Social matching'],
    proof: 'Designed for verified profiles, explicit confirmation, and human-centered wellness journeys.',
  },
  pet: {
    promise:
      'FitMeet Pet & Animal extends care, bonding, and everyday health understanding to the lives that move with us.',
    pillars: ['Care routines', 'Companion insights', 'Health monitoring'],
    proof: 'Built for guardians, care providers, and animal-aware wellness experiences.',
  },
  ai: {
    promise:
      'FitMeet AI & Robotics gives agents and embodied companions a controlled way to assist everyday wellness.',
    pillars: ['Agent permissions', 'Robotics companion', 'Personalized guidance'],
    proof: 'Every automated action stays behind clear authorization, audit logs, and reversible user control.',
  },
};

type GatewayPageProps = {
  params: { gateway: string };
};

export function generateStaticParams() {
  return GATEWAYS.map((gateway) => ({ gateway: gateway.id }));
}

export function generateMetadata({ params }: GatewayPageProps): Metadata {
  const gateway = readGateway(params.gateway);
  if (!gateway) return {};
  return {
    title: `${gateway.titleEn} — FitMeet`,
    description: gateway.descriptionEn,
  };
}

export default function GatewayDetailPage({ params }: GatewayPageProps) {
  const gateway = readGateway(params.gateway);
  if (!gateway) notFound();
  const detail = DETAILS[gateway.id];

  return (
    <main className="min-h-screen bg-[#0A0A09] text-ivory">
      <section className="mx-auto flex min-h-[92svh] max-w-[1180px] flex-col justify-end px-6 pb-24 pt-32 md:px-10">
        <p className="mb-6 text-[10px] uppercase tracking-[0.36em] text-ivory/42">
          {gateway.index} — {gateway.eyebrow}
        </p>
        <h1 className="font-display text-[clamp(4rem,10vw,9rem)] font-light leading-[0.92] tracking-ultra">
          {gateway.titleEn}
        </h1>
        <p className="mt-5 text-xl text-ivory/60">{gateway.title}</p>
        <p className="mt-8 max-w-2xl text-balance text-[clamp(1rem,1.5vw,1.32rem)] leading-relaxed text-ivory/70">
          {detail.promise}
        </p>
        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <a
            href="/agent-hub"
            className="inline-flex items-center justify-center border border-ivory/22 px-7 py-3 text-[11px] uppercase tracking-[0.24em] text-ivory transition-colors duration-300 hover:border-ivory/60"
          >
            Connect Agent
          </a>
          <a
            href="/#gateways"
            className="inline-flex items-center justify-center px-7 py-3 text-[11px] uppercase tracking-[0.24em] text-ivory/48 transition-colors duration-300 hover:text-ivory"
          >
            Back to ecosystem
          </a>
        </div>
      </section>

      <section className="border-y border-ivory/[0.08] bg-[#0D0D0B] px-6 py-20 md:px-10">
        <div className="mx-auto grid max-w-[1180px] gap-8 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-ivory/35">
              What it covers
            </p>
            <h2 className="mt-4 font-display text-4xl font-light tracking-ultra">
              {gateway.cta}
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden border border-ivory/[0.08] md:grid-cols-3">
            {detail.pillars.map((pillar) => (
              <div key={pillar} className="bg-[#11110E] p-6">
                <p className="text-sm text-ivory/74">{pillar}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-20 md:px-10">
        <p className="max-w-3xl text-lg leading-relaxed text-ivory/62">
          {detail.proof}
        </p>
      </section>
    </main>
  );
}

function readGateway(slug: string): Gateway | undefined {
  return GATEWAYS.find((gateway) => gateway.id === slug);
}
