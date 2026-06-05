import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  socialAgentDebugApi,
  type SocialAgentChatRunResult,
  type SocialAgentChatStreamEvent,
  type SocialAgentPermissionMode,
  type SocialAgentStepStatus,
} from '../api/socialAgentDebugApi';
import { ActionConfirmDialog } from './agent-workbench/ActionConfirmDialog';
import { AgentChatPanel } from './agent-workbench/AgentChatPanel';
import { AgentSidebar } from './agent-workbench/AgentSidebar';
import { initialRunEvents } from './agent-workbench/agentWorkbenchMock';
import type {
  AgentConfirmAction,
  AgentRunEvent,
  AgentWorkbenchMessage,
} from './agent-workbench/agentWorkbenchTypes';
import { MatchWorkspace } from './agent-workbench/MatchWorkspace';
import { MobileAgentHome } from './agent-workbench/MobileAgentHome';

export const SocialAgentConsolePage = memo(function SocialAgentConsolePage() {
  const [mode, setMode] = useState<SocialAgentPermissionMode>('limited_auto');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AgentWorkbenchMessage[]>([]);
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [result, setResult] = useState<SocialAgentChatRunResult | null>(null);
  const [activeAction, setActiveAction] = useState<AgentConfirmAction | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const candidates = useMemo(() => result?.candidates ?? [], [result]);
  const pendingCount = useMemo(
    () => result?.approvalRequiredActions?.length ?? (activeAction ? 1 : 0),
    [activeAction, result],
  );

  useEffect(() => {
    document.title = 'FitMeet Agent - AI 社交工作台';
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, events, candidates.length]);

  useEffect(() => {
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ eventType?: string; payload?: Record<string, unknown> }>).detail;
      if (!detail?.eventType?.startsWith('agent:')) return;
      setEvents((current) =>
        upsertEvent(current, realtimeToRunEvent(detail.eventType ?? '', detail.payload ?? {})),
      );
    };
    window.addEventListener('fitmeet:realtime', onRealtime);
    return () => window.removeEventListener('fitmeet:realtime', onRealtime);
  }, []);

  const resetConversation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setInput('');
    setMessages([]);
    setEvents([]);
    setResult(null);
    setActiveAction(null);
    setIsRunning(false);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const goal = input.trim();
    if (!goal || isRunning) return;

    const userMessage: AgentWorkbenchMessage = {
      id: nextId('user'),
      role: 'user',
      content: goal,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setResult(null);
    setError('');
    setIsRunning(true);
    setEvents(markFirstStepRunning(initialRunEvents));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalResult = await socialAgentDebugApi.runChatStream(
        {
          goal,
          permissionMode: mode,
          idempotencyKey: `agent-workbench-${Date.now()}`,
        },
        (streamEvent) => handleStreamEvent(streamEvent),
        controller.signal,
      );
      finishWithResult(finalResult);
    } catch (err) {
      if (controller.signal.aborted) {
        setEvents((current) =>
          upsertEvent(current, {
            stepId: 'stopped',
            type: 'final_answer',
            title: '已停止本次执行',
            summary: '你可以修改需求后重新发送。',
            status: 'error',
            agent: 'FitMeetAgent',
            createdAt: new Date().toISOString(),
          }),
        );
        return;
      }
      const message = humanizeError(err);
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: message,
          createdAt: new Date().toISOString(),
        },
      ]);
      setEvents((current) =>
        upsertEvent(current, {
          stepId: 'error',
          type: 'final_answer',
          title: '附近用户搜索失败，请稍后重试',
          summary: message,
          status: 'error',
          agent: 'FitMeetAgent',
          createdAt: new Date().toISOString(),
        }),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStreamEvent = (streamEvent: SocialAgentChatStreamEvent) => {
    if (streamEvent.type === 'step') {
      setEvents((current) => upsertEvent(current, streamStepToRunEvent(streamEvent.step)));
      return;
    }
    if (streamEvent.type === 'result') {
      finishWithResult(streamEvent.result);
      return;
    }
    if (streamEvent.type === 'error') {
      setError(streamEvent.message);
    }
  };

  const finishWithResult = (finalResult: SocialAgentChatRunResult) => {
    setResult(finalResult);
    setEvents((current) =>
      current
        .map((event) =>
          event.status === 'pending' || event.status === 'running'
            ? { ...event, status: 'success' as const }
            : event,
        )
        .concat({
          stepId: 'approval',
          type: 'action_required',
          title: '等待你确认下一步操作',
          summary: '好友申请、私信、线下活动和联系方式都需要你确认后才会执行。',
          status: 'waiting_confirmation',
          agent: 'SafetyAgent',
          createdAt: new Date().toISOString(),
        }),
    );
    setMessages((current) => {
      const alreadyAdded = current.some(
        (message) => message.role === 'assistant' && message.content === finalResult.assistantMessage,
      );
      if (alreadyAdded) return current;
      return [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: finalResult.assistantMessage || agentResultFallback(finalResult),
          createdAt: new Date().toISOString(),
        },
      ];
    });
  };

  const confirmAction = () => {
    if (!activeAction) return;
    setMessages((current) => [
      ...current,
      {
        id: nextId('assistant'),
        role: 'assistant',
        content: `已收到确认：${activeAction.title}。当前演示环境会先记录确认意图，实际执行仍会经过后端 PendingApproval 和安全策略。`,
        createdAt: new Date().toISOString(),
      },
    ]);
    setActiveAction(null);
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-slate-50 text-slate-950">
      <MobileAgentHome />
      <div className="flex min-h-[calc(100vh-72px)]">
        <AgentSidebar mode={mode} onModeChange={setMode} onNewChat={resetConversation} />
        <AgentChatPanel
          mode={mode}
          messages={messages}
          events={events}
          candidates={candidates}
          input={input}
          isRunning={isRunning}
          scrollRef={scrollRef}
          onInput={setInput}
          onSubmit={submit}
          onStop={() => abortRef.current?.abort()}
          onPrompt={setInput}
          onAction={setActiveAction}
        />
        <MatchWorkspace
          candidates={candidates}
          mode={mode}
          pendingCount={pendingCount}
          onAction={setActiveAction}
        />
      </div>
      {error && <span className="sr-only">{error}</span>}
      <ActionConfirmDialog
        action={activeAction}
        onClose={() => setActiveAction(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
});

function markFirstStepRunning(events: AgentRunEvent[]): AgentRunEvent[] {
  return events.map((event, index) => ({
    ...event,
    status: index === 0 ? 'running' : 'pending',
    createdAt: new Date().toISOString(),
  }));
}

function streamStepToRunEvent(step: {
  id: string;
  label: string;
  status: SocialAgentStepStatus;
}): AgentRunEvent {
  const mapped = mapStep(step.id, step.label);
  return {
    stepId: mapped.stepId,
    type: mapped.type,
    title: mapped.title,
    summary: mapped.summary,
    status: step.status === 'done' ? 'success' : step.status === 'failed' ? 'error' : 'running',
    agent: mapped.agent,
    tool: mapped.tool,
    createdAt: new Date().toISOString(),
  };
}

function mapStep(stepId: string, label: string): Omit<AgentRunEvent, 'status' | 'createdAt'> {
  const known: Record<string, Omit<AgentRunEvent, 'status' | 'createdAt'>> = {
    understand: {
      stepId: 'intent',
      type: 'intent_detected',
      title: '正在理解你的社交需求',
      agent: 'FitMeetAgent',
    },
    deepseek: {
      stepId: 'profile',
      type: 'profile_loaded',
      title: '正在读取 Life Graph',
      summary: '结合长期画像、当前意图和生活节奏判断匹配条件。',
      agent: 'LifeGraphAgent',
      tool: 'fitmeet_get_my_profile',
    },
    permission: {
      stepId: 'permission',
      type: 'permission_checked',
      title: '正在检查权限边界',
      summary: '确认哪些动作只能建议，哪些动作需要你点头。',
      agent: 'SafetyAgent',
    },
    search: {
      stepId: 'search',
      type: 'tool_call_started',
      title: '正在搜索附近候选用户',
      agent: 'MatchAgent',
      tool: 'fitmeet_search_candidates',
    },
    rank: {
      stepId: 'score',
      type: 'candidates_scored',
      title: '正在计算匹配度',
      summary: '综合时间、兴趣、目标、安全边界和活跃度。',
      agent: 'MatchAgent',
      tool: 'fitmeet_score_candidates',
    },
    safety_filter: {
      stepId: 'safety',
      type: 'safety_checked',
      title: '正在过滤低信任风险',
      summary: '检查隐私、骚扰、诈骗、线下见面和联系方式泄露风险。',
      agent: 'SafetyAgent',
    },
    draft: {
      stepId: 'cards',
      type: 'tool_call_finished',
      title: '正在生成推荐卡片',
      agent: 'FitMeetAgent',
    },
    reason: {
      stepId: 'reason',
      type: 'tool_call_finished',
      title: '正在生成推荐理由',
      agent: 'MatchAgent',
    },
    icebreaker: {
      stepId: 'icebreaker',
      type: 'tool_call_finished',
      title: '正在准备高情商开场白',
      agent: 'ConversationAgent',
      tool: 'fitmeet_generate_icebreaker',
    },
    done: {
      stepId: 'final',
      type: 'final_answer',
      title: '正在整理最终建议',
      agent: 'FitMeetAgent',
    },
  };
  return (
    known[stepId] ?? {
      stepId,
      type: 'tool_call_started',
      title: label || '正在处理任务',
      agent: 'FitMeetAgent',
    }
  );
}

function realtimeToRunEvent(eventType: string, payload: Record<string, unknown>): AgentRunEvent {
  const titleMap: Record<string, string> = {
    'agent:thinking': '正在理解你的社交需求',
    'agent:tool_call': '正在调用工具',
    'agent:tool_result': '工具调用已完成',
    'agent:candidates': '已找到候选用户',
    'agent:approval_required': '等待你确认下一步操作',
    'agent:completed': '已生成最终建议',
    'agent:error': 'Agent 处理遇到问题',
  };
  return {
    stepId: eventType,
    type: eventType === 'agent:approval_required' ? 'action_required' : 'tool_call_finished',
    title: titleMap[eventType] ?? 'Agent 状态已更新',
    summary:
      typeof payload.candidateCount === 'number'
        ? `已找到 ${payload.candidateCount} 个可能匹配的人`
        : undefined,
    status:
      eventType === 'agent:error'
        ? 'error'
        : eventType === 'agent:approval_required'
          ? 'waiting_confirmation'
          : 'success',
    agent: eventType === 'agent:approval_required' ? 'SafetyAgent' : 'FitMeetAgent',
    tool: typeof payload.toolName === 'string' ? payload.toolName : undefined,
    createdAt: new Date().toISOString(),
  };
}

function upsertEvent(current: AgentRunEvent[], next: AgentRunEvent): AgentRunEvent[] {
  const index = current.findIndex((event) => event.stepId === next.stepId);
  if (index < 0) return [...current, next];
  return current.map((event, itemIndex) => (itemIndex === index ? { ...event, ...next } : event));
}

function agentResultFallback(result: SocialAgentChatRunResult) {
  if (result.candidates.length > 0) {
    return `我先帮你筛出 ${result.candidates.length} 位候选人。建议先从低压力开场白开始，不直接交换联系方式。`;
  }
  return '我这轮没有找到足够合适的候选人。你可以补充时间、地点或安全边界，我再帮你缩小范围。';
}

function humanizeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (!message || /stack|trace|exception|json|html|undefined|null/i.test(message)) {
    return '这次请求没有顺利完成，我已经保留当前上下文。你可以稍后重试。';
  }
  if (/timeout|failed to fetch|network|abort/i.test(message)) {
    return '网络有点慢，这次请求暂时没有完成。你可以稍后重试。';
  }
  return message;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
