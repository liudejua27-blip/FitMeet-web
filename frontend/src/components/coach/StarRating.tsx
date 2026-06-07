import { memo } from 'react';
import { cn } from '../../lib/utils';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  showValue?: boolean;
  className?: string;
}

export const StarRating = memo(function StarRating({
  rating,
  maxStars = 5,
  showValue = false,
  className,
}: StarRatingProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="flex">
        {Array.from({ length: maxStars }, (_, i) => {
          const starIndex = i + 1;
          const isFull = starIndex <= Math.floor(rating);
          const isHalf = !isFull && starIndex - rating < 1;
          
          return (
            <span
              key={i}
              className={cn(
                'text-sm',
                isFull && 'text-lime',
                isHalf && 'text-lime/50',
                !isFull && !isHalf && 'text-textSofter'
              )}
            >
              ★
            </span>
          );
        })}
      </div>
      {showValue && (
        <span className="text-sm font-bold text-lime">{rating.toFixed(1)}</span>
      )}
    </div>
  );
});
