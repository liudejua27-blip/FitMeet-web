import { memo, useEffect, useMemo, useState } from 'react';
import {
  waitlistApi,
  type InviteCodeDto,
  type WaitlistEntry,
  type WaitlistStats,
} from '../api/waitlistApi';
import { WebsiteLayout } from '../components/website/WebsitePlatform';

export const AdminWaitlistPage = memo(function AdminWaitlistPage() {
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCodeDto[]>([]);
  const [q, setQ] = useState('');
  const [qualityLevel, setQualityLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [statsResult, listResult, invitesResult] = await Promise.all([
        waitlistApi.getStats(),
        waitlistApi.listAdmin({ q, qualityLevel: qualityLevel as never, limit: 50 }),
        waitlistApi.listInviteCodes(),
      ]);
      setStats(statsResult);
      setEntries(listResult.data);
      setInviteCodes(invitesResult);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const csv = useMemo(() => buildCsv(entries), [entries]);

  return (
    <WebsiteLayout>
      <main className="platform-legacy-page min-h-screen bg-[#0b0c0d] px-4 py-8 text-[#f6efe5] sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">App 内测等待名单</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#a99b8d]">
              用于筛选 100-500 位高质量种子用户，观察城市、设备、场景、访谈意愿和邀请码来源。
            </p>
          </div>
          <a
            className="rounded-lg bg-[#c8ff80] px-4 py-3 text-sm font-black text-[#111315]"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
            download="fitmeet-app-waitlist.csv"
          >
            导出 CSV
          </a>
        </div>

        {error ? (
          <p className="mt-5 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-sm font-bold text-[#ffb4b4]">
            {error}
          </p>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <Metric title="总报名数" value={stats?.total ?? 0} />
          <Metric title="高质量用户" value={stats?.highQuality ?? 0} />
          <Metric title="愿意访谈" value={stats?.interviewWilling ?? 0} />
          <Metric title="邀请码批次" value={inviteCodes.length} />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <Distribution title="设备比例" items={stats?.byDevice ?? []} />
          <Distribution title="城市分布" items={stats?.byCity ?? []} />
          <Distribution title="Top 场景" items={stats?.byScenario ?? []} />
          <Distribution title="国家分布" items={stats?.byCountry ?? []} />
          <Distribution title="用户角色" items={stats?.byUserRole ?? []} />
          <Distribution title="邀请码来源" items={stats?.byInviteSource ?? []} />
        </section>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-black text-white">高质量用户列表</h2>
              <p className="mt-1 text-sm text-[#a99b8d]">默认显示最近 50 条，邮箱和手机号已脱敏。</p>
            </div>
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-2 text-sm font-bold text-white outline-none"
                placeholder="搜索城市 / 邀请码"
              />
              <select
                value={qualityLevel}
                onChange={(event) => setQualityLevel(event.target.value)}
                className="rounded-lg border border-white/10 bg-[#0b0c0d] px-3 py-2 text-sm font-bold text-white outline-none"
              >
                <option value="">全部质量</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button className="rounded-lg border border-[#c8ff80]/40 px-3 py-2 text-sm font-black text-[#dfff9f]" onClick={() => void load()}>
                筛选
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead className="text-xs font-black text-[#8f8174]">
                <tr>
                  {['用户', '城市', '设备', '场景', '身份', '访谈', '质量', '来源'].map((head) => (
                    <th key={head} className="border-b border-white/10 px-3 py-3">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-6 text-[#a99b8d]" colSpan={8}>正在加载等待名单</td></tr>
                ) : entries.length ? (
                  entries.map((entry) => (
                    <tr key={entry.id} className="text-[#f6efe5]">
                      <td className="border-b border-white/10 px-3 py-3">
                        <p className="font-black">{entry.email}</p>
                        <p className="text-xs text-[#8f8174]">{entry.phone || '未填手机'}</p>
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">{entry.city}</td>
                      <td className="border-b border-white/10 px-3 py-3">{entry.deviceType}</td>
                      <td className="border-b border-white/10 px-3 py-3">{entry.scenarios.join('、')}</td>
                      <td className="border-b border-white/10 px-3 py-3">{entry.userRole}</td>
                      <td className="border-b border-white/10 px-3 py-3">{entry.interviewWilling ? '愿意' : '否'}</td>
                      <td className="border-b border-white/10 px-3 py-3">
                        {entry.qualityLevel} · {entry.qualityScore}
                      </td>
                      <td className="border-b border-white/10 px-3 py-3">{entry.inviteCode || entry.source}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td className="px-3 py-6 text-[#a99b8d]" colSpan={8}>暂无报名数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      </main>
    </WebsiteLayout>
  );
});

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
      <p className="text-xs font-black text-[#8f8174]">{title}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function Distribution({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.slice(0, 6).map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-xs font-bold text-[#c9b9a7]">
              <span>{item.label}</span>
              <span>{item.count}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#c8ff80]" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {!items.length ? <p className="text-sm text-[#8f8174]">暂无数据</p> : null}
      </div>
    </div>
  );
}

function buildCsv(entries: WaitlistEntry[]) {
  const rows = [
    ['id', 'email', 'phone', 'city', 'deviceType', 'scenarios', 'userRole', 'interviewWilling', 'qualityScore', 'qualityLevel', 'source'],
    ...entries.map((entry) => [
      entry.id,
      entry.email,
      entry.phone ?? '',
      entry.city,
      entry.deviceType,
      entry.scenarios.join('|'),
      entry.userRole,
      entry.interviewWilling ? 'yes' : 'no',
      entry.qualityScore ?? '',
      entry.qualityLevel,
      entry.inviteCode || entry.source || '',
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message) {
    if (/^\s*[{[]/.test(error.message) || /stack|trace|exception/i.test(error.message)) {
      return '等待名单暂时无法加载，请稍后重试。';
    }
    return error.message;
  }
  return '等待名单暂时无法加载，请稍后重试。';
}

export default AdminWaitlistPage;
