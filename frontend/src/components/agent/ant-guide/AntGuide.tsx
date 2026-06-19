import { type CSSProperties, useEffect, useId, useMemo, useRef } from 'react';
import clsx from 'clsx';
import {
  ANT_GUIDE_ARIA_LABELS,
  ANT_GUIDE_COPY,
  ANT_GUIDE_GLOW_COLORS,
  ANT_GUIDE_GLOW_STRENGTH,
} from './AntGuide.constants';
import { preloadAntGuideStateAssets } from './AntGuide.assets';
import { AntGuideAssetAvatar } from './AntGuideAssetAvatar';
import { useAntGuideMotion } from './AntGuideMotion';
import type { AntGuideProps } from './AntGuide.types';
import './ant-guide.css';

export function AntGuide({
  state,
  copy,
  size = 'md',
  target = null,
  interactive = true,
  reducedMotion,
  className,
  ariaLabel,
  onStateAnimationEnd,
}: AntGuideProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copyId = useId();
  const motion = useAntGuideMotion({
    rootRef,
    target,
    interactive,
    reducedMotion,
  });
  const guideCopy = useMemo(
    () => ({
      ...ANT_GUIDE_COPY[state],
      ...copy,
    }),
    [copy, state],
  );
  const label = ariaLabel ?? ANT_GUIDE_ARIA_LABELS[state];
  const style = {
    '--ant-glow-color': ANT_GUIDE_GLOW_COLORS[state],
    '--ant-glow-strength': ANT_GUIDE_GLOW_STRENGTH[state],
  } as CSSProperties;

  useEffect(() => {
    if (!onStateAnimationEnd) return undefined;
    const duration = motion.shouldReduceMotion ? 0 : 700;
    const timeout = window.setTimeout(() => onStateAnimationEnd(state), duration);
    return () => window.clearTimeout(timeout);
  }, [motion.shouldReduceMotion, onStateAnimationEnd, state]);

  useEffect(() => preloadAntGuideStateAssets(state), [state]);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${label}${guideCopy.title ? `：${guideCopy.title}` : ''}`}
      aria-describedby={copyId}
      className={clsx(
        'ant-guide',
        `ant-guide--${state}`,
        `ant-guide--${size}`,
        motion.canTrack && 'ant-guide--interactive',
        motion.shouldReduceMotion && 'ant-guide--reduced-motion',
        className,
      )}
      data-state={state}
      data-size={size}
      data-target={target ?? 'none'}
      data-target-priority={motion.targetPriority}
      style={style}
    >
      <div className="ant-guide__avatar" role="img" aria-label={label}>
        <AntGuideAssetAvatar
          state={state}
          size={size}
          reducedMotion={motion.shouldReduceMotion}
        />
      </div>
      <div id={copyId} className="ant-guide__copy" role="status" aria-live="polite">
        {guideCopy.title ? <strong>{guideCopy.title}</strong> : null}
        {guideCopy.description ? <span>{guideCopy.description}</span> : null}
      </div>
    </div>
  );
}
