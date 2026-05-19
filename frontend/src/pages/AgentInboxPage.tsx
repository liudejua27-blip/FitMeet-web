import clsx from 'clsx';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  agentInboxApi,
  type AgentInboxConversation,
  type AgentInboxEvent,
  type AgentInboxMessage,
} from '../api/agentInboxApi';

type RecommendationAction =
  | 'ignore'
  | 'favorite'
  | 'draft-opener'
  | 'confirm-contact'
  | 'request-contact-exchange'
  | 'send-intro';

function conversationTitle(conv: AgentInboxConversation) {
  const users = conv.users.map((u) => u.name).filter(Boolean);
  const agents = conv.agents.map((a) => a.name).filter(Boolean);
  return [...users, ...agents].join(' / ') || 'Agent 会话';
}

function participantBadge(conv: AgentInboxConversation) {
  const agent = conv.agents[0];
  if (agent) return agent.name.slice(0, 2).toUpperCase();
  const user = conv.users[0];
  return (user?.avatar || user?.name?.[0] || 'A').slice(0, 2).toUpperCase();
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export const AgentInboxPage = memo(function AgentInboxPage() {
  const [agentName, setAgentName] = useState('OpenClaw');
  const [conversations, setConversations] = useState<AgentInboxConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, AgentInboxMessage[]>>({});
  const [events, setEvents] = useState<AgentInboxEvent[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [matchmakingRunning, setMatchmakingRunning] = useState(false);
  const [profileMatchRunning, setProfileMatchRunning] = useState(false);
  const [profileActionPending, setProfileActionPending] = useState<string | null>(null);
  const [draftOpenerContents, setDraftOpenerContents] = useState<Record<string, string>>({});
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const activeMessages = useMemo(
    () => (activeId ? messages[activeId] ?? [] : []),
    [activeId, messages],
  );

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await agentInboxApi.conversations({ limit: 50 });
      setAgentName(res.agentName || 'OpenClaw');
      setConversations(res.conversations);
      setActiveId((current) => {
        if (current && res.conversations.some((conv) => conv.id === current)) return current;
        return res.conversations[0]?.id ?? null;
      });
    } catch (e) {
      setError(formatAgentInboxError(e, 'Agent Inbox 加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await agentInboxApi.events({ limit: 50 });
      setEvents(res.events);
    } catch (e) {
      setError(formatAgentInboxError(e, 'Agent 事件加载失败'));
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await agentInboxApi.messages(conversationId, { limit: 100 });
      setMessages((prev) => ({ ...prev, [conversationId]: res.messages }));
      setConversations((prev) =>
        prev.map((conv) => (conv.id === conversationId ? { ...conv, unread: 0 } : conv)),
      );
    } catch (e) {
      setError(formatAgentInboxError(e, '会话消息加载失败'));
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadEvents();
  }, [loadConversations, loadEvents]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadConversations(), loadEvents()]);
  }, [loadConversations, loadEvents]);

  const sendReply = useCallback(async () => {
    const content = draft.trim();
    if (!activeId || !content) return;
    setSending(true);
    setError(null);
    try {
      const res = await agentInboxApi.reply(activeId, { content });
      setDraft('');
      setMessages((prev) => ({
        ...prev,
        [activeId]: [...(prev[activeId] ?? []), res.message],
      }));
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeId ? { ...conv, lastMessage: content, time: '刚刚' } : conv,
        ),
      );
      setStatusText(res.socketPushed ? '回复已实时送达站内用户。' : '回复已保存，对方上线后可见。');
    } catch (e) {
      setError(formatAgentInboxError(e, '回复失败'));
    } finally {
      setSending(false);
    }
  }, [activeId, draft]);

  const runAutopilot = useCallback(async () => {
    setAutopilotRunning(true);
    setError(null);
    setStatusText(null);
    try {
      const res = await agentInboxApi.runAutopilotOnce();
      const decisions = res.summary.decisions;
      setStatusText(
        `约练托管扫描 ${res.summary.requestsScanned} 张卡片：已发送 ${decisions.executed ?? 0}，计划中 ${decisions.planned ?? 0}，跳过 ${decisions.skipped ?? 0}。`,
      );
      await refreshAll();
    } catch (e) {
      setError(formatAgentInboxError(e, '约练托管运行失败'));
    } finally {
      setAutopilotRunning(false);
    }
  }, [refreshAll]);

  const runMatchmaking = useCallback(async () => {
    setMatchmakingRunning(true);
    setError(null);
    setStatusText(null);
    try {
      const res = await agentInboxApi.runSubconsciousLoopOnce();
      const s = res.summary;
      setStatusText(
        `AI 托管撮合完成：扫描画像 ${s.scannedProfiles} 个、卡片 ${s.scannedRequests} 张，生成画像推荐 ${s.generatedRecommendations} 个、卡片候选 ${s.generatedRequestCandidates} 个，写入 Inbox ${s.inboxEvents} 条。`,
      );
      await refreshAll();
    } catch (e) {
      setError(formatAgentInboxError(e, 'AI 托管撮合失败'));
    } finally {
      setMatchmakingRunning(false);
    }
  }, [refreshAll]);

  const runProfileMatches = useCallback(async () => {
    setProfileMatchRunning(true);
    setError(null);
    setStatusText(null);
    try {
      const res = await agentInboxApi.runProfileMatchesOnce();
      setStatusText(`画像匹配完成，新增 ${res.matchedCount} 个可确认推荐。`);
      await loadEvents();
    } catch (e) {
      setError(formatAgentInboxError(e, '画像匹配失败'));
    } finally {
      setProfileMatchRunning(false);
    }
  }, [loadEvents]);

  const profileRecommendationEvents = useMemo(
    () => events.filter((event) => event.eventType === 'profile.match.recommended'),
    [events],
  );
  const requestRecommendationEvents = useMemo(
    () => events.filter((event) => event.eventType === 'social_request.match.recommended'),
    [events],
  );

  const runProfileRecommendationAction = useCallback(
    async (event: AgentInboxEvent, action: RecommendationAction) => {
      const aiMatchSessionId = Number(event.metadata?.aiMatchSessionId);
      if (!Number.isFinite(aiMatchSessionId)) {
        setError('这条推荐缺少匹配会话 ID，无法执行操作。');
        return;
      }
      if (
        action === 'confirm-contact' &&
        !window.confirm('确认向对方发起加好友请求？对方同意前不会交换联系方式。')
      ) {
        return;
      }
      if (
        action === 'request-contact-exchange' &&
        !window.confirm('确认申请交换联系方式？仍需要对方同意。')
      ) {
        return;
      }
      if (action === 'send-intro') {
        const content = draftOpenerContents[event.id];
        if (!content?.trim()) {
          setError('请先起草开场白，再发送。');
          return;
        }
        if (!window.confirm(`确认发送这段开场白？\n\n${content.slice(0, 160)}`)) {
          return;
        }
      }

      const pendingKey = `${event.id}:${action}`;
      setProfileActionPending(pendingKey);
      setError(null);
      setStatusText(null);
      try {
        if (action === 'ignore') {
          await agentInboxApi.ignoreProfileMatch(aiMatchSessionId);
          setStatusText('推荐已忽略。');
        } else if (action === 'favorite') {
          await agentInboxApi.favoriteProfileMatch(aiMatchSessionId);
          setStatusText('推荐已保存。');
        } else if (action === 'draft-opener') {
          const res = await agentInboxApi.draftProfileMatchOpener(aiMatchSessionId);
          setDraftOpenerContents((prev) => ({ ...prev, [event.id]: res.draft.content }));
          setStatusText('AI 已生成开场白，可以在推荐卡片里确认发送。');
        } else if (action === 'confirm-contact') {
          const res = await agentInboxApi.confirmProfileMatchContact(aiMatchSessionId);
          setStatusText(`加好友请求 #${res.contactRequestId} 已创建，等待对方同意。`);
        } else if (action === 'request-contact-exchange') {
          const res = await agentInboxApi.requestContactExchange(aiMatchSessionId);
          setStatusText(`联系方式交换请求已提交，当前状态：${res.status}。`);
        } else if (action === 'send-intro') {
          const content = draftOpenerContents[event.id] ?? '';
          const res = await agentInboxApi.sendIntro(aiMatchSessionId, content);
          setStatusText(
            res.conversationId
              ? `开场白已发送，会话 ID：${res.conversationId}`
              : '开场白已提交。',
          );
          setDraftOpenerContents((prev) => {
            const next = { ...prev };
            delete next[event.id];
            return next;
          });
          await loadConversations();
        }
        await loadEvents();
      } catch (e) {
        setError(formatAgentInboxError(e, '推荐操作失败'));
      } finally {
        setProfileActionPending(null);
      }
    },
    [draftOpenerContents, loadConversations, loadEvents],
  );

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#E8E4DC]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8C8A6E]">
              Agent Inbox
            </p>
            <h1 className="mt-2 text-2xl font-black text-white">
              {agentName} 收信与 AI 托管控制台
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#A9A595]">
              网站用户回复 Agent 绑定会话后，会写入持久 Inbox 事件并推送 webhook；OpenClaw 也可以轮询未读事件并向主人报告。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runMatchmaking}
              disabled={matchmakingRunning}
              className="rounded-lg bg-[#C8FF80] px-4 py-2 text-sm font-black text-[#0d0d0b] transition hover:bg-[#d8ff9a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {matchmakingRunning ? '撮合中...' : '运行 AI 托管撮合'}
            </button>
            <button
              onClick={runProfileMatches}
              disabled={profileMatchRunning}
              className="rounded-lg border border-[#C8FF80]/30 px-4 py-2 text-sm font-black text-[#C8FF80] transition hover:bg-[#C8FF80]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileMatchRunning ? '匹配中...' : '只跑画像匹配'}
            </button>
            <button
              onClick={runAutopilot}
              disabled={autopilotRunning}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-[#E8E4DC] transition hover:border-[#C8FF80]/45 hover:text-[#C8FF80] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {autopilotRunning ? '运行中...' : '只跑约练托管'}
            </button>
            <Link
              to="/agent-control"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-[#E8E4DC] transition hover:border-[#C8FF80]/45 hover:text-[#C8FF80]"
            >
              动作记录
            </Link>
          </div>
        </header>

        {(error || statusText) && (
          <div
            className={clsx(
              'rounded-lg border px-4 py-3 text-sm',
              error
                ? 'border-red-500/25 bg-red-500/10 text-red-200'
                : 'border-[#6B7A5A]/30 bg-[#6B7A5A]/10 text-[#C8FF80]',
            )}
          >
            {error || statusText}
          </div>
        )}

        {(profileRecommendationEvents.length > 0 || requestRecommendationEvents.length > 0) && (
          <section className="grid gap-3 xl:grid-cols-2">
            {profileRecommendationEvents.slice(0, 4).map((event) => (
              <ProfileRecommendationCard
                key={event.id}
                event={event}
                pendingAction={
                  profileActionPending?.startsWith(`${event.id}:`) ? profileActionPending : null
                }
                draftOpenerContent={draftOpenerContents[event.id] ?? ''}
                onAction={runProfileRecommendationAction}
              />
            ))}
            {requestRecommendationEvents.slice(0, 4).map((event) => (
              <RequestRecommendationCard key={event.id} event={event} />
            ))}
          </section>
        )}

        <div className="grid min-h-[calc(100vh-230px)] overflow-hidden rounded-lg border border-white/10 bg-[#111110] lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-black text-white">Inbox</span>
              <button
                onClick={() => void refreshAll()}
                className="text-xs font-bold text-[#8C8A6E] hover:text-[#C8FF80]"
              >
                刷新
              </button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto lg:max-h-[calc(100vh-284px)]">
              {loading ? (
                <div className="p-5 text-sm text-[#8C8A6E]">正在加载收件箱...</div>
              ) : conversations.length === 0 ? (
                <div className="p-5 text-sm leading-6 text-[#8C8A6E]">
                  还没有 Agent 会话。AI 托管撮合、用户回复或 Social Skills 消息都会出现在这里。
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveId(conv.id)}
                    className={clsx(
                      'flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition',
                      activeId === conv.id ? 'bg-[#6B7A5A]/18' : 'hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1e1e18] text-xs font-black text-[#C8FF80]">
                      {participantBadge(conv)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-white">
                        {conversationTitle(conv)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#8C8A6E]">
                        {conv.lastMessage || '暂无消息'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-[#5e5d4e]">{conv.time}</span>
                      {conv.unread > 0 && (
                        <span className="rounded-full bg-[#C8FF80] px-1.5 py-0.5 text-[10px] font-black text-[#0d0d0b]">
                          {conv.unread}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[560px] flex-col">
            {activeConversation ? (
              <>
                <div className="border-b border-white/10 px-5 py-4">
                  <div className="text-sm font-black text-white">
                    {conversationTitle(activeConversation)}
                  </div>
                  <div className="mt-1 text-xs text-[#8C8A6E]">
                    正在以 {agentName} 身份回复
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {activeMessages.map((msg) => (
                    <div key={msg.id} className={clsx('flex', msg.isMine ? 'justify-end' : 'justify-start')}>
                      <div
                        className={clsx(
                          'max-w-[76%] rounded-2xl px-4 py-2.5 text-sm leading-6',
                          msg.isMine
                            ? 'rounded-br-md bg-[#6B7A5A] text-white'
                            : 'rounded-bl-md border border-white/10 bg-[#171713] text-[#E8E4DC]',
                        )}
                      >
                        <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                          {msg.senderType === 'agent' ? 'Agent' : 'User'}
                        </div>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <div className="mt-1 text-[10px] opacity-60">{msg.time}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 p-4">
                  <div className="flex gap-3">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`以 ${agentName} 身份回复...`}
                      rows={2}
                      className="min-h-[52px] flex-1 resize-none rounded-lg border border-white/10 bg-[#0A0A09] px-3 py-2 text-sm text-white outline-none placeholder:text-[#5e5d4e] focus:border-[#C8FF80]/50"
                    />
                    <button
                      onClick={sendReply}
                      disabled={sending || !draft.trim()}
                      className="w-24 rounded-lg bg-[#C8FF80] px-4 py-2 text-sm font-black text-[#0d0d0b] transition hover:bg-[#d8ff9a] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {sending ? '发送中' : '发送'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-10 text-center">
                <div>
                  <div className="text-lg font-black text-white">选择一个会话</div>
                  <p className="mt-2 text-sm text-[#8C8A6E]">
                    OpenClaw 收到网站用户回复后，会话会显示在这里。
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
});

function ProfileRecommendationCard({
  event,
  pendingAction,
  draftOpenerContent,
  onAction,
}: {
  event: AgentInboxEvent;
  pendingAction: string | null;
  draftOpenerContent: string;
  onAction: (event: AgentInboxEvent, action: RecommendationAction) => void;
}) {
  const metadata = event.metadata ?? {};
  const safeProfile = (metadata.safeProfile ?? {}) as Record<string, unknown>;
  const reasoner = (metadata.reasoner ?? {}) as Record<string, unknown>;
  const score = asNumber(metadata.score);
  const publicReasons = asText(reasoner.publicReason)
    ? [asText(reasoner.publicReason)]
    : asStringArray(metadata.publicReasons).length
      ? asStringArray(metadata.publicReasons)
      : asStringArray(metadata.reasons);
  const riskWarnings = asStringArray(reasoner.riskWarnings).length
    ? asStringArray(reasoner.riskWarnings)
    : asStringArray(metadata.riskTips);
  const sharedPoints = asStringArray(reasoner.sharedPoints);
  const suggestedOpener = asText(reasoner.suggestedOpener);
  const nextAction = asText(reasoner.nextAction) || asText(metadata.nextAction);
  const confidence = asNumber(reasoner.confidence, -1);
  const hasDraft = draftOpenerContent.trim().length > 0;
  const isBusy = Boolean(pendingAction);

  return (
    <article className="rounded-lg border border-[#C8FF80]/20 bg-[#171713] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#C8FF80]">
            AI 画像推荐
          </div>
          <h2 className="mt-1 text-lg font-black text-white">
            {asText(safeProfile.name, '推荐候选人')}
          </h2>
          <p className="mt-1 text-xs text-[#8C8A6E]">
            {asText(safeProfile.city, '城市未公开')} · 双方确认后才能加好友
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="rounded-lg bg-[#C8FF80] px-3 py-2 text-sm font-black text-[#0d0d0b]">
            {score}
          </div>
          {confidence >= 0 && (
            <span className="text-[10px] text-[#5e5d4e]">
              置信度 {Math.round(confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {asText(safeProfile.summary) && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#D8D2C4]">
          {asText(safeProfile.summary)}
        </p>
      )}

      {asStringArray(safeProfile.publicTags).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {asStringArray(safeProfile.publicTags)
            .slice(0, 8)
            .map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs font-bold text-[#E8E4DC]"
              >
                {tag}
              </span>
            ))}
        </div>
      )}

      {publicReasons.length > 0 && (
        <div className="mt-3 space-y-1">
          {publicReasons.slice(0, 2).map((reason) => (
            <p key={reason} className="text-xs leading-5 text-[#A9A595]">
              {reason}
            </p>
          ))}
        </div>
      )}

      {sharedPoints.length > 0 && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#C8FF80]/70">
            匹配理由
          </div>
          <ul className="mt-1 space-y-0.5">
            {sharedPoints.slice(0, 3).map((point) => (
              <li key={point} className="text-xs leading-5 text-[#D8D2C4]">
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {riskWarnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/5 px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200/70">
            安全提示
          </div>
          <ul className="mt-1 space-y-0.5">
            {riskWarnings.slice(0, 3).map((warning) => (
              <li key={warning} className="text-xs leading-5 text-amber-100/80">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextAction && (
        <div className="mt-3 rounded-lg border border-[#C8FF80]/10 bg-[#C8FF80]/5 px-3 py-2 text-xs leading-5 text-[#C8FF80]/90">
          <span className="font-black">建议下一步：</span> {nextAction}
        </div>
      )}

      {!hasDraft && suggestedOpener && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8C8A6E]">
            AI 建议开场白
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#A9A595]">
            {suggestedOpener}
          </p>
        </div>
      )}

      {hasDraft && (
        <div className="mt-3 rounded-lg border border-[#C8FF80]/25 bg-[#C8FF80]/5 px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#C8FF80]/70">
            待发送开场白
          </div>
          <p className="mt-1 text-xs leading-5 text-[#D8D2C4]">{draftOpenerContent}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => onAction(event, 'draft-opener')}
          disabled={isBusy}
          className="rounded-lg border border-[#C8FF80]/30 px-3 py-2 text-xs font-black text-[#C8FF80] transition hover:bg-[#C8FF80]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction?.endsWith(':draft-opener') ? '生成中...' : hasDraft ? '重新起草' : '起草开场白'}
        </button>
        {hasDraft && (
          <button
            onClick={() => onAction(event, 'send-intro')}
            disabled={isBusy}
            className="rounded-lg bg-[#C8FF80] px-3 py-2 text-xs font-black text-[#0d0d0b] transition hover:bg-[#d8ff9a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingAction?.endsWith(':send-intro') ? '发送中...' : '发送开场白'}
          </button>
        )}
        <button
          onClick={() => onAction(event, 'confirm-contact')}
          disabled={isBusy}
          className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction?.endsWith(':confirm-contact') ? '提交中...' : '申请加好友'}
        </button>
        <button
          onClick={() => onAction(event, 'request-contact-exchange')}
          disabled={isBusy}
          className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction?.endsWith(':request-contact-exchange') ? '申请中...' : '交换联系方式'}
        </button>
        <button
          onClick={() => onAction(event, 'favorite')}
          disabled={isBusy}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-[#E8E4DC] transition hover:border-yellow-400/30 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction?.endsWith(':favorite') ? '保存中...' : '保存'}
        </button>
        <button
          onClick={() => onAction(event, 'ignore')}
          disabled={isBusy}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-[#E8E4DC] transition hover:border-red-400/30 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction?.endsWith(':ignore') ? '忽略中...' : '忽略'}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-[#5e5d4e]">
        AI 只提供推荐和开场白；加好友、联系方式与线下见面仍需要双方同意。
      </p>
    </article>
  );
}

function RequestRecommendationCard({ event }: { event: AgentInboxEvent }) {
  const metadata = event.metadata ?? {};
  const candidates = Array.isArray(metadata.candidates)
    ? (metadata.candidates as Record<string, unknown>[])
    : [];
  return (
    <article className="rounded-lg border border-sky-300/20 bg-[#171713] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">
            约练卡片推荐
          </div>
          <h2 className="mt-1 text-lg font-black text-white">
            {asText(metadata.title) || asText(metadata.activityType) || '社交卡片'}
          </h2>
          <p className="mt-1 text-xs text-[#8C8A6E]">
            AI 托管找到 {asNumber(metadata.candidateCount, candidates.length)} 个候选人
          </p>
        </div>
      </div>
      {event.contentPreview && (
        <p className="mt-3 text-sm leading-6 text-[#D8D2C4]">{event.contentPreview}</p>
      )}
      {candidates.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {candidates.slice(0, 4).map((candidate, index) => (
            <div
              key={`${asText(candidate.name, 'candidate')}-${index}`}
              className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-black text-white">
                  {asText(candidate.name, '候选人')}
                </span>
                <span className="rounded-md bg-sky-300/15 px-2 py-0.5 text-xs font-black text-sky-100">
                  {asNumber(candidate.score)} 分
                </span>
              </div>
              {asStringArray(candidate.commonTags).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {asStringArray(candidate.commonTags)
                    .slice(0, 4)
                    .map((tag) => (
                      <span key={tag} className="text-[10px] font-bold text-[#A9A595]">
                        #{tag}
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-[#8C8A6E]">
        这是 AI 托管生成的卡片候选。后续可从对应卡片详情页确认邀请、发消息或加好友。
      </p>
    </article>
  );
}

function formatAgentInboxError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录已过期，请重新登录。';
    if (error.status === 403) return '权限不足，无法访问 Agent Inbox。';
    if (error.status >= 500) return 'Agent Inbox 服务异常，请稍后重试。';
    if (/complete your AI profile/i.test(error.message)) {
      return '请先完成 AI 画像。完成后 AI 托管会自动把你加入画像匹配池。';
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
