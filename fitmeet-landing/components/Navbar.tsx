'use client';

import { useEffect, useState } from 'react';
import { NAV_LINKS } from '@/data/nav';
import clsx from 'clsx';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={clsx(
        'fixed top-0 inset-x-0 z-50 transition-[background,backdrop-filter,border-color] duration-500 ease-brand',
        scrolled ? 'glass' : 'bg-transparent border-b border-transparent'
      )}
    >
      <nav
        aria-label="Primary"
        className="max-w-[1440px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between"
      >
        <a href="#top" className="text-ivory tracking-ultra text-lg font-medium">
          FitMeet
        </a>

        <ul className="hidden md:flex items-center gap-8 text-[13px] tracking-wide text-ivory/70">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="hover:text-ivory transition-colors duration-300 ease-brand"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="#gateways"
          className="hidden md:inline-flex items-center px-4 py-2 text-[12px] tracking-[0.18em] uppercase border border-ivory/20 hover:border-ivory/60 transition-colors duration-300 ease-brand"
        >
          Enter
        </a>

        <button
          aria-label="Open menu"
          aria-expanded={open}
          className="md:hidden w-10 h-10 grid place-items-center"
          onClick={() => setOpen((v) => !v)}
        >
          <span
            className={clsx(
              'block w-5 h-px bg-ivory transition-transform duration-300',
              open && 'translate-y-[3px] rotate-45'
            )}
          />
          <span
            className={clsx(
              'block w-5 h-px bg-ivory mt-[6px] transition-transform duration-300',
              open && '-translate-y-[3px] -rotate-45'
            )}
          />
        </button>
      </nav>

      {open && (
        <div className="md:hidden glass border-t hairline">
          <ul className="px-6 py-6 flex flex-col gap-5 text-ivory/80">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
