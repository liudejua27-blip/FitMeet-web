import { useEffect, useRef } from 'react';

const promoHotspots = [
  { id: 'fitness', label: '一起健身' },
  { id: 'match', label: '匹配成功' },
  { id: 'coffee', label: '咖啡时光' },
  { id: 'citywalk', label: 'Citywalk' },
];

export function SocialWorldHeroVisual() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const pointerQuery = window.matchMedia('(pointer: fine) and (min-width: 769px)');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const interactionSurface = root.closest<HTMLElement>('.fm-enterprise-hero-system') ?? root;
    let animationFrame = 0;
    let latestPointer: PointerEvent | null = null;

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const resetMotion = () => {
      root.style.setProperty('--look-x', '-5px');
      root.style.setProperty('--look-y', '-1px');
      root.style.setProperty('--ant-x', '0px');
      root.style.setProperty('--ant-y', '0px');
      root.style.setProperty('--ant-rotate', '0deg');
      root.style.setProperty('--pointer-x', '58%');
      root.style.setProperty('--pointer-y', '42%');
      interactionSurface.style.setProperty('--hero-bg-x', '0px');
      interactionSurface.style.setProperty('--hero-bg-y', '0px');
      root.style.setProperty('--antenna-scale', '1');
      root.dataset.activeCard = '';
      root.dataset.cardNear = 'false';
    };

    const updateVisual = () => {
      animationFrame = 0;
      const pointer = latestPointer;
      if (!pointer || !pointerQuery.matches || reducedMotionQuery.matches) return;

      const rect = interactionSurface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const localX = pointer.clientX - rect.left;
      const localY = pointer.clientY - rect.top;
      const normalizedX = clamp(localX / rect.width, 0, 1);
      const normalizedY = clamp(localY / rect.height, 0, 1);
      const centeredX = normalizedX - 0.5;
      const centeredY = normalizedY - 0.5;

      root.style.setProperty('--pointer-x', `${(normalizedX * 100).toFixed(2)}%`);
      root.style.setProperty('--pointer-y', `${(normalizedY * 100).toFixed(2)}%`);
      interactionSurface.style.setProperty('--hero-bg-x', `${(-centeredX * 7).toFixed(2)}px`);
      interactionSurface.style.setProperty('--hero-bg-y', `${(-centeredY * 4).toFixed(2)}px`);

      const ant = root.querySelector<HTMLElement>('.fm-ant-agent-cutout');
      if (ant) {
        const antRect = ant.getBoundingClientRect();
        const antCenterX = antRect.left + antRect.width * 0.46;
        const antCenterY = antRect.top + antRect.height * 0.28;
        const lookX = clamp((pointer.clientX - antCenterX) / (rect.width * 0.32), -1, 1);
        const lookY = clamp((pointer.clientY - antCenterY) / (rect.height * 0.3), -1, 1);

        root.style.setProperty('--look-x', `${(lookX * 7).toFixed(2)}px`);
        root.style.setProperty('--look-y', `${(lookY * 5).toFixed(2)}px`);
        root.style.setProperty('--ant-x', `${(lookX * 12).toFixed(2)}px`);
        root.style.setProperty('--ant-y', `${(lookY * 7).toFixed(2)}px`);
        root.style.setProperty('--ant-rotate', `${(lookX * 3).toFixed(2)}deg`);
      }

      let activeCard = '';
      let cardDistance = Number.POSITIVE_INFINITY;
      root.querySelectorAll<HTMLElement>('[data-promo-hotspot]').forEach((hotspot) => {
        const hotspotRect = hotspot.getBoundingClientRect();
        const centerX = hotspotRect.left + hotspotRect.width / 2;
        const centerY = hotspotRect.top + hotspotRect.height / 2;
        const distance = Math.hypot(pointer.clientX - centerX, pointer.clientY - centerY);
        const isNear =
          pointer.clientX >= hotspotRect.left - 34 &&
          pointer.clientX <= hotspotRect.right + 34 &&
          pointer.clientY >= hotspotRect.top - 34 &&
          pointer.clientY <= hotspotRect.bottom + 34;

        if (isNear && distance < cardDistance) {
          cardDistance = distance;
          activeCard = hotspot.dataset.cardId ?? '';
        }
      });

      root.dataset.activeCard = activeCard;
      root.dataset.cardNear = activeCard ? 'true' : 'false';
      root.style.setProperty('--antenna-scale', activeCard ? '1.22' : '1');
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerQuery.matches || reducedMotionQuery.matches) return;
      latestPointer = event;
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateVisual);
    };

    const onPointerLeave = () => {
      latestPointer = null;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      resetMotion();
    };

    const onMediaChange = () => {
      if (!pointerQuery.matches || reducedMotionQuery.matches) resetMotion();
    };

    resetMotion();
    interactionSurface.addEventListener('pointermove', onPointerMove, { passive: true });
    interactionSurface.addEventListener('pointerleave', onPointerLeave);
    pointerQuery.addEventListener('change', onMediaChange);
    reducedMotionQuery.addEventListener('change', onMediaChange);

    return () => {
      interactionSurface.removeEventListener('pointermove', onPointerMove);
      interactionSurface.removeEventListener('pointerleave', onPointerLeave);
      pointerQuery.removeEventListener('change', onMediaChange);
      reducedMotionQuery.removeEventListener('change', onMediaChange);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="fm-social-hero-visual"
      data-card-near="false"
      data-active-card=""
      aria-label="Social World App 互动主视觉"
    >
      <div className="fm-ant-agent" aria-label="FitMeet 小蚁智能体">
        <span className="fm-ant-agent__aura" aria-hidden="true" />
        <img
          className="fm-ant-agent-cutout"
          src="/images/fitmeet/generated/fitmeet-ant-agent-cutout-transparent.png"
          alt="黑金色机械风 FitMeet 小蚁智能体"
          width="739"
          height="1131"
          decoding="async"
        />
        <span className="fm-ant-agent__spark fm-ant-agent__spark--left" aria-hidden="true" />
        <span className="fm-ant-agent__spark fm-ant-agent__spark--right" aria-hidden="true" />
      </div>

      <div className="fm-promo-hotspots" aria-hidden="true">
        {promoHotspots.map((hotspot) => (
          <span
            key={hotspot.id}
            className={`fm-promo-hotspot fm-promo-hotspot--${hotspot.id}`}
            data-promo-hotspot
            data-card-id={hotspot.id}
            title={hotspot.label}
          />
        ))}
      </div>
    </div>
  );
}
