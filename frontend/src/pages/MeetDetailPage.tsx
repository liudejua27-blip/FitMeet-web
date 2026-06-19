import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MeetDetail } from '../components/meet';
import * as dataService from '../services/dataService';
import { useAuthStore, useNotificationStore } from '../stores';
import type { Meet } from '../types';

export function MeetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const meetId = Number.parseInt(id || '', 10);
  const { isLoggedIn, openLogin } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [meet, setMeet] = useState<Meet | null>(null);
  const [joinedMeetIds, setJoinedMeetIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMeet = useCallback(async () => {
    if (!Number.isFinite(meetId) || meetId <= 0) {
      setError('约练不存在');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      setMeet(await dataService.getMeetDetail(meetId));
    } catch {
      setMeet(null);
      setError('约练详情加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, [meetId]);

  useEffect(() => {
    void loadMeet();
  }, [loadMeet]);

  const handleJoin = useCallback(
    async (targetMeetId: number) => {
      if (!isLoggedIn) {
        openLogin();
        return;
      }
      if (joinedMeetIds.includes(targetMeetId)) return;
      try {
        await dataService.joinMeet(targetMeetId);
        setJoinedMeetIds((current) => [...current, targetMeetId]);
        addNotification({
          type: 'meet',
          username: meet?.username || '约练',
          avatar: (meet?.username || '约')[0],
          color: meet?.color || '#10a37f',
          text: `你已申请加入「${meet?.title || '约练'}」，等待发起人确认。`,
          time: '刚刚',
        });
        await loadMeet();
      } catch {
        setError('申请加入失败，请稍后重试。');
      }
    },
    [addNotification, isLoggedIn, joinedMeetIds, loadMeet, meet, openLogin],
  );

  const handleCreateActivity = useCallback(async (targetMeetId: number) => {
    try {
      const activity = await dataService.createMeetActivity(targetMeetId);
      navigate(`/activity/${activity.activityId}`);
    } catch {
      setError('创建活动失败，请稍后重试。');
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base text-sm text-textMuted">
        正在加载约练详情...
      </div>
    );
  }

  if (error && !meet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base px-6 text-cream">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-black text-white">{error}</h1>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-lime px-5 py-2 text-sm font-bold text-white"
              onClick={() => void loadMeet()}
            >
              重试
            </button>
            <Link
              to="/discover"
              className="rounded-lg border border-border px-5 py-2 text-sm font-bold text-textMuted"
            >
              返回发现
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base pb-16 text-cream">
      <div className="sticky top-0 z-30 border-b border-border bg-base/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <button
            type="button"
            className="text-sm font-bold text-textMuted transition hover:text-white"
            onClick={() => navigate(-1)}
          >
            ← 返回
          </button>
          <Link to="/discover" className="text-xs font-black text-lime">
            发现更多
          </Link>
        </div>
      </div>
      {error ? (
        <div className="mx-auto mt-4 max-w-6xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      <main className="mx-auto max-w-6xl px-5 py-6">
        <MeetDetail
          meet={meet}
          joinedMeetIds={joinedMeetIds}
          onJoin={handleJoin}
          onCreate={() => navigate('/social-request/new')}
          onCreateActivity={handleCreateActivity}
        />
      </main>
    </div>
  );
}

export default MeetDetailPage;
