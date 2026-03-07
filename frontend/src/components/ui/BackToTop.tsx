import { useState, useEffect, useCallback } from 'react';

/**
 * Floating back-to-top button that appears after scrolling down.
 * Place once in Layout or on any scrollable page.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-20 md:bottom-8 right-4 z-40 w-10 h-10 rounded-full bg-surface border border-border text-white flex items-center justify-center shadow-lg hover:border-lime hover:text-lime transition-all duration-200 cursor-pointer"
      aria-label="返回顶部"
      title="返回顶部"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
