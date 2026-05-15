import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useAuthStore } from '../../stores';

type AuthMode = 'login' | 'register';

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function LoginModal() {
  const {
    showLoginModal,
    loading,
    error,
    login,
    register,
    closeLogin,
  } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const { containerRef, handleBackdropClick } = useModalA11y({
    open: showLoginModal,
    onClose: closeLogin,
  });

  useEffect(() => {
    if (!showLoginModal) {
      setPassword('');
      setLocalError(null);
      return;
    }
    setLocalError(null);
  }, [showLoginModal, mode]);

  if (!showLoginModal) return null;

  const title = mode === 'login' ? '登录 FitMeet' : '创建 FitMeet 账号';
  const submitLabel = mode === 'login' ? '登录' : '注册并登录';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    const trimmedName = name.trim();

    if (!normalizedEmail || !password) {
      setLocalError('请输入邮箱和密码');
      return;
    }
    if (mode === 'register' && !trimmedName) {
      setLocalError('请输入昵称');
      return;
    }

    try {
      setLocalError(null);
      if (mode === 'login') {
        await login({ email: normalizedEmail, password });
      } else {
        await register({
          email: normalizedEmail,
          password,
          name: trimmedName,
        });
      }
    } catch {
      // The store keeps the user-facing error text.
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-md"
      onMouseDown={handleBackdropClick}
    >
      <section
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        tabIndex={-1}
        className="w-full max-w-[430px] rounded-xl border border-white/10 bg-[#15100d] p-5 text-cream shadow-2xl outline-none sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-lime">
              FitMeet
            </p>
            <h2 id="login-modal-title" className="mt-2 text-2xl font-black">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-xl leading-none text-textMuted transition hover:border-lime/40 hover:text-cream"
            aria-label="关闭登录窗口"
            onClick={closeLogin}
          >
            x
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={clsx(
                'rounded-md px-3 py-2 text-sm font-black transition',
                mode === item
                  ? 'bg-lime text-white shadow-glow'
                  : 'text-textMuted hover:text-cream',
              )}
              onClick={() => setMode(item)}
            >
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="grid gap-2 text-sm font-bold text-textMuted">
              昵称
              <input
                className="h-12 rounded-lg border border-white/10 bg-black/30 px-4 text-base text-cream outline-none transition placeholder:text-textSofter focus:border-lime/60"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={32}
                placeholder="你的展示名"
              />
            </label>
          )}

          <label className="grid gap-2 text-sm font-bold text-textMuted">
            邮箱
            <input
              className="h-12 rounded-lg border border-white/10 bg-black/30 px-4 text-base text-cream outline-none transition placeholder:text-textSofter focus:border-lime/60"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold text-textMuted">
            密码
            <input
              className="h-12 rounded-lg border border-white/10 bg-black/30 px-4 text-base text-cream outline-none transition placeholder:text-textSofter focus:border-lime/60"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              type="password"
              minLength={6}
              placeholder={mode === 'login' ? '输入密码' : '至少 6 位'}
            />
          </label>

          {(localError || error) && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 h-12 rounded-lg bg-lime px-5 text-sm font-black text-white transition hover:bg-brand2 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '处理中...' : submitLabel}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="font-bold text-lime transition hover:text-brand2"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？去登录'}
          </button>
          <Link
            to="/forgot-password"
            className="font-bold text-textMuted transition hover:text-cream"
            onClick={closeLogin}
          >
            忘记密码
          </Link>
        </div>
      </section>
    </div>
  );
}
