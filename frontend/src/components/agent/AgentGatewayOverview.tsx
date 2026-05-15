import { useEffect, useState } from 'react';
import { gatewayOverviewMetrics } from '@/data/agentMockData';
import { AgentStatusBadge } from './AgentStatusBadge';
import * as api from '@/api/client';

type Metric = {
  labelZh: string;
  labelEn: string;
  value: string;
  tone: string;
};

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function AgentGatewayOverview() {
  const [metrics, setMetrics] = useState<readonly Metric[]>(
    gatewayOverviewMetrics,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [connsR, activityR, pendingR] = await Promise.allSettled([
        api.request<unknown[]>('/agents/connections'),
        api.request<{ items?: { createdAt?: string }[] }>(
          '/agents/activity?page=1&limit=50',
        ),
        api.request<unknown[]>('/agent/approvals/pending'),
      ]);
      if (cancelled) return;

      const conns =
        connsR.status === 'fulfilled' && Array.isArray(connsR.value)
          ? connsR.value
          : [];
      const activityItems =
        activityR.status === 'fulfilled'
          ? activityR.value?.items ?? []
          : [];
      const pending =
        pendingR.status === 'fulfilled' && Array.isArray(pendingR.value)
          ? pendingR.value
          : [];

      const connCount = conns.length;
      const todayLogs = activityItems.filter((it) => isToday(it.createdAt)).length;
      const pendingCount = pending.length;
      const safety = pendingCount > 5 ? 'Review' : 'Stable';

      // API Gateway \u72b6\u6001\uff1a\u53ea\u8981\u4efb\u4e00\u8bf7\u6c42\u62ff\u5230\u54cd\u5e94\u5c31\u89c6\u4e3a Online\uff1b
      // \u5168\u90e8\u5931\u8d25\u624d\u62a5 Offline\uff0c\u907f\u514d\u5728\u672a\u767b\u5f55/\u8fc7\u671f\u65f6\u8bef\u62a5\u670d\u52a1\u6302\u6389\u3002
      const anyOk = [connsR, activityR, pendingR].some(
        (r) => r.status === 'fulfilled',
      );
      const gateway = anyOk ? 'Online' : 'Offline';

      setMetrics([
        {
          labelZh: '\u5df2\u8fde\u63a5\u667a\u80fd\u4f53',
          labelEn: 'CONNECTED AGENTS',
          value: String(connCount),
          tone: connCount > 0 ? 'stable' : 'neutral',
        },
        {
          labelZh: '\u5f85\u5ba1\u6279\u884c\u4e3a',
          labelEn: 'PENDING ACTIONS',
          value: String(pendingCount),
          tone: pendingCount > 0 ? 'review' : 'stable',
        },
        {
          labelZh: '\u4eca\u65e5\u884c\u4e3a\u8bb0\u5f55',
          labelEn: 'TODAY LOGS',
          value: String(todayLogs),
          tone: 'neutral',
        },
        {
          labelZh: '\u5f53\u524d\u5b89\u5168\u72b6\u6001',
          labelEn: 'SAFETY STATE',
          value: safety,
          tone: safety === 'Stable' ? 'stable' : 'review',
        },
        {
          labelZh: 'API Gateway',
          labelEn: 'API GATEWAY',
          value: gateway,
          tone: gateway === 'Online' ? 'online' : 'review',
        },
      ]);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="agent-overview" aria-label="Agent Gateway overview">
      <div className="agent-section-heading">
        <span>AGENT GATEWAY</span>
        <h2>接入总览</h2>
      </div>

      <div className="agent-overview__grid">
        {metrics.map((metric) => (
          <article key={metric.labelEn} className={`agent-overview-meter agent-overview-meter--${metric.tone}`}>
            <div className="agent-overview-meter__dial" aria-hidden="true">
              <span />
            </div>
            <div>
              <p>{metric.labelZh}</p>
              <small>{metric.labelEn}</small>
            </div>
            <strong>{metric.value}</strong>
            {(metric.value === 'Stable' || metric.value === 'Online') && (
              <AgentStatusBadge value={metric.value} compact />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
