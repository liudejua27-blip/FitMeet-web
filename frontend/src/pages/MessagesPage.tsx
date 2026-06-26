import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import clsx from 'clsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useMessageStore, useSocialContactStore } from '../stores';
import type { PublicIntentApplication } from '../types/socialContact';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations,
    activeConvId,
    messages,
    selectConv,
    closeConv,
    sendMessage,
    loadConversations,
    disabledConversationReasons,
  } = useMessageStore();
  const {
    applicationsById,
    ownerApplicationIds,
    applicantApplicationIds,
    conversationsByApplicationId,
    loadOwnerApplications,
    loadApplicantApplications,
    acceptApplication,
    rejectApplication,
    cancelApplication,
    recoverProvisioningApplications,
  } = useSocialContactStore();
  const [inputText, setInputText] = useState('');
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [applicationActionId, setApplicationActionId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const disabledReason = activeConvId ? disabledConversationReasons[activeConvId] : '';

  const activeMessages = useMemo(
    () => (activeConvId ? messages[activeConvId] || [] : []),
    [activeConvId, messages],
  );
  const fromSocialAgent = searchParams.get('from') === 'social-agent';
  const agentTaskId = searchParams.get('agentTaskId');
  const socialAgentReturnUrl = agentTaskId
    ? `/social-agent?taskId=${encodeURIComponent(agentTaskId)}`
    : '/social-agent';
  const handledConversationQueryRef = useRef<string | null>(null);

  const ownerApplications = useMemo(
    () =>
      ownerApplicationIds
        .map((id) => applicationsById[id])
        .filter((item): item is PublicIntentApplication => Boolean(item)),
    [applicationsById, ownerApplicationIds],
  );
  const applicantApplications = useMemo(
    () =>
      applicantApplicationIds
        .map((id) => applicationsById[id])
        .filter((item): item is PublicIntentApplication => Boolean(item)),
    [applicantApplicationIds, applicationsById],
  );

  useEffect(() => {
    void Promise.allSettled([
      loadOwnerApplications(),
      loadApplicantApplications(),
      loadConversations(),
    ]).then(() => recoverProvisioningApplications());
  }, [
    loadApplicantApplications,
    loadConversations,
    loadOwnerApplications,
    recoverProvisioningApplications,
  ]);

  useEffect(() => {
    const fromQuery =
      searchParams.get('conversationId') ?? searchParams.get('conversation');
    if (!fromQuery) {
      handledConversationQueryRef.current = null;
      return;
    }
    if (
      handledConversationQueryRef.current === fromQuery ||
      activeConvId === fromQuery
    ) {
      handledConversationQueryRef.current = fromQuery;
      return;
    }
    handledConversationQueryRef.current = fromQuery;
    let cancelled = false;
    loadConversations()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        const exists = useMessageStore
          .getState()
          .conversations.some((conversation) => conversation.id === fromQuery);
        if (exists) {
          setConversationError(null);
          selectConv(fromQuery);
        } else {
          closeConv();
          setConversationError('这个会话不存在或你无权访问，未自动打开其他会话。');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeConvId, closeConv, loadConversations, searchParams, selectConv]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setConversationError(null);
      handledConversationQueryRef.current = id;
      selectConv(id);
      setSearchParams({ conversationId: id });
    },
    [selectConv, setSearchParams],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const handleSend = useCallback(() => {
    if (!inputText.trim() || !activeConvId || disabledReason) return;
    void sendMessage(activeConvId, inputText.trim());
    setInputText('');
  }, [activeConvId, disabledReason, inputText, sendMessage]);

  const handleAcceptApplication = useCallback(
    async (application: PublicIntentApplication) => {
      setApplicationActionId(application.id);
      try {
        await acceptApplication(application.id);
      } finally {
        setApplicationActionId(null);
      }
    },
    [acceptApplication],
  );

  const handleRejectApplication = useCallback(
    async (application: PublicIntentApplication) => {
      setApplicationActionId(application.id);
      try {
        await rejectApplication(application.id);
      } finally {
        setApplicationActionId(null);
      }
    },
    [rejectApplication],
  );

  const handleCancelApplication = useCallback(
    async (application: PublicIntentApplication) => {
      setApplicationActionId(application.id);
      try {
        await cancelApplication(application.id);
      } finally {
        setApplicationActionId(null);
      }
    },
    [cancelApplication],
  );

  const openApplicationConversation = useCallback(
    (application: PublicIntentApplication) => {
      const conversationId = conversationsByApplicationId[application.id]?.conversationId;
      if (!conversationId) {
        recoverProvisioningApplications();
        return;
      }
      setConversationError(null);
      handledConversationQueryRef.current = conversationId;
      selectConv(conversationId);
      setSearchParams({ conversationId });
    },
    [conversationsByApplicationId, recoverProvisioningApplications, selectConv, setSearchParams],
  );

  return (
    <div className="min-h-screen bg-[#100b08] text-cream">
      <div className="grid h-[calc(100vh-72px)] grid-cols-1 lg:grid-cols-[380px_1fr]">
        {/* Conversation List */}
        <div
          className={clsx(
            'border-r border-border overflow-y-auto',
            activeConvId ? 'hidden lg:block' : 'block'
          )}
        >
          <div className="sticky top-0 z-10 bg-base/95 backdrop-blur-xl border-b border-border px-5 py-4">
            <h2 className="font-display text-lg font-black text-white">消息</h2>
            <p className="text-xs text-textSofter mt-0.5">
              {conversations.filter((c) => c.unread > 0).length} 条未读
            </p>
          </div>

          <ApplicationInboxSection
            actionId={applicationActionId}
            applicantApplications={applicantApplications}
            conversationByApplicationId={conversationsByApplicationId}
            ownerApplications={ownerApplications}
            onAccept={handleAcceptApplication}
            onCancel={handleCancelApplication}
            onOpenConversation={openApplicationConversation}
            onReject={handleRejectApplication}
          />

          <div className="divide-y divide-border/50">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                className={clsx(
                  'w-full flex items-center gap-3 px-5 py-4 text-left transition cursor-pointer',
                  activeConvId === conv.id
                    ? 'bg-surface border-l-2 border-l-lime'
                    : 'hover:bg-surface/50'
                )}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
                    style={{ background: conv.color }}
                  >
                    {conv.avatar}
                  </div>
                  {conv.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-md border-2 border-base bg-lime" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white truncate">{conv.username}</span>
                    <span className="text-[10px] text-textSofter flex-shrink-0">{conv.time}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-textMuted truncate">{conv.lastMessage}</span>
                    {conv.unread > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1 flex-shrink-0 ml-1">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        <div
          className={clsx(
            'flex flex-col',
            !activeConvId ? 'hidden lg:flex' : 'flex'
          )}
        >
          {activeConv ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-base/95 backdrop-blur-xl">
                <button
                  className="lg:hidden text-textMuted hover:text-white transition cursor-pointer mr-1"
                  onClick={closeConv}
                >
                  ←
                </button>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-black text-white"
                  style={{ background: activeConv.color }}
                >
                  {activeConv.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{activeConv.username}</div>
                  <div className="text-[11px] text-textSofter">
                    {activeConv.online ? '🟢 在线' : '⚫ 离线'}
                  </div>
                </div>
                {fromSocialAgent ? (
                  <Link
                    to={socialAgentReturnUrl}
                    className="ml-auto rounded-full border border-border px-3 py-1.5 text-xs font-bold text-textMuted transition hover:border-lime hover:text-lime"
                  >
                    返回 Agent
                  </Link>
                ) : null}
              </div>

              {/* Messages */}
              <div
                key={`messages-${activeConvId}`}
                className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
              >
                {activeMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={clsx(
                      'flex',
                      msg.isMine ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={clsx(
                        'max-w-[70%] px-4 py-2.5 rounded-2xl text-sm',
                        msg.isMine
                          ? 'rounded-br-md bg-lime text-white shadow-glow'
                          : 'bg-surface border border-border text-white rounded-bl-md'
                      )}
                    >
                      {msg.source === 'ai_delegate' && (
                        <div
                          className={clsx(
                            'mb-2 inline-flex rounded-md px-2 py-0.5 text-[10px] font-black',
                            msg.isMine
                              ? 'bg-white/20 text-white'
                              : 'bg-lime/15 text-lime',
                          )}
                        >
                          Agent 代发
                        </div>
                      )}
                      <p>{msg.text}</p>
                      {msg.card?.type === 'fitmeet_contact_card' && (
                        <Link
                          to={msg.card.profileUrl}
                          className={clsx(
                            'mt-3 block rounded-xl border p-3 transition',
                            msg.isMine
                              ? 'border-white/25 bg-white/10 hover:bg-white/20'
                              : 'border-lime/25 bg-lime/10 hover:bg-lime/15',
                          )}
                        >
                          <div className="text-xs font-black">FitMeet 站内名片</div>
                          <div className="mt-1 text-sm font-black">{msg.card.name}</div>
                          <div className="mt-1 text-xs opacity-80">
                            {[msg.card.city, ...msg.card.sports].filter(Boolean).join(' · ') || '查看个人主页'}
                          </div>
                        </Link>
                      )}
                      <div
                        className={clsx(
                          'text-[10px] mt-1',
                          msg.isMine ? 'text-white/65' : 'text-textSofter'
                        )}
                      >
                        {msg.time}
                        {msg.deliveryStatus === 'pending' ? ' · 发送中' : ''}
                        {msg.deliveryStatus === 'failed' ? ` · ${msg.errorText || '发送失败'}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border px-5 py-3 bg-base/95 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder={disabledReason || '输入消息...'}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={Boolean(disabledReason)}
                    className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-textSofter focus:border-lime/50"
                  />
                  <button
                    className={clsx(
                      'cursor-pointer rounded-lg px-5 py-2.5 text-sm font-black transition',
                      inputText.trim() && !disabledReason
                        ? 'bg-lime text-white hover:bg-brand2 hover:shadow-glow'
                        : 'bg-surfaceMuted text-textSofter cursor-not-allowed'
                    )}
                    onClick={handleSend}
                    disabled={!inputText.trim() || Boolean(disabledReason)}
                  >
                    发送
                  </button>
                </div>
              </div>
            </>
          ) : conversationError ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="max-w-sm text-center">
                <div className="text-lg font-display font-bold text-white">无法打开会话</div>
                <div className="text-sm text-textSofter mt-2">{conversationError}</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-3">💬</div>
                <div className="text-lg font-display font-bold text-textMuted">选择一个对话开始聊天</div>
                <div className="text-sm text-textSofter mt-1">和你的健身搭子聊起来吧</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function ApplicationInboxSection({
  actionId,
  applicantApplications,
  conversationByApplicationId,
  ownerApplications,
  onAccept,
  onCancel,
  onOpenConversation,
  onReject,
}: {
  actionId: number | null;
  applicantApplications: PublicIntentApplication[];
  conversationByApplicationId: Record<
    number,
    { status: string; conversationId: string | null }
  >;
  ownerApplications: PublicIntentApplication[];
  onAccept: (application: PublicIntentApplication) => void;
  onCancel: (application: PublicIntentApplication) => void;
  onOpenConversation: (application: PublicIntentApplication) => void;
  onReject: (application: PublicIntentApplication) => void;
}) {
  const visibleOwner = ownerApplications.slice(0, 4);
  const visibleApplicant = applicantApplications.slice(0, 4);
  if (visibleOwner.length === 0 && visibleApplicant.length === 0) return null;

  return (
    <section className="border-b border-border/70 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-xs font-black text-white">约练申请</strong>
        <span className="text-[10px] text-textSofter">
          {visibleOwner.length + visibleApplicant.length} 条
        </span>
      </div>
      <div className="space-y-2">
        {visibleOwner.map((application) => (
          <ApplicationCard
            key={`owner-${application.id}`}
            actionId={actionId}
            application={application}
            conversation={conversationByApplicationId[application.id]}
            mode="owner"
            onAccept={onAccept}
            onCancel={onCancel}
            onOpenConversation={onOpenConversation}
            onReject={onReject}
          />
        ))}
        {visibleApplicant.map((application) => (
          <ApplicationCard
            key={`applicant-${application.id}`}
            actionId={actionId}
            application={application}
            conversation={conversationByApplicationId[application.id]}
            mode="applicant"
            onAccept={onAccept}
            onCancel={onCancel}
            onOpenConversation={onOpenConversation}
            onReject={onReject}
          />
        ))}
      </div>
    </section>
  );
}

function ApplicationCard({
  actionId,
  application,
  conversation,
  mode,
  onAccept,
  onCancel,
  onOpenConversation,
  onReject,
}: {
  actionId: number | null;
  application: PublicIntentApplication;
  conversation?: { status: string; conversationId: string | null };
  mode: 'owner' | 'applicant';
  onAccept: (application: PublicIntentApplication) => void;
  onCancel: (application: PublicIntentApplication) => void;
  onOpenConversation: (application: PublicIntentApplication) => void;
  onReject: (application: PublicIntentApplication) => void;
}) {
  const busy = actionId === application.id;
  const ready = application.status === 'accepted' && Boolean(conversation?.conversationId);
  const provisioning =
    application.status === 'accepted' &&
    (!conversation || conversation.status === 'provisioning' || !conversation.conversationId);
  return (
    <article className="rounded-xl border border-border bg-surface/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-black text-white">
            {mode === 'owner' ? `来自用户 ${application.applicantUserId}` : `报名 ${application.publicIntentId}`}
          </div>
          <div className="mt-1 truncate text-[11px] text-textSofter">
            {application.message || '对方没有留言'}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-textMuted">
          {applicationStatusLabel(application.status, provisioning, ready)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {mode === 'owner' && application.status === 'pending' ? (
          <>
            <button
              type="button"
              className="rounded-md bg-lime px-3 py-1 text-[11px] font-black text-white disabled:opacity-60"
              disabled={busy}
              onClick={() => onAccept(application)}
            >
              接受
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-[11px] font-bold text-textMuted disabled:opacity-60"
              disabled={busy}
              onClick={() => onReject(application)}
            >
              拒绝
            </button>
          </>
        ) : null}
        {mode === 'applicant' && application.status === 'pending' ? (
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1 text-[11px] font-bold text-textMuted disabled:opacity-60"
            disabled={busy}
            onClick={() => onCancel(application)}
          >
            取消报名
          </button>
        ) : null}
        {ready ? (
          <button
            type="button"
            className="rounded-md bg-lime px-3 py-1 text-[11px] font-black text-white"
            onClick={() => onOpenConversation(application)}
          >
            进入聊天
          </button>
        ) : null}
        {provisioning ? (
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1 text-[11px] font-bold text-textMuted"
            onClick={() => onOpenConversation(application)}
          >
            正在建立会话
          </button>
        ) : null}
        <Link
          to={`/user/${mode === 'owner' ? application.applicantUserId : application.ownerUserId}`}
          className="rounded-md border border-border px-3 py-1 text-[11px] font-bold text-textMuted"
        >
          查看资料
        </Link>
      </div>
    </article>
  );
}

function applicationStatusLabel(
  status: PublicIntentApplication['status'],
  provisioning: boolean,
  ready: boolean,
) {
  if (ready) return '可聊天';
  if (provisioning) return '建立中';
  switch (status) {
    case 'pending':
      return '待确认';
    case 'accepted':
      return '已接受';
    case 'rejected':
      return '未通过';
    case 'cancelled':
      return '已取消';
    case 'expired':
      return '已过期';
    default:
      return status;
  }
}
