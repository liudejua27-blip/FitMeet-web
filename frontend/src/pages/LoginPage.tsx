import { type FormEvent, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores';

type AuthMode = 'login' | 'register';

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function LoginPage() {
  const navigate = useNavigate();
  const { error, isLoggedIn, loading, login, register } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    document.title = '登录 FitMeet | Social World';
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      navigate('/agent/profile', { replace: true });
    }
  }, [isLoggedIn, navigate]);

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
  };

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
        await register({ email: normalizedEmail, password, name: trimmedName });
      }
      navigate('/agent/profile', { replace: true });
    } catch {
      // Auth store keeps user-facing error text.
    }
  };

  return (
    <main className="login-page-shell">
      <section className="login-page-panel" aria-labelledby="login-page-title">
        <Link to="/" className="login-page-brand" aria-label="返回 FitMeet 首页">
          <span>
            <img src="/favicon-192.png" alt="FitMeet" width="40" height="40" />
          </span>
          <strong>FitMeet</strong>
        </Link>

        <div className="login-page-copy">
          <p>Social World Account</p>
          <h1 id="login-page-title">{mode === 'login' ? '登录 FitMeet' : '创建 FitMeet 账号'}</h1>
          <span>登录后同步你的会话、个人信息、安全确认和发现页操作。关键动作仍会先等你确认。</span>
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
          {mode === 'register' ? (
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
          ) : null}
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
              minLength={6}
              placeholder={mode === 'login' ? '输入密码' : '至少 6 位'}
              type="password"
            />
          </label>
          {localError || error ? (
            <div className="login-modal-error">{localError || error}</div>
          ) : null}
          <button type="submit" disabled={loading} className="login-modal-submit">
            {loading ? '正在进入...' : mode === 'login' ? '继续进入' : '创建并进入'}
          </button>
        </form>

        <div className="login-modal-footer">
          <button
            type="button"
            onClick={() => handleModeChange(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? '还没有账号' : '已有账号'}
          </button>
          <Link to="/forgot-password">忘记密码</Link>
        </div>
      </section>
    </main>
  );
}
