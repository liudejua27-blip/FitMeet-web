import { useEffect, useRef, useCallback } from 'react';

interface UseModalA11yOptions {
  /** Whether the modal is currently open. */
  open: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** Whether clicking the backdrop should close the modal. Default: true */
  backdropClose?: boolean;
}

/**
 * Provides full modal accessibility:
 * - ESC key closes the modal
 * - Click on backdrop closes the modal
 * - Focus trap inside the modal
 * - Body scroll lock while open
 *
 * Returns a ref to attach to the modal container (the inner panel, not the overlay).
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  backdropClose = true,
}: UseModalA11yOptions) {
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Lock body scroll & store previously-focused element
  useEffect(() => {
    if (!open) return;
    previousActiveElement.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      // Restore focus
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [open]);

  // Auto-focus the container when opened
  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.focus();
    }
  }, [open]);

  // Handle ESC key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  // Backdrop click handler — attach to the overlay div
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (backdropClose && e.target === e.currentTarget) {
        onClose();
      }
    },
    [backdropClose, onClose],
  );

  return { containerRef, handleBackdropClick };
}
