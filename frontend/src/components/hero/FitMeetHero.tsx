import { motion } from 'framer-motion';
import { useState } from 'react';
import { heroCopy, type HeroLanguage } from '@/data/heroCopy';
import { AgentGatewayPanel } from './AgentGatewayPanel';
import { GlobeOrbitLabels } from './GlobeOrbitLabels';
import { HeroCopy } from './HeroCopy';
import { HeroNavigation } from './HeroNavigation';
import { PortalCTA } from './PortalCTA';
import { ScrollIndicator } from './ScrollIndicator';

const portalIcons = ['ecosystem', 'enter', 'agent'] as const;

export function FitMeetHero() {
  const [currentLang, setCurrentLang] = useState<HeroLanguage>('zh');
  const copy = heroCopy[currentLang];

  return (
    <section className="fitmeet-hero" aria-label="FitMeet agent-native social universe">
      <HeroNavigation currentLang={currentLang} onLanguageChange={setCurrentLang} />
      <div className="fitmeet-hero__space" aria-hidden="true">
        <span className="space-arc space-arc--one" />
        <span className="space-arc space-arc--two" />
        <span className="space-arc space-arc--three" />
      </div>

      <div className="fitmeet-hero__grid">
        <div className="fitmeet-hero__left">
          <HeroCopy currentLang={currentLang} />
          <motion.div
            className="portal-cta-row"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.74, ease: [0.22, 1, 0.36, 1] }}
          >
            {copy.portals.map((portal, index) => (
              <PortalCTA
                key={portal.titleEn}
                icon={portalIcons[index]}
                titleZh={portal.titleZh}
                titleEn={portal.titleEn}
                href={portal.href}
                variant={portal.variant}
              />
            ))}
          </motion.div>

          <motion.div
            className="hero-security"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 1.05 }}
          >
            <span>{copy.safety.zh}</span>
            <small>{copy.safety.en}</small>
            <small>{copy.safety.principle}</small>
          </motion.div>
        </div>

        <motion.div
          className="fitmeet-hero__right"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <GlobeOrbitLabels />
          <AgentGatewayPanel currentLang={currentLang} />
        </motion.div>
      </div>

      <ScrollIndicator />
    </section>
  );
}
