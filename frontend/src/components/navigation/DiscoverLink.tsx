import { type MouseEvent, type ReactNode, useCallback } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { scrollToTopBeforeNavigate } from '../../lib/scrollNavigation';

type DiscoverLinkProps = Omit<LinkProps, 'to'> & {
  children: ReactNode;
  to: string;
  scrollBehavior?: ScrollBehavior;
};

export const DiscoverLink = ({
  to,
  onClick,
  scrollBehavior = 'auto',
  ...props
}: DiscoverLinkProps) => {
  const dataTestId = (props as Record<string, unknown>)['data-testid'] ?? 'discover-entry';

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (onClick) {
        onClick(event);
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      scrollToTopBeforeNavigate(scrollBehavior);
    },
    [onClick, scrollBehavior],
  );

  return (
    <Link
      data-discover-entry="true"
      data-discover-target={to}
      data-testid={String(dataTestId)}
      to={to}
      onClick={handleClick}
      {...props}
    />
  );
};
