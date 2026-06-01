import clsx from 'clsx';
import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export function SectionShell({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={clsx('platform-section-shell', className)} {...props} />;
}

export function SectionHeader({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('platform-section-header', className)}>
      {eyebrow ? <span className="platform-label">{eyebrow}</span> : null}
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

type PlatformButtonProps =
  | (LinkProps & { to: string; variant?: 'primary' | 'secondary' })
  | (ButtonHTMLAttributes<HTMLButtonElement> & { to?: never; variant?: 'primary' | 'secondary' });

export function PlatformButton({ className, variant = 'secondary', ...props }: PlatformButtonProps) {
  const buttonClass = clsx('platform-button', variant === 'primary' && 'platform-button--primary', className);

  if ('to' in props && props.to) {
    return <Link className={buttonClass} {...props} />;
  }

  return <button className={buttonClass} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />;
}

export function PlatformSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('platform-surface', className)} {...props} />;
}

export function InlineIconHeading({
  icon,
  title,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('platform-inline-heading', className)}>
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
    </div>
  );
}

export function PlatformCTA({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('platform-cta', className)} {...props}>
      {children}
    </div>
  );
}

export function SubtleDivider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={clsx('platform-divider', className)} {...props} />;
}
