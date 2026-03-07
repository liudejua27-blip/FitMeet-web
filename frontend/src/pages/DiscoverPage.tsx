import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FEED_DATA } from '../data/mockData';
import * as dataService from '../services/dataService';
import { FilterBar, FriendListWidget, MasonryFeed } from '../components/discover';
import { CreatePostModal } from '../components/common';
import { useSocialStore, useMessageStore, useAuthStore, useNotificationStore } from '../stores';
import { FeedCardSkeleton, EmptyState } from '../components/ui';

const PAGE_SIZE = 6;

export const DiscoverPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [gender, setGender] = useState('all');
  const [distance, setDistance] = useState('all');
  const [level, setLevel] = useState('all');
  const [feedData, setFeedData] = useState(FEED_DATA);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { isLoggedIn, openLogin } = useAuthStore();
  const { toggleFollow, toggleLike, toggleSave } = useSocialStore();
  const { startChat } = useMessageStore();
  const { addNotification } = useNotificationStore();



  // Load feed data from data service on mount
  useEffect(() => {
    let cancelled = false;
    dataService
      .getFeed()
      .then((data) => {
        if (!cancelled) {
          setFeedData(data);
          setInitialLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setInitialLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Check if navigated from bottom tab "+" button
  useEffect(() => {
    if (
      location.state &&
      (location.state as { openCreatePost?: boolean }).openCreatePost
    ) {
      if (!showCreatePost) {
        // eslint-disable-next-line
        setShowCreatePost(true);
      }
      // Clear the state so it doesn't re-trigger
      window.history.replaceState({}, document.title);
    }
  }, [location.state, showCreatePost]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          setLoading(true);
          // Simulate loading delay
          setTimeout(() => {
            setVisibleCount(prev => {
              const next = prev + PAGE_SIZE;
              // If we've shown all, "load more" by duplicating with new IDs
              if (prev >= feedData.length) {
                setFeedData(prevData => [
                  ...prevData,
                  ...prevData.slice(0, PAGE_SIZE).map((p, i) => ({
                    ...p,
                    id: prevData.length + i + 1,
                  })),
                ]);
              }
              return next;
            });
            setLoading(false);
          }, 600);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, feedData.length]);

  // Memoized filtered data
  const filteredData = useMemo(() => {
    let data = feedData;
    if (filter !== 'all') {
      data = data.filter(item => item.type === filter || item.sport === filter);
    }
    if (gender !== 'all') {
      data = data.filter(item =>
        gender === 'male' ? item.gender === '♂' : item.gender === '♀'
      );
    }
    if (distance !== 'all') {
      const maxDist = parseFloat(distance.replace(/[^\d.]/g, ''));
      data = data.filter(item => {
        const d = parseFloat(item.dist.replace(/[^\d.]/g, ''));
        return !isNaN(d) && d <= maxDist;
      });
    }
    if (level !== 'all') {
      data = data.filter(item => item.level === level);
    }
    return data;
  }, [filter, gender, distance, level, feedData]);

  const visibleData = useMemo(() => filteredData.slice(0, visibleCount), [filteredData, visibleCount]);
  const hasMore = visibleCount < filteredData.length;

  const handleFilterChange = useCallback((key: string) => { setFilter(key); setVisibleCount(PAGE_SIZE); }, []);
  const handleGenderChange = useCallback((g: string) => { setGender(g); setVisibleCount(PAGE_SIZE); }, []);
  const handleDistanceChange = useCallback((d: string) => { setDistance(d); setVisibleCount(PAGE_SIZE); }, []);
  const handleLevelChange = useCallback((l: string) => { setLevel(l); setVisibleCount(PAGE_SIZE); }, []);

  const handleLike = useCallback((id: number) => {
    if (!isLoggedIn) { openLogin(); return; }
    toggleLike(id);
  }, [isLoggedIn, openLogin, toggleLike]);

  const handleSave = useCallback((id: number) => {
    if (!isLoggedIn) { openLogin(); return; }
    toggleSave(id);
  }, [isLoggedIn, openLogin, toggleSave]);

  const handleAddFriend = useCallback((id: number) => {
    if (!isLoggedIn) { openLogin(); return; }
    const post = feedData.find(p => p.id === id);
    if (post) {
      toggleFollow(id);
      addNotification({
        type: 'follow',
        username: post.username,
        avatar: post.username[0],
        color: post.color,
        text: `你关注了 ${post.username}`,
        time: '刚刚',
      });
    }
  }, [isLoggedIn, openLogin, feedData, toggleFollow, addNotification]);

  const handleMeetRequest = useCallback((id: number) => {
    if (!isLoggedIn) { openLogin(); return; }
    const post = feedData.find(p => p.id === id);
    if (post) {
      addNotification({
        type: 'meet',
        username: post.username,
        avatar: post.username[0],
        color: post.color,
        text: `你向 ${post.username} 发送了约练邀请`,
        time: '刚刚',
      });
    }
  }, [isLoggedIn, openLogin, feedData, addNotification]);

  const handleSendGift = useCallback((postId: number) => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    const post = feedData.find(p => p.id === postId);
    if (post) {
      addNotification({
        type: 'like',
        username: '系统',
        avatar: 'S',
        color: '#38BDF8',
        text: `你给 ${post.username} 送了一份礼物 🎁`,
        time: '刚刚',
      });
    }
  }, [isLoggedIn, openLogin, feedData, addNotification]);

  const handleMessage = useCallback((id: number) => {
    if (!isLoggedIn) { openLogin(); return; }
    const post = feedData.find(p => p.id === id);
    if (post && post.userId) {
      startChat(post.userId, post.username, post.username[0], post.color);
      navigate('/messages');
    } else {
        // Fallback for mock data lacking userId, temporary
        console.warn('Post missing userId, cannot start chat');
    }
  }, [isLoggedIn, openLogin, feedData, startChat, navigate]);

  return (
    <div className="min-h-screen pb-20">
      {/* Friend List Widget - Desktop Only */}
      <FriendListWidget />

      {/* Filter Bar */}
      <FilterBar
        active={filter}
        onChange={handleFilterChange}
        gender={gender}
        onGenderChange={handleGenderChange}
        distance={distance}
        onDistanceChange={handleDistanceChange}
        level={level}
        onLevelChange={handleLevelChange}
      />

      {/* Feed - Virtualized Waterfall Grid */}
      <div className="max-w-6xl px-6 mx-auto pt-7 min-h-[500px]">
        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-textMuted">
            共 <span className="text-lime font-bold">{filteredData.length}</span> 条动态
          </div>
          <button
            className="px-4 py-2 rounded-full bg-lime text-[#09090A] text-xs font-bold hover:bg-[#d4ff1a] transition cursor-pointer"
            onClick={() => { if (!isLoggedIn) { openLogin(); return; } setShowCreatePost(true); }}
          >
            ✏️ 发动态
          </button>
        </div>

        {initialLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <FeedCardSkeleton key={i} />
              ))}
            </div>
        ) : filteredData.length > 0 ? (
          <MasonryFeed
            posts={visibleData}
            loadMore={() => {
               if (hasMore && !loading) {
                   setLoading(true);
                   // Simulate fetching more
                   setTimeout(() => {
                        setVisibleCount(prev => prev + PAGE_SIZE);
                        setLoading(false);
                   }, 500);
               }
            }}
            loading={loading}
            onLike={handleLike}
            onSave={handleSave}
            onAddFriend={handleAddFriend}
            onMeetRequest={handleMeetRequest}
            onSendGift={handleSendGift}
            onMessage={handleMessage}
          />
        ) : (
          <EmptyState
            icon="🔍"
            title="暂无相关内容"
            description="换个筛选条件试试，或发布一条动态吧"
            action={
              <button
                className="px-5 py-2 rounded-full bg-lime text-[#09090A] text-sm font-bold hover:bg-[#d4ff1a] transition cursor-pointer"
                onClick={() => { setFilter('all'); setGender('all'); setDistance('all'); setLevel('all'); }}
              >
                重置筛选
              </button>
            }
          />
        )}
      </div>

      {/* Create Post Modal */}
      <CreatePostModal open={showCreatePost} onClose={() => setShowCreatePost(false)} />
    </div>
  );
};
