import type { MouseEvent, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { isInternalDiscoverRoute, resolveNavigationAlias } from '../../lib/scrollNavigation';
import { DiscoverLink } from './DiscoverLink';

type SiteLinkProps = Omit<LinkProps, 'to'> & {
  children: ReactNode;
  to: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

const isExternalUrl = (to: string) => {
  return /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(to) || to.startsWith('mailto:') || to.startsWith('tel:');
};

const isInternalHref = (to: string) => {
  return to.startsWith('/') && !to.startsWith('//');
};

export const SiteLink = ({ to, ...props }: SiteLinkProps) => {
  if (!to) {
    return <a href={to} {...props} />;
  }

  const resolvedTo = resolveNavigationAlias(to);

  if (isInternalHref(resolvedTo) && isInternalDiscoverRoute(resolvedTo)) {
    return <DiscoverLink to={resolvedTo} {...props} />;
  }

  if (
    resolvedTo.startsWith('#') ||
    isExternalUrl(resolvedTo) ||
    !isInternalHref(resolvedTo)
  ) {
    return <a href={resolvedTo} {...props} />;
  }

  return <Link to={resolvedTo} {...props} />;
};
