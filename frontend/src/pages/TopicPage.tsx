import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as dataService from '../services/dataService';
import type { Post, Meet } from '../types';

export const TopicPage = () => {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const decodedTag = decodeURIComponent(tag || '');
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [allMeets, setAllMeets] = useState<Meet[]>([]);

  useEffect(() => {
    dataService.getFeed().then(setAllPosts);
    dataService.getMeets().then(setAllMeets);
  }, []);

  const relatedPosts = useMemo(
    () =>
      allPosts.filter((p) =>
        p.tags.some((t) => t.toLowerCase().includes(decodedTag.toLowerCase()))
      ),
    [decodedTag, allPosts]
  );

  const relatedMeets = useMemo(
    () =>
      allMeets.filter(
        (m) =>
          m.title.toLowerCase().includes(decodedTag.toLowerCase()) ||
          m.sport.toLowerCase().includes(decodedTag.toLowerCase())
      ),
    [decodedTag, allMeets]
  );

  const totalPosts = relatedPosts.length + relatedMeets.length;
  const totalViews = relatedPosts.reduce((sum, p) => sum + p.viewCount, 0);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-16 z-40 border-b border-border bg-base/95 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            className="text-textMuted hover:text-white transition cursor-pointer"
            onClick={() => navigate(-1)}
          >
            ← 返回
          </button>
          <span className="text-sm font-display font-bold text-white">话题</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {/* Topic Header */}
        <div className="py-8 text-center border-b border-border">
          <div className="inline-block px-5 py-2 rounded-full bg-limeDim border border-lime/20 mb-3">
            <span className="text-2xl font-display font-extrabold text-lime">#{decodedTag}</span>
          </div>
          <div className="flex justify-center gap-8 mt-4">
            <div className="text-center">
              <div className="text-xl font-bold text-white">{totalPosts}</div>
              <div className="text-[11px] text-textSofter">相关内容</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">{totalViews.toLocaleString()}</div>
              <div className="text-[11px] text-textSofter">总浏览</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-white">{relatedPosts.length}</div>
              <div className="text-[11px] text-textSofter">动态</div>
            </div>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="mt-6 mb-8">
            <h3 className="font-display font-bold text-white mb-4">📝 相关动态</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-4 rounded-xl border border-border bg-surface hover:border-borderStrong transition cursor-pointer"
                  onClick={() => navigate('/discover')}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: post.color }}
                    >
                      {post.username[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{post.username}</div>
                      <div className="text-[10px] text-textSofter">📍 {post.city} · {post.dist}</div>
                    </div>
                    <span className="ml-auto text-[10px] text-textSofter">{post.emoji}</span>
                  </div>
                  <p className="text-sm text-textMuted leading-relaxed line-clamp-2">{post.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {post.tags.map((t) => (
                      <span
                        key={t}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          t.toLowerCase().includes(decodedTag.toLowerCase())
                            ? 'text-lime bg-limeDim border border-lime/20'
                            : 'text-textSofter'
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-textSofter">
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.comments}</span>
                    <span>👁️ {post.viewCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Meets */}
        {relatedMeets.length > 0 && (
          <section className="mb-8">
            <h3 className="font-display font-bold text-white mb-4">📍 相关约练</h3>
            <div className="space-y-3">
              {relatedMeets.map((meet) => (
                <div
                  key={meet.id}
                  className="p-4 rounded-xl border border-border bg-surface hover:border-borderStrong transition cursor-pointer"
                  onClick={() => navigate('/discover')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{meet.sport.split(' ')[0]}</span>
                      <span className="text-sm font-semibold text-white">{meet.title}</span>
                    </div>
                    <span className="text-xs text-lime bg-limeDim px-2 py-0.5 rounded-full">
                      {meet.slots}/{meet.maxSlots} 人
                    </span>
                  </div>
                  <div className="text-xs text-textSofter mt-1">
                    ⏰ {meet.time} · 📍 {meet.loc} · 👤 {meet.username}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {totalPosts === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🏷️</div>
            <div className="text-lg font-display font-bold text-textMuted">
              暂无「#{decodedTag}」相关内容
            </div>
            <div className="text-sm text-textSofter mt-1">
              成为第一个发布此话题的人吧！
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
