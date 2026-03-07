import { useState, useCallback, useMemo, useEffect } from 'react';
import { COACH_DATA } from '../data/mockData';
import * as dataService from '../services/dataService';
import type { Coach } from '../data/mockData';
import { CoachCard, CoachSearchBar, CoachDetail } from '../components/coach';
import { useAuthStore, useNotificationStore } from '../stores';
import { CoachCardSkeleton, EmptyState } from '../components/ui';

export const CoachPage = () => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recommend');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [bookedCoaches, setBookedCoaches] = useState<number[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [coachData, setCoachData] = useState([] as typeof COACH_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();

  // Load coaches from data service on mount
  useEffect(() => {
    let cancelled = false;
    dataService
      .getCoaches()
      .then((data) => {
        if (!cancelled) {
          setCoachData(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredAndSortedData = useMemo(() => {
    let data = filter === 'all'
      ? coachData
      : coachData.filter(c => c.specialtyCode === filter);

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(c =>
        c.name.toLowerCase().includes(q) || c.specialty.toLowerCase().includes(q)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'rating':
        data = [...data].sort((a, b) => b.rating - a.rating);
        break;
      case 'price':
        data = [...data].sort((a, b) => a.price - b.price);
        break;
      default:
        break;
    }

    return data;
  }, [filter, sortBy, searchQuery, coachData]);

  const handleFilterChange = useCallback((code: string) => setFilter(code), []);
  const handleSortChange = useCallback((sort: string) => setSortBy(sort), []);

  const handleBook = useCallback((name: string) => {
    if (!isLoggedIn) { openLogin(); return; }
    const coach = coachData.find(c => c.name === name);
    if (coach && bookedCoaches.includes(coach.id)) return;
    if (coach) setBookedCoaches(prev => [...prev, coach.id]);
    addNotification({
      type: 'system',
      username: '系统',
      avatar: 'S',
      color: '#38BDF8',
      text: `你已成功预约教练 ${name}，请准时到达！`,
      time: '刚刚',
    });
    setSuccessMsg(`已成功预约 ${name} 教练！`);
    setTimeout(() => setSuccessMsg(''), 3000);
  }, [isLoggedIn, openLogin, bookedCoaches, addNotification, coachData]);

  const handleCardClick = useCallback((coachId: number) => {
    const coach = coachData.find(c => c.id === coachId);
    if (coach) setSelectedCoach(coach);
  }, [coachData]);

  return (
    <div className="min-h-screen pb-20">
      {/* Search Bar */}
      <CoachSearchBar
        filter={filter}
        onFilterChange={handleFilterChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Coach Grid */}
      <div className="max-w-6xl mx-auto px-8 pt-8">
        {/* Results count */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-textMuted">
            共 <span className="text-lime font-bold">{filteredAndSortedData.length}</span> 位教练
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <CoachCardSkeleton key={i} />)
            : filteredAndSortedData.map(coach => (
                <div key={coach.id} onClick={() => handleCardClick(coach.id)} className="cursor-pointer">
                  <CoachCard coach={coach} onBook={handleBook} />
                </div>
              ))
          }
        </div>

        {/* Empty State */}
        {!isLoading && filteredAndSortedData.length === 0 && (
          <EmptyState
            icon="🏋️"
            title="暂无符合条件的教练"
            description="试试调整筛选条件或搜索关键词"
            action={
              <button
                className="px-5 py-2 rounded-full bg-lime text-[#09090A] text-sm font-bold hover:bg-[#d4ff1a] transition cursor-pointer"
                onClick={() => { setFilter('all'); setSearchQuery(''); }}
              >
                重置筛选
              </button>
            }
          />
        )}
      </div>

      {/* Coach Detail Modal */}
      {selectedCoach && (
        <CoachDetail
          coach={selectedCoach}
          onBook={handleBook}
          onClose={() => setSelectedCoach(null)}
        />
      )}

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl bg-lime text-[#09090A] font-bold text-sm shadow-glow animate-bounce">
          ✅ {successMsg}
        </div>
      )}
    </div>
  );
};
