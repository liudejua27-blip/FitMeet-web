import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const introSelectors = [
  '.fitmeet-website .fm-enterprise-hero-system__copy > *',
  '.fitmeet-website .fm-enterprise-hero-system__visual',
  '.fitmeet-website .fm-hero__copy > *',
  '.fitmeet-website .fm-hero__visual',
  '.fitmeet-website .fm-social-hero-visual',
  '.fitmeet-website .concept-home-hero__copy > *',
  '.fitmeet-website .website-page-hero > div > *',
  '[data-testid="assistant-ui-thread-list"] a',
  '[data-testid="assistant-ui-empty-state"] > div > *',
  '[data-testid="assistant-ui-composer"]',
  'main h1',
  'main h2',
].join(',');

const revealSelectors = [
  '.fitmeet-website .fm-section__header',
  '.fitmeet-website .fm-context-panel',
  '.fitmeet-website .fm-enterprise-loop article',
  '.fitmeet-website .fm-proof-strip article',
  '.fitmeet-website .fm-final-cta > *',
  '.fitmeet-website .website-band__header',
  '.fitmeet-website .demand-comparison article',
  '.fitmeet-website .proof-scenario-card',
  '.fitmeet-website .concept-loop-step',
  '.fitmeet-website .concept-panel',
  '.fitmeet-website .concept-module-grid > *',
  '.fitmeet-website .lifegraph-backing > *',
  '.fitmeet-website .safety-principles > *',
  '.fitmeet-website .concept-split > *',
  '.fitmeet-website .concept-terminal',
  '.fitmeet-website .concept-audit-list > *',
  '[data-testid="assistant-ui-thread-list"] button',
  '[data-testid="assistant-ui-message"]',
  '[data-testid="assistant-ui-tool-ui"]',
  'main article',
  'main [class*="Card"]',
  'main [class*="card"]',
].join(',');

const ambientSelectors = [
  '.fitmeet-website .fm-product-proof-visual',
  '.fitmeet-website .fm-world-story img',
  '.fitmeet-website .website-hero__visual',
  '[data-testid="assistant-ui-composer"] button[type="submit"]',
].join(',');

export function InterfaceMotion() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const root = document.documentElement;
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.classList.add('fm-motion-ready');

    if (prefersReducedMotion) {
      root.classList.add('fm-motion-reduced');
      return () => {
        root.classList.remove('fm-motion-ready', 'fm-motion-reduced');
      };
    }

    let cancelled = false;
    let setupTimer: number | undefined;
    let refreshTimer: number | undefined;
    let ctx: { revert: () => void } | undefined;

    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([gsapModule, scrollTriggerModule]) => {
        if (cancelled) return;
        const gsap = gsapModule.gsap;
        const ScrollTrigger = scrollTriggerModule.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        setupTimer = window.setTimeout(() => {
          ctx = gsap.context(() => {
            const introTargets = uniqueElements(gsap, introSelectors).slice(0, 28);
            const revealTargets = uniqueElements(gsap, revealSelectors)
              .filter((element) => !introTargets.includes(element))
              .slice(0, 180);
            const ambientTargets = uniqueElements(gsap, ambientSelectors);
            const pointerSurfaces = uniqueElements(
              gsap,
              '.fitmeet-website, [data-testid="assistant-ui-shell"]',
            );
            const magneticTargets = uniqueElements(
              gsap,
              [
                '.fitmeet-website .fm-button',
                '.fitmeet-website .concept-button',
                '.fitmeet-website .website-nav__actions a',
                '.fitmeet-website .website-page-hero__actions a',
                '[data-testid="assistant-ui-composer"] button[type="submit"]',
                '[data-testid="assistant-ui-thread-list"] button',
              ].join(','),
            ).slice(0, 80);

            gsap.fromTo(
              document.querySelector('main') ?? document.body,
              { autoAlpha: 0.985 },
              { autoAlpha: 1, duration: 0.24, ease: 'power1.out' },
            );

            if (introTargets.length > 0) {
              gsap.from(introTargets, {
                autoAlpha: 0,
                y: 22,
                scale: 0.985,
                duration: 0.78,
                ease: 'power3.out',
                stagger: { each: 0.045, from: 'start' },
                clearProps: 'transform,opacity,visibility',
              });
            }

            if (revealTargets.length > 0) {
              gsap.set(revealTargets, { autoAlpha: 0, y: 26 });
              ScrollTrigger.batch(revealTargets, {
                start: 'top 88%',
                once: true,
                interval: 0.08,
                batchMax: 8,
                onEnter: (batch) => {
                  gsap.to(batch, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.7,
                    ease: 'power3.out',
                    stagger: 0.045,
                    overwrite: 'auto',
                    clearProps: 'transform,opacity,visibility',
                  });
                },
              });
            }

            if (ambientTargets.length > 0) {
              gsap.to(ambientTargets, {
                y: -8,
                scale: 1.006,
                duration: 5.8,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
                overwrite: 'auto',
              });
            }

            const removePointerListeners = wirePointerSpotlight(gsap, pointerSurfaces);
            const removeMagneticListeners = wireMagneticHover(gsap, magneticTargets);

            return () => {
              removePointerListeners();
              removeMagneticListeners();
            };
          });

          refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 180);
        }, 80);
      },
    );

    return () => {
      cancelled = true;
      if (setupTimer) window.clearTimeout(setupTimer);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      ctx?.revert();
    };
  }, [location.pathname]);

  return null;
}

function wirePointerSpotlight(gsap: typeof import('gsap').gsap, surfaces: HTMLElement[]) {
  const cleanups: Array<() => void> = [];
  const clamp = gsap.utils.clamp(0, 100);

  surfaces.forEach((surface) => {
    const xTo = gsap.quickTo(surface, '--fm-pointer-x', {
      duration: 0.55,
      ease: 'power3.out',
    });
    const yTo = gsap.quickTo(surface, '--fm-pointer-y', {
      duration: 0.55,
      ease: 'power3.out',
    });

    const onMove = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      const toPercentX = gsap.utils.mapRange(rect.left, rect.right, 0, 100);
      const toPercentY = gsap.utils.mapRange(rect.top, rect.bottom, 0, 100);
      xTo(clamp(toPercentX(event.clientX)));
      yTo(clamp(toPercentY(event.clientY)));
    };
    const onLeave = () => {
      xTo(50);
      yTo(42);
    };

    surface.addEventListener('pointermove', onMove, { passive: true });
    surface.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerleave', onLeave);
    });
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

function wireMagneticHover(gsap: typeof import('gsap').gsap, targets: HTMLElement[]) {
  const cleanups: Array<() => void> = [];

  targets.forEach((target) => {
    const xTo = gsap.quickTo(target, 'x', { duration: 0.32, ease: 'power3.out' });
    const yTo = gsap.quickTo(target, 'y', { duration: 0.32, ease: 'power3.out' });
    const rotateTo = gsap.quickTo(target, 'rotation', {
      duration: 0.32,
      ease: 'power3.out',
    });

    const onMove = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      xTo(gsap.utils.clamp(-7, 7, x * 0.08));
      yTo(gsap.utils.clamp(-5, 5, y * 0.08));
      rotateTo(gsap.utils.clamp(-0.8, 0.8, x * 0.006));
    };
    const onLeave = () => {
      xTo(0);
      yTo(0);
      rotateTo(0);
    };

    target.addEventListener('pointermove', onMove, { passive: true });
    target.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      gsap.set(target, { clearProps: 'transform' });
    });
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

function uniqueElements(gsap: typeof import('gsap').gsap, selector: string) {
  const elements = gsap.utils.toArray<HTMLElement>(selector);
  return Array.from(new Set(elements)).filter(isRenderable);
}

function isRenderable(element: HTMLElement) {
  if (element.closest('[aria-hidden="true"], [hidden]')) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
