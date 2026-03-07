import { useState, useCallback, useMemo, useEffect } from 'react';
import { MEET_DATA } from '../data/mockData';
import * as dataService from '../services/dataService';
import { MeetSidebar, MeetDetail, CreateMeetModal } from '../components/meet';
import type { MeetFormData } from '../components/meet';
import { useAuthStore } from '../stores';
import { useNotificationStore } from '../stores';
import { MeetCardSkeleton } from '../components/ui';

export const MeetPage = () => {
  const [selectedMeetId, setSelectedMeetId] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');
  const [distanceFilter, setDistanceFilter] = useState('不限');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinedMeets, setJoinedMeets] = useState<number[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [meetData, setMeetData] = useState([] as typeof MEET_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();

  // Load meets from data service on mount
  useEffect(() => {
    let cancelled = false;
    dataService.getMeets().then((data) => {
      if (!cancelled) { setMeetData(data); setIsLoading(false); }
    }).catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredMeets = useMemo(() => {
    let data = meetData;
    if (filter !== 'all') data = data.filter(m => m.type === filter);
    if (distanceFilter !== '不限') {
      const maxKm = parseFloat(distanceFilter.replace(/[^\d.]/g, ''));
      data = data.filter(m => {
        const d = parseFloat(m.dist.replace(/[^\d.]/g, ''));
        return !isNaN(d) && d <= maxKm;
      });
    }
    return data;
  }, [filter, distanceFilter, meetData]);

  const selectedMeet = useMemo(() =>
    meetData.find(m => m.id === selectedMeetId) ?? null,
    [selectedMeetId, meetData]
  );

  const handleFilterChange = useCallback((newFilter: string) => {
    setFilter(newFilter);
  }, []);

  const handleDistanceChange = useCallback((d: string) => {
    setDistanceFilter(d);
  }, []);

  const handleSelect = useCallback((id: number) => {
    setSelectedMeetId(id);
  }, []);

  const handleJoin = useCallback(async (id: number) => {
    if (!isLoggedIn) { openLogin(); return; }
    if (joinedMeets.includes(id)) return;

    try {
      await dataService.joinMeet(id);
      setJoinedMeets(prev => [...prev, id]);
      const meet = meetData.find(m => m.id === id);
      addNotification({
        type: 'meet',
        username: meet?.username || '约练',
        avatar: (meet?.username || '约')[0],
        color: '#C8FF00',
        text: `你成功加入了「${meet?.title || '约练'}」，等待确认`,
        time: '刚刚',
      });
      setSuccessMsg(`已成功申请加入「${meet?.title}」！`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      // Error handled in dataService/store or ignored
    }
  }, [isLoggedIn, openLogin, joinedMeets, addNotification, meetData]);

  const handleCreate = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleCreateSubmit = useCallback(async (data: MeetFormData) => {
    if (!isLoggedIn) { openLogin(); return; }
    try {
      await dataService.createMeet(data as unknown as import('../types').Meet);
      addNotification({
        type: 'meet',
        username: '系统',
        avatar: 'S',
        color: '#38BDF8',
        text: `你的约练「${data.title}」已发布成功！`,
        time: '刚刚',
      });
      setShowCreateModal(false);
      setSuccessMsg(`约练「${data.title}」发布成功！`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      // Error handled
    }
  }, [isLoggedIn, openLogin, addNotification]);

  return (
    <div className="min-h-screen">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* Sidebar */}
        {isLoading ? (
          <aside className="p-4 space-y-3 border-r border-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <MeetCardSkeleton key={i} />
            ))}
          </aside>
        ) : (
          <MeetSidebar
            meets={filteredMeets}
            selectedId={selectedMeetId}
            filter={filter}
            distanceFilter={distanceFilter}
            onFilterChange={handleFilterChange}
            onDistanceChange={handleDistanceChange}
            onSelect={handleSelect}
            onJoin={handleJoin}
          />
        )}

        {/* Detail Panel */}
        <div className="p-4 sm:p-8 lg:p-10 overflow-y-auto lg:h-[calc(100vh-64px)]">
          <MeetDetail meet={selectedMeet} onJoin={handleJoin} onCreate={handleCreate} />
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-lime text-[#09090A] text-2xl font-bold flex items-center justify-center cursor-pointer z-50 shadow-glow transition-transform duration-200 hover:scale-110 hover:rotate-45 border-none"
        title="发起约练"
        onClick={handleCreate}
      >
        +
      </button>

      {/* Create Meet Modal */}
      <CreateMeetModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateSubmit}
      />

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl bg-lime text-[#09090A] font-bold text-sm shadow-glow animate-bounce">
          ✅ {successMsg}
        </div>
      )}
    </div>
  );
};
