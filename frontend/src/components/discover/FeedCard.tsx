import { memo, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { formatCount, sanitizeInput } from '../../lib/utils';
import type { Post } from '../../types';
import { useAuthStore, useSocialStore } from '../../stores';
import { SportVisual, Tooltip } from '../ui';
import { getCustomCategoryName, getSportLabel } from '../../data/taxonomy';

interface FeedCardProps {
  post: Post;
  onLike: (id: number) => void;
  onSave: (id: number) => void;
  onAddFriend: (id: number) => void;
  onMeetRequest: (id: number) => void;
  onMessage: (id: number) => void;
}

const typeBadge: Record<string, { label: string; className: string }> = {
  meet: { label: '约练邀请', className: 'bg-lime text-white' },
  log: { label: '训练日记', className: 'bg-[#24130a] text-white' },
  help: { label: '其他求助', className: 'bg-[#ff8a1f] text-white' },
  coach: { label: '教练', className: 'bg-mint text-white' },
};

export const FeedCard = memo(function FeedCard({
  post,
  onAddFriend,
  onLike,
  onMeetRequest,
  onMessage,
  onSave,
}: FeedCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const navigate = useNavigate();
  const { getComments, addComment, likeComment, isLiked, isSaved, getLikeDelta } = useSocialStore();
  const { isLoggedIn, user, openLogin } = useAuthStore();
  const postComments = getComments(post.id);
  const liked = isLiked(post.id);
  const saved = isSaved(post.id);
  const likesCount = post.likes + getLikeDelta(post.id);
  const customCategory = getCustomCategoryName(post.tags);
  const sportLabel = customCategory || getSportLabel(post.sport);
  const visibleTags = post.tags
    .filter((tag) => !tag.startsWith('custom:') && !tag.startsWith('#custom:') && !tag.startsWith('subcategory:'))
    .slice(0, 8);
  const profilePath = `/user/${post.userId || post.id}`;

  const handleSubmitComment = useCallback(() => {
    const cleaned = sanitizeInput(commentText, 500);
    if (!cleaned) return;
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    addComment(post.id, cleaned, user?.name || '我');
    setCommentText('');
  }, [addComment, commentText, isLoggedIn, openLogin, post.id, user?.name]);

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#ead8c7] bg-white text-ink shadow-card transition hover:-translate-y-1 hover:border-lime/40">
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#fff0e2]"
        style={!post.images?.length && !post.videoUrl ? { background: post.colorBg } : undefined}
      >
        {post.videoUrl ? (
          <video
            src={post.videoUrl}
            className="h-full w-full object-cover"
            controls
            playsInline
            muted
            loop
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : post.images && post.images.length > 0 ? (
          <img
            src={post.images[0].url}
            alt="动态内容"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <SportVisual
            className="h-full w-full rounded-none"
            gender={post.gender}
            label={post.username}
            variant={post.sport}
          />
        )}
        <span
          className={clsx(
            'absolute left-3 top-3 rounded-md px-3 py-1 text-[10px] font-black tracking-wide',
            typeBadge[post.type]?.className,
          )}
        >
          {typeBadge[post.type]?.label ?? post.type}
        </span>
        {post.slots && (
          <span className="absolute right-3 top-3 rounded-md border border-lime/30 bg-white/90 px-3 py-1 text-[10px] font-black text-lime">
            余 {post.slots} 人
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white"
            style={{ background: post.color }}
            onClick={() => navigate(profilePath)}
          >
            {post.username[0]}
          </button>
          <div className="min-w-0 flex-1">
            <button
              className="truncate text-left text-sm font-black transition hover:text-lime"
              onClick={() => navigate(profilePath)}
            >
              {post.username} {post.cert ? <span className="text-lime">✓</span> : null}
            </button>
            <div className="mt-0.5 truncate text-[11px] font-bold text-[#8b6a54]">
              {post.city} · {post.dist} · {sportLabel} · {post.gender} {post.age}岁
            </div>
          </div>
          <button
            className="rounded-lg border border-[#ead8c7] px-3 py-2 text-xs font-black text-[#76543e] transition hover:border-lime/40 hover:text-lime"
            onClick={() => onMessage(post.id)}
          >
            私信
          </button>
        </div>

        {post.title && <h3 className="line-clamp-2 text-base font-black leading-snug">{post.title}</h3>}
        <p className="line-clamp-3 text-sm leading-7 text-[#76543e]">{post.text}</p>

        <div className="flex flex-wrap gap-2">
          {customCategory && (
            <button
              className="rounded-md bg-[#fff0e2] px-2 py-1 text-[11px] font-bold text-lime"
              onClick={() => navigate(`/topic/${encodeURIComponent(customCategory)}`)}
            >
              #{customCategory}
            </button>
          )}
          {visibleTags.map((tag) => (
            <button
              key={tag}
              className="rounded-md bg-[#fff0e2] px-2 py-1 text-[11px] font-bold text-lime"
              onClick={() => navigate(`/topic/${encodeURIComponent(tag.replace('#', ''))}`)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-[#ead8c7] pt-3 text-xs text-[#8b6a54]">
          <Tooltip content={`点赞 ${formatCount(likesCount)}`}>
            <button
              aria-label={`点赞 ${likesCount}`}
              className={clsx(
                'rounded-lg border px-3 py-2 font-black transition',
                liked ? 'border-red-300 bg-red-50 text-coral' : 'border-[#ead8c7] hover:border-lime/40 hover:text-lime',
              )}
              onClick={() => onLike(post.id)}
            >
              ♥ {formatCount(likesCount)}
            </button>
          </Tooltip>
          <button
            className="rounded-lg border border-[#ead8c7] px-3 py-2 font-black transition hover:border-lime/40 hover:text-lime"
            onClick={() => setShowComments((value) => !value)}
          >
            评论 {formatCount(post.comments)}
          </button>
          <span className="flex-1" />
          <button
            className={clsx(
              'rounded-lg border px-3 py-2 font-black transition',
              saved ? 'border-lime/40 bg-[#fff0e2] text-lime' : 'border-[#ead8c7] hover:border-lime/40 hover:text-lime',
            )}
            onClick={() => onSave(post.id)}
          >
            {saved ? '已收藏' : '收藏'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-lg border border-[#ead8c7] px-3 py-2 text-xs font-black text-[#76543e] transition hover:border-lime/40 hover:text-lime"
            onClick={() => onAddFriend(post.id)}
          >
            加好友
          </button>
          <button
            className="rounded-lg bg-lime px-3 py-2 text-xs font-black text-white transition hover:bg-brand2"
            onClick={() => (post.type === 'meet' ? onMeetRequest(post.id) : onMessage(post.id))}
          >
            {post.type === 'meet' ? '想约TA' : '打招呼'}
          </button>
        </div>

        {showComments && (
          <div className="space-y-3 border-t border-[#ead8c7] pt-3">
            <div className="text-xs font-black text-[#8b6a54]">评论 ({postComments.length})</div>
            {postComments.slice(0, 5).map((comment) => (
              <div key={comment.id} className="flex gap-2">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white"
                  style={{ background: comment.color }}
                >
                  {comment.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black">{comment.username}</div>
                  <p className="mt-0.5 text-xs text-[#76543e]">{comment.text}</p>
                </div>
                <button className="text-xs font-bold text-[#8b6a54]" onClick={() => likeComment(post.id, comment.id)}>
                  ♥ {comment.likes}
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="写评论..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                className="min-w-0 flex-1 rounded-lg border border-[#ead8c7] bg-[#fffaf6] px-3 py-2 text-xs outline-none focus:border-lime/50"
              />
              <button className="rounded-lg bg-lime px-3 py-2 text-xs font-black text-white" onClick={handleSubmitComment}>
                发送
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});
