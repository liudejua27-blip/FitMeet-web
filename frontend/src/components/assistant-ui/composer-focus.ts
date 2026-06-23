const COMPOSER_FOCUS_EVENT = 'fitmeet-agent-focus-composer';
const COMPOSER_FOCUS_UNTIL_ATTRIBUTE = 'data-fitmeet-focus-composer-until';

export function requestAssistantComposerFocus() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  document.documentElement.setAttribute(COMPOSER_FOCUS_UNTIL_ATTRIBUTE, String(Date.now() + 2_000));
  window.dispatchEvent(new Event(COMPOSER_FOCUS_EVENT));

  let attempts = 0;
  const focus = () => {
    const input = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="assistant-ui-composer"] textarea',
    );
    input?.focus({ preventScroll: true });
    if (input && document.activeElement === input) return;
    attempts += 1;
    if (attempts < 20) window.setTimeout(focus, 100);
  };
  window.setTimeout(focus, 0);
}

export function shouldFocusAssistantComposer() {
  if (typeof document === 'undefined') return false;
  const focusUntil = Number(
    document.documentElement.getAttribute(COMPOSER_FOCUS_UNTIL_ATTRIBUTE) ?? '0',
  );
  return Number.isFinite(focusUntil) && Date.now() <= focusUntil;
}

export function addAssistantComposerFocusListener(listener: () => void) {
  window.addEventListener(COMPOSER_FOCUS_EVENT, listener);
  return () => window.removeEventListener(COMPOSER_FOCUS_EVENT, listener);
}
