import clsx from 'clsx';
import { memo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  socialAgentApi,
  type SocialAgentChatCandidate,
  type SocialAgentChatRunResult,
  type SocialAgentPermissionMode,
  type SocialAgentStepStatus,
} from '../api/socialAgentApi';
import { cleanDisplayArray, cleanDisplayText } from '../lib/displayText';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type StatusStep = {
  id: string;
  text: string;
  state: SocialAgentStepStatus;
};

const defaultPrompt = '帮我找一个今晚在青岛可以一起轻松跑步的人，公开地点，低压力。';

const stepLabels: Record<string, string> = {
  understand: '正在理解你的社交需求',
  permission: '正在检查权限模式',
  deepseek: '正在调用 DeepSeek 生成匹配意图',
  search: '正在检索附近候选人',
  rank: '正在根据时间、地点、兴趣和安全边界排序',
  draft: '正在生成约练草稿',
  reason: '正在生成推荐理由',
  done: '已完成',
};

const modeLabels: Record<SocialAgentPermissionMode, string> = {
  assist: 'Assist Mode',
  confirm: 'Confirm Mode',
  limited_auto: 'Limited Auto Mode',
};

export const SocialAgentConsolePage = memo(function SocialAgentConsolePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<SocialAgentPermissionMode>('confirm');
  const [input, setInput] = useState(defaultPrompt);
  const [messages, setMessages] = useState<Message[]>([]);
  const [statuses, setStatuses] = useState<StatusStep[]>([]);
  const [result, setResult] = useState<SocialAgentChatRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [savingCandidateId, setSavingCandidateId] = useState<number | null>(null);
  const [savedCandidateIds, setSavedCandidateIds] = useState<number[]>([]);
  const [sendingUserId, setSendingUserId] = useState<number | null>(null);
  const [connectingUserId, setConnectingUserId] = useState<number | null>(null);
  const [actionStatus, setActionStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const started = messages.length > 0;
  const draft = result?.socialRequestDraft ?? null;
  const candidates = result?.candidates ?? [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const goal = cleanDisplayText(input, '').trim();
    if (!goal || isRunning) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setIsPublishing(false);
    setSavingCandidateId(null);
    setSavedCandidateIds([]);
    setSendingUserId(null);
    setConnectingUserId(null);
    setResult(null);
    setActionStatus('');
    setStatuses([]);
    setMessages([
      { id: nextId('user'), role: 'user', content: goal },
      {
        id: nextId('assistant'),
        role: 'assistant',
        content:
          '我会先整理你的需求，再安全地搜索真实候选人。需要发布、收藏或发送消息时，都会关联任务并写入审计记录。',
      },
    ]);

    try {
      await socialAgentApi.runChatStream(
        {
          goal,
          permissionMode: mode,
          idempotencyKey: `social-agent-chat:${Date.now()}:${Math.random()
            .toString(16)
            .slice(2)}`,
        },
        (streamEvent) => {
          if (streamEvent.type === 'step') {
            upsertStatus(
              streamEvent.step.id,
              statusText(streamEvent.step.id, streamEvent.step.label, mode),
              streamEvent.step.status,
            );
          }

          if (streamEvent.type === 'result') {
            const nextResult = streamEvent.result;
            setResult(nextResult);
            setMessages((items) => [
              ...items,
              {
                id: nextId('assistant'),
                role: 'assistant',
                content: assistantMessage(nextResult),
              },
            ]);
          }
        },
        controller.signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessages((items) => [
        ...items,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: `抱歉，这次没有完成搜索。${errorMessage(error)}`,
        },
      ]);
      setStatuses((items) =>
        items.map((item) =>
          item.state === 'running' ? { ...item, state: 'failed' } : item,
        ),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const upsertStatus = (id: string, text: string, state: SocialAgentStepStatus) => {
    setStatuses((items) => {
      const next = { id, text, state };
      const exists = items.some((item) => item.id === id);
      return exists ? items.map((item) => (item.id === id ? next : item)) : [...items, next];
    });
  };

  const publishDraft = async () => {
    if (!result?.taskId || !draft || isPublishing) return;
    setIsPublishing(true);
    setActionStatus('正在发布约练，并写入 Agent 审计记录...');

    try {
      await socialAgentApi.publishSocialRequest(result.taskId, draft);
      setActionStatus(`约练已发布。后续匹配、消息和候选动作都会关联 task #${result.taskId}。`);
    } catch (error) {
      setActionStatus(errorMessage(error, '发布失败，请稍后再试。'));
    } finally {
      setIsPublishing(false);
    }
  };

  const saveCandidate = async (candidate: SocialAgentChatCandidate) => {
    if (!result?.taskId || savingCandidateId) return;
    setSavingCandidateId(candidate.userId);
    setActionStatus(`正在收藏 ${displayName(candidate)}，并通过 SaveCandidate 写入候选记录...`);

    try {
      await socialAgentApi.saveCandidate(result.taskId, {
        candidateRecordId: candidate.candidateRecordId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        targetUserId: candidate.userId,
        candidate: {
          userId: candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
        },
      });
      setSavedCandidateIds((ids) =>
        ids.includes(candidate.userId) ? ids : [...ids, candidate.userId],
      );
      setActionStatus(`${displayName(candidate)} 已收藏，候选状态已持久化并关联 task #${result.taskId}。`);
    } catch (error) {
      setActionStatus(errorMessage(error, '收藏失败，请稍后再试。'));
    } finally {
      setSavingCandidateId(null);
    }
  };

  const sendMessage = async (candidate: SocialAgentChatCandidate) => {
    const message = cleanDisplayText(candidate.suggestedMessage, '').trim();
    if (!result?.taskId || !message || sendingUserId) return;
    setSendingUserId(candidate.userId);
    setActionStatus(`正在发送给 ${displayName(candidate)}，并记录确认事件...`);

    try {
      await socialAgentApi.sendCandidateMessage(result.taskId, {
        targetUserId: candidate.userId,
        message,
        candidate: {
          userId: candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
          candidateRecordId: candidate.candidateRecordId,
          socialRequestId: candidate.socialRequestId,
        },
      });
      setActionStatus(`已发送给 ${displayName(candidate)}，消息已关联 task #${result.taskId}。`);
    } catch (error) {
      setActionStatus(errorMessage(error, '发送失败，请稍后再试。'));
    } finally {
      setSendingUserId(null);
    }
  };

  const connectCandidate = async (candidate: SocialAgentChatCandidate) => {
    if (!result?.taskId || connectingUserId) return;
    setConnectingUserId(candidate.userId);
    setActionStatus(`正在添加 ${displayName(candidate)} 为好友，并创建站内会话...`);

    try {
      const connection = await socialAgentApi.connectCandidate(result.taskId, {
        candidateRecordId: candidate.candidateRecordId,
        socialRequestId: candidate.socialRequestId ?? draft?.socialRequestId ?? null,
        targetUserId: candidate.userId,
        candidate: {
          userId: candidate.userId,
          nickname: candidate.nickname,
          score: candidate.score,
          reasons: candidate.reasons,
        },
      });
      if (connection.conversationId) {
        setActionStatus(`${displayName(candidate)} 已加为好友，正在进入聊天。`);
        navigate(`/messages?conversationId=${encodeURIComponent(connection.conversationId)}`);
        return;
      }
      setActionStatus(`${displayName(candidate)} 好友动作已提交，但暂未创建会话。`);
    } catch (error) {
      setActionStatus(errorMessage(error, '加好友失败，请稍后再试。'));
    } finally {
      setConnectingUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#202124]">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-40 pt-10 sm:px-6">
        <header className="mx-auto w-full max-w-3xl text-center">
          <div className="text-xl font-black text-[#202124]">FitMeet Social Agent</div>
          <p className="mt-2 text-sm leading-6 text-[#6f706b]">
            AI 帮你整理需求、寻找合适的人、发起低风险社交连接
          </p>
        </header>

        <section className="mx-auto mt-10 flex w-full max-w-3xl flex-1 flex-col">
          {!started ? (
            <div className="flex flex-1 items-center justify-center pb-20">
              <h1 className="text-center text-3xl font-normal text-[#2f302d] sm:text-5xl">
                你想认识什么样的人？
              </h1>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.slice(0, 2).map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {statuses.length > 0 ? <StatusStream statuses={statuses} /> : null}

              {messages.slice(2).map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}

              {draft ? (
                <DraftCard draft={draft} isPublishing={isPublishing} onPublish={publishDraft} />
              ) : null}

              {result && candidates.length === 0 ? (
                <EmptyResult />
              ) : candidates.length > 0 ? (
                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <CandidateCard
                      key={`${candidate.userId}:${candidate.candidateRecordId ?? 'candidate'}`}
                      candidate={candidate}
                      isSaved={savedCandidateIds.includes(candidate.userId)}
                      isSaving={savingCandidateId === candidate.userId}
                      isSending={sendingUserId === candidate.userId}
                      isConnecting={connectingUserId === candidate.userId}
                      onSave={saveCandidate}
                      onSendMessage={sendMessage}
                      onConnect={connectCandidate}
                    />
                  ))}
                </div>
              ) : null}

              {actionStatus ? (
                <div className="rounded-xl bg-[#f1f1ee] px-3 py-2 text-sm font-bold text-[#686963]">
                  {actionStatus}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <form
        onSubmit={submit}
        className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#f8f8f6] via-[#f8f8f6] to-transparent px-4 pb-5 pt-8"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[28px] border border-[#deded8] bg-white p-2 shadow-[0_12px_36px_rgba(32,33,36,0.12)]">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as SocialAgentPermissionMode)}
            className="mb-1 hidden h-10 shrink-0 rounded-full border border-[#e4e4de] bg-[#f7f7f4] px-3 text-xs font-bold text-[#555] outline-none sm:block"
            aria-label="权限模式"
          >
            <option value="assist">Assist Mode</option>
            <option value="confirm">Confirm Mode</option>
            <option value="limited_auto">Limited Auto Mode</option>
          </select>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            className="max-h-32 min-h-[46px] flex-1 resize-none border-0 bg-transparent px-3 py-3 text-[15px] leading-6 text-[#202124] outline-none placeholder:text-[#8c8d88]"
            placeholder="输入你的社交需求..."
          />
          <button
            type="submit"
            disabled={isRunning || !cleanDisplayText(input, '').trim()}
            className="mb-1 flex h-10 shrink-0 items-center justify-center rounded-full bg-[#202124] px-4 text-sm font-black text-white transition hover:bg-[#343633] disabled:cursor-not-allowed disabled:bg-[#d2d2cc]"
            aria-label="发送"
          >
            {isRunning ? '分析中' : '发送'}
          </button>
        </div>
        <div className="mx-auto mt-2 block max-w-3xl sm:hidden">
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as SocialAgentPermissionMode)}
            className="h-9 w-full rounded-full border border-[#e4e4de] bg-white px-3 text-xs font-bold text-[#555] outline-none"
            aria-label="权限模式"
          >
            <option value="assist">Assist Mode</option>
            <option value="confirm">Confirm Mode</option>
            <option value="limited_auto">Limited Auto Mode</option>
          </select>
        </div>
      </form>
    </div>
  );
});

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[82%] rounded-2xl px-4 py-3 text-[15px] leading-7',
          isUser ? 'bg-[#ebeef7] text-[#202124]' : 'bg-transparent text-[#2f302d]',
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function StatusStream({ statuses }: { statuses: StatusStep[] }) {
  return (
    <div className="ml-4 space-y-1.5 border-l border-[#e5e5df] pl-4">
      {statuses.map((step) => (
        <div
          key={step.id}
          className="flex min-h-[24px] items-center gap-2 rounded-md bg-[#f1f1ee]/70 px-2 text-[13px] leading-5 text-[#686963] transition-all"
        >
          <StatusIcon state={step.state} />
          <span>{step.text}</span>
        </div>
      ))}
    </div>
  );
}

function StatusIcon({ state }: { state: SocialAgentStepStatus }) {
  if (state === 'done') return <span className="text-[#168a55]">✓</span>;
  if (state === 'failed') return <span className="text-[#c24135]">!</span>;
  if (state === 'running') {
    return (
      <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[#8a8b85] border-t-transparent" />
    );
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-[#b7b8b1]" />;
}

function DraftCard({
  draft,
  isPublishing,
  onPublish,
}: {
  draft: NonNullable<SocialAgentChatRunResult['socialRequestDraft']>;
  isPublishing: boolean;
  onPublish: () => void;
}) {
  const tags = cleanDisplayArray(draft.interestTags);
  return (
    <article className="rounded-2xl border border-[#e6e6df] bg-white p-4 shadow-[0_8px_24px_rgba(32,33,36,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black text-[#777872]">约练草稿</div>
          <h2 className="mt-1 text-base font-black text-[#202124]">
            {cleanDisplayText(draft.title, '待确认约练')}
          </h2>
        </div>
        <span className="rounded-full bg-[#fff6df] px-3 py-1 text-xs font-black text-[#8a5a00]">
          待确认
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#555650]">
        {cleanDisplayText(draft.description, cleanDisplayText(draft.rawText, 'AI 已生成约练草稿。'))}
      </p>
      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#f1f1ee] px-2 py-1 text-[11px] font-bold text-[#666762]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPublish}
        disabled={isPublishing}
        className="mt-4 rounded-full bg-[#202124] px-4 py-2 text-sm font-black text-white transition hover:bg-[#343633] disabled:cursor-not-allowed disabled:bg-[#d2d2cc]"
      >
        {isPublishing ? '正在发布...' : '确认发布约练'}
      </button>
    </article>
  );
}

function CandidateCard({
  candidate,
  isSaved,
  isSaving,
  isSending,
  isConnecting,
  onSave,
  onSendMessage,
  onConnect,
}: {
  candidate: SocialAgentChatCandidate;
  isSaved: boolean;
  isSaving: boolean;
  isSending: boolean;
  isConnecting: boolean;
  onSave: (candidate: SocialAgentChatCandidate) => void;
  onSendMessage: (candidate: SocialAgentChatCandidate) => void;
  onConnect: (candidate: SocialAgentChatCandidate) => void;
}) {
  const name = displayName(candidate);
  const avatar = cleanDisplayText(candidate.avatar, '');
  const tags = cleanDisplayArray(candidate.commonTags);
  const reasons = cleanDisplayArray(candidate.reasons);
  const warnings = cleanDisplayArray(candidate.risk?.warnings);
  const opener = cleanDisplayText(candidate.suggestedMessage, '');
  const canSave = Boolean(candidate.candidateRecordId || (candidate.socialRequestId && candidate.userId));

  return (
    <article className="rounded-2xl border border-[#e6e6df] bg-white p-4 shadow-[0_8px_24px_rgba(32,33,36,0.06)]">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
          style={{ backgroundColor: cleanDisplayText(candidate.color, '#202124') }}
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            name.slice(0, 1)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-base font-black text-[#202124]">{name}</h3>
            <span className="text-sm font-black text-[#168a55]">
              {Math.round(candidate.score)}% 匹配
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-[#777872]">
            {candidateLocation(candidate)}
          </p>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#f1f1ee] px-2 py-1 text-[11px] font-bold text-[#666762]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-1">
        {(reasons.length > 0 ? reasons : ['TA 与你的时间、地点或兴趣边界较匹配。'])
          .slice(0, 4)
          .map((reason) => (
            <p key={reason} className="text-sm leading-6 text-[#555650]">
              {reason}
            </p>
          ))}
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-xl bg-[#fff6df] p-3 text-xs leading-5 text-[#7a5a12]">
          {warnings.slice(0, 2).join('，')}
        </div>
      ) : null}

      {opener ? (
        <p className="mt-3 rounded-xl bg-[#f8f8f6] p-3 text-sm leading-6 text-[#555650]">
          {opener}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSave(candidate)}
          disabled={isSaved || isSaving || !canSave}
          className="rounded-full border border-[#e4e4de] px-4 py-2 text-sm font-black text-[#555] transition hover:border-[#c7c7bf] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaved ? '已收藏' : isSaving ? '正在收藏...' : '收藏'}
        </button>
        <button
          type="button"
          onClick={() => onSendMessage(candidate)}
          disabled={!opener || isSending}
          className="rounded-full bg-[#202124] px-4 py-2 text-sm font-black text-white transition hover:bg-[#343633] disabled:cursor-not-allowed disabled:bg-[#d2d2cc]"
        >
          {isSending ? '正在发送...' : '确认发送'}
        </button>
        <button
          type="button"
          onClick={() => onConnect(candidate)}
          disabled={isConnecting || !candidate.userId}
          className="rounded-full border border-[#202124] px-4 py-2 text-sm font-black text-[#202124] transition hover:bg-[#f1f1ee] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConnecting ? '连接中...' : '加好友并聊天'}
        </button>
      </div>
    </article>
  );
}

function EmptyResult() {
  return (
    <div className="rounded-2xl border border-dashed border-[#d9d9d2] bg-white/70 p-5 text-sm leading-6 text-[#686963]">
      暂时没有找到符合条件的真实候选人。可以放宽城市、时间、距离或兴趣条件后重新搜索。
    </div>
  );
}

function statusText(id: string, fallback: string, mode: SocialAgentPermissionMode): string {
  if (id === 'permission') return `正在检查权限模式：${modeLabels[mode]}`;
  return stepLabels[id] ?? cleanDisplayText(fallback, '正在处理任务');
}

function assistantMessage(result: SocialAgentChatRunResult): string {
  const stable = cleanDisplayText(result.assistantMessage, '');
  if (stable && stable !== '内容已隐藏') return stable;
  if (result.candidates.length === 0) {
    return '我完成了搜索，但暂时没有找到符合安全边界和权限要求的真实候选人。';
  }
  const first = result.candidates[0];
  return `我找到了 ${result.candidates.length} 位真实候选人，优先推荐 ${displayName(first)}，匹配度 ${Math.round(first.score)}%。`;
}

function displayName(candidate: SocialAgentChatCandidate): string {
  return cleanDisplayText(candidate.nickname, `用户 #${candidate.userId}`);
}

function candidateLocation(candidate: SocialAgentChatCandidate): string {
  const city = cleanDisplayText(candidate.city, '');
  if (city) return city;
  if (candidate.distanceKm == null) return '同城或附近';
  return `${candidate.distanceKm.toFixed(1)}km`;
}

function errorMessage(error: unknown, fallback = '请稍后再试。'): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}
