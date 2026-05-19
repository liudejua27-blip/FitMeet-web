import { ProfileSettings } from '../components/profile/ProfileSettings';
import { useAuthStore } from '../stores';

export const ProfilePage = () => {
  const { user, openLogin, refreshProfile } = useAuthStore();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0c0d] px-6">
        <div className="space-y-4 text-center">
          <p className="text-lg text-textMuted">请先登录查看个人设置</p>
          <button
            onClick={openLogin}
            className="rounded-lg bg-lime px-6 py-2 font-bold text-white transition hover:bg-brand2"
          >
            登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0c0d] pb-20 text-white">
      <div className="border-b border-white/10 bg-[#100b08]/80 px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.26em] text-lime">
            Profile Settings
          </p>
          <h1 className="mt-2 text-3xl font-black">我的设置</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">
            个人页已简化为设置中心。这里保留账号、安全认证、紧急联系人、隐私与协议入口。
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 pt-6">
        <ProfileSettings
          profile={user}
          onVerificationApproved={refreshProfile}
        />
      </main>
    </div>
  );
};
