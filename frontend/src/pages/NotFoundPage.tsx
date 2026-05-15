import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-2 font-display text-[120px] font-extrabold leading-none text-lime/20">
        404
      </div>
      <h1 className="mb-3 font-display text-2xl font-extrabold text-white">
        页面不存在
      </h1>
      <p className="mb-8 max-w-md text-sm leading-relaxed text-textMuted">
        你访问的页面可能已被移除、更名或暂时不可用。
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.history.back()}
          className="rounded-full border border-border px-6 py-2.5 font-display text-sm font-semibold text-white transition hover:border-borderStrong"
        >
          返回上页
        </button>
        <Link
          to="/"
          className="rounded-full bg-lime px-6 py-2.5 font-display text-sm font-bold text-white transition hover:shadow-glow"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
