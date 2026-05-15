import { useCallback, useEffect, useState } from 'react';
import type { SafetyReport, VerificationRequest } from '../api/client';
import * as dataService from '../services/dataService';

export const SafetyAdminPage = () => {
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    Promise.all([dataService.listSafetyReports(), dataService.listVerificationRequests()])
      .then(([reportData, verificationData]) => {
        setReports(reportData);
        setVerifications(verificationData);
      })
      .catch(() => {
        setError('无法加载安全后台，请确认当前账号在 ADMIN_USER_IDS 中');
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateReport = useCallback(
    (id: number, status: SafetyReport['status']) => {
      dataService.updateSafetyReport(id, { status }).then(load);
    },
    [load],
  );

  const updateVerification = useCallback(
    (id: number, status: VerificationRequest['status']) => {
      dataService.updateVerificationRequest(id, { status }).then(load);
    },
    [load],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-extrabold">安全审核后台</h1>
        <p className="mt-2 text-sm text-textMuted">处理举报、拉黑线索与实名认证/教练认证申请。</p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-display text-xl font-bold">举报队列</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {reports.length === 0 ? (
            <EmptyRow text="暂无举报" />
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="text-sm font-bold">
                    #{report.id} {report.targetType} / {report.targetId}
                  </div>
                  <div className="mt-1 text-xs text-textMuted">
                    举报人 {report.reporterId} · {report.reason}
                  </div>
                  {report.description && (
                    <div className="mt-2 text-sm text-textMuted">{report.description}</div>
                  )}
                </div>
                <StatusActions
                  status={report.status}
                  options={['reviewing', 'resolved', 'rejected']}
                  onChange={(status) => updateReport(report.id, status as SafetyReport['status'])}
                />
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">认证申请</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {verifications.length === 0 ? (
            <EmptyRow text="暂无认证申请" />
          ) : (
            verifications.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="text-sm font-bold">
                    #{item.id} 用户 {item.userId} ·{' '}
                    {item.type === 'real_name' ? '实名认证' : '教练认证'}
                  </div>
                  <div className="mt-1 text-xs text-textMuted">
                    {item.realName || item.certName || '未填写补充信息'}
                  </div>
                </div>
                <StatusActions
                  status={item.status}
                  options={['approved', 'rejected']}
                  onChange={(status) =>
                    updateVerification(item.id, status as VerificationRequest['status'])
                  }
                />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-textMuted">{text}</div>;
}

function StatusActions({
  status,
  options,
  onChange,
}: {
  status: string;
  options: string[];
  onChange: (status: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full border border-border px-3 py-1 text-xs text-textMuted">
        {status}
      </span>
      {options.map((option) => (
        <button
          key={option}
          className="rounded-full border border-lime/30 px-3 py-1 text-xs font-bold text-lime transition hover:bg-lime hover:text-white"
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
