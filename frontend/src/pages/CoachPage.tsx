import { useCallback, useEffect, useMemo, useState } from 'react';
import * as dataService from '../services/dataService';
import type { Coach } from '../types';
import { CoachCard, CoachDetail, CoachSearchBar } from '../components/coach';
import { useAuthStore, useNotificationStore } from '../stores';
import { CoachCardSkeleton, EmptyState } from '../components/ui';

export const CoachPage = () => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recommend');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [bookedCoaches, setBookedCoaches] = useState<number[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [coachData, setCoachData] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const loadCoaches = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const data = await dataService.getCoaches();
      setCoachData(data);
    } catch {
      setError('加载教练列表失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoaches();
  }, [loadCoaches]);

  const filteredAndSortedData = useMemo(() => {
    let data = filter === 'all' ? coachData : coachData.filter((coach) => coach.specialtyCode === filter);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      data = data.filter((coach) => coach.name.toLowerCase().includes(query) || coach.specialty.toLowerCase().includes(query));
    }
    switch (sortBy) {
      case 'rating':
        return [...data].sort((a, b) => b.rating - a.rating);
      case 'students':
        return [...data].sort((a, b) => b.students - a.students);
      default:
        return data;
    }
  }, [coachData, filter, searchQuery, sortBy]);

  const handleBook = useCallback(
    (name: string) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      const coach = coachData.find((item) => item.name === name);
      if (coach && bookedCoaches.includes(coach.id)) return;
      if (coach) setBookedCoaches((prev) => [...prev, coach.id]);
      addNotification({
        type: 'system',
        username: '系统',
        avatar: 'S',
        color: '#16C784',
        text: `你已成功预约教练 ${name}，请准时到达`,
        time: '刚刚',
      });
      setSuccessMsg(`已成功预约 ${name} 教练`);
      window.setTimeout(() => setSuccessMsg(''), 3000);
    },
    [addNotification, bookedCoaches, coachData, isLoggedIn, openLogin],
  );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <section className="border-b border-[#ead8c7] bg-[#fff3e8] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-display text-[clamp(36px,6vw,64px)] font-black leading-none">专业教练市场</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#76543e]">
              认证、评价、专长和预约动作集中展示，让用户更快找到可靠教练。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <HeroMetric value="1,280+" label="认证教练" />
            <HeroMetric value="4.8" label="平均评分" />
            <HeroMetric value="24h" label="响应" />
          </div>
        </div>
      </section>

      <CoachSearchBar
        filter={filter}
        onFilterChange={setFilter}
        onSearchChange={setSearchQuery}
        onSortChange={setSortBy}
        searchQuery={searchQuery}
        sortBy={sortBy}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-[#ead8c7] bg-white px-5 py-4 shadow-card">
          <div className="text-sm font-bold text-[#76543e]">
            共 <span className="text-lime">{filteredAndSortedData.length}</span> 位教练
          </div>
          <div className="text-xs font-bold text-[#9a7459]">公益交流 · 视频认证 · 真实评价</div>
        </div>

        {error && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button className="font-black underline" onClick={() => void loadCoaches()}>
              重试
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, index) => <CoachCardSkeleton key={index} />)
            : filteredAndSortedData.map((coach) => (
                <CoachCard key={coach.id} coach={coach} onBook={handleBook} onView={setSelectedCoach} />
              ))}
        </div>

        {!isLoading && filteredAndSortedData.length === 0 && (
          <EmptyState
            icon="⌕"
            title="暂无符合条件的教练"
            description="试试调整筛选条件或搜索关键词"
            action={
              <button
                className="rounded-lg bg-lime px-5 py-2 text-sm font-black text-white"
                onClick={() => {
                  setFilter('all');
                  setSearchQuery('');
                }}
              >
                重置筛选
              </button>
            }
          />
        )}
      </main>

      {selectedCoach && <CoachDetail coach={selectedCoach} onBook={handleBook} onClose={() => setSelectedCoach(null)} />}

      {successMsg && (
        <div className="fixed left-1/2 top-24 z-[100] -translate-x-1/2 rounded-xl bg-lime px-6 py-3 text-sm font-black text-white shadow-glow">
          {successMsg}
        </div>
      )}
    </div>
  );
};

const HeroMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-[#ead8c7] bg-white px-4 py-3 shadow-card">
    <div className="font-display text-xl font-black text-lime">{value}</div>
    <div className="mt-1 text-[10px] font-black text-[#8b6a54]">{label}</div>
  </div>
);
