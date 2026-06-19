import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import { ANT_GUIDE_STATE_ASSETS } from './AntGuide.assets';
import { AntGuideSvg } from './AntGuideSvg';
import type { AntGuideProps, AntGuideState } from './AntGuide.types';

export type AntGuideAssetMode = 'webp' | 'png' | 'svg';

interface AntGuideAssetDebugOptions {
  forceSvgFallback?: boolean;
  simulateWebpFailure?: boolean;
  simulatePngFailure?: boolean;
  onModeChange?: (mode: AntGuideAssetMode) => void;
}

const AntGuideAssetDebugContext = createContext<AntGuideAssetDebugOptions | null>(null);

export function AntGuideAssetDebugProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AntGuideAssetDebugOptions;
}) {
  return (
    <AntGuideAssetDebugContext.Provider value={value}>
      {children}
    </AntGuideAssetDebugContext.Provider>
  );
}

export interface AntGuideAssetAvatarProps {
  state: AntGuideState;
  size: NonNullable<AntGuideProps['size']>;
  reducedMotion?: boolean;
  className?: string;
}

export function AntGuideAssetAvatar({
  state,
  size,
  reducedMotion,
  className,
}: AntGuideAssetAvatarProps) {
  const debug = useContext(AntGuideAssetDebugContext);
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set());
  const asset = ANT_GUIDE_STATE_ASSETS[state];
  const webpFailed = debug?.simulateWebpFailure || failedSources.has(asset.webp);
  const pngFailed = debug?.simulatePngFailure || failedSources.has(asset.png);
  const mode = useMemo<AntGuideAssetMode>(() => {
    if (debug?.forceSvgFallback || pngFailed) return 'svg';
    return webpFailed ? 'png' : 'webp';
  }, [debug?.forceSvgFallback, pngFailed, webpFailed]);
  const src = mode === 'webp' ? asset.webp : mode === 'png' ? asset.png : null;

  useEffect(() => {
    debug?.onModeChange?.(mode);
  }, [debug, mode]);

  if (mode === 'svg' || !src) {
    return <AntGuideSvg state={state} />;
  }

  return (
    <img
      className={clsx('ant-guide__asset', className)}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      width={asset.width}
      height={asset.height}
      data-asset-mode={mode}
      data-state={state}
      data-size={size}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      onError={() => {
        setFailedSources((current) => new Set(current).add(src));
      }}
    />
  );
}
