import { useState, useEffect } from 'react';
import { searchApi } from '../api/searchApi';
import type { SearchResult } from '../api/searchApi';
import { X, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (query.trim().length > 1) {
      const timer = setTimeout(() => {
        searchApi.suggest(query).then(setSuggestions);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // eslint-disable-next-line
      if (suggestions.length > 0) setSuggestions([]);
    }
  }, [query, suggestions.length]);

  const handleSearch = async () => {
    if (!query) return;
    try {
      const res = await searchApi.search(query);
      setResults(res);
      setSuggestions([]);
    } catch (error) {
      console.error('Search failed', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center pt-20" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden h-fit max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center gap-2">
          <Search className="text-gray-400" />
          <input
            type="text"
            className="flex-1 outline-none text-lg"
            placeholder="Search users, posts, coaches..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            autoFocus
          />
          <button onClick={onClose}>
            <X className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-6">
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500">Suggestions</h3>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="cursor-pointer hover:bg-gray-50 p-2 rounded"
                  onClick={() => { setQuery(s); handleSearch(); }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}

          {results && (
            <>
              {results.users.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">Users</h3>
                  <div className="grid gap-2">
                    {results.users.map(u => (
                      <Link
                        to={`/profile/${u.id}`}
                        key={u.id}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded"
                        onClick={onClose}
                      >
                        <div className="w-8 h-8 bg-gray-200 rounded-full" />
                        <span>{u.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {results.posts.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">Posts</h3>
                  <div className="grid gap-2">
                    {results.posts.map(p => (
                      <div key={p.id} className="p-3 border rounded text-sm hover:bg-gray-50">
                        <p className="line-clamp-2">{p.content}</p>
                        <span className="text-xs text-gray-400">by {p.author}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {results && results.users.length === 0 && results.posts.length === 0 && (
            <div className="text-center text-gray-500 py-10">
              No results found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
