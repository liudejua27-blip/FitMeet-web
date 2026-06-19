import idlePng from '@/assets/agent/ant-guide/ant-guide-idle.png';
import thinkingPng from '@/assets/agent/ant-guide/ant-guide-thinking.png';
import discoveringPng from '@/assets/agent/ant-guide/ant-guide-discovering.png';
import recommendingPng from '@/assets/agent/ant-guide/ant-guide-recommending.png';
import remindingPng from '@/assets/agent/ant-guide/ant-guide-reminding.png';
import confirmingPng from '@/assets/agent/ant-guide/ant-guide-confirming.png';
import successPng from '@/assets/agent/ant-guide/ant-guide-success.png';
import errorPng from '@/assets/agent/ant-guide/ant-guide-error.png';
import idleWebp from '@/assets/agent/ant-guide/webp/ant-guide-idle.webp';
import thinkingWebp from '@/assets/agent/ant-guide/webp/ant-guide-thinking.webp';
import discoveringWebp from '@/assets/agent/ant-guide/webp/ant-guide-discovering.webp';
import recommendingWebp from '@/assets/agent/ant-guide/webp/ant-guide-recommending.webp';
import remindingWebp from '@/assets/agent/ant-guide/webp/ant-guide-reminding.webp';
import confirmingWebp from '@/assets/agent/ant-guide/webp/ant-guide-confirming.webp';
import successWebp from '@/assets/agent/ant-guide/webp/ant-guide-success.webp';
import errorWebp from '@/assets/agent/ant-guide/webp/ant-guide-error.webp';
import type { AntGuideState } from './AntGuide.types';

export interface AntGuideStateAsset {
  webp: string;
  png: string;
  width: number;
  height: number;
}

export const ANT_GUIDE_STATES: AntGuideState[] = [
  'idle',
  'thinking',
  'discovering',
  'recommending',
  'reminding',
  'confirming',
  'success',
  'error',
];

export const ANT_GUIDE_STATE_ASSETS: Record<AntGuideState, AntGuideStateAsset> = {
  idle: { webp: idleWebp, png: idlePng, width: 354, height: 368 },
  thinking: { webp: thinkingWebp, png: thinkingPng, width: 379, height: 368 },
  discovering: { webp: discoveringWebp, png: discoveringPng, width: 378, height: 368 },
  recommending: { webp: recommendingWebp, png: recommendingPng, width: 385, height: 368 },
  reminding: { webp: remindingWebp, png: remindingPng, width: 354, height: 350 },
  confirming: { webp: confirmingWebp, png: confirmingPng, width: 379, height: 350 },
  success: { webp: successWebp, png: successPng, width: 378, height: 350 },
  error: { webp: errorWebp, png: errorPng, width: 385, height: 350 },
};

export const ANT_GUIDE_ASSET_SOURCES: Record<AntGuideState, string> =
  ANT_GUIDE_STATES.reduce(
    (sources, state) => ({
      ...sources,
      [state]: ANT_GUIDE_STATE_ASSETS[state].webp,
    }),
    {} as Record<AntGuideState, string>,
  );

const preloadedAssetSources = new Set<string>();

function preloadImage(src: string) {
  if (preloadedAssetSources.has(src)) return;
  preloadedAssetSources.add(src);
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
}

export function preloadAntGuideStateAssets(currentState: AntGuideState) {
  if (typeof window === 'undefined') return undefined;

  preloadImage(ANT_GUIDE_STATE_ASSETS[currentState].webp);

  const preloadRemaining = () => {
    for (const state of ANT_GUIDE_STATES) {
      if (state !== currentState) {
        preloadImage(ANT_GUIDE_STATE_ASSETS[state].webp);
      }
    }
  };

  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(preloadRemaining, { timeout: 1400 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = globalThis.setTimeout(preloadRemaining, 500);
  return () => globalThis.clearTimeout(timeoutId);
}
