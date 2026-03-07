import { memo, useState, useCallback } from 'react';
import type { UserProfile } from '../../types';
import { StarRating } from '../coach/StarRating';
import { StatBox, InfoItemStacked } from '../ui';
import { useAuthStore, useNotificationStore } from '../../stores';

interface ProfileCoachProps {
  profile: UserProfile;
}

export const ProfileCoach = memo(function ProfileCoach({ profile }: ProfileCoachProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showCourses, setShowCourses] = useState(false);
  const [editSpecialty, setEditSpecialty] = useState(profile.coachSpecialty || '');
  const [editPrice, setEditPrice] = useState(profile.coachPrice?.toString() || '');
  const [editExperience, setEditExperience] = useState(profile.coachExperience || '');
  const [successMsg, setSuccessMsg] = useState('');
  const { updateProfile } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const handleSaveCoachInfo = useCallback(() => {
    updateProfile({
      coachSpecialty: editSpecialty.trim() || profile.coachSpecialty,
      coachPrice: Number(editPrice) || profile.coachPrice,
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
    setSuccessMsg('教练资料已更新！');
    setTimeout(() => setSuccessMsg(''), 3000);
  }, [editSpecialty, editPrice, editExperience, profile, updateProfile, addNotification]);
  if (!profile.isCoach) {
    return (
      <div className="text-center py-12 space-y-4">
        <span className="text-5xl">🏋️</span>
        <h3 className="font-display font-bold text-lg">成为教练</h3>
        <p className="text-sm text-textMuted max-w-sm mx-auto">
          分享你的专业知识，帮助更多人实现健身目标，同时获得额外收入。
        </p>
        <button className="px-6 py-3 rounded-xl bg-lime text-[#09090A] font-bold hover:bg-[#d4ff1a] transition">
          申请教练认证
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Coach Overview */}
      <div className="p-5 bg-surface border border-border rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg">教练信息</h3>
          <span className="px-3 py-1 bg-lime/10 text-lime text-xs font-bold rounded-full">
            已认证
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <InfoItemStacked label="专业方向" value={profile.coachSpecialty || '—'} />
          <InfoItemStacked label="执教经验" value={profile.coachExperience || '—'} />
          <InfoItemStacked label="课程价格" value={profile.coachPrice ? `¥${profile.coachPrice}/节` : '—'} />
          <div>
            <div className="text-xs text-textMuted mb-1">综合评分</div>
            <div className="flex items-center gap-2">
              <StarRating rating={profile.coachRating || 0} />
              <span className="text-sm font-bold text-lime">{profile.coachRating?.toFixed(1) || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatBox icon="👨‍🎓" value={profile.coachStudents?.toString() || '0'} label="学员数" size="lg" />
        <StatBox icon="📅" value={profile.coachExperience?.replace(/[^\d]/g, '') || '0'} label="执教年数" size="lg" />
        <StatBox
          icon="💰"
          value={profile.coachIncome ? `¥${(profile.coachIncome / 1000).toFixed(1)}k` : '¥0'}
          label="累计收入"
          size="lg"
        />
      </div>

      {/* Certifications */}
      {profile.coachCerts && profile.coachCerts.length > 0 && (
        <div>
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
            🎖️ 资质证书
          </h3>
          <div className="space-y-3">
            {profile.coachCerts.map((cert, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-4 bg-surface border border-border rounded-xl hover:border-borderStrong transition"
              >
                <div className="w-10 h-10 rounded-lg bg-lime/10 flex items-center justify-center text-lime text-lg">
                  📜
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{cert}</div>
                  <div className="text-xs text-textMuted">已验证</div>
                </div>
                <span className="text-green-400 text-xs">✓ 有效</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex gap-3">
        <button
          className="flex-1 py-3 rounded-xl bg-lime text-[#09090A] font-bold hover:bg-[#d4ff1a] transition text-sm cursor-pointer"
          onClick={() => setIsEditing(true)}
        >
          编辑教练资料
        </button>
        <button
          className="flex-1 py-3 rounded-xl border border-border text-textSecondary font-bold hover:border-borderStrong transition text-sm cursor-pointer"
          onClick={() => setShowCourses(true)}
        >
          查看课程管理
        </button>
      </div>

      {/* Edit Coach Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsEditing(false)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-display font-bold text-white">编辑教练资料</h3>
            <div>
              <label className="text-xs text-textMuted mb-1 block">专业方向</label>
              <input
                type="text"
                value={editSpecialty}
                onChange={e => setEditSpecialty(e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-lime/30"
              />
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">课程价格 (¥/节)</label>
              <input
                type="number"
                value={editPrice}
                onChange={e => setEditPrice(e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-lime/30"
              />
            </div>
            <div>
              <label className="text-xs text-textMuted mb-1 block">执教经验</label>
              <input
                type="text"
                value={editExperience}
                onChange={e => setEditExperience(e.target.value)}
                className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-2 text-sm text-white outline-none focus:border-lime/30"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                className="flex-1 py-2 rounded-lg border border-border text-textMuted text-sm hover:text-white transition cursor-pointer"
                onClick={() => setIsEditing(false)}
              >
                取消
              </button>
              <button
                className="flex-1 py-2 rounded-lg bg-lime text-[#09090A] text-sm font-bold hover:bg-[#d4ff1a] transition cursor-pointer"
                onClick={handleSaveCoachInfo}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Course Management Modal */}
      {showCourses && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCourses(false)}>
          <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-white">课程管理</h3>
              <button
                className="w-8 h-8 rounded-full bg-surfaceMuted flex items-center justify-center text-textMuted hover:text-white transition cursor-pointer"
                onClick={() => setShowCourses(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {['周一力量训练', '周三有氧课程', '周五拉伸放松', '周末综合体能'].map((course, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-surfaceMuted border border-border rounded-xl">
                  <div>
                    <div className="font-semibold text-sm text-white">{course}</div>
                    <div className="text-xs text-textMuted mt-1">
                      {i < 2 ? '已排期' : '待排期'} · {3 + i} 名学员
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${i < 2 ? 'text-green-400 bg-green-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                    {i < 2 ? '进行中' : '待确认'}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-textSofter text-center pt-2">
              更多课程管理功能即将上线
            </p>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {successMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl bg-lime text-[#09090A] font-bold text-sm shadow-glow animate-bounce">
          ✅ {successMsg}
        </div>
      )}
    </div>
  );
});


