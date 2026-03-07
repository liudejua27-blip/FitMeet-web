import { memo } from 'react';
import type { UserProfile } from '../../types';

interface ProfileStatsProps {
  profile: UserProfile;
}

export const ProfileStats = memo(function ProfileStats({ profile }: ProfileStatsProps) {
  return (
    <div className="space-y-6">
      {/* Training Summary */}
      <div>
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          📊 健身档案
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <BigStatCard value={profile.trainingDays.toString()} label="训练天数" unit="天" color="lime" />
          <BigStatCard value={profile.trainingCount.toString()} label="训练次数" unit="次" />
          <BigStatCard value={(profile.caloriesBurned / 1000).toFixed(1)} label="消耗卡路里" unit="千卡" color="orange" />
        </div>
      </div>

      {/* Best Records */}
      <div>
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          🏆 个人最佳
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {profile.bestRecords.map((record, i) => (
            <div key={i} className="p-4 bg-surface border border-border rounded-xl text-center hover:border-borderStrong transition">
              <div className="font-display font-extrabold text-xl text-lime">{record.value}</div>
              <div className="text-xs text-textMuted mt-1">{record.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Before/After placeholder */}
      <div>
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          📸 身材变化
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="aspect-[3/4] rounded-xl bg-surfaceMuted border border-border flex flex-col items-center justify-center text-textMuted hover:border-borderStrong transition cursor-pointer">
            <span className="text-4xl mb-2">📷</span>
            <span className="text-sm font-semibold">Before</span>
            <span className="text-[10px] text-textSofter mt-1">点击上传</span>
          </div>
          <div className="aspect-[3/4] rounded-xl bg-surfaceMuted border border-border flex flex-col items-center justify-center text-textMuted hover:border-borderStrong transition cursor-pointer">
            <span className="text-4xl mb-2">📷</span>
            <span className="text-sm font-semibold">After</span>
            <span className="text-[10px] text-textSofter mt-1">点击上传</span>
          </div>
        </div>
      </div>

      {/* Weekly Activity Chart */}
      <div>
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          📅 本周训练
        </h3>
        <div className="flex items-end gap-2 h-32 p-4 bg-surface border border-border rounded-xl">
          {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => {
            const height = [60, 80, 45, 90, 70, 100, 30][i];
            const isToday = i === 0;
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md transition ${isToday ? 'bg-lime' : 'bg-lime/30'}`}
                  style={{ height: `${height}%` }}
                />
                <span className={`text-[10px] ${isToday ? 'text-lime font-bold' : 'text-textMuted'}`}>
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const BigStatCard = memo(function BigStatCard({
  value,
  label,
  unit,
  color = 'white',
}: {
  value: string;
  label: string;
  unit: string;
  color?: string;
}) {
  return (
    <div className="p-5 bg-surface border border-border rounded-xl text-center">
      <div className={`font-display font-extrabold text-3xl ${color === 'lime' ? 'text-lime' : color === 'orange' ? 'text-orange-400' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-xs text-textMuted mt-1">{label}</div>
      <div className="text-[10px] text-textSofter">{unit}</div>
    </div>
  );
});
