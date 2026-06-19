import { useState, useCallback, memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '../api/searchApi';
import { navigateToDiscoverWithScrollReset } from '../lib/scrollNavigation';

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
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition hover:border-borderStrong hover:bg-surfaceMuted"
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg"
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
      <span className="flex-shrink-0 rounded-md bg-surfaceMuted px-2 py-0.5 text-[10px] text-textSofter">
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
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const data = await searchApi.search(query);

        const mappedUsers = data.users.map((u) => ({
          id: `user-${u.id}`,
          title: u.name,
          desc: '用户',
          avatar: u.avatar,
          emoji: '👤',
          type: '用户',
          onClick: () => navigate(`/user/${u.id}`),
        }));

        const mappedPosts = data.posts.map((p) => ({
          id: `post-${p.id}`,
          title: p.author,
          desc: p.content,
          emoji: '📝',
          color: '#3B82F6',
          type: '动态',
          onClick: () => navigateToDiscoverWithScrollReset(navigate),
        }));

        const mappedCoaches = data.coaches.map((c) => ({
          id: `coach-${c.id}`,
          title: c.name,
          desc: c.title || '健身教练',
          emoji: '🏋️',
          color: '#10B981',
          type: '教练',
          onClick: () => navigate('/coach'),
        }));

        setResults([...mappedUsers, ...mappedPosts, ...mappedCoaches]);
      } catch (err) {
        console.error('Search error', err);
        setError('搜索失败，请稍后重试');
        setResults([]);
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
    <div className="min-h-screen bg-base pb-20 text-white">
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
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 transition focus-within:border-lime/50">
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
              className="cursor-pointer rounded-lg bg-lime px-4 py-2 text-sm font-black text-white transition hover:bg-brand2"
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
                      className="rounded-lg bg-surface px-3 py-1.5 text-sm text-textMuted transition hover:bg-surfaceMuted"
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
                    className="rounded-lg border border-lime/20 bg-lime/5 px-3 py-1.5 text-sm text-lime transition hover:bg-lime/10"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
             {loading && <div className="text-center py-4 text-textMuted">Loading...</div>}

             {!loading && error && (
               <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                 {error}
               </div>
             )}

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
