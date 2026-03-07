import { memo } from 'react';
import { HeroSection, FeaturesSection, HowItWorksSection, CtaSection } from '../components/home';

export const HomePage = memo(function HomePage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CtaSection />
    </div>
  );
});
