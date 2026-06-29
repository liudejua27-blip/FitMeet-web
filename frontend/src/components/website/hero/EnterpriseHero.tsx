import { type ReactNode } from 'react';
import clsx from 'clsx';
import { SiteLink } from '../../navigation/SiteLink';
import { HeroProofBar } from './HeroProofBar';

export type EnterpriseHeroAction = {
  label: string;
  to: string;
  variant?: 'primary' | 'secondary';
};

export function EnterpriseHero({
  actions,
  description,
  eyebrow,
  layout = 'split',
  pageName,
  proofItems,
  title,
  visual,
}: {
  actions: EnterpriseHeroAction[];
  description: string;
  eyebrow?: string;
  layout?: 'split' | 'center';
  pageName?: string;
  proofItems?: string[];
  title: ReactNode;
  visual?: ReactNode;
}) {
  const isCenter = layout === 'center';

  return (
    <section
      className={clsx(
        'fm-enterprise-hero-system',
        visual && !isCenter && 'fm-enterprise-hero-system--split',
        isCenter && 'fm-enterprise-hero-system--center',
        pageName && `fm-enterprise-hero-system--${pageName}`,
      )}
    >
      <div className="fm-enterprise-hero-system__copy">
        {eyebrow ? <span className="fm-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="fm-actions">
          {actions.map((action) => (
            <SiteLink
              key={action.label}
              to={action.to}
              className={clsx(
                'fm-button',
                action.variant === 'primary' ? 'fm-button--primary' : 'fm-button--ghost',
              )}
            >
              {action.label}
            </SiteLink>
          ))}
        </div>
        <HeroProofBar items={proofItems} />
      </div>
      {visual && !isCenter ? (
        <div className="fm-enterprise-hero-system__visual">{visual}</div>
      ) : null}
    </section>
  );
}
