import { useState, useCallback, memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '../api/searchApi';
import { FEED_DATA } from '../data/mockData';

const HOT_TOPICS = ['#增肌', '#跑步打卡', '#瑜伽', '#减脂', '#深蹲', '#户外运动', '#游泳', '#HIIT'];
const SEARCH_HISTORY_KEY = 'search_history';

const SearchResultCard = memo(function SearchResultCard({
  item,
  type,
  onClick,
}: {
  item: { title: string; desc: string; emoji?: string; avatar?: string; color?: string };
  type: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-borderStrong hover:bg-surfaceMuted transition text-left cursor-pointer"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg overflow-hidden flex-shrink-0"
        style={{ backgroundColor: item.color ? item.color + '20' : '#333' }}
      >
        {item.avatar ? (
          <img src={item.avatar} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          item.emoji || '🔍'
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-white text-sm truncate">{item.title}</div>
        <div className="text-xs text-textMuted truncate">{item.desc}</div>
      </div>
      <span className="text-[10px] text-textSofter bg-surfaceMuted px-2 py-0.5 rounded-full flex-shrink-0">
        {type}
      </span>
    </button>
  );
});

interface SearchResultItem {
  id: string;
  title: string;
  desc: string;
  avatar?: string;
  emoji?: string;
  type: string;
  color?: string;
  onClick: () => void;
}

export const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
    return saved
      ? JSON.parse(saved)
      : ['约练', '瑜伽教练', '望京健身房', '减脂食谱'];
  });

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await searchApi.search(query);

        const mappedUsers = data.users.map((u) => ({
          id: `user-${u.id}`,
          title: u.name,
          desc: '用户',
          avatar: u.avatar,
          emoji: '👤',
          type: '用户',
          onClick: () => navigate(`/profile/${u.id}`),
        }));

        const mappedPosts = data.posts.map((p) => ({
          id: `post-${p.id}`,
          title: p.author,
          desc: p.content,
          emoji: '📝',
          color: '#3B82F6',
          type: '动态',
          onClick: () => navigate(`/post/${p.id}`),
        }));

        const mappedCoaches = data.coaches.map((c) => ({
          id: `coach-${c.id}`,
          title: c.name,
          desc: c.title || '健身教练',
          emoji: '🏋️',
          color: '#10B981',
          type: '教练',
          onClick: () => navigate(`/coach/${c.id}`),
        }));

        setResults([...mappedUsers, ...mappedPosts, ...mappedCoaches]);
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setLoading(false);
      }
    }, 500); // Debounce

    return () => clearTimeout(timer);
  }, [query, navigate]);

  const handleSearch = useCallback(
    (text: string) => {
      if (!text) return;
      setQuery(text);
      const newHistory = [text, ...history.filter(h => h !== text)].slice(0, 8);
      setHistory(newHistory);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
    },
    [history]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  }, []);

  return (
    <div className="min-h-screen pb-20 bg-base text-white">
      {/* Search Header */}
      <div className="sticky top-0 z-40 border-b border-border bg-base/95 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className="text-textMuted hover:text-white transition cursor-pointer p-2"
              onClick={() => navigate(-1)}
            >
              ←
            </button>
            <div className="flex-1 flex items-center gap-2 bg-surface border border-border rounded-full px-4 py-2.5 focus-within:border-lime/50 transition">
              <span className="text-textMuted">🔍</span>
              <input
                type="text"
                placeholder="搜索用户、动态、教练..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
                className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-textSofter"
                autoFocus
              />
              {query && (
                <button
                  className="text-textMuted hover:text-white text-sm cursor-pointer px-1"
                  onClick={() => setQuery('')}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              className="px-4 py-2 rounded-full bg-lime text-[#09090A] text-sm font-bold cursor-pointer hover:bg-[#d4ff1a] transition"
              onClick={() => handleSearch(query)}
            >
              搜索
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {!query.trim() ? (
          <div className="space-y-8 animate-fade-in">
            {history.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-4 px-2">
                  <h3 className="font-bold text-lg text-white">搜索历史</h3>
                  <button onClick={clearHistory} className="text-xs text-textMuted hover:text-textSofter">
                    清除
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearch(h)}
                      className="px-3 py-1.5 rounded-full bg-surface hover:bg-surfaceMuted transition text-sm text-textMuted"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-bold text-lg text-white mb-4 px-2">热门话题</h3>
              <div className="flex flex-wrap gap-2">
                {HOT_TOPICS.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearch(topic.replace('#', ''))}
                    className="px-3 py-1.5 rounded-full border border-lime/20 text-lime bg-lime/5 hover:bg-lime/10 transition text-sm"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Trending Section using Mock Data (since we don't have Trending API yet) */}
            <section>
              <h3 className="text-sm font-display font-bold text-white mb-3">📈 热门推荐</h3>
              <div className="space-y-2">
                {FEED_DATA.slice(0, 4).map((post, i) => (
                  <button
                    key={post.id}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-borderStrong transition text-left cursor-pointer"
                    onClick={() => navigate('/discover')}
                  >
                    <span className={`text-lg font-bold font-mono ${i < 3 ? 'text-lime' : 'text-textSofter'}`}>
                      {i + 1}
                    </span>
                    <span className="text-2xl">{post.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{post.text.slice(0, 30)}...</div>
                      <div className="text-[11px] text-textSofter">{post.username} · ❤️ {post.likes}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
             {loading && <div className="text-center py-4 text-textMuted">Loading...</div>}

             {!loading && (
               <div className="text-sm text-textMuted mb-2">
                 找到 <span className="text-lime font-bold">{results.length}</span> 个结果
               </div>
             )}

             {!loading && results.map((item) => (
               <SearchResultCard
                 key={item.id}
                 item={item}
                 type={item.type}
                 onClick={item.onClick}
               />
             ))}
             {!loading && results.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🔍</div>
                  <div className="text-sm text-textMuted">没有找到相关内容</div>
                  <div className="text-xs text-textSofter mt-1">换个关键词试试吧</div>
                </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};
