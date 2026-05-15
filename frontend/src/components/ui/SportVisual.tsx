import { memo } from 'react';
import { cn } from '../../lib/utils';

type SportVisualVariant =
  | 'gym'
  | 'run'
  | 'yoga'
  | 'outdoor'
  | 'swim'
  | 'martial'
  | 'ball'
  | 'coach'
  | 'default';

interface SportVisualProps {
  variant?: string;
  gender?: string;
  imageSrc?: string;
  name?: string;
  label?: string;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}

const variantAliases: Record<string, SportVisualVariant> = {
  badminton: 'ball',
  basketball: 'ball',
  camping: 'outdoor',
  climbing: 'outdoor',
  cycling: 'run',
  dance: 'yoga',
  diving: 'outdoor',
  fat: 'gym',
  hiking: 'outdoor',
  mountaineering: 'outdoor',
  muscle: 'gym',
  other: 'default',
  pickleball: 'ball',
  rehab: 'coach',
  recovery: 'coach',
  ski: 'outdoor',
  skiing: 'outdoor',
  trailrunning: 'outdoor',
};

const normalizeVariant = (variant?: string): SportVisualVariant => {
  const key = (variant || '').replace(/[^a-z]/gi, '').toLowerCase();
  if (!key) return 'default';
  if (variantAliases[key]) return variantAliases[key];
  if (['gym', 'run', 'yoga', 'outdoor', 'swim', 'martial', 'ball', 'coach'].includes(key)) {
    return key as SportVisualVariant;
  }
  return 'default';
};

export const SportVisual = memo(function SportVisual({
  className,
  compact = false,
  gender,
  imageSrc,
  label,
  name,
  showLabel = true,
  variant,
}: SportVisualProps) {
  const visualVariant = normalizeVariant(variant);
  const isFemale = gender === '♀' || visualVariant === 'yoga';
  const displayLabel = label || name || sportLabels[visualVariant];

  return (
    <div
      aria-hidden="true"
      className={cn(
        'sport-visual',
        `sport-visual--${visualVariant}`,
        compact && 'sport-visual--compact',
        imageSrc && 'sport-visual--photo',
        className,
      )}
    >
      {imageSrc && <img alt="" className="sport-visual__photo" decoding="async" loading="lazy" src={imageSrc} />}
      {imageSrc && <span className="sport-visual__photo-vignette" />}
      <div className="sport-visual__grid" />
      <div className="sport-visual__flare" />
      {compact && !imageSrc && (
        <div className={cn('sport-visual__portrait', isFemale && 'sport-visual__portrait--soft')}>
          <span className="sport-visual__photo-halo" />
          <span className="sport-visual__portrait-neck" />
          <span className="sport-visual__portrait-face" />
          <span className="sport-visual__portrait-hair" />
          <span className="sport-visual__portrait-eye sport-visual__portrait-eye--left" />
          <span className="sport-visual__portrait-eye sport-visual__portrait-eye--right" />
          <span className="sport-visual__portrait-mouth" />
          <span className="sport-visual__portrait-shoulder sport-visual__portrait-shoulder--left" />
          <span className="sport-visual__portrait-shoulder sport-visual__portrait-shoulder--right" />
          <span className="sport-visual__portrait-top" />
        </div>
      )}
      <div className="sport-visual__track">
        <span />
        <span />
        <span />
      </div>
      <div className={cn('sport-visual__figure', compact && 'sport-visual__figure--hidden', isFemale && 'sport-visual__figure--soft')}>
        <span className="sport-visual__head" />
        <span className="sport-visual__torso" />
        <span className="sport-visual__arm sport-visual__arm--left" />
        <span className="sport-visual__arm sport-visual__arm--right" />
        <span className="sport-visual__leg sport-visual__leg--left" />
        <span className="sport-visual__leg sport-visual__leg--right" />
      </div>
      {showLabel && (
        <div className="sport-visual__label">
          <span>{displayLabel}</span>
        </div>
      )}
    </div>
  );
});

const sportLabels: Record<SportVisualVariant, string> = {
  ball: '球类',
  coach: '教练',
  default: 'FitMeet',
  gym: '力量',
  martial: '搏击',
  outdoor: '户外',
  run: '跑步',
  swim: '游泳',
  yoga: '瑜伽',
};
