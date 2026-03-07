import { memo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button, Badge, StatBox } from '../ui';
import { StarRating } from './StarRating';
import type { Coach, Review } from '../../data/mockData';
import { COACH_REVIEWS } from '../../data/mockData';
import { useAuthStore, useMessageStore } from '../../stores';
import { useModalA11y } from '../../hooks/useModalA11y';

interface CoachDetailProps {
  coach: Coach | null;
  onBook: (name: string) => void;
  onClose: () => void;
}

export const CoachDetail = memo(function CoachDetail({ coach, onClose, onBook }: CoachDetailProps) {
  const [activeTab, setActiveTab] = useState<'about' | 'reviews' | 'works'>('about');
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();
  const { startChat } = useMessageStore();
  const { containerRef, handleBackdropClick } = useModalA11y<HTMLDivElement>({ open: !!coach, onClose });

  const handleMessageCoach = useCallback(() => {
    if (!coach) return;
    if (!isLoggedIn) { openLogin(); return; }
    if (coach.userId) {
      startChat(coach.userId, coach.name, coach.name[0], coach.color);
      onClose();
      navigate('/messages');
    }
  }, [coach, isLoggedIn, openLogin, startChat, onClose, navigate]);

  if (!coach) return null;

  const successRate = Math.round(coach.reviews / coach.sessions * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick}>
      <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="教练详情" className="bg-surface border border-border rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto outline-none">
        {/* Cover */}
        <div
          className="h-36 relative flex items-center justify-center rounded-t-2xl"
          style={{ background: coach.coverBg }}
        >
          <span className="text-6xl">{coach.cover}</span>
          <button
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition cursor-pointer"
            onClick={onClose}
          >
            ✕
          </button>
          {/* Avatar */}
          <div
            className="absolute -bottom-8 left-6 w-20 h-20 rounded-full flex items-center justify-center text-2xl font-display font-bold text-[#09090A] border-4 border-surface"
            style={{ backgroundColor: coach.color }}
          >
            {coach.name[0]}
          </div>
          {coach.cert && (
            <div className="absolute -bottom-4 left-20 w-6 h-6 bg-lime rounded-full flex items-center justify-center text-sm text-[#09090A] font-bold">
              ✓
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-6 pt-12">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-display font-extrabold text-2xl mb-1">{coach.name}</h2>
              <div className="text-sm text-textMuted">
                {coach.specialty} · {coach.experience}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <StarRating rating={coach.rating} showValue />
                <span className="text-xs text-textMuted">({coach.reviews}条评价)</span>
                {coach.cert && <Badge variant="lime" size="sm">视频认证</Badge>}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-extrabold text-3xl text-lime">¥{coach.price}</div>
              <div className="text-xs text-textMuted">{coach.unit}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatBox value={coach.students.toString()} label="学员" size="md" />
            <StatBox value={coach.followers.toString()} label="粉丝" size="md" />
            <StatBox value={`${successRate}%`} label="好评率" highlight size="md" />
            <StatBox value={coach.sessions.toString()} label="课程" size="md" />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {coach.tags.map((tag, i) => (
              <span
                key={i}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-mono',
                  i === 0
                    ? 'bg-limeDim border border-lime/25 text-lime'
                    : 'bg-surfaceMuted border border-border text-textMuted'
                )}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-border">
            {(['about', 'reviews', 'works'] as const).map(tab => (
              <button
                key={tab}
                className={cn(
                  'px-4 py-2.5 text-sm font-display font-semibold transition cursor-pointer border-b-2',
                  activeTab === tab
                    ? 'text-lime border-lime'
                    : 'text-textMuted border-transparent hover:text-white'
                )}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'about' ? '简介' : tab === 'reviews' ? '评价' : '作品集'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'about' && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-textMuted">{coach.desc}</p>

              {/* Certifications */}
              <div>
                <h4 className="font-mono text-[10px] text-textMuted uppercase tracking-wider mb-2">认证信息</h4>
                <div className="space-y-2">
                  {['NSCA-CSCS 认证', '国家级运动员等级', '运动营养师资格'].map((cert, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 bg-surfaceMuted rounded-lg">
                      <span className="text-lime text-sm">✓</span>
                      <span className="text-xs text-textMuted">{cert}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Income Stats (coach view only — visible only to the coach themselves) */}
              {isLoggedIn && useAuthStore.getState().user?.name === coach.name && <div className="p-4 bg-lime/5 border border-lime/15 rounded-xl">
                <h4 className="font-mono text-[10px] text-lime uppercase tracking-wider mb-3">收入概览</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className="font-display font-bold text-lg text-lime">¥{(coach.sessions * coach.price * 0.3).toLocaleString()}</div>
                    <div className="text-[10px] text-textMuted">总收入</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display font-bold text-lg text-white">{Math.floor(coach.sessions * 0.7)}</div>
                    <div className="text-[10px] text-textMuted">本月课程</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display font-bold text-lg text-white">¥{(coach.price * 25).toLocaleString()}</div>
                    <div className="text-[10px] text-textMuted">本月收入</div>
                  </div>
                </div>
              </div>}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-4">
              {COACH_REVIEWS.map(review => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}

          {activeTab === 'works' && (
            <div className="grid grid-cols-3 gap-3">
              {coach.works.map((work, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-xl bg-surfaceMuted border border-border flex items-center justify-center text-sm text-textMuted hover:border-borderStrong transition cursor-pointer"
                >
                  📸 {work}
                </div>
              ))}
              {[1, 2, 3].map(i => (
                <div
                  key={`placeholder-${i}`}
                  className="aspect-square rounded-xl bg-surfaceMuted border border-border flex items-center justify-center text-sm text-textSofter"
                >
                  +
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="flex gap-3 mt-6 pt-4 border-t border-border">
            <Button variant="outline" size="lg" onClick={handleMessageCoach}>
              💬 私信
            </Button>
            <Button variant="primary" size="lg" className="flex-1" onClick={() => onBook(coach.name)}>
              立即预约 →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});



const ReviewCard = memo(function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="p-4 bg-surfaceMuted rounded-xl border border-border">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[#09090A]"
          style={{ background: review.color }}
        >
          {review.avatar}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{review.username}</div>
          <div className="text-[10px] text-textSofter">{review.date}</div>
        </div>
        <StarRating rating={review.rating} />
      </div>
      <p className="text-xs text-textMuted leading-relaxed">{review.text}</p>
      {review.tags && (
        <div className="flex gap-1.5 mt-2">
          {review.tags.map((tag, i) => (
            <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-lime/10 text-lime border border-lime/20">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});
