import { Link } from 'react-router-dom';
import { SiteLink } from '../../navigation/SiteLink';

export function FinalCTA({
  body,
  label,
  primary,
  secondary,
  title,
}: {
  body: string;
  label: string;
  primary: { label: string; to: string; siteLink?: boolean };
  secondary: { label: string; to: string; siteLink?: boolean };
  title: string;
}) {
  const PrimaryLink = primary.siteLink ? SiteLink : Link;
  const SecondaryLink = secondary.siteLink ? SiteLink : Link;

  return (
    <section className="fm-final-cta">
      <span>{label}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="fm-actions">
        <PrimaryLink to={primary.to} className="fm-button fm-button--primary">
          {primary.label}
        </PrimaryLink>
        <SecondaryLink to={secondary.to} className="fm-button fm-button--ghost">
          {secondary.label}
        </SecondaryLink>
      </div>
    </section>
  );
}
