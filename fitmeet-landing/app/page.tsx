import { HeroSection } from '@/components/HeroSection';
import { BrandPhilosophy } from '@/components/BrandPhilosophy';
import { EcosystemGateways } from '@/components/EcosystemGateways';
import { SymbiosisStory } from '@/components/SymbiosisStory';
import { VisionSection } from '@/components/VisionSection';
import { FinalCTA } from '@/components/FinalCTA';

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <BrandPhilosophy />
      <EcosystemGateways />
      <SymbiosisStory />
      <VisionSection />
      <FinalCTA />
    </>
  );
}
