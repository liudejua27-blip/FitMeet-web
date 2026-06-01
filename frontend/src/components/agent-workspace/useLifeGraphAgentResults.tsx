import { useEffect, useMemo, useState } from 'react';
import {
  lifeGraphApi,
  type LifeGraphAuditLog,
  type LifeGraphResponse,
} from '../../api/lifeGraphApi';
import {
  LifeGraphChangeSummary,
  LifeRhythmAnalysisResult,
  type QuickResult,
  WeeklyActivityRecommendation,
} from './LifeGraphAgentFlow';

export function useLifeGraphAgentResults() {
  const [result, setResult] = useState<QuickResult>(null);
  const [graph, setGraph] = useState<LifeGraphResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<LifeGraphAuditLog[]>([]);

  useEffect(() => {
    if (!result) return;
    if (result === 'changes') {
      void lifeGraphApi
        .getAudit()
        .then(setAuditLogs)
        .catch(() => setAuditLogs([]));
      return;
    }
    void lifeGraphApi
      .getMe()
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [result]);

  const resultNode = useMemo(() => {
    if (result === 'rhythm') return <LifeRhythmAnalysisResult graph={graph} />;
    if (result === 'weekly') return <WeeklyActivityRecommendation graph={graph} />;
    if (result === 'changes') {
      return <LifeGraphChangeSummary auditLogs={auditLogs} />;
    }
    return null;
  }, [auditLogs, graph, result]);

  return { result, setResult, resultNode };
}
