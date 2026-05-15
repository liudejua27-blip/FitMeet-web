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

function conversationTitle(conv: AgentInboxConversation) {
  const users = conv.users.map((u) => u.name).filter(Boolean);
  const agents = conv.agents.map((a) => a.name).filter(Boolean);
  return [...users, ...agents].join(' / ') || 'Agent conversation';
}

function participantBadge(conv: AgentInboxConversation) {
  const agent = conv.agents[0];
  if (agent) return agent.name.slice(0, 2).toUpperCase();
  const user = conv.users[0];
  return (user?.avatar || user?.name?.[0] || 'A').slice(0, 2).toUpperCase();
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
  const [profileMatchRunning, setProfileMatchRunning] = useState(false);
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
      setActiveId((current) => current ?? res.conversations[0]?.id ?? null);
    } catch (e) {
      setError(formatAgentInboxError(e, 'Failed to load Agent inbox'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await agentInboxApi.events({ limit: 30 });
      setEvents(res.events);
    } catch (e) {
      setError(formatAgentInboxError(e, 'Failed to load Agent events'));
    }
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      try {
        const res = await agentInboxApi.messages(conversationId, { limit: 100 });
        setMessages((prev) => ({
          ...prev,
          [conversationId]: res.messages,
        }));
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId ? { ...conv, unread: 0 } : conv,
          ),
        );
      } catch (e) {
        setError(formatAgentInboxError(e, 'Failed to load messages'));
      }
    },
    [],
  );

  useEffect(() => {
    void loadConversations();
    void loadEvents();
  }, [loadConversations, loadEvents]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

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
          conv.id === activeId
            ? { ...conv, lastMessage: content, time: 'just now' }
            : conv,
        ),
      );
      setStatusText(res.socketPushed ? 'Reply delivered in real time.' : 'Reply stored; recipient will see it when online.');
    } catch (e) {
      setError(formatAgentInboxError(e, 'Reply failed'));
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
        `Autopilot scanned ${res.summary.requestsScanned} request(s): ${decisions.executed ?? 0} sent, ${decisions.pending ?? 0} pending approval, ${decisions.planned ?? 0} planned.`,
      );
      await loadConversations();
      await loadEvents();
    } catch (e) {
      setError(formatAgentInboxError(e, 'Autopilot run failed'));
    } finally {
      setAutopilotRunning(false);
    }
  }, [loadConversations, loadEvents]);

  const runProfileMatches = useCallback(async () => {
    setProfileMatchRunning(true);
    setError(null);
    setStatusText(null);
    try {
      const res = await agentInboxApi.runProfileMatchesOnce();
      setStatusText(`Profile matching added ${res.matchedCount} review-only recommendation(s).`);
      await loadEvents();
    } catch (e) {
      setError(formatAgentInboxError(e, 'Profile matching failed'));
    } finally {
      setProfileMatchRunning(false);
    }
  }, [loadEvents]);

  const profileRecommendationEvents = useMemo(
    () => events.filter((event) => event.eventType === 'profile.match.recommended'),
    [events],
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
              {agentName} conversation console
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#A9A595]">
              Read messages addressed to your OpenClaw/Agent, inspect the Agent inbox, and reply as the Agent without exposing the raw token in the browser.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runAutopilot}
              disabled={autopilotRunning}
              className="rounded-lg bg-[#6B7A5A] px-4 py-2 text-sm font-black text-white transition hover:bg-[#7A8A68] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {autopilotRunning ? 'Running...' : 'Run autopilot once'}
            </button>
            <button
              onClick={runProfileMatches}
              disabled={profileMatchRunning}
              className="rounded-lg border border-[#C8FF80]/30 px-4 py-2 text-sm font-black text-[#C8FF80] transition hover:bg-[#C8FF80]/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {profileMatchRunning ? 'Matching...' : 'Run profile match'}
            </button>
            <Link
              to="/agent-control"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-[#E8E4DC] transition hover:border-[#C8FF80]/45 hover:text-[#C8FF80]"
            >
              Pending approvals
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

        {profileRecommendationEvents.length > 0 && (
          <section className="grid gap-3 md:grid-cols-2">
            {profileRecommendationEvents.slice(0, 4).map((event) => (
              <ProfileRecommendationCard key={event.id} event={event} />
            ))}
          </section>
        )}

        <div className="grid min-h-[calc(100vh-230px)] overflow-hidden rounded-lg border border-white/10 bg-[#111110] lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-black text-white">Inbox</span>
              <button
                onClick={() => void loadConversations()}
                className="text-xs font-bold text-[#8C8A6E] hover:text-[#C8FF80]"
              >
                Refresh
              </button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto lg:max-h-[calc(100vh-284px)]">
              {loading ? (
                <div className="p-5 text-sm text-[#8C8A6E]">Loading inbox...</div>
              ) : conversations.length === 0 ? (
                <div className="p-5 text-sm leading-6 text-[#8C8A6E]">
                  No Agent conversations yet. Other users or agents can message this Agent through the Agent search and Social Skills flow.
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveId(conv.id)}
                    className={clsx(
                      'flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition',
                      activeId === conv.id
                        ? 'bg-[#6B7A5A]/18'
                        : 'hover:bg-white/[0.04]',
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
                        {conv.lastMessage || 'No messages yet'}
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
                    Replying as {agentName}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {activeMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={clsx(
                        'flex',
                        msg.isMine ? 'justify-end' : 'justify-start',
                      )}
                    >
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
                      placeholder={`Reply as ${agentName}...`}
                      rows={2}
                      className="min-h-[52px] flex-1 resize-none rounded-lg border border-white/10 bg-[#0A0A09] px-3 py-2 text-sm text-white outline-none placeholder:text-[#5e5d4e] focus:border-[#C8FF80]/50"
                    />
                    <button
                      onClick={sendReply}
                      disabled={sending || !draft.trim()}
                      className="w-24 rounded-lg bg-[#C8FF80] px-4 py-2 text-sm font-black text-[#0d0d0b] transition hover:bg-[#d8ff9a] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {sending ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-10 text-center">
                <div>
                  <div className="text-lg font-black text-white">Select a conversation</div>
                  <p className="mt-2 text-sm text-[#8C8A6E]">
                    Agent messages will appear here once OpenClaw receives traffic.
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

function ProfileRecommendationCard({ event }: { event: AgentInboxEvent }) {
  const metadata = event.metadata ?? {};
  const safeProfile = (metadata.safeProfile ?? {}) as {
    name?: string;
    city?: string;
    publicTags?: string[];
    summary?: string;
  };
  const score = typeof metadata.score === 'number' ? metadata.score : 0;
  const reasons = Array.isArray(metadata.reasons)
    ? metadata.reasons.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <article className="rounded-lg border border-[#C8FF80]/20 bg-[#171713] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#C8FF80]">
            Profile match
          </div>
          <h2 className="mt-1 text-lg font-black text-white">
            {safeProfile.name || 'Recommended profile'}
          </h2>
          <p className="mt-1 text-xs text-[#8C8A6E]">
            {safeProfile.city || 'City hidden'} · owner confirmation required
          </p>
        </div>
        <div className="rounded-lg bg-[#C8FF80] px-3 py-2 text-sm font-black text-[#0d0d0b]">
          {score}
        </div>
      </div>
      {safeProfile.summary && (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#D8D2C4]">
          {safeProfile.summary}
        </p>
      )}
      {Array.isArray(safeProfile.publicTags) && safeProfile.publicTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {safeProfile.publicTags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs font-bold text-[#E8E4DC]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-[#A9A595]">
          {reasons.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-[#E8E4DC]">
          Ignore
        </button>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black text-[#E8E4DC]">
          Save
        </button>
        <button className="rounded-lg border border-[#C8FF80]/30 px-3 py-2 text-xs font-black text-[#C8FF80]">
          Draft opener
        </button>
        <button className="rounded-lg bg-[#6B7A5A] px-3 py-2 text-xs font-black text-white">
          Confirm contact
        </button>
      </div>
    </article>
  );
}

function formatAgentInboxError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录已过期，请重新登录。';
    if (error.status === 403) return '权限不足，无法访问 Agent Inbox。';
    if (error.status >= 500) return 'Agent Inbox 服务异常，请稍后重试。';
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
