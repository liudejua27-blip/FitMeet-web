import { memo, useCallback } from 'react';
import type { Coach } from '../../types';
import { Button, SportVisual } from '../ui';
import { StarRating } from './StarRating';

interface CoachCardProps {
  coach: Coach;
  onBook: (name: string) => void;
  onView?: (coach: Coach) => void;
}

export const CoachCard = memo(function CoachCard({ coach, onBook, onView }: CoachCardProps) {
  const handleBook = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onBook(coach.name);
    },
    [coach.name, onBook],
  );
  const handleView = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onView?.(coach);
    },
    [coach, onView],
  );
  const successRate = coach.sessions > 0 ? Math.round((coach.reviews / coach.sessions) * 100) : 98;

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#ead8c7] bg-white text-ink shadow-card transition hover:-translate-y-1 hover:border-lime/40">
      <div className="relative h-36 bg-[#24130a] text-white">
        <SportVisual className="h-full w-full rounded-none" label={coach.name} variant={coach.specialtyCode} />
        <div
          className="absolute -bottom-7 left-5 flex h-16 w-16 items-center justify-center rounded-xl border-4 border-white text-xl font-black text-white shadow-card"
          style={{ backgroundColor: coach.color }}
        >
          {coach.name[0]}
        </div>
        {coach.cert && (
          <div className="absolute bottom-3 right-3 rounded-lg bg-lime px-3 py-1 text-xs font-black text-white">
            视频认证
          </div>
        )}
      </div>

      <div className="p-5 pt-10">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-black">{coach.name}</h3>
            <p className="mt-1 text-xs font-bold text-[#8b6a54]">
              {coach.specialty} · {coach.experience}
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-black text-lime">免费</div>
            <div className="text-[10px] font-bold text-[#8b6a54]">预约交流</div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {coach.tags.slice(0, 4).map((tag, index) => (
            <span
              key={tag}
              className={index === 0 ? 'rounded-md bg-[#fff0e2] px-2 py-1 text-xs font-black text-lime' : 'rounded-md bg-[#f8eee4] px-2 py-1 text-xs font-bold text-[#76543e]'}
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <StarRating rating={coach.rating} showValue />
          <span className="text-xs font-bold text-[#8b6a54]">({coach.reviews} 条评价)</span>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2">
          <Metric value={coach.students.toString()} label="学员" />
          <Metric value={coach.followers.toString()} label="粉丝" />
          <Metric value={`${successRate}%`} label="好评" hot />
        </div>

        <div className="flex items-center gap-2 border-t border-[#ead8c7] pt-4">
          <Button className="flex-1" onClick={handleBook}>
            立即预约
          </Button>
          <button
            className="rounded-lg border border-[#ead8c7] px-4 py-2.5 text-sm font-black text-[#76543e] transition hover:border-lime/40 hover:text-lime"
            type="button"
            onClick={handleView}
          >
            详情
          </button>
        </div>
      </div>
    </article>
  );
});

const Metric = memo(function Metric({ hot = false, label, value }: { hot?: boolean; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#fff8f0] p-3 text-center">
      <div className={hot ? 'font-display text-base font-black text-lime' : 'font-display text-base font-black'}>{value}</div>
      <div className="mt-1 text-[10px] font-bold text-[#8b6a54]">{label}</div>
    </div>
  );
});
