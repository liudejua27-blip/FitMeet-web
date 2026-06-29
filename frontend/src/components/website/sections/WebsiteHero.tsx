import { EnterpriseHero } from '../hero/EnterpriseHero';
import { EnterpriseHeroVisual } from '../hero/EnterpriseHeroVisual';
import { websiteHeroConfig } from '../hero/hero-config';

export function WebsiteHero({ name }: { name: keyof typeof websiteHeroConfig }) {
  const config = websiteHeroConfig[name];
  const layout = 'layout' in config ? config.layout : undefined;
  const visual = 'visual' in config ? config.visual : undefined;

  return (
    <EnterpriseHero
      actions={config.actions}
      description={config.description}
      eyebrow={config.eyebrow}
      layout={layout}
      pageName={name}
      proofItems={config.proofItems}
      title={config.title}
      visual={visual ? <EnterpriseHeroVisual variant={visual} /> : undefined}
    />
  );
}
