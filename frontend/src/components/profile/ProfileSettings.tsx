import { memo, useState, useCallback } from 'react';
import type { UserProfile } from '../../types';

interface ProfileSettingsProps {
  profile: UserProfile;
}

interface SettingToggleProps {
  label: string;
  description: string;
  icon: string;
  defaultChecked?: boolean;
}

export const ProfileSettings = memo(function ProfileSettings({ profile }: ProfileSettingsProps) {
  return (
    <div className="space-y-6">
      {/* Safety & Verification */}
      <SettingSection title="🛡️ 安全与认证">
        <SettingToggle
          icon="🪪"
          label="实名认证"
          description="完成实名认证获得信任标识"
          defaultChecked={profile.verified}
        />
        <SettingToggle
          icon="📹"
          label="视频认证"
          description="通过视频验证真人身份"
        />
        <SettingToggle
          icon="📍"
          label="行程分享"
          description="约练期间自动分享行程给紧急联系人"
          defaultChecked
        />
        <SettingItem icon="📞" label="紧急联系人" value="已设置 1 人" action="编辑" />
        <SettingItem icon="🚨" label="举报中心" value="" action="进入" />
      </SettingSection>

      {/* Coach Mode */}
      <SettingSection title="🏋️ 教练模式">
        <SettingToggle
          icon="🎓"
          label="教练模式"
          description={profile.isCoach ? '你已开启教练身份' : '开启后可接受约课和约练'}
          defaultChecked={profile.isCoach}
        />
        {profile.isCoach && (
          <>
            <SettingItem icon="💳" label="收款方式" value="微信支付" action="修改" />
            <SettingItem icon="📊" label="收入明细" value={`¥${profile.coachIncome?.toLocaleString() || 0}`} action="查看" />
          </>
        )}
      </SettingSection>

      {/* Account */}
      <SettingSection title="⚙️ 账号设置">
        <SettingItem icon="📱" label="手机号" value="138****8888" action="修改" />
        <SettingItem icon="🔑" label="修改密码" value="" action="修改" />
        <SettingItem icon="🔔" label="通知设置" value="已开启" action="管理" />
        <SettingItem icon="🌐" label="隐私设置" value="" action="管理" />
        <SettingItem icon="📦" label="数据导出" value="" action="导出" />
      </SettingSection>

      {/* About */}
      <SettingSection title="ℹ️ 关于">
        <SettingItem icon="📄" label="用户协议" value="" action="查看" />
        <SettingItem icon="🔒" label="隐私政策" value="" action="查看" />
        <SettingItem icon="📧" label="联系我们" value="support@fitapp.cn" action="" />
        <SettingItem icon="📱" label="当前版本" value="v1.0.0" action="" />
      </SettingSection>

      {/* Logout */}
      <button className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 font-bold text-sm hover:bg-red-500/10 transition">
        退出登录
      </button>
    </div>
  );
});

const SettingSection = memo(function SettingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-display font-bold text-lg mb-3">{title}</h3>
      <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
        {children}
      </div>
    </div>
  );
});

const SettingToggle = memo(function SettingToggle({
  icon,
  label,
  description,
  defaultChecked = false,
}: SettingToggleProps) {
  const [checked, setChecked] = useState(defaultChecked);
  const toggle = useCallback(() => setChecked((c) => !c), []);

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-[10px] text-textMuted mt-0.5">{description}</div>
      </div>
      <button
        onClick={toggle}
        className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-lime' : 'bg-surfaceMuted'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
});

const SettingItem = memo(function SettingItem({
  icon,
  label,
  value,
  action,
}: {
  icon: string;
  label: string;
  value: string;
  action: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-surfaceMuted/50 transition cursor-pointer">
      <span className="text-xl">{icon}</span>
      <div className="flex-1 font-semibold text-sm">{label}</div>
      {value && <span className="text-xs text-textMuted">{value}</span>}
      {action && (
        <span className="text-xs text-lime font-bold">{action} ›</span>
      )}
    </div>
  );
});
