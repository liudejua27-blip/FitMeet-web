import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // TODO: 接入 Sentry 等错误监控服务
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="mb-6 text-6xl" role="img" aria-label="错误">⚠️</div>
          <h1 className="mb-3 font-display text-2xl font-extrabold text-white">
            页面出了点问题
          </h1>
          <p className="mb-8 max-w-md text-sm leading-relaxed text-textMuted">
            抱歉，页面遇到了意外错误。你可以尝试刷新页面或返回首页。
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mb-6 max-w-lg overflow-auto rounded-xl border border-border bg-surface p-4 text-left text-xs text-red-400">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="rounded-full border border-border px-6 py-2.5 font-display text-sm font-semibold text-white transition hover:border-borderStrong"
            >
              重试
            </button>
            <a
              href="/"
              className="rounded-full bg-lime px-6 py-2.5 font-display text-sm font-bold text-white transition hover:shadow-glow"
            >
              返回首页
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
