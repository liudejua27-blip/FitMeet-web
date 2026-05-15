import { memo, useCallback, useState } from 'react';
import type { UserProfile } from '../../types';
import { Button, Badge, SportVisual } from '../ui';

interface ProfileHeaderProps {
  profile: UserProfile;
  onEdit: () => void;
}

export const ProfileHeader = memo(function ProfileHeader({ profile, onEdit }: ProfileHeaderProps) {
  const [shareToast, setShareToast] = useState(false);

  const handleShare = useCallback(() => {
    const shareUrl = `${window.location.origin}/user/${profile.id}`;
    const shareText = `来看看 FitMeet 上的 ${profile.name} 的个人主页！`;
    if (navigator.share) {
      navigator.share({ title: `${profile.name} - FitMeet`, text: shareText, url: shareUrl }).catch(() => {});
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
      <div className="relative h-48 overflow-hidden md:h-56">
        <SportVisual className="h-full w-full rounded-none" label={profile.name} variant="gym" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,11,7,0.06),rgba(18,11,7,0.88))]" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-base to-transparent" />
      </div>

      {/* Profile Info */}
      <div className="max-w-4xl mx-auto px-6 -mt-16 relative z-10">
        <div className="flex flex-col md:flex-row items-start gap-5">
          {/* Avatar */}
          <div className="relative">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-base text-3xl font-display font-bold text-white shadow-card md:h-28 md:w-28"
              style={{ backgroundColor: profile.color }}
            >
              {profile.avatar}
            </div>
            {profile.singleCert && (
              <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-lg border-2 border-base bg-amber text-lg" title="单身认证">
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
                  className="rounded-lg border border-lime/20 bg-limeDim px-2.5 py-1 text-[11px] font-black text-lime"
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
        <div className="fixed left-1/2 top-20 z-[100] -translate-x-1/2 rounded-xl bg-lime px-6 py-3 text-sm font-bold text-white shadow-glow">
          ✅ 链接已复制到剪贴板
        </div>
      )}
    </div>
  );
});
