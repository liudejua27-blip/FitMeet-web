import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function useCinematicMotion<T extends HTMLElement>() {
  const scopeRef = useRef<T | null>(null);

  useEffect(() => {
    const root = scopeRef.current;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || reduceMotion) return;

    const media = root.querySelector<HTMLElement>('[data-cinematic-media]');
    const floats = root.querySelectorAll<HTMLElement>('[data-cinematic-float]');
    const beams = root.querySelectorAll<HTMLElement>('[data-cinematic-beam]');

    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from(media, { autoAlpha: 0, y: 34, rotationY: -8, scale: 0.965, duration: 0.86 })
        .from(
          floats,
          {
            autoAlpha: 0,
            y: 24,
            scale: 0.94,
            duration: 0.58,
            stagger: { amount: 0.28, from: 'center' },
          },
          '-=0.44',
        );

      gsap.to(floats, {
        y: (index) => (index % 2 === 0 ? -10 : 10),
        rotation: (index) => (index % 2 === 0 ? 1.4 : -1.2),
        duration: 3.4,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        stagger: 0.18,
      });

      gsap.to(beams, {
        xPercent: 12,
        autoAlpha: 0.82,
        duration: 4.8,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        stagger: 0.28,
      });
    }, root);

    const mediaX = media ? gsap.quickTo(media, 'x', { duration: 0.62, ease: 'power3.out' }) : null;
    const mediaY = media ? gsap.quickTo(media, 'y', { duration: 0.62, ease: 'power3.out' }) : null;
    const mediaRotate = media
      ? gsap.quickTo(media, 'rotationY', { duration: 0.62, ease: 'power3.out' })
      : null;

    const handlePointerMove = (event: PointerEvent) => {
      if (!mediaX || !mediaY || !mediaRotate) return;
      const rect = root.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      mediaX(x * 18);
      mediaY(y * 14);
      mediaRotate(x * 5);
    };

    const handlePointerLeave = () => {
      mediaX?.(0);
      mediaY?.(0);
      mediaRotate?.(0);
    };

    root.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', handlePointerLeave);
      ctx.revert();
    };
  }, []);

  return scopeRef;
}
