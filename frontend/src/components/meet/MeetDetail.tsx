import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import type { Meet } from '../../data/mockData';
import { Avatar, Badge, Button, Tag } from '../ui';
import { useAuthStore, useMessageStore } from '../../stores';

interface MeetDetailProps {
  meet: Meet | null;
  onJoin: (id: number) => void;
  onCreate?: () => void;
}

export const MeetDetail = memo(function MeetDetail({ meet, onJoin, onCreate }: MeetDetailProps) {
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();
  const { startChat } = useMessageStore();
  const [shareToast, setShareToast] = useState(false);

  const handleJoin = useCallback(() => {
    if (meet) onJoin(meet.id);
  }, [meet, onJoin]);

  const handleShare = useCallback(() => {
    if (!meet) return;
    const shareUrl = `${window.location.origin}/meet?id=${meet.id}`;
    const shareText = `来 FitMate 一起约练「${meet.title}」！${meet.sport} · ${meet.loc}`;
    if (navigator.share) {
      navigator.share({ title: meet.title, text: shareText, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      });
    }
  }, [meet]);

  const handleMessage = useCallback(() => {
    if (!isLoggedIn) { openLogin(); return; }
    if (!meet) return;
    if (meet.userId) {
      startChat(meet.userId, meet.username, meet.username[0], meet.color);
      navigate('/messages');
    } else {
        console.warn('Meet userId missing');
    }
  }, [isLoggedIn, openLogin, meet, startChat, navigate]);

  const handleCreate = useCallback(() => {
    if (!isLoggedIn) { openLogin(); return; }
    if (onCreate) {
      onCreate();
    }
  }, [isLoggedIn, openLogin, onCreate]);

  // Empty state
  if (!meet) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 text-textMuted">
        <div className="text-6xl">📍</div>
        <div className="font-display font-bold text-lg text-textSofter">
          选择一个约练活动
        </div>
        <div className="text-sm">
          从左侧列表点击查看详情，或发起新的约练
        </div>
        <Button variant="primary" size="lg" className="mt-4" onClick={handleCreate}>
          + 发起约练
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <div className="text-[10px] font-mono uppercase tracking-widest text-lime mb-3">
          {meet.sport} · {meet.dist}
        </div>
        <h1 className="font-display font-extrabold text-2xl md:text-4xl leading-tight tracking-tight mb-3">
          {meet.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Tag variant="lime">{meet.price}</Tag>
          <Tag>{meet.level} 水平</Tag>
          <Tag>👥 {meet.maxSlots} 人上限</Tag>
        </div>
      </header>

      {/* Map Placeholder */}
      <div className="bg-surface border border-border rounded-2xl min-h-[200px] relative overflow-hidden flex items-center justify-center">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        {/* Location Pin */}
        <div className="absolute top-[30%] left-[35%] flex flex-col items-center z-10">
          <div className="w-3 h-3 rounded-full bg-lime shadow-[0_0_0_4px_rgba(200,255,0,0.2)]" />
          <span className="mt-1 font-mono text-[9px] text-lime tracking-wider whitespace-nowrap">
            {meet.loc.split(' ')[0]}
          </span>
        </div>

        {/* User Pin */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-[0_0_0_6px_rgba(68,136,255,0.2)]" />
          <span className="mt-1 font-mono text-[9px] text-blue-400 whitespace-nowrap">我的位置</span>
        </div>

        <span className="font-mono text-[11px] tracking-wider text-textMuted z-10">
          📍 {meet.loc} (地图加载中...)
        </span>
      </div>

      {/* User Card */}
      <div className="flex items-center gap-3.5 p-5 bg-surface border border-border rounded-2xl">
        <Avatar name={meet.username} color={meet.color} size="xl" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base mb-1">
            {meet.username}
            {meet.cert && <span className="text-lime ml-2">✓ 已认证</span>}
          </div>
          <div className="text-xs text-textMuted flex items-center gap-2.5">
            <span>⭐ {meet.rating} 评分</span>
            <span>约练 {meet.meetCount} 次</span>
            <span>粉丝 324</span>
          </div>
        </div>
        {meet.cert && (
          <Badge variant="lime" size="sm">视频认证</Badge>
        )}
        <Button variant="ghost" size="sm" onClick={handleMessage}>
          私信
        </Button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoBox label="时间" value={meet.time} />
        <InfoBox label="地点" value={meet.loc} small />
        <InfoBox label="费用" value={meet.price} highlight />
        <InfoBox label="剩余名额" value={`${meet.slots} / ${meet.maxSlots} 人`} highlight />
      </div>

      {/* Description */}
      <p className="text-sm leading-loose text-textMuted">
        {meet.desc}
      </p>

      {/* Participants */}
      <div>
        <div className="font-display font-bold text-sm mb-3.5 flex items-center gap-2">
          已加入的伙伴
          <span className="text-lime text-[13px]">{meet.participants.length} 人</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {meet.participants.map((name, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3.5 py-2 bg-surface border border-border rounded-full"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-display font-bold text-base"
                style={{ backgroundColor: `hsl(${name.charCodeAt(0) * 5 % 360}, 60%, 55%)` }}
              >
                {name[0]}
              </div>
              <span className="text-xs font-display font-semibold">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Bar */}
      <div className="flex items-center gap-2.5 p-3.5 bg-lime/5 border border-lime/15 rounded-xl">
        <span className="text-lg flex-shrink-0">🛡️</span>
        <p className="text-xs text-textMuted leading-relaxed">
          加入后可开启行程共享，发起者已通过视频真人认证，平台信用分 98 分。遇到紧急情况可随时触发 SOS。
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex gap-3 sticky bottom-6 pt-4">
        <Button variant="outline" size="lg" onClick={handleShare}>
          📤 分享
        </Button>
        <Button variant="primary" size="lg" className="flex-1" onClick={handleJoin}>
          立即加入 →
        </Button>
      </div>

      {/* Share Toast */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl bg-lime text-[#09090A] font-bold text-sm shadow-glow animate-bounce">
          ✅ 链接已复制到剪贴板
        </div>
      )}
    </div>
  );
});

const InfoBox = memo(function InfoBox({
  label,
  value,
  highlight = false,
  small = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div className="p-4 bg-surface border border-border rounded-xl">
      <div className="font-mono text-[9px] uppercase tracking-widest text-textMuted mb-1.5">
        {label}
      </div>
      <div className={cn(
        'font-display font-bold',
        small ? 'text-sm' : 'text-base',
        highlight && 'text-lime'
      )}>
        {value}
      </div>
    </div>
  );
});
