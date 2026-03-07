import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCount, sanitizeInput } from '../../lib/utils';
import clsx from 'clsx';
import type { Post } from '../../data/mockData';
import { VIRTUAL_GIFTS } from '../../data/mockData';
import { useSocialStore } from '../../stores';
import { useAuthStore } from '../../stores';

interface FeedCardProps {
  post: Post;
  onLike: (id: number) => void;
  onSave: (id: number) => void;
  onAddFriend: (id: number) => void;
  onMeetRequest: (id: number) => void;
  onSendGift: (postId: number, giftId: string) => void;
  onMessage: (id: number) => void;
}

const typeBadge: Record<string, { label: string; className: string }> = {
  meet: { label: '约练邀请', className: 'bg-lime text-[#09090A]' },
  log: { label: '健身日记', className: 'bg-black/70 text-white border border-border' },
  coach: { label: '教练', className: 'bg-blue-500 text-white' },
};

export const FeedCard = memo(function FeedCard({ post, onLike, onSave, onAddFriend, onMeetRequest, onSendGift, onMessage }: FeedCardProps) {
  const [showGifts, setShowGifts] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const navigate = useNavigate();
  const { getComments, addComment, likeComment, isLiked, isSaved, getLikeDelta } = useSocialStore();
  const { isLoggedIn, user, openLogin } = useAuthStore();
  const postComments = getComments(post.id);

  // Read liked/saved from global store instead of post props
  const liked = isLiked(post.id);
  const saved = isSaved(post.id);
  const likesCount = post.likes + getLikeDelta(post.id);

  const handleLike = useCallback(() => onLike(post.id), [onLike, post.id]);
  const handleSave = useCallback(() => onSave(post.id), [onSave, post.id]);
  const handleAddFriend = useCallback(() => onAddFriend(post.id), [onAddFriend, post.id]);
  const handleMeetRequest = useCallback(() => onMeetRequest(post.id), [onMeetRequest, post.id]);
  const handleMessage = useCallback(() => onMessage(post.id), [onMessage, post.id]);

  const handleSubmitComment = useCallback(() => {
    const cleaned = sanitizeInput(commentText, 500);
    if (!cleaned) return;
    if (!isLoggedIn) { openLogin(); return; }
    addComment(post.id, cleaned, user?.name || '我');
    setCommentText('');
  }, [commentText, isLoggedIn, openLogin, addComment, post.id, user]);

  const handleTagClick = useCallback((tag: string) => {
    navigate(`/topic/${encodeURIComponent(tag.replace('#', ''))}`);
  }, [navigate]);

  const handleUsernameClick = useCallback(() => {
    navigate(`/user/${post.id}`);
  }, [navigate, post.id]);

  return (
    <article className="group rounded-xl border border-border bg-surface transition hover:-translate-y-1 hover:border-borderStrong hover:shadow-card">
      {/* Image area */}
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-xl bg-surfaceMuted"
        style={(!post.images?.length && !post.videoUrl) ? { background: post.colorBg } : {}}
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
            alt="post content"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="text-5xl">{post.emoji}</span>
        )}
        <span
          className={clsx(
            'absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-mono tracking-[0.15em] uppercase z-10',
            typeBadge[post.type]?.className
          )}
        >
          {typeBadge[post.type]?.label ?? post.type}
        </span>
        {post.slots && (
          <span className="absolute right-3 top-3 rounded-full border border-lime/50 bg-limeDim px-3 py-1 text-[10px] font-mono tracking-wide text-lime">
            还剩 {post.slots} 人
          </span>
        )}
        {/* Single cert badge */}
        {post.cert && (
          <span className="absolute left-3 bottom-3 text-xs">
            ⭐ 已认证
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        {/* Title */}
        {post.title && (
          <h3 className="font-bold text-base line-clamp-2 text-white mb-1 leading-snug">
            {post.title}
          </h3>
        )}

        {/* User info */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-display font-bold text-[#09090A]"
            style={{ background: post.color }}
          >
            {post.username[0]}
          </div>
          <div className="flex-1 leading-tight">
            <div className="flex items-center gap-1 text-sm font-semibold text-white cursor-pointer hover:text-lime transition" onClick={handleUsernameClick}>
              {post.username}
              {post.cert && <span className="text-xs text-lime">✓</span>}
            </div>
            <div className="text-[11px] text-textSofter">📍 {post.city} · {post.dist} · {post.gender} {post.age}岁</div>
          </div>
          <button
            className="text-lg hover:scale-110 transition"
            onClick={handleMessage}
            title="私信"
          >
            💬
          </button>
        </div>

        {/* Content */}
        <p className="text-sm leading-7 text-textMuted">{post.text}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span key={tag} className="text-[11px] font-mono text-lime cursor-pointer hover:underline" onClick={() => handleTagClick(tag)}>
              {tag}
            </span>
          ))}
        </div>

        {/* Interaction bar */}
        <div className="flex items-center gap-3 border-t border-border pt-3 text-xs text-textMuted">
          <button
            aria-label={`点赞 ${likesCount}`}
            className={clsx(
              'flex items-center gap-1 transition focus-visible:outline-2 focus-visible:outline-lime cursor-pointer',
              liked ? 'text-red-400' : 'hover:text-white'
            )}
            onClick={handleLike}
          >
            {liked ? '❤️' : '🤍'} {formatCount(likesCount)}
          </button>
          <button
            aria-label={`评论 ${post.comments}`}
            className="flex items-center gap-1 transition hover:text-white focus-visible:outline-2 focus-visible:outline-lime cursor-pointer"
            onClick={() => setShowComments(!showComments)}
          >
            💬 {formatCount(post.comments)}
          </button>
          <button
            aria-label="送礼物"
            className="flex items-center gap-1 transition hover:text-white cursor-pointer"
            onClick={() => setShowGifts(!showGifts)}
          >
            🎁 送礼
          </button>
          <span className="flex-1" />
          <button
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer',
              saved
                ? 'border-lime/40 text-lime bg-limeDim'
                : 'border-border text-textMuted hover:border-borderStrong hover:text-white'
            )}
            onClick={handleSave}
          >
            {saved ? '🔖 已收藏' : '🔖 收藏'}
          </button>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-white transition hover:border-borderStrong cursor-pointer"
            onClick={handleAddFriend}
          >
            ➕ 加好友
          </button>
          {post.type === 'meet' && (
            <button
              className="rounded-full border border-lime/60 bg-limeDim px-3 py-1 text-xs font-semibold text-lime transition hover:border-lime hover:bg-lime hover:text-[#09090A] cursor-pointer"
              onClick={handleMeetRequest}
            >
              想约TA →
            </button>
          )}
        </div>

        {/* Gift panel */}
        {showGifts && (
          <div className="border-t border-border pt-3">
            <div className="text-[11px] text-textSofter mb-2 font-mono">送 TA 一份虚拟礼物</div>
            <div className="flex gap-2 flex-wrap">
              {VIRTUAL_GIFTS.map(gift => (
                <button
                  key={gift.id}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg border border-border hover:border-lime/30 hover:bg-limeDim transition cursor-pointer"
                  onClick={() => { onSendGift(post.id, gift.id); setShowGifts(false); }}
                >
                  <span className="text-xl">{gift.emoji}</span>
                  <span className="text-[9px] text-textMuted">{gift.name}</span>
                  <span className="text-[9px] text-lime">{gift.price}币</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comments panel */}
        {showComments && (
          <div className="border-t border-border pt-3 space-y-3">
            <div className="text-[11px] text-textSofter mb-2 font-mono">评论 ({postComments.length})</div>
            {postComments.length === 0 && (
              <div className="text-xs text-textSofter text-center py-2">暂无评论，快来说点什么吧~</div>
            )}
            {postComments.slice(0, 5).map(comment => (
              <div key={comment.id} className="flex gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-[#09090A] flex-shrink-0"
                  style={{ background: comment.color }}
                >
                  {comment.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{comment.username}</span>
                    <span className="text-[10px] text-textSofter">{comment.time}</span>
                  </div>
                  <p className="text-xs text-textMuted mt-0.5">{comment.text}</p>
                </div>
                <button
                  className="text-[10px] text-textSofter hover:text-white flex-shrink-0 cursor-pointer"
                  onClick={() => likeComment(post.id, comment.id)}
                >
                  ❤️ {comment.likes}
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="写评论..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmitComment()}
                className="flex-1 bg-surfaceMuted border border-border rounded-full px-3 py-1.5 text-xs text-white placeholder:text-textSofter outline-none focus:border-lime/30"
              />
              <button
                className="px-3 py-1.5 rounded-full bg-lime text-[#09090A] text-xs font-bold hover:bg-[#d4ff1a] transition cursor-pointer"
                onClick={handleSubmitComment}
              >
                发送
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});
