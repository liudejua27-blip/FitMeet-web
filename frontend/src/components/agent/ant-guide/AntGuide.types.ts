import type React from 'react';

export type AntGuideState =
  | 'idle'
  | 'thinking'
  | 'discovering'
  | 'recommending'
  | 'reminding'
  | 'confirming'
  | 'success'
  | 'error';

export type AntGuideTarget =
  | 'input'
  | 'recommendation'
  | 'confirmButton'
  | 'safetyCard'
  | null;

export interface AntGuideCopy {
  title?: string;
  description?: string;
}

export interface AntGuideProps {
  state: AntGuideState;
  copy?: AntGuideCopy;
  size?: 'sm' | 'md' | 'lg';
  target?: AntGuideTarget;
  interactive?: boolean;
  reducedMotion?: boolean;
  className?: string;
  ariaLabel?: string;
  onStateAnimationEnd?: (state: AntGuideState) => void;
}

export interface AntGuideMotionOptions {
  rootRef: React.RefObject<HTMLElement | null>;
  target: AntGuideTarget;
  interactive: boolean;
  reducedMotion?: boolean;
}
