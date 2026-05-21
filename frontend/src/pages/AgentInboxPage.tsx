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
import { cleanDisplayArray, cleanDisplayText, sanitizeDisplayValue } from '../lib/displayText';

type RecommendationAction =
  | 'ignore'
  | 'favorite'
  | 'draft-opener'
  | 'confirm-contact'
  | 'request-contact-exchange'
  | 'send-intro';

type EventIntent = 'pending' | 'reply' | 'completed' | 'risk' | 'info';

const eventTypeLabels: Record<string, string> = {
  'profile.match.recommended': '画像推荐',
  'social_request.match.recommended': '约练候选',
  'social_agent.action.result': '动作结果',
  'social_agent.reply.received': '收到回复',
  'social_agent.reply.sent': '已发送回复',
  'social_agent.inbox.write': '写入 Inbox',
};

const toolLabels: Record<string, string> = {
  payment: '支付意图',
  offline_meeting: '线下见面',
  send_message: '发送消息',
  reply_message: '回复消息',
  add_friend: '加好友',
  invite_activity: '活动邀请',
  save_candidate: '保存候选人',
  search_matches: '搜索匹配',
  explain_matches: '生成推荐理由',
  draft_opener: '生成破冰话术',
};

function conversationTitle(conv: AgentInboxConversation) {
  const users = conv.users.map((user) => cleanDisplayText(user.name)).filter(Boolean);
  const agents = conv.agents.map((agent) => cleanDisplayText(agent.name)).filter(Boolean);
  return [...users, ...agents].join(' / ') || 'Agent 会话';
}

function participantBadge(conv: AgentInboxConversation) {
  const agent = conv.agents[0];
  if (agent) return cleanDisplayText(agent.name, 'AI').slice(0, 2).toUpperCase();
  const user = conv.users[0];
  return (cleanDisplayText(user?.avatar) || cleanDisplayText(user?.name)?.[0] || 'A')
    .slice(0, 2)
    .toUpperCase();
}

function asText(value: unknown, fallback = '') {
  return cleanDisplayText(value, fallback);
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return cleanDisplayArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asDisplay(value: unknown, fallback = '') {
  if (typeof value === 'string' && value.trim()) return cleanDisplayText(value, fallback);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function eventLabel(event: AgentInboxEvent) {
  const toolName = asText(event.metadata?.toolName);
  return eventTypeLabels[event.eventType] || toolLabels[toolName] || cleanDisplayText(event.eventType, 'Agent 事件');
}

function eventIntent(event: AgentInboxEvent): EventIntent {
  const toolName = asText(event.metadata?.toolName);
  const status = asText(event.metadata?.status).toLowerCase();
  if (toolName === 'payment' || toolName === 'offline_meeting') return 'risk';
  if (event.eventType.includes('reply') || event.conversationId || event.messageId) return 'reply';
  if (
    event.eventType === 'profile.match.recommended' ||
    event.eventType === 'social_request.match.recommended' ||
    status.includes('pending') ||
    status.includes('approval')
  ) {
    return 'pending';
  }
  if (!event.unread) return 'completed';
  return 'info';
}

function formatTime(value?: string | null) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanDisplayText(value, '刚刚');
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const AgentInboxPage = memo(function AgentInboxPage() {
  const [agentName, setAgentName] = useState('FitMeet Agent');
  const [conversations, setConversations] = useState<AgentInboxConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, AgentInboxMessage[]>>({});
  const [events, setEvents] = useState<AgentInboxEvent[]>([]);
  const [conversationLimit, setConversationLimit] = useState(30);
  const [eventLimit, setEventLimit] = useState(40);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [matchmakingRunning, setMatchmakingRunning] = useState(false);
  const [profileMatchRunning, setProfileMatchRunning] = useState(false);
  const [profileActionPending, setProfileActionPending] = useState<string | null>(null);
  const [ackPending, setAckPending] = useState<string | null>(null);
  const [draftOpenerContents, setDraftOpenerContents] = useState<Record<string, string>>({});
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const activeMessages = useMemo(
    () => (activeId ? (messages[activeId] ?? []) : []),
    [activeId, messages],
  );

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await agentInboxApi.conversations({
        limit: conversationLimit,
        unreadOnly: showUnreadOnly,
      });
      setAgentName(cleanDisplayText(res.agentName, 'FitMeet Agent'));
      setConversations(res.conversations);
      setActiveId((current) => {
        if (current && res.conversations.some((conversation) => conversation.id === current)) {
          return current;
        }
        return res.conversations[0]?.id ?? null;
      });
    } catch (e) {
      setError(formatAgentInboxError(e, 'Agent Inbox 加载失败'));
    } finally {
      setLoading(false);
    }
  }, [conversationLimit, showUnreadOnly]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await agentInboxApi.events({ limit: eventLimit, unreadOnly: showUnreadOnly });
      setEvents(res.events);
    } catch (e) {
      setError(formatAgentInboxError(e, 'Agent 事件加载失败'));
    }
  }, [eventLimit, showUnreadOnly]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await agentInboxApi.messages(conversationId, { limit: 100 });
      setMessages((previous) => ({ ...previous, [conversationId]: res.messages }));
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation,
        ),
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

  const ackEventIds = useCallback(async (eventIds: string[]) => {
    const ids = Array.from(new Set(eventIds.filter(Boolean)));
    if (ids.length === 0) return;
    setAckPending(ids.length === 1 ? ids[0] : 'bulk');
    setError(null);
    try {
      await agentInboxApi.ackEvents(ids);
      setEvents((previous) =>
        previous.map((event) => (ids.includes(event.id) ? { ...event, unread: false } : event)),
      );
    } catch (e) {
      setError(formatAgentInboxError(e, '标记已读失败'));
    } finally {
      setAckPending(null);
    }
  }, []);

  const sendReply = useCallback(async () => {
    const content = draft.trim();
    if (!activeId || !content) return;
    setSending(true);
    setError(null);
    try {
      const res = await agentInboxApi.reply(activeId, { content });
      setDraft('');
      setMessages((previous) => ({
        ...previous,
        [activeId]: [...(previous[activeId] ?? []), res.message],
      }));
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeId
            ? { ...conversation, lastMessage: cleanDisplayText(content), time: '刚刚' }
            : conversation,
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
        `约练托管扫描 ${res.summary.requestsScanned} 张卡片：已执行 ${decisions.executed ?? 0}，计划中 ${decisions.planned ?? 0}，跳过 ${decisions.skipped ?? 0}。`,
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
      const res = await agentInboxApi.runProfileMatchAutopilotOnce();
      const s = res.summary;
      setStatusText(
        `Profile Match Autopilot 完成：扫描画像 ${s.scannedProfiles} 个、卡片 ${s.scannedRequests} 张，生成画像推荐 ${s.generatedRecommendations} 个、卡片候选 ${s.generatedRequestCandidates} 个，写入 Inbox ${s.inboxEvents} 条。`,
      );
      await refreshAll();
    } catch (e) {
      setError(formatAgentInboxError(e, 'Profile Match Autopilot 运行失败'));
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

  const unreadEventIds = useMemo(
    () => events.filter((event) => event.unread).map((event) => event.id),
    [events],
  );
  const replyConversations = useMemo(
    () => conversations.filter((conversation) => conversation.unread > 0),
    [conversations],
  );
  const pendingEvents = useMemo(
    () =>
      events.filter((event) => {
        const intent = eventIntent(event);
        return intent === 'pending' || intent === 'risk';
      }),
    [events],
  );
  const completedEvents = useMemo(
    () =>
      events.filter((event) => {
        const intent = eventIntent(event);
        return intent === 'completed' || intent === 'info';
      }),
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
          setDraftOpenerContents((previous) => ({ ...previous, [event.id]: res.draft.content }));
          setStatusText('AI 已生成开场白，可在推荐卡片里确认发送。');
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
            res.conversationId ? `开场白已发送，会话 ID：${res.conversationId}` : '开场白已提交。',
          );
          setDraftOpenerContents((previous) => {
            const next = { ...previous };
            delete next[event.id];
            return next;
          });
          await loadConversations();
        }
        await ackEventIds([event.id]);
        await loadEvents();
      } catch (e) {
        setError(formatAgentInboxError(e, '推荐操作失败'));
      } finally {
        setProfileActionPending(null);
      }
    },
    [ackEventIds, draftOpenerContents, loadConversations, loadEvents],
  );

  return (
    <div className="min-h-screen bg-[#0d0d0b] text-[#E8E4DC]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8C8A6E]">
              Agent Inbox
            </p>
            <h1 className="mt-2 text-2xl font-black text-white">{agentName} 的收件箱</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#A9A595]">
              这里按用户视角整理 Agent 的工作：谁回复了你、哪些动作等你确认、Agent 已经完成了什么。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runMatchmaking}
              disabled={matchmakingRunning}
              className="rounded-lg bg-[#C8FF80] px-4 py-2 text-sm font-black text-[#0d0d0b] transition hover:bg-[#d8ff9a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {matchmakingRunning ? '匹配中...' : '运行画像自动匹配'}
            </button>
            <button
              onClick={runProfileMatches}
              disabled={profileMatchRunning}
              className="rounded-lg border border-[#C8FF80]/30 px-4 py-2 text-sm font-black text-[#C8FF80] transition hover:bg-[#C8FF80]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileMatchRunning ? '生成中...' : '生成画像推荐'}
            </button>
            <button
              onClick={runAutopilot}
              disabled={autopilotRunning}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-[#E8E4DC] transition hover:border-[#C8FF80]/45 hover:text-[#C8FF80] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {autopilotRunning ? '运行中...' : '运行约练托管'}
            </button>
            <Link
              to="/agent-control"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-[#E8E4DC] transition hover:border-[#C8FF80]/45 hover:text-[#C8FF80]"
            >
              审计记录
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

        <section className="grid gap-3 md:grid-cols-3">
          <SummaryCard
            label="谁回复我了"
            value={replyConversations.reduce((sum, item) => sum + item.unread, 0)}
            helper={replyConversations.length ? `${replyConversations.length} 个会话有新消息` : '暂无未读回复'}
          />
          <SummaryCard
            label="等我确认"
            value={pendingEvents.length}
            helper="推荐、加好友、联系方式、线下见面与支付都会停在这里"
          />
          <SummaryCard
            label="Agent 已完成"
            value={completedEvents.length}
            helper={`当前展示最近 ${events.length} 条可审计事件`}
          />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#111110] px-4 py-3">
          <label className="flex items-center gap-2 text-sm font-bold text-[#D8D2C4]">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(event) => {
                setShowUnreadOnly(event.target.checked);
                setActiveId(null);
              }}
              className="h-4 w-4 accent-[#C8FF80]"
            />
            只看未读
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void refreshAll()}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-[#A9A595] transition hover:border-[#C8FF80]/40 hover:text-[#C8FF80]"
            >
              刷新
            </button>
            <button
              onClick={() => void ackEventIds(unreadEventIds)}
              disabled={unreadEventIds.length === 0 || Boolean(ackPending)}
              className="rounded-lg border border-[#C8FF80]/30 px-3 py-2 text-xs font-black text-[#C8FF80] transition hover:bg-[#C8FF80]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ackPending === 'bulk' ? '处理中...' : '全部标为已读'}
            </button>
          </div>
        </div>

        <main className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <section className="space-y-5">
            <Panel
              title="等我确认"
              subtitle="这些动作不会静默执行，需要你明确确认或继续处理。"
              empty={pendingEvents.length === 0 ? '暂无待确认动作。' : undefined}
            >
              <div className="grid gap-3">
                {pendingEvents.map((event) => (
                  <PendingEventCard
                    key={event.id}
                    event={event}
                    pendingAction={
                      profileActionPending?.startsWith(`${event.id}:`) ? profileActionPending : null
                    }
                    draftOpenerContent={draftOpenerContents[event.id] ?? ''}
                    ackPending={ackPending}
                    onAction={runProfileRecommendationAction}
                    onAck={(eventId) => void ackEventIds([eventId])}
                  />
                ))}
              </div>
            </Panel>

            <Panel
              title="会话"
              subtitle="用户回复、Agent 代发消息和后续沟通都集中在这里。"
              empty={conversations.length === 0 ? '暂无 Agent 会话。' : undefined}
            >
              <div className="grid overflow-hidden rounded-lg border border-white/10 bg-[#111110] lg:grid-cols-[320px_minmax(0,1fr)]">
                <ConversationList
                  conversations={conversations}
                  activeId={activeId}
                  loading={loading}
                  onSelect={setActiveId}
                  onLoadMore={() => setConversationLimit((current) => current + 20)}
                />
                <ConversationDetail
                  conversation={activeConversation}
                  messages={activeMessages}
                  draft={draft}
                  sending={sending}
                  onDraftChange={setDraft}
                  onSend={() => void sendReply()}
                />
              </div>
            </Panel>
          </section>

          <aside className="space-y-5">
            <Panel
              title="谁回复我了"
              subtitle="优先处理有新消息的会话。"
              empty={replyConversations.length === 0 ? '暂无新的用户回复。' : undefined}
            >
              <div className="space-y-2">
                {replyConversations.slice(0, 6).map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => setActiveId(conversation.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-[#C8FF80]/15 bg-[#C8FF80]/5 px-3 py-3 text-left transition hover:bg-[#C8FF80]/10"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1e1e18] text-xs font-black text-[#C8FF80]">
                      {participantBadge(conversation)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-white">
                        {conversationTitle(conversation)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#A9A595]">
                        {cleanDisplayText(conversation.lastMessage, '新消息')}
                      </span>
                    </span>
                    <span className="rounded-full bg-[#C8FF80] px-2 py-0.5 text-xs font-black text-[#0d0d0b]">
                      {conversation.unread}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel
              title="Agent 已完成"
              subtitle="可审计的推荐、工具调用、Inbox 写入和结果记录。"
              empty={completedEvents.length === 0 ? '暂无已完成事件。' : undefined}
            >
              <div className="space-y-2">
                {completedEvents.slice(0, eventLimit).map((event) => (
                  <TimelineEventCard
                    key={event.id}
                    event={event}
                    ackPending={ackPending}
                    onAck={(eventId) => void ackEventIds([eventId])}
                  />
                ))}
              </div>
              {events.length >= eventLimit && (
                <button
                  onClick={() => setEventLimit((current) => current + 20)}
                  className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-[#A9A595] transition hover:border-[#C8FF80]/40 hover:text-[#C8FF80]"
                >
                  加载更多事件
                </button>
              )}
            </Panel>
          </aside>
        </main>
      </div>
    </div>
  );
});

function SummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-[#111110] px-4 py-4">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8C8A6E]">{label}</div>
      <div className="mt-2 text-3xl font-black text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-[#A9A595]">{helper}</p>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#111110] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#8C8A6E]">{subtitle}</p>
        </div>
      </div>
      {empty ? (
        <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-5 text-sm text-[#8C8A6E]">
          {empty}
        </div>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </section>
  );
}

function PendingEventCard({
  event,
  pendingAction,
  draftOpenerContent,
  ackPending,
  onAction,
  onAck,
}: {
  event: AgentInboxEvent;
  pendingAction: string | null;
  draftOpenerContent: string;
  ackPending: string | null;
  onAction: (event: AgentInboxEvent, action: RecommendationAction) => void;
  onAck: (eventId: string) => void;
}) {
  const toolName = asText(event.metadata?.toolName);
  if (event.eventType === 'profile.match.recommended') {
    return (
      <ProfileRecommendationCard
        event={event}
        pendingAction={pendingAction}
        draftOpenerContent={draftOpenerContent}
        onAction={onAction}
      />
    );
  }
  if (event.eventType === 'social_request.match.recommended') {
    return <RequestRecommendationCard event={event} />;
  }
  if (toolName === 'payment') {
    return <PaymentActionCard event={event} />;
  }
  if (toolName === 'offline_meeting') {
    return <OfflineMeetingActionCard event={event} />;
  }
  return <TimelineEventCard event={event} ackPending={ackPending} onAck={onAck} />;
}

function TimelineEventCard({
  event,
  ackPending,
  onAck,
}: {
  event: AgentInboxEvent;
  ackPending: string | null;
  onAck: (eventId: string) => void;
}) {
  const metadata = sanitizeDisplayValue(event.metadata ?? {}) as Record<string, unknown>;
  const toolName = asText(metadata.toolName);
  const taskId = asDisplay(metadata.agentTaskId ?? metadata.taskId);
  const status = asDisplay(metadata.status);
  return (
    <article
      className={clsx(
        'rounded-lg border px-3 py-3 transition',
        event.unread ? 'border-[#C8FF80]/25 bg-[#C8FF80]/5' : 'border-white/[0.06] bg-white/[0.03]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {event.unread && <span className="h-2 w-2 rounded-full bg-[#C8FF80]" aria-label="未读" />}
            <span className="text-xs font-black text-white">{eventLabel(event)}</span>
            {status && (
              <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#A9A595]">
                {status}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#A9A595]">
            {cleanDisplayText(event.contentPreview, '事件内容已隐藏')}
          </p>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[#5e5d4e]">
            <span>{formatTime(event.createdAt)}</span>
            {toolName && <span>工具：{toolLabels[toolName] || toolName}</span>}
            {taskId && <span>Task #{taskId}</span>}
          </div>
        </div>
        {event.unread && (
          <button
            onClick={() => onAck(event.id)}
            disabled={Boolean(ackPending)}
            className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] font-black text-[#C8FF80] disabled:opacity-50"
          >
            {ackPending === event.id ? '处理中' : '已读'}
          </button>
        )}
      </div>
    </article>
  );
}

function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onLoadMore,
}: {
  conversations: AgentInboxConversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <aside className="border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10">
      <div className="max-h-[42vh] overflow-y-auto lg:max-h-[560px]">
        {loading ? (
          <div className="p-5 text-sm text-[#8C8A6E]">正在加载收件箱...</div>
        ) : conversations.length === 0 ? (
          <div className="p-5 text-sm leading-6 text-[#8C8A6E]">
            暂无 Agent 会话。用户回复、Agent 代发消息和 Social Skills 消息都会出现在这里。
          </div>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={clsx(
                'flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition',
                activeId === conversation.id ? 'bg-[#6B7A5A]/18' : 'hover:bg-white/[0.04]',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1e1e18] text-xs font-black text-[#C8FF80]">
                {participantBadge(conversation)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-white">
                  {conversationTitle(conversation)}
                </span>
                <span className="mt-1 block truncate text-xs text-[#8C8A6E]">
                  {cleanDisplayText(conversation.lastMessage, '暂无消息')}
                </span>
                <span className="mt-1 block text-[10px] text-[#5e5d4e]">
                  {cleanDisplayText(conversation.time, formatTime(conversation.lastMessageTime))}
                </span>
              </span>
              {conversation.unread > 0 && (
                <span className="rounded-full bg-[#C8FF80] px-2 py-0.5 text-xs font-black text-[#0d0d0b]">
                  {conversation.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>
      {conversations.length > 0 && (
        <button
          onClick={onLoadMore}
          className="w-full border-t border-white/10 px-4 py-3 text-xs font-black text-[#8C8A6E] transition hover:text-[#C8FF80]"
        >
          加载更多会话
        </button>
      )}
    </aside>
  );
}

function ConversationDetail({
  conversation,
  messages,
  draft,
  sending,
  onDraftChange,
  onSend,
}: {
  conversation: AgentInboxConversation | null;
  messages: AgentInboxMessage[];
  draft: string;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}) {
  if (!conversation) {
    return (
      <div className="flex min-h-[360px] items-center justify-center p-6 text-sm text-[#8C8A6E]">
        选择一个会话查看用户回复和 Agent 消息。
      </div>
    );
  }
  return (
    <section className="flex min-h-[420px] flex-col">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-black text-white">{conversationTitle(conversation)}</h3>
        <p className="mt-1 text-xs text-[#8C8A6E]">未读 {conversation.unread} 条</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-5 text-sm text-[#8C8A6E]">
            暂无消息。
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={clsx('flex', message.isMine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={clsx(
                  'max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6',
                  message.isMine
                    ? 'bg-[#C8FF80] text-[#0d0d0b]'
                    : 'border border-white/10 bg-white/[0.04] text-[#E8E4DC]',
                )}
              >
                {message.senderType === 'agent' && (
                  <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
                    Agent 代发
                  </div>
                )}
                <p>{cleanDisplayText(message.text, '消息内容已隐藏')}</p>
                <div className="mt-1 text-[10px] opacity-60">{cleanDisplayText(message.time, '刚刚')}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="以 Agent 身份回复..."
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0d0b] px-3 py-2 text-sm text-white outline-none transition placeholder:text-[#5e5d4e] focus:border-[#C8FF80]/50"
          />
          <button
            onClick={onSend}
            disabled={sending || !draft.trim()}
            className="rounded-lg bg-[#C8FF80] px-4 py-2 text-sm font-black text-[#0d0d0b] transition hover:bg-[#d8ff9a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? '发送中' : '发送'}
          </button>
        </div>
      </div>
    </section>
  );
}

function PaymentActionCard({ event }: { event: AgentInboxEvent }) {
  const metadata = sanitizeDisplayValue(event.metadata ?? {}) as Record<string, unknown>;
  const output = asRecord(metadata.output);
  const error = asRecord(metadata.error);
  const amount = asDisplay(output.amount, '金额待确认');
  const currency = asDisplay(output.currency, 'CNY');
  const status = asDisplay(output.status, asText(metadata.status, 'pending'));
  const description = asDisplay(output.description, cleanDisplayText(event.contentPreview, 'Agent 发起了支付意图'));
  const hasError = Boolean(asText(error.message));

  return (
    <article className="rounded-lg border border-amber-300/20 bg-[#171713] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">
            支付意图
          </div>
          <h3 className="mt-1 text-lg font-black text-white">
            {currency} {amount}
          </h3>
          <p className="mt-1 text-xs text-[#8C8A6E]">{description}</p>
        </div>
        <span className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100">
          {status}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[#A9A595] sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          Intent #{asDisplay(output.paymentIntentId ?? output.id, '-')}
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          Task #{asDisplay(metadata.agentTaskId, '-')}
        </div>
      </div>
      <p
        className={clsx(
          'mt-3 rounded-lg border px-3 py-2 text-xs',
          hasError
            ? 'border-red-400/20 bg-red-500/10 text-red-100'
            : 'border-amber-300/15 bg-amber-300/5 text-amber-100/85',
        )}
      >
        {hasError ? asText(error.message) : '支付不会静默执行。当前只记录 payment intent，后续仍需用户确认和审计。'}
      </p>
    </article>
  );
}

function OfflineMeetingActionCard({ event }: { event: AgentInboxEvent }) {
  const metadata = sanitizeDisplayValue(event.metadata ?? {}) as Record<string, unknown>;
  const output = asRecord(metadata.output);
  const error = asRecord(metadata.error);
  const activity = asRecord(output.activity);
  const status = asDisplay(output.status ?? activity.status, asText(metadata.status, 'pending'));
  const title = asDisplay(activity.title, '线下见面安排');
  const location = [asDisplay(activity.city), asDisplay(activity.locationName)].filter(Boolean).join(' ');

  return (
    <article className="rounded-lg border border-[#C8FF80]/20 bg-[#171713] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#C8FF80]">
            线下见面
          </div>
          <h3 className="mt-1 text-lg font-black text-white">{title}</h3>
          <p className="mt-1 text-xs text-[#8C8A6E]">
            {location || cleanDisplayText(event.contentPreview, '已发送活动邀请')}
          </p>
        </div>
        <span className="rounded-lg border border-[#C8FF80]/25 bg-[#C8FF80]/10 px-3 py-2 text-xs font-black text-[#C8FF80]">
          {status}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[#A9A595] sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          Activity #{asDisplay(output.activityId ?? output.id, '-')}
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          Message {asDisplay(output.messageId, '-')}
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-[#C8FF80]/10 bg-[#C8FF80]/5 px-3 py-2 text-xs text-[#C8FF80]/85">
        线下动作必须保留 taskId、消息记录和确认来源，方便撤销、追踪和审计。
      </p>
      {asText(error.message) && (
        <p className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {asText(error.message)}
        </p>
      )}
    </article>
  );
}

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
  const metadata = sanitizeDisplayValue(event.metadata ?? {}) as Record<string, unknown>;
  const safeProfile = asRecord(metadata.safeProfile);
  const reasoner = asRecord(metadata.reasoner);
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
            待确认推荐
          </div>
          <h3 className="mt-1 text-lg font-black text-white">
            {asText(safeProfile.name, '推荐候选人')}
          </h3>
          <p className="mt-1 text-xs text-[#8C8A6E]">
            {asText(safeProfile.city, '城市未公开')} · 双方确认后才会加好友
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="rounded-lg bg-[#C8FF80] px-3 py-2 text-sm font-black text-[#0d0d0b]">
            {score}
          </div>
          {confidence >= 0 && (
            <span className="text-[10px] text-[#5e5d4e]">置信度 {Math.round(confidence * 100)}%</span>
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
        <InfoBlock label="匹配原因" tone="green" items={sharedPoints.slice(0, 3)} />
      )}
      {riskWarnings.length > 0 && (
        <InfoBlock label="安全提示" tone="amber" items={riskWarnings.slice(0, 3)} />
      )}

      {nextAction && (
        <div className="mt-3 rounded-lg border border-[#C8FF80]/10 bg-[#C8FF80]/5 px-3 py-2 text-xs leading-5 text-[#C8FF80]/90">
          <span className="font-black">建议下一步：</span> {nextAction}
        </div>
      )}

      {!hasDraft && suggestedOpener && (
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8C8A6E]">
            建议破冰话术
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#A9A595]">{suggestedOpener}</p>
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
        AI 只提供推荐和草稿；加好友、联系方式、线下见面仍需要确认和审计。
      </p>
    </article>
  );
}

function InfoBlock({ label, tone, items }: { label: string; tone: 'green' | 'amber'; items: string[] }) {
  const isAmber = tone === 'amber';
  return (
    <div
      className={clsx(
        'mt-3 rounded-lg border px-3 py-2',
        isAmber ? 'border-amber-300/15 bg-amber-300/5' : 'border-white/[0.06] bg-white/[0.03]',
      )}
    >
      <div
        className={clsx(
          'text-[10px] font-black uppercase tracking-[0.14em]',
          isAmber ? 'text-amber-200/70' : 'text-[#C8FF80]/70',
        )}
      >
        {label}
      </div>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={item} className={clsx('text-xs leading-5', isAmber ? 'text-amber-100/80' : 'text-[#D8D2C4]')}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestRecommendationCard({ event }: { event: AgentInboxEvent }) {
  const metadata = sanitizeDisplayValue(event.metadata ?? {}) as Record<string, unknown>;
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
          <h3 className="mt-1 text-lg font-black text-white">
            {asText(metadata.title) || asText(metadata.activityType) || '社交卡片'}
          </h3>
          <p className="mt-1 text-xs text-[#8C8A6E]">
            找到 {asNumber(metadata.candidateCount, candidates.length)} 个候选人，后续邀请需要确认。
          </p>
        </div>
      </div>
      {event.contentPreview && (
        <p className="mt-3 text-sm leading-6 text-[#D8D2C4]">
          {cleanDisplayText(event.contentPreview, '推荐摘要已隐藏')}
        </p>
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
    </article>
  );
}

function formatAgentInboxError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录已过期，请重新登录。';
    if (error.status === 403) return '权限不足，无法访问 Agent Inbox。';
    if (error.status >= 500) return 'Agent Inbox 服务异常，请稍后重试。';
    if (/complete your AI profile/i.test(error.message)) {
      return '请先完成 AI 画像。完成后，Profile Match Autopilot 会把你加入画像匹配池。';
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
