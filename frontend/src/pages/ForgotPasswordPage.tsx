import { Link } from 'react-router-dom';

export const ForgotPasswordPage = () => (
  <div className="flex min-h-[calc(100vh-72px)] flex-col items-center justify-center px-4">
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-10 text-center">
      <div className="flex items-center justify-center mb-6">
        <span className="flex items-center justify-center w-16 h-16 text-3xl rounded-xl bg-lime/20">
          🔑
        </span>
      </div>
      <h1 className="mb-3 text-2xl font-black font-display text-cream">找回密码</h1>
      <p className="mb-6 text-sm leading-relaxed text-textMuted">
        密码找回功能正在完善中。如需重置密码，请发送邮件至客服邮箱，我们会在 24 小时内回复并协助处理。
      </p>
      <a
        href="mailto:15253005312@163.com"
        className="block px-6 py-3 mb-4 text-sm font-black text-white transition rounded-lg bg-lime hover:bg-brand2 hover:shadow-glow"
      >
        发送邮件给客服
      </a>
      <Link
        to="/"
        className="text-sm font-bold transition text-textMuted hover:text-lime"
        replace
      >
        返回首页
      </Link>
    </div>
  </div>
);
