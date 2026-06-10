import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Coordinates } from '../../lib/amap';
import type { Meet } from '../../types';
import { useAuthStore, useMessageStore } from '../../stores';
import { triggerConfetti } from '../../lib/confetti';
import { Avatar, Badge, Button, Tag } from '../ui';
import { AmapMeetMap } from './AmapMeetMap';
import { AnonymousSwitch } from './AnonymousSwitch';

interface MeetDetailProps {
  meet: Meet | null;
  userLocation?: Coordinates | null;
  joinedMeetIds?: number[];
  onJoin: (id: number) => void;
  onCreate?: () => void;
  onConfirmParticipant?: (meetId: number, participantId: number) => void;
  onCancelMeet?: (meetId: number) => void;
  onCreateTripShare?: (meetId: number) => void;
  onCreateActivity?: (meetId: number) => void | Promise<void>;
  onReport?: (meet: Meet, reason: string) => void;
  onBlockUser?: (userId: number) => void;
}

export const MeetDetail = memo(function MeetDetail({
  joinedMeetIds = [],
  meet,
  onBlockUser,
  onCancelMeet,
  onConfirmParticipant,
  onCreate,
  onCreateTripShare,
  onCreateActivity,
  onJoin,
  onReport,
  userLocation,
}: MeetDetailProps) {
  const navigate = useNavigate();
  const { isLoggedIn, openLogin, user } = useAuthStore();
  const { startChat } = useMessageStore();
  const [shareToast, setShareToast] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const isOwner = Boolean(user?.id && meet?.userId === user.id);
  const myParticipation = useMemo(
    () => meet?.participantDetails?.find((participant) => participant.userId === user?.id),
    [meet?.participantDetails, user?.id],
  );
  const joined =
    hasJoined ||
    Boolean(meet && joinedMeetIds.includes(meet.id)) ||
    Boolean(myParticipation && myParticipation.status !== 'cancelled');
  const pendingParticipants = useMemo(
    () => meet?.participantDetails?.filter((participant) => participant.status === 'pending') ?? [],
    [meet?.participantDetails],
  );

  const handleJoin = useCallback(() => {
    if (!meet) return;
    onJoin(meet.id);
    setHasJoined(true);
    triggerConfetti(2600);
  }, [meet, onJoin]);

  const handleShare = useCallback(() => {
    if (!meet) return;
    const shareUrl = `${window.location.origin}/discover?id=${meet.id}`;
    const shareText = `来 FitMeet 一起约练「${meet.title}」：${meet.sport} · ${meet.loc}`;
    if (navigator.share) {
      navigator.share({ title: meet.title, text: shareText, url: shareUrl }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 2000);
    });
  }, [meet]);

  const handleMessage = useCallback(() => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    if (!meet?.userId) return;
    startChat(meet.userId, meet.username, meet.username[0], meet.color);
    navigate('/messages');
  }, [isLoggedIn, meet, navigate, openLogin, startChat]);

  const handleReport = useCallback(() => {
    if (!meet) return;
    const reason = window.prompt('请简要说明举报原因', '活动信息不实');
    if (reason?.trim()) onReport?.(meet, reason.trim());
  }, [meet, onReport]);

  if (!meet) {
    return (
      <div className="flex min-h-[560px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <div className="mb-4 text-6xl text-lime">⌖</div>
        <h2 className="font-display text-2xl font-black">选择一场约练</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-textMuted">从左侧活动队列查看详情，或者直接发起新的约练。</p>
        <Button className="mt-6" size="lg" onClick={onCreate}>
          发起约练
        </Button>
      </div>
    );
  }

  const location = typeof meet.lng === 'number' && typeof meet.lat === 'number' ? { lng: meet.lng, lat: meet.lat } : null;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-white/10 bg-[#fff8f0] p-5 text-ink shadow-card">
        <div className="mb-3 flex flex-wrap gap-2">
          <Tag variant="lime">{meet.sport}</Tag>
          <Tag>{meet.dist || '距离待计算'}</Tag>
          {meet.status === 'cancelled' && <Tag>已取消</Tag>}
        </div>
        <h1 className="font-display text-[clamp(28px,5vw,50px)] font-black leading-tight">{meet.title}</h1>
        <p className="mt-3 text-sm leading-7 text-[#76543e]">{meet.desc}</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <AmapMeetMap location={location} title={meet.loc} address={meet.address || meet.loc} userLocation={userLocation} />

          <section className="grid gap-3 sm:grid-cols-2">
            <InfoBox label="时间" value={meet.time} />
            <InfoBox label="地点" value={meet.loc} />
            <InfoBox label="费用" value={meet.price || '免费'} highlight />
            <InfoBox label="名额" value={`${meet.slots} / ${meet.maxSlots} 人`} highlight />
          </section>

          {isOwner && pendingParticipants.length > 0 && (
            <section className="rounded-2xl border border-amber/30 bg-amber/10 p-4">
              <h2 className="mb-3 text-sm font-black text-amber">待确认申请</h2>
              <div className="space-y-2">
                {pendingParticipants.map((participant) => (
                  <div key={participant.participantId} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={participant.name} color={participant.color} size="sm" />
                      <span className="text-sm font-black">{participant.name}</span>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => onConfirmParticipant?.(meet.id, participant.participantId)}>
                      确认
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="flex items-center gap-3">
              <Avatar name={meet.username} color={meet.color} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-black">{meet.username}</div>
                <div className="mt-1 text-xs font-bold text-textMuted">
                  {meet.rating} 分 · 约练 {meet.meetCount} 次
                </div>
              </div>
              {meet.cert && <Badge variant="lime">真人认证</Badge>}
            </div>
            {!isOwner && (
              <Button variant="outline" className="mt-4 w-full" onClick={handleMessage}>
                私信发起人
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-black">已确认伙伴</h2>
              <span className="text-xs font-black text-lime">{meet.participants.length} 人</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {meet.participants.map((name) => (
                <span key={name} className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold">
                  {name}
                </span>
              ))}
            </div>
          </section>

          {!joined && !isOwner && <AnonymousSwitch checked={isAnonymous} onChange={setIsAnonymous} />}

          <section className="rounded-2xl border border-lime/25 bg-lime/10 p-4 text-xs leading-6 text-textMuted">
            加入申请需要发起人确认。出发前可开启行程分享，遇到异常可举报活动或拉黑发起人。
          </section>

          <div className="grid gap-2">
            {joined ? (
              <Button size="lg" onClick={handleMessage}>
                进入约练私信
              </Button>
            ) : isOwner ? (
              <Button size="lg" onClick={onCreate}>
                继续发布新约练
              </Button>
            ) : (
              <Button size="lg" onClick={handleJoin}>
                申请加入
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleShare}>
                分享
              </Button>
              <Button variant="outline" onClick={() => onCreateTripShare?.(meet.id)}>
                行程分享
              </Button>
            </div>
            {/* Activity lifecycle entries (统一约练 / 活动) */}
            {(isOwner && meet.status === 'matched') ||
            (meet.activityId && (isOwner || joined)) ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-lime/30 bg-lime/5 p-2">
                {isOwner && meet.status === 'matched' && !meet.activityId && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await onCreateActivity?.(meet.id);
                    }}
                  >
                    创建活动
                  </Button>
                )}
                {meet.activityId ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/activity/${meet.activityId}`)}
                    >
                      查看活动
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/activity/${meet.activityId}?action=check-in`)}
                    >
                      到场签到
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/activity/${meet.activityId}?action=upload-proof`)}
                    >
                      上传证明
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/activity/${meet.activityId}?action=complete`)}
                    >
                      确认完成
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/activity/${meet.activityId}?action=review`)}
                    >
                      评价
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            {!isOwner && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={handleReport}>
                  举报
                </Button>
                {meet.userId && (
                  <Button variant="ghost" onClick={() => onBlockUser?.(meet.userId as number)}>
                    拉黑
                  </Button>
                )}
              </div>
            )}
            {(isOwner || joined) && (
              <Button variant="ghost" onClick={() => onCancelMeet?.(meet.id)}>
                {isOwner ? '取消活动' : '取消申请'}
              </Button>
            )}
          </div>
        </aside>
      </div>

      {shareToast && (
        <div className="fixed left-1/2 top-24 z-[100] -translate-x-1/2 rounded-xl bg-lime px-6 py-3 text-sm font-black text-white shadow-glow">
          链接已复制
        </div>
      )}
    </div>
  );
});

const InfoBox = memo(function InfoBox({
  highlight = false,
  label,
  value,
}: {
  highlight?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <div className="mb-1 text-[11px] font-black text-textMuted">{label}</div>
      <div className={highlight ? 'font-display text-lg font-black text-lime' : 'font-display text-lg font-black text-cream'}>
        {value}
      </div>
    </div>
  );
});
