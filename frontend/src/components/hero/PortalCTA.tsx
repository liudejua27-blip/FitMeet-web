type PortalCTAProps = {
  icon: 'ecosystem' | 'enter' | 'agent';
  titleZh: string;
  titleEn: string;
  href: string;
  variant: 'primary' | 'secondary' | 'agent';
};

function PortalIcon({ icon }: { icon: PortalCTAProps['icon'] }) {
  if (icon === 'enter') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 9l5.6 15.1L53 30l-15.4 5.9L32 51l-5.6-15.1L11 30l15.4-5.9L32 9z" />
        <circle cx="32" cy="30" r="5.8" />
      </svg>
    );
  }

  if (icon === 'agent') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="18" cy="28" r="6" />
        <circle cx="46" cy="22" r="6" />
        <circle cx="38" cy="46" r="6" />
        <path d="M23.4 25.5l17.2-2.3M21.7 32.8l11.8 10.4M43.8 27.3l-4 13.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="31" cy="31" r="13" />
      <path d="M8 39c11.5-24.8 30.1-25.3 48-13M11 44c16.6-4.8 28.7-1.2 42 7" />
      <path d="M22 15c-2.2 8.1-1 18.8 5.7 31.4" />
    </svg>
  );
}

export function PortalCTA({ icon, titleZh, titleEn, href, variant }: PortalCTAProps) {
  return (
    <a className={`portal-cta portal-cta--${variant}`} href={href}>
      <span className="portal-cta__rings" aria-hidden="true">
        <span />
        <span />
      </span>
      <span className="portal-cta__core">
        <PortalIcon icon={icon} />
        <strong>{titleZh}</strong>
        <small>{titleEn}</small>
      </span>
      <span className="portal-cta__arrow" aria-hidden="true">
        →
      </span>
    </a>
  );
}
