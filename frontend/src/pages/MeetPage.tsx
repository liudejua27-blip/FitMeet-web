import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateMeetModal, MeetDetail, MeetSidebar } from '../components/meet';
import type { MeetFormData } from '../components/meet';
import { MeetCardSkeleton } from '../components/ui';
import type { Coordinates } from '../lib/amap';
import { getBrowserLocation } from '../lib/location';
import { getMeetDistanceMeters } from '../lib/distance';
import * as dataService from '../services/dataService';
import { useAuthStore, useNotificationStore } from '../stores';
import type { Meet } from '../types';
import { normalizeSportGroup } from '../data/taxonomy';
import { withMockMeets } from '../data/mockContent';

export const MeetPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedMeetId, setSelectedMeetId] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');
  const [distanceFilter, setDistanceFilter] = useState('不限');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinedMeets, setJoinedMeets] = useState<number[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [meetData, setMeetData] = useState<Meet[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<number[]>([]);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tripShareMeet, setTripShareMeet] = useState<Meet | null>(null);
  const [tripShareError, setTripShareError] = useState('');

  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const loadMeets = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const data = await dataService.getMeets({ lat: userLocation?.lat, lng: userLocation?.lng });
      const hydrated = withMockMeets(data);
      setMeetData(hydrated);
      setSelectedMeetId((current) => current ?? hydrated[0]?.id ?? null);
    } catch {
      const fallback = withMockMeets([]);
      setMeetData(fallback);
      setSelectedMeetId((current) => current ?? fallback[0]?.id ?? null);
      setError('约练列表加载失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    void loadMeets();
  }, [loadMeets]);

  useEffect(() => {
    if (location.state && (location.state as { openCreateMeet?: boolean }).openCreateMeet) {
      setShowCreateModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('trip');
    if (!token) {
      setTripShareMeet(null);
      setTripShareError('');
      return;
    }
    let cancelled = false;
    setTripShareError('');
    dataService
      .getTripShare(token)
      .then((info) => {
        if (cancelled) return;
        setTripShareMeet(info.meet);
        if (info.meet?.id) setSelectedMeetId(info.meet.id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTripShareMeet(null);
        setTripShareError(err instanceof Error ? err.message : '行程分享链接已失效。');
      });
    return () => {
      cancelled = true;
    };
  }, [location.search]);

  useEffect(() => {
    if (!isLoggedIn) {
      setBlockedUserIds([]);
      return;
    }
    dataService
      .getBlockedUserIds()
      .then(setBlockedUserIds)
      .catch(() => setBlockedUserIds([]));
  }, [isLoggedIn]);

  const filteredMeets = useMemo(() => {
    let data = meetData;
    if (blockedUserIds.length > 0) {
      const blocked = new Set(blockedUserIds);
      data = data.filter((meet) => !meet.userId || !blocked.has(meet.userId));
    }
    if (filter !== 'all')
      data = data.filter((meet) => normalizeSportGroup(meet.type || meet.sport) === filter);
    if (distanceFilter !== '不限') {
      const maxKm = parseFloat(distanceFilter.replace(/[^\d.]/g, ''));
      data = data.filter((meet) => {
        const meters = getMeetDistanceMeters(meet, userLocation);
        return typeof meters === 'number' && Number.isFinite(meters) && meters <= maxKm * 1000;
      });
    }
    if (userLocation) {
      data = [...data].sort(
        (a, b) =>
          (getMeetDistanceMeters(a, userLocation) ?? Number.POSITIVE_INFINITY) -
          (getMeetDistanceMeters(b, userLocation) ?? Number.POSITIVE_INFINITY),
      );
    }
    return data;
  }, [blockedUserIds, distanceFilter, filter, meetData, userLocation]);

  const selectedMeet = useMemo(
    () => meetData.find((meet) => meet.id === selectedMeetId) ?? filteredMeets[0] ?? null,
    [filteredMeets, meetData, selectedMeetId],
  );

  const showToast = useCallback((message: string) => {
    setSuccessMsg(message);
    window.setTimeout(() => setSuccessMsg(''), 3000);
  }, []);

  const handleUseMyLocation = useCallback(() => {
    setIsLocating(true);
    getBrowserLocation()
      .then((coords) => {
        setUserLocation(coords);
        showToast('已更新附近约练排序。');
      })
      .catch((error) => {
        setError(error instanceof Error ? error.message : '定位失败，请检查浏览器权限。');
      })
      .finally(() => setIsLocating(false));
  }, [showToast]);

  const handleJoin = useCallback(
    async (id: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      if (joinedMeets.includes(id)) return;
      try {
        const meet = meetData.find((item) => item.id === id);
        if (!meet?.mock) await dataService.joinMeet(id);
        setJoinedMeets((prev) => [...prev, id]);
        addNotification({
          type: 'meet',
          username: meet?.username || '约练',
          avatar: (meet?.username || '约')[0],
          color: '#ff6a00',
          text: `你已申请加入「${meet?.title || '约练'}」，等待发起人确认。`,
          time: '刚刚',
        });
        if (!meet?.mock) await loadMeets();
        showToast(`已申请加入「${meet?.title || '约练'}」。`);
      } catch {
        setError('加入失败，请稍后重试。');
      }
    },
    [addNotification, isLoggedIn, joinedMeets, loadMeets, meetData, openLogin, showToast],
  );

  const handleCreateSubmit = useCallback(
    async (data: MeetFormData) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      try {
        const created = await dataService.createMeet({
          title: data.title,
          type: data.type,
          sport: data.sport,
          time: data.time,
          loc: data.location,
          address: data.address,
          poiId: data.poiId,
          lat: data.lat,
          lng: data.lng,
          maxSlots: data.maxSlots,
          level: data.level,
          price: data.price,
          feeType: data.feeType,
          groupType: data.groupType,
          creatorType: data.creatorType,
          clubId: data.clubId,
          city: data.city,
          startAt: data.startAt || data.time,
          desc: data.desc,
        } as Partial<Meet>);
        setMeetData((prev) =>
          withMockMeets([created, ...prev.filter((meet) => meet.id !== created.id)]),
        );
        setSelectedMeetId(created.id);
        addNotification({
          type: 'meet',
          username: '系统',
          avatar: 'S',
          color: '#16c784',
          text: `你的约练「${data.title}」已发布成功。`,
          time: '刚刚',
        });
        setShowCreateModal(false);
        showToast(`约练「${data.title}」发布成功。`);
      } catch {
        setError('创建约练失败，请稍后重试。');
      }
    },
    [addNotification, isLoggedIn, openLogin, showToast],
  );

  const handleConfirmParticipant = useCallback(
    async (meetId: number, participantId: number) => {
      try {
        await dataService.confirmMeetParticipant(meetId, participantId);
        await loadMeets();
        showToast('已确认加入申请。');
      } catch {
        setError('确认失败，请稍后重试。');
      }
    },
    [loadMeets, showToast],
  );

  const handleCancelMeet = useCallback(
    async (meetId: number) => {
      try {
        await dataService.cancelMeet(meetId);
        await loadMeets();
        showToast('约练状态已更新。');
      } catch {
        setError('取消失败，请稍后重试。');
      }
    },
    [loadMeets, showToast],
  );

  const handleCreateTripShare = useCallback(
    async (meetId: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      try {
        const result = await dataService.createTripShare(meetId);
        await navigator.clipboard.writeText(result.url);
        showToast('行程分享链接已复制。');
      } catch {
        setError('行程分享开启失败。');
      }
    },
    [isLoggedIn, openLogin, showToast],
  );

  const handleCreateActivity = useCallback(
    async (meetId: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      try {
        const result = await dataService.createMeetActivity(meetId);
        showToast(result.reused ? '该约练已绑定活动。' : '活动已创建。');
        await loadMeets();
        navigate(`/activity/${result.activityId}`);
      } catch {
        setError('活动创建失败。');
      }
    },
    [isLoggedIn, loadMeets, navigate, openLogin, showToast],
  );

  const handleReport = useCallback(
    async (meet: Meet, reason: string) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      try {
        await dataService.createReport({
          targetType: 'meet',
          targetId: meet.id,
          reason,
          description: `约练发起人：${meet.username}`,
        });
        showToast('举报已提交。');
      } catch {
        setError('举报提交失败。');
      }
    },
    [isLoggedIn, openLogin, showToast],
  );

  const handleBlockUser = useCallback(
    async (userId: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      try {
        await dataService.blockUser(userId);
        setBlockedUserIds((prev) => [...new Set([...prev, userId])]);
        setSelectedMeetId(null);
        showToast('已拉黑该用户。');
      } catch {
        setError('拉黑失败。');
      }
    },
    [isLoggedIn, openLogin, showToast],
  );

  return (
    <div className="app-social-page app-social-page--meet min-h-screen bg-[#f7f4f1] text-ink">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5">
        <div className="mx-auto flex max-w-7xl items-start gap-2 text-xs text-amber-800 sm:items-center">
          <span className="mt-0.5 shrink-0 text-sm sm:mt-0">!</span>
          <span className="leading-relaxed">
            <span className="font-bold">安全提示：</span>
            首次见面优先选择学校、健身房、商场、公园等公共场所，出发前确认时间、地点和参与者。
          </span>
        </div>
      </div>

      <div className="border-b border-[#e5ddd5] bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime text-white shadow-sm">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-black text-[#1a1208]">附近约练</h1>
              <p className="text-xs text-[#8b6a54]">
                {filteredMeets.length > 0
                  ? `${filteredMeets.length} 场活动可加入`
                  : '查找附近的运动约练'}
                {userLocation && <span className="ml-2 text-lime">· 已定位</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg border border-[#e5ddd5] bg-white px-3 py-2 text-xs font-bold text-[#76543e] transition hover:border-lime/40 hover:text-lime disabled:opacity-60"
              onClick={handleUseMyLocation}
              disabled={isLocating}
            >
              {isLocating ? '定位中' : '附近排序'}
            </button>
            <button
              className="flex items-center gap-1 rounded-lg bg-lime px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-brand2"
              onClick={() => (isLoggedIn ? setShowCreateModal(true) : openLogin())}
            >
              <span className="text-sm leading-none">+</span>
              发起约练
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button className="font-black underline" onClick={() => void loadMeets()}>
              重试
            </button>
          </div>
        </div>
      )}

      {(tripShareMeet || tripShareError) && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8">
          {tripShareError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {tripShareError}
            </div>
          ) : tripShareMeet ? (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm sm:p-5">
              <h3 className="mb-2 text-lg font-black text-[#1a1208]">{tripShareMeet.title}</h3>
              <p className="text-sm text-[#76543e]">
                {tripShareMeet.time || '时间待定'} · {tripShareMeet.loc || '地点待定'}
              </p>
              <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                安全提示：优先选择白天和公共场所见面，提前告知亲友行程。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-lime px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-brand2"
                  onClick={() => handleJoin(tripShareMeet.id)}
                >
                  申请加入
                </button>
                {tripShareMeet.lat && tripShareMeet.lng ? (
                  <a
                    className="rounded-lg border border-[#e5ddd5] bg-white px-4 py-2 text-xs font-black text-[#76543e] transition hover:border-lime/40 hover:text-lime"
                    href={`https://uri.amap.com/marker?position=${tripShareMeet.lng},${tripShareMeet.lat}&name=${encodeURIComponent(tripShareMeet.title || '集合点')}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    打开地图
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-8">
        {isLoading ? (
          <aside className="space-y-3 rounded-2xl border border-[#e5ddd5] bg-white p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <MeetCardSkeleton key={index} />
            ))}
          </aside>
        ) : (
          <MeetSidebar
            distanceFilter={distanceFilter}
            filter={filter}
            meets={filteredMeets}
            selectedId={selectedMeet?.id ?? null}
            onCreate={() => (isLoggedIn ? setShowCreateModal(true) : openLogin())}
            onDistanceChange={setDistanceFilter}
            onFilterChange={setFilter}
            onJoin={handleJoin}
            onSelect={setSelectedMeetId}
          />
        )}

        <section className="min-h-[620px] rounded-2xl border border-[#e5ddd5] bg-white p-4 shadow-sm md:p-6">
          <MeetDetail
            joinedMeetIds={joinedMeets}
            meet={selectedMeet}
            userLocation={userLocation}
            onBlockUser={handleBlockUser}
            onCancelMeet={handleCancelMeet}
            onConfirmParticipant={handleConfirmParticipant}
            onCreate={() => (isLoggedIn ? setShowCreateModal(true) : openLogin())}
            onCreateTripShare={handleCreateTripShare}
            onCreateActivity={handleCreateActivity}
            onJoin={handleJoin}
            onReport={handleReport}
          />
        </section>
      </div>

      <CreateMeetModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateSubmit}
      />

      {successMsg && (
        <div className="fixed left-1/2 top-24 z-[100] -translate-x-1/2 rounded-xl bg-lime px-6 py-3 text-sm font-black text-white shadow-glow">
          {successMsg}
        </div>
      )}
    </div>
  );
};
