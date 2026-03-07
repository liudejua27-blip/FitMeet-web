import { memo, useState, useMemo } from 'react';
import type { Post } from '../../types';
import { useSocialStore } from '../../stores';
import { FEED_DATA } from '../../data/mockData';

interface ProfilePostsProps {
  posts: Post[];
}

export const ProfilePosts = memo(function ProfilePosts({ posts }: ProfilePostsProps) {
  const [tab, setTab] = useState<'my' | 'liked' | 'saved'>('my');
  const { likedPosts, savedPosts, getLikeDelta } = useSocialStore();

  const filtered = useMemo(() => {
    if (tab === 'liked') {
      // Show all posts the user has liked (from entire feed)
      return FEED_DATA.filter((p) => likedPosts.includes(p.id));
    }
    if (tab === 'saved') {
      // Show all posts the user has saved (from entire feed)
      return FEED_DATA.filter((p) => savedPosts.includes(p.id));
    }
    return posts;
  }, [tab, posts, likedPosts, savedPosts]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { key: 'my', label: '我的动态' },
          { key: 'liked', label: `点赞 (${likedPosts.length})` },
          { key: 'saved', label: `收藏 (${savedPosts.length})` },
        ] as const).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition ${
              tab === item.key
                ? 'bg-lime text-[#09090A]'
                : 'bg-surface border border-border text-textMuted hover:border-borderStrong'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Posts */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-textMuted">
          <span className="text-4xl block mb-2">📝</span>
          暂无内容
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((post) => (
            <PostItem key={post.id} post={post} liked={likedPosts.includes(post.id)} saved={savedPosts.includes(post.id)} likeDelta={getLikeDelta(post.id)} />
          ))}
        </div>
      )}
    </div>
  );
});

const PostItem = memo(function PostItem({ post, liked, saved, likeDelta }: { post: Post; liked: boolean; saved: boolean; likeDelta: number }) {
  return (
    <div className="p-4 bg-surface border border-border rounded-xl hover:border-borderStrong transition">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ backgroundColor: post.colorBg, color: post.color }}
        >
          {post.emoji}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">{post.username}</div>
          <div className="text-[10px] text-textMuted">
            {post.dist} · {post.city}
          </div>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-textSecondary mb-3 leading-relaxed">{post.text}</p>

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <div
          className={`grid gap-2 mb-3 ${
            post.images.length === 1
              ? 'grid-cols-1'
              : post.images.length <= 4
                ? 'grid-cols-2'
                : 'grid-cols-3'
          }`}
        >
          {post.images.map((img, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-surfaceMuted border border-border overflow-hidden"
            >
              <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-lime/10 text-lime text-[10px] font-bold rounded-full"
            >
              {tag.startsWith('#') ? tag : `#${tag}`}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-textMuted pt-2 border-t border-border">
        <span className="flex items-center gap-1">
          {liked ? '❤️' : '🤍'} {post.likes + likeDelta}
        </span>
        <span className="flex items-center gap-1">💬 {post.comments}</span>
        <span className="flex items-center gap-1">
          {saved ? '🔖' : '📎'} 收藏
        </span>
      </div>
    </div>
  );
});
