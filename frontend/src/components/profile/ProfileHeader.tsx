import { memo, useCallback, useState } from 'react';
import type { UserProfile } from '../../types';
import { Button, Badge } from '../ui';

interface ProfileHeaderProps {
  profile: UserProfile;
  onEdit: () => void;
}

export const ProfileHeader = memo(function ProfileHeader({ profile, onEdit }: ProfileHeaderProps) {
  const [shareToast, setShareToast] = useState(false);

  const handleShare = useCallback(() => {
    const shareUrl = `${window.location.origin}/user/${profile.id}`;
    const shareText = `来看看 FitMate 上的 ${profile.name} 的个人主页！`;
    if (navigator.share) {
      navigator.share({ title: `${profile.name} - FitMate`, text: shareText, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      });
    }
  }, [profile.id, profile.name]);

  return (
    <div className="relative">
      {/* Cover Photo */}
      <div
        className="h-48 md:h-56 relative"
        style={{
          background: 'linear-gradient(135deg, #1a2200 0%, #0a1500 50%, #111113 100%)',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(200,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-base to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="max-w-4xl mx-auto px-6 -mt-16 relative z-10">
        <div className="flex flex-col md:flex-row items-start gap-5">
          {/* Avatar */}
          <div className="relative">
            <div
              className="w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center text-3xl font-display font-bold text-[#09090A] border-4 border-base shadow-card"
              style={{ backgroundColor: profile.color }}
            >
              {profile.avatar}
            </div>
            {profile.singleCert && (
              <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full w-8 h-8 flex items-center justify-center text-lg border-2 border-base" title="单身认证">
                ⭐
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display font-extrabold text-2xl md:text-3xl">{profile.name}</h1>
              <span className="text-lg">{profile.gender}</span>
              <span className="text-sm text-textMuted">{profile.age}岁</span>
              {profile.isCoach && <Badge variant="lime" size="sm">教练</Badge>}
            </div>
            <div className="text-sm text-textMuted mt-1.5 flex items-center gap-3">
              <span>📍 {profile.city}</span>
              <span>🏋️ {profile.gym}</span>
            </div>
            <p className="text-sm text-textMuted mt-2">{profile.bio}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-3">
              {profile.interestTags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-limeDim border border-lime/20 text-lime"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Social Stats */}
            <div className="flex items-center gap-6 mt-4 text-sm">
              <div>
                <span className="font-display font-bold text-white">{profile.followers}</span>
                <span className="text-textMuted ml-1">粉丝</span>
              </div>
              <div>
                <span className="font-display font-bold text-white">{profile.following}</span>
                <span className="text-textMuted ml-1">关注</span>
              </div>
              <div>
                <span className="font-display font-bold text-white">{profile.posts}</span>
                <span className="text-textMuted ml-1">动态</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 md:pt-4">
            <Button variant="primary" size="md" onClick={onEdit}>
              编辑资料
            </Button>
            <Button variant="outline" size="md" onClick={handleShare}>
              📤 分享
            </Button>
          </div>
        </div>
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
