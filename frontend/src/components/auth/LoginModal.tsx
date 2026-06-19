import { type FormEvent, useCallback, useState } from 'react';
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

  const resetLocalState = useCallback(() => {
    setPassword('');
    setLocalError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetLocalState();
    closeLogin();
  }, [closeLogin, resetLocalState]);

  const { containerRef, handleBackdropClick } = useModalA11y({
    open: showLoginModal,
    onClose: handleClose,
  });

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
  };

  if (!showLoginModal) return null;

  const title = mode === 'login' ? '回到 FitMeet' : '创建你的 FitMeet';
  const subtitle =
    mode === 'login'
      ? '继续你的约练、匹配和 Life Graph。'
      : '留下一个名字，让别人知道该怎么称呼你。';
  const submitLabel = mode === 'login' ? '继续进入' : '创建并进入';

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
      className="login-modal-shell"
      onMouseDown={handleBackdropClick}
    >
      <section
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        tabIndex={-1}
        className="login-modal-card"
      >
        <div className="login-modal-header">
          <div className="login-modal-brand">
            <span>
              <img src="/favicon-192.png" alt="FitMeet" width="36" height="36" />
            </span>
            <div>
              <strong>FitMeet</strong>
              <small>Human plans, held lightly</small>
            </div>
          </div>
          <button
            type="button"
            className="login-modal-close"
            aria-label="关闭登录窗口"
            onClick={handleClose}
          >
            ×
          </button>
        </div>

        <div className="login-modal-copy">
          <h2 id="login-modal-title">{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="login-modal-tabs" role="tablist" aria-label="账号入口">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              className={clsx(mode === item && 'is-active')}
              onClick={() => handleModeChange(item)}
            >
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form className="login-modal-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              <span>昵称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={32}
                placeholder="你的展示名"
              />
            </label>
          )}

          <label>
            <span>邮箱</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              type="email"
            />
          </label>

          <label>
            <span>密码</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              type="password"
              minLength={6}
              placeholder={mode === 'login' ? '输入密码' : '至少 6 位'}
            />
          </label>

          {(localError || error) && (
            <div className="login-modal-error">
              {localError || error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="login-modal-submit"
          >
            {loading ? '正在进入...' : submitLabel}
          </button>
        </form>

        <div className="login-modal-footer">
          <button
            type="button"
            onClick={() =>
              handleModeChange(mode === 'login' ? 'register' : 'login')
            }
          >
            {mode === 'login' ? '还没有账号' : '已有账号'}
          </button>
          <Link
            to="/forgot-password"
            onClick={handleClose}
          >
            忘记密码
          </Link>
        </div>

        <div className="login-modal-note" aria-hidden="true">
          <span>你的联系方式、精确位置和画像更新都不会自动公开。</span>
        </div>
      </section>
    </div>
  );
}
