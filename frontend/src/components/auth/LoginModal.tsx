import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores';
import { useModalA11y } from '../../hooks/useModalA11y';

const loginTabs = [
  { id: 'email', label: '📧 邮箱', icon: '📧' },
  { id: 'phone', label: '📱 手机号', icon: '📱' },
  { id: 'wechat', label: '💬 微信', icon: '💬' },
];

export const LoginModal = memo(function LoginModal() {
  const { showLoginModal, closeLogin, login, loginWithPhone, loginWithWechat, sendSmsCode, register, loading, error } = useAuthStore();
  const { containerRef, handleBackdropClick } = useModalA11y<HTMLDivElement>({ open: showLoginModal, onClose: closeLogin });
  const [tab, setTab] = useState('email');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [agreed, setAgreed] = useState(false);
  // Email/password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  // Countdown timer for SMS resend
  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            setCodeSent(false);
            clearInterval(countdownRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(countdownRef.current);
  }, [countdown]);

  const handleSendCode = useCallback(async () => {
    if (phone.length === 11 && !codeSent) {
      try {
        await sendSmsCode(phone);
        setCodeSent(true);
        setCountdown(60);
      } catch {
        // error is set in store
      }
    }
  }, [phone, codeSent, sendSmsCode]);

  const handleLogin = useCallback(async () => {
    if (tab === 'email' && email && password) {
      try {
        if (isRegister && name) {
          await register({ email, password, name });
        } else {
          await login({ email, password });
        }
      } catch {
        // error is set in store
      }
    } else if (tab === 'phone' && phone && code) {
      try {
        await loginWithPhone(phone, code);
      } catch {
        // error is set in store
      }
    } else if (tab === 'wechat') {
      try {
        // In dev mode, generate a unique code for simulated WeChat login
        const devCode = `dev_${Date.now()}`;
        await loginWithWechat(devCode);
      } catch {
        // error is set in store
      }
    }
  }, [tab, email, password, name, isRegister, phone, code, login, loginWithPhone, loginWithWechat, register]);

  if (!showLoginModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleBackdropClick}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="登录" className="relative w-full max-w-md mx-4 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in outline-none">
        {/* Header */}
        <div className="relative px-6 pt-8 pb-4 text-center">
          <button
            onClick={closeLogin}
            className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full text-textMuted hover:text-white hover:bg-surfaceMuted transition cursor-pointer"
          >
            ✕
          </button>
          <h2 className="text-2xl font-display font-extrabold text-white">
            欢迎来到 <span className="text-lime">FitMate</span>
          </h2>
          <p className="text-sm text-textMuted mt-1">找到你的健身搭子</p>
        </div>

        {/* Login Tabs */}
        <div className="flex border-b border-border mx-6">
          {loginTabs.map((t) => (
            <button
              key={t.id}
              className={`flex-1 py-3 text-sm font-display font-semibold transition cursor-pointer border-b-2 ${
                tab === t.id
                  ? 'text-lime border-lime'
                  : 'text-textMuted border-transparent hover:text-white'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Login Form */}
        <div className="p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {tab === 'email' && (
            <>
              <div className="space-y-3">
                {isRegister && (
                  <input
                    type="text"
                    placeholder="昵称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-3 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/40 transition"
                  />
                )}
                <input
                  type="email"
                  placeholder="邮箱地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-3 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/40 transition"
                />
                <input
                  type="password"
                  placeholder="密码（至少6位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surfaceMuted border border-border rounded-lg px-4 py-3 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/40 transition"
                />
              </div>

              <button
                className={`w-full py-3 rounded-full font-display font-bold text-sm transition cursor-pointer ${
                  email && password && agreed && (!isRegister || name)
                    ? 'bg-lime text-[#09090A] hover:bg-[#d4ff1a] hover:shadow-glow'
                    : 'bg-surfaceMuted text-textSofter cursor-not-allowed'
                }`}
                onClick={handleLogin}
                disabled={!email || !password || !agreed || (isRegister && !name) || loading}
              >
                {loading ? '处理中...' : isRegister ? '注册' : '登录'}
              </button>

              <button
                className="w-full text-xs text-textMuted hover:text-lime transition cursor-pointer"
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
              </button>
            </>
          )}

          {tab === 'phone' && (
            <>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-surfaceMuted border border-border rounded-lg text-sm text-textMuted">
                    +86
                  </span>
                  <input
                    type="tel"
                    placeholder="输入手机号"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    className="flex-1 bg-surfaceMuted border border-border rounded-lg px-4 py-3 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/40 transition"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="输入6位验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="flex-1 bg-surfaceMuted border border-border rounded-lg px-4 py-3 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/40 transition"
                  />
                  <button
                    className={`px-4 py-3 rounded-lg text-sm font-semibold transition cursor-pointer whitespace-nowrap ${
                      phone.length === 11 && !codeSent
                        ? 'bg-lime/15 text-lime border border-lime/30 hover:bg-lime/25'
                        : 'bg-surfaceMuted text-textSofter border border-border cursor-not-allowed'
                    }`}
                    onClick={handleSendCode}
                    disabled={phone.length !== 11 || codeSent || loading}
                  >
                    {codeSent ? `${countdown}s` : '获取验证码'}
                  </button>
                </div>
              </div>

              <button
                className={`w-full py-3 rounded-full font-display font-bold text-sm transition cursor-pointer ${
                  phone && code.length === 6 && agreed
                    ? 'bg-lime text-[#09090A] hover:bg-[#d4ff1a] hover:shadow-glow'
                    : 'bg-surfaceMuted text-textSofter cursor-not-allowed'
                }`}
                onClick={handleLogin}
                disabled={!phone || code.length !== 6 || !agreed || loading}
              >
                {loading ? '处理中...' : '登录 / 注册'}
              </button>
            </>
          )}

          {tab === 'wechat' && (
            <div className="text-center py-8">
              <div className="w-40 h-40 mx-auto bg-surfaceMuted rounded-xl border border-border flex items-center justify-center mb-4">
                <div className="text-5xl">💬</div>
              </div>
              <p className="text-sm text-textMuted mb-4">使用微信扫码登录</p>
              <button
                className={`w-full py-3 rounded-full font-display font-bold text-sm transition cursor-pointer ${
                  agreed
                    ? 'bg-[#07C160] text-white hover:bg-[#06ad56]'
                    : 'bg-surfaceMuted text-textSofter cursor-not-allowed'
                }`}
                onClick={handleLogin}
                disabled={!agreed || loading}
              >
                {loading ? '处理中...' : '微信登录'}
              </button>
            </div>
          )}

          {/* Agreement */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 accent-lime"
            />
            <span className="text-xs text-textSofter leading-relaxed">
              我已阅读并同意 <span className="text-lime cursor-pointer">《用户协议》</span> 和{' '}
              <span className="text-lime cursor-pointer">《隐私政策》</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
});
