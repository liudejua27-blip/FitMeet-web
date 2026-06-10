import { useEffect, useMemo, useRef, useState } from 'react';
import type { AntGuideMotionOptions, AntGuideTarget } from './AntGuide.types';

type Point = { x: number; y: number };

const TARGET_POINTS: Record<Exclude<AntGuideTarget, null>, Point> = {
  input: { x: 0.18, y: 0.76 },
  recommendation: { x: 0.86, y: 0.46 },
  confirmButton: { x: 0.9, y: 0.62 },
  safetyCard: { x: 0.82, y: 0.28 },
};

const TARGET_PRIORITY: Record<Exclude<AntGuideTarget, null>, number> = {
  input: 1,
  recommendation: 2,
  safetyCard: 3,
  confirmButton: 4,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readMedia(query: string) {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useAntGuideMotion({
  rootRef,
  target,
  interactive,
  reducedMotion,
}: AntGuideMotionOptions) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(() =>
    readMedia('(prefers-reduced-motion: reduce)'),
  );
  const [coarsePointer, setCoarsePointer] = useState(() =>
    readMedia('(hover: none), (pointer: coarse)'),
  );
  const [smallViewport, setSmallViewport] = useState(() => readMedia('(max-width: 640px)'));
  const pointerRef = useRef<Point | null>(null);
  const currentRef = useRef<Point>({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    const viewportQuery = window.matchMedia('(max-width: 640px)');
    const handleMotion = () => setSystemReducedMotion(motionQuery.matches);
    const handlePointer = () => setCoarsePointer(pointerQuery.matches);
    const handleViewport = () => setSmallViewport(viewportQuery.matches);
    motionQuery.addEventListener('change', handleMotion);
    pointerQuery.addEventListener('change', handlePointer);
    viewportQuery.addEventListener('change', handleViewport);
    return () => {
      motionQuery.removeEventListener('change', handleMotion);
      pointerQuery.removeEventListener('change', handlePointer);
      viewportQuery.removeEventListener('change', handleViewport);
    };
  }, []);

  const shouldReduceMotion = reducedMotion ?? systemReducedMotion;
  const canTrack = interactive && !shouldReduceMotion && !coarsePointer && !smallViewport;
  const targetPoint = useMemo(() => (target ? TARGET_POINTS[target] : null), [target]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !canTrack) {
      root?.style.setProperty('--ant-eye-x', '0px');
      root?.style.setProperty('--ant-eye-y', '0px');
      root?.style.setProperty('--ant-antenna-rotate', '0deg');
      root?.style.setProperty('--ant-body-x', '0px');
      root?.style.setProperty('--ant-body-y', '0px');
      return undefined;
    }

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      frameRef.current = null;
      const rect = root.getBoundingClientRect();
      const desired = targetPoint
        ? {
            x: rect.left + rect.width * targetPoint.x,
            y: rect.top + rect.height * targetPoint.y,
          }
        : pointerRef.current;
      if (!desired || rect.width <= 0 || rect.height <= 0) return;

      const center = {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.48,
      };
      const normalized = {
        x: clamp((desired.x - center.x) / Math.max(1, rect.width * 0.5), -1, 1),
        y: clamp((desired.y - center.y) / Math.max(1, rect.height * 0.5), -1, 1),
      };

      currentRef.current = {
        x: currentRef.current.x + (normalized.x - currentRef.current.x) * 0.14,
        y: currentRef.current.y + (normalized.y - currentRef.current.y) * 0.14,
      };

      root.style.setProperty('--ant-eye-x', `${(currentRef.current.x * 4).toFixed(2)}px`);
      root.style.setProperty('--ant-eye-y', `${(currentRef.current.y * 3).toFixed(2)}px`);
      root.style.setProperty(
        '--ant-antenna-rotate',
        `${(currentRef.current.x * 6).toFixed(2)}deg`,
      );
      root.style.setProperty('--ant-body-x', `${(currentRef.current.x * 3).toFixed(2)}px`);
      root.style.setProperty('--ant-body-y', `${(currentRef.current.y * 2).toFixed(2)}px`);

      const hasMoreMotion =
        Math.abs(currentRef.current.x - normalized.x) > 0.01 ||
        Math.abs(currentRef.current.y - normalized.y) > 0.01;
      if (hasMoreMotion) {
        frameRef.current = window.requestAnimationFrame(tick);
      }
    };

    if (!targetPoint) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
    }
    if (targetPoint && frameRef.current === null) {
      frameRef.current = window.requestAnimationFrame(tick);
    }
    return () => {
      if (!targetPoint) {
        window.removeEventListener('pointermove', onPointerMove);
      }
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [canTrack, rootRef, targetPoint]);

  return {
    shouldReduceMotion,
    canTrack,
    targetPriority: target ? TARGET_PRIORITY[target] : 0,
  };
}
