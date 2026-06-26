import { type ReactNode } from 'react';
import clsx from 'clsx';

export function WebsiteSection({
  body,
  children,
  id,
  label,
  title,
  tone,
}: {
  body?: string;
  children: ReactNode;
  id?: string;
  label: string;
  title: string;
  tone?: 'deep' | 'plain';
}) {
  return (
    <section
      id={id}
      className={clsx(
        'fm-section',
        tone === 'deep' && 'fm-section--deep',
        tone === 'plain' && 'fm-section--plain',
      )}
    >
      <div className="fm-section__header">
        <span>{label}</span>
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
      </div>
      {children}
    </section>
  );
}
