import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import type { LinkProps } from 'react-router-dom';
import clsx from 'clsx';
import { SiteLink } from '../navigation/SiteLink';

type PremiumButtonBaseProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
};

type PremiumAnchorProps = PremiumButtonBaseProps & {
  href: string;
  to?: undefined;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

type PremiumLinkProps = PremiumButtonBaseProps & {
  to: string;
  href?: undefined;
} & Omit<LinkProps, 'to'>;

type PremiumButtonOnlyProps = PremiumButtonBaseProps & {
  to?: undefined;
  href?: undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

type PremiumButtonProps = PremiumAnchorProps | PremiumLinkProps | PremiumButtonOnlyProps;

export function PremiumButton({
  children,
  variant = 'primary',
  className,
  ...props
}: PremiumButtonProps) {
  const classes = clsx(
    'living-button group relative inline-flex items-center justify-center overflow-hidden px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] transition duration-500',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f4efe6]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090908]',
    variant === 'primary' &&
      'border border-[#f4efe6]/26 bg-[#f4efe6] text-[#11110f] hover:border-[#f4efe6] hover:bg-[#fffaf0]',
    variant === 'secondary' &&
      'border border-[#f4efe6]/18 bg-[#f4efe6]/[0.035] text-[#f4efe6] hover:border-[#f4efe6]/52 hover:bg-[#f4efe6]/[0.07]',
    variant === 'ghost' &&
      'border border-transparent bg-transparent text-[#f4efe6]/58 hover:text-[#f4efe6]',
    className,
  );

  const content = (
    <>
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden="true"
        className="relative z-10 ml-4 h-px w-7 bg-current opacity-45 transition-all duration-500 group-hover:w-10 group-hover:opacity-80"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-0 transition duration-700 group-hover:translate-x-[120%] group-hover:opacity-100"
      />
    </>
  );

  if ('href' in props && props.href) {
    const anchorProps = props as { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} {...anchorProps}>
        {content}
      </a>
    );
  }

  if ('to' in props && props.to) {
    const { to, ...linkProps } = props as PremiumLinkProps;
    return (
      <SiteLink to={to} className={classes} {...linkProps}>
        {content}
      </SiteLink>
    );
  }

  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button className={classes} {...buttonProps} type={buttonProps.type ?? 'button'}>{content}</button>;
}
