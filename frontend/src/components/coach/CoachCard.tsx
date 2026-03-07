import { memo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { Button, StatBox } from '../ui';
import { StarRating } from './StarRating';
import type { Coach } from '../../data/mockData';

interface CoachCardProps {
  coach: Coach;
  onBook: (name: string) => void;
}

export const CoachCard = memo(function CoachCard({ coach, onBook }: CoachCardProps) {
  const handleBook = useCallback(() => onBook(coach.name), [onBook, coach.name]);

  const successRate = Math.round(coach.reviews / coach.sessions * 100);

  return (
    <article className="bg-surface border border-border rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-borderStrong hover:shadow-card">
      {/* Cover */}
      <div
        className="h-24 relative flex items-center justify-center"
        style={{ background: coach.coverBg }}
      >
        <span className="text-4xl">{coach.cover}</span>

        {/* Avatar */}
        <div
          className="absolute -bottom-5 left-4 w-14 h-14 rounded-full flex items-center justify-center text-lg font-display font-bold text-[#09090A] border-4 border-surface"
          style={{ backgroundColor: coach.color }}
        >
          {coach.name[0]}
        </div>

        {/* Verified Badge */}
        {coach.cert && (
          <div
            className="absolute -bottom-2 left-14 w-5 h-5 bg-lime rounded-full flex items-center justify-center text-[10px] text-[#09090A] font-bold"
            title="视频认证"
          >
            ✓
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 pt-8">
        {/* Name */}
        <h3 className="font-display font-bold text-base mb-1">{coach.name}</h3>

        {/* Specialty */}
        <div className="text-xs text-textMuted mb-3">
          <span>{coach.specialty}</span>
          <span className="text-textSofter"> · {coach.experience}</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {coach.tags.map((tag, i) => (
            <span
              key={i}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-mono',
                i === 0
                  ? 'bg-limeDim border border-lime/25 text-lime'
                  : 'bg-surfaceMuted border border-border text-textMuted'
              )}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-3.5">
          <StarRating rating={coach.rating} showValue />
          <span className="text-xs text-textMuted">({coach.reviews}条评价)</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatBox value={coach.students.toString()} label="学员数" />
          <StatBox value={coach.followers.toString()} label="粉丝" />
          <StatBox value={`${successRate}%`} label="好评率" highlight />
        </div>

        {/* Portfolio */}
        <div className="mb-4">
          <div className="font-mono text-[10px] text-textMuted uppercase tracking-wider mb-2">
            作品集
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="w-10 h-10 rounded-lg bg-surfaceMuted border border-border flex items-center justify-center text-[10px] text-textMuted"
              >
                作品
              </div>
            ))}
          </div>
        </div>

        {/* Price & CTA */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div>
            <div className="font-display font-extrabold text-xl text-lime">
              ¥{coach.price}
            </div>
            <div className="text-[10px] text-textMuted">{coach.unit}</div>
          </div>
          <Button variant="primary" size="md" onClick={handleBook}>
            立即预约
          </Button>
        </div>
      </div>
    </article>
  );
});


