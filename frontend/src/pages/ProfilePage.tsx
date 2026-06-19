import { Link } from 'react-router-dom';
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
    <div className="profile-control-page min-h-screen pb-20 text-white">
      <div className="profile-control-hero px-6 py-8">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.26em] text-lime">
              Trust & Profile Center
            </p>
            <h1 className="mt-2 text-3xl font-black">我的 FitMeet 信任中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-textMuted">
              这里帮你把公开身份、私密偏好和账号安全分开管理。你可以清楚知道哪些信息会展示给别人，哪些只用于匹配，哪些可以随时撤回。
            </p>
          </div>
          <div className="profile-control-identity">
            <span style={{ background: user.color || '#18b98f' }}>
              {(user.name || 'F').slice(0, 1)}
            </span>
            <div>
              <strong>{user.name || 'FitMeet 用户'}</strong>
              <small>
                {user.city || '未设置城市'} · {user.verified ? '已实名认证' : '未实名认证'}
              </small>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 pt-6">
        <section className="profile-control-summary" aria-label="账号状态概览">
          <article>
            <span>私密偏好</span>
            <strong>{user.interestTags?.length ? `${user.interestTags.length} 个已确认信号` : '等待你确认'}</strong>
            <p>兴趣、边界和长期偏好默认不公开，只在匹配时使用，并且可以撤回。</p>
          </article>
          <article>
            <span>安全认证</span>
            <strong>{user.verified ? '已认证' : '可提升信任'}</strong>
            <p>认证会帮助别人更放心地回应你，不会默认公开证件信息。</p>
          </article>
          <article>
            <span>公开身份</span>
            <strong>{user.posts ? `${user.posts} 条公开动态` : '还没有公开动态'}</strong>
            <p>你可以只展示昵称、城市和兴趣；精确位置、联系方式不会自动公开。</p>
          </article>
        </section>

        <section className="profile-trust-explainer" aria-label="资料完善说明">
          <article>
            <span>为什么完善</span>
            <p>资料越清楚，Agent 越能帮你找到时间、兴趣和边界都合适的人，而不是泛泛推荐陌生人。</p>
          </article>
          <article>
            <span>你能得到什么</span>
            <p>更准确的候选解释、开场白建议、约练活动推荐，以及更少的无效打扰。</p>
          </article>
          <article>
            <span>如何撤回</span>
            <p>进入 Life Graph 可以导出、删除或撤回记忆。高风险动作仍会先等你确认。</p>
          </article>
        </section>

        <Link
          to="/profile/life-graph"
          className="profile-control-lifegraph mb-5 block rounded-2xl border border-lime/25 bg-limeDim p-5 transition hover:border-lime/50"
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-lime">Life Graph</p>
          <h2 className="mt-2 text-xl font-black text-white">进入 AI 生活画像控制台</h2>
          <p className="mt-2 text-sm leading-6 text-textMuted">
            查看、编辑、确认和撤回 Agent 用于匹配、安全边界和多端同步的长期画像。
          </p>
        </Link>
        <ProfileSettings
          profile={user}
          onVerificationApproved={refreshProfile}
        />
      </main>
    </div>
  );
};
