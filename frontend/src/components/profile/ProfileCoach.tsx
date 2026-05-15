import { memo, useCallback, useState } from 'react';
import type { UserProfile } from '../../types';
import { StarRating } from '../coach/StarRating';
import { InfoItemStacked, StatBox } from '../ui';
import { useAuthStore, useNotificationStore } from '../../stores';

interface ProfileCoachProps {
  profile: UserProfile;
}

export const ProfileCoach = memo(function ProfileCoach({
  profile,
}: ProfileCoachProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [editSpecialty, setEditSpecialty] = useState(
    profile.coachSpecialty || '',
  );
  const [editExperience, setEditExperience] = useState(
    profile.coachExperience || '',
  );
  const [successMsg, setSuccessMsg] = useState('');
  const { updateProfile } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const handleSaveCoachInfo = useCallback(() => {
    updateProfile({
      coachSpecialty: editSpecialty.trim() || profile.coachSpecialty,
      coachExperience: editExperience.trim() || profile.coachExperience,
    });
    addNotification({
      type: 'system',
      username: '系统',
      avatar: 'S',
      color: '#38BDF8',
      text: '教练资料已更新',
      time: '刚刚',
    });
    setIsEditing(false);
    setSuccessMsg('教练资料已更新');
    setTimeout(() => setSuccessMsg(''), 3000);
  }, [editSpecialty, editExperience, profile, updateProfile, addNotification]);

  if (!profile.isCoach) {
    return (
      <div className="space-y-4 py-12 text-center">
        <span className="text-5xl">🏋️</span>
        <h3 className="font-display text-lg font-bold">成为公益教练</h3>
        <p className="mx-auto max-w-sm text-sm text-textMuted">
          分享你的专业知识，帮助更多人安全运动。FitMeet 免费版不收取平台费用。
        </p>
        <button className="rounded-xl bg-lime px-6 py-3 font-bold text-white transition hover:bg-brand2">
          申请教练认证
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">教练信息</h3>
          <span className="rounded-full bg-lime/10 px-3 py-1 text-xs font-bold text-lime">
            已认证
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <InfoItemStacked
            label="专业方向"
            value={profile.coachSpecialty || '未填写'}
          />
          <InfoItemStacked
            label="执教经验"
            value={profile.coachExperience || '未填写'}
          />
          <InfoItemStacked label="服务方式" value="免费预约交流" />
          <div>
            <div className="mb-1 text-xs text-textMuted">综合评分</div>
            <div className="flex items-center gap-2">
              <StarRating rating={profile.coachRating || 0} />
              <span className="text-sm font-bold text-lime">
                {profile.coachRating?.toFixed(1) || '暂无'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatBox
          icon="👥"
          value={profile.coachStudents?.toString() || '0'}
          label="帮助人数"
          size="lg"
        />
        <StatBox
          icon="📅"
          value={profile.coachExperience?.replace(/[^\d]/g, '') || '0'}
          label="经验年数"
          size="lg"
        />
        <StatBox icon="✅" value="免费" label="平台模式" size="lg" />
      </div>

      {profile.coachCerts && profile.coachCerts.length > 0 && (
        <div>
          <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
            🎖️ 资质证书
          </h3>
          <div className="space-y-3">
            {profile.coachCerts.map((cert, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-borderStrong"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime/10 text-lg text-lime">
                  📐
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{cert}</div>
                  <div className="text-xs text-textMuted">已验证</div>
                </div>
                <span className="text-xs text-green-400">有效</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          className="flex-1 cursor-pointer rounded-xl bg-lime py-3 text-sm font-bold text-white transition hover:bg-brand2"
          onClick={() => setIsEditing(true)}
        >
          编辑教练资料
        </button>
        <button
          className="flex-1 cursor-pointer rounded-xl border border-border py-3 text-sm font-bold text-textSecondary transition hover:border-borderStrong"
          onClick={() => setShowSessions(true)}
        >
          查看交流安排
        </button>
      </div>

      {isEditing && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setIsEditing(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-white">
              编辑教练资料
            </h3>
            <div>
              <label className="mb-1 block text-xs text-textMuted">
                专业方向
              </label>
              <input
                type="text"
                value={editSpecialty}
                onChange={(e) => setEditSpecialty(e.target.value)}
                className="w-full rounded-lg border border-border bg-surfaceMuted px-4 py-2 text-sm text-white outline-none focus:border-lime/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-textMuted">
                执教经验
              </label>
              <input
                type="text"
                value={editExperience}
                onChange={(e) => setEditExperience(e.target.value)}
                className="w-full rounded-lg border border-border bg-surfaceMuted px-4 py-2 text-sm text-white outline-none focus:border-lime/30"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                className="flex-1 cursor-pointer rounded-lg border border-border py-2 text-sm text-textMuted transition hover:text-white"
                onClick={() => setIsEditing(false)}
              >
                取消
              </button>
              <button
                className="flex-1 cursor-pointer rounded-lg bg-lime py-2 text-sm font-bold text-white transition hover:bg-brand2"
                onClick={handleSaveCoachInfo}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {showSessions && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSessions(false)}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                交流安排
              </h3>
              <button
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-surfaceMuted text-textMuted transition hover:text-white"
                onClick={() => setShowSessions(false)}
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              {['周一力量交流', '周三有氧陪练', '周五拉伸放松', '周末综合体能'].map(
                (session, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-border bg-surfaceMuted p-4"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {session}
                      </div>
                      <div className="mt-1 text-xs text-textMuted">
                        {i < 2 ? '已排期' : '待排期'} · {3 + i} 名伙伴
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        i < 2
                          ? 'bg-green-400/10 text-green-400'
                          : 'bg-yellow-400/10 text-yellow-400'
                      }`}
                    >
                      {i < 2 ? '进行中' : '待确认'}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="fixed left-1/2 top-20 z-[100] -translate-x-1/2 animate-bounce rounded-xl bg-lime px-6 py-3 text-sm font-bold text-white shadow-glow">
          {successMsg}
        </div>
      )}
    </div>
  );
});
