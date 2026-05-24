import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import clsx from 'clsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useMessageStore } from '../stores';

export const MessagesPage = () => {
  const [searchParams] = useSearchParams();
  const {
    conversations,
    activeConvId,
    messages,
    selectConv,
    closeConv,
    sendMessage,
    loadConversations,
  } = useMessageStore();
  const [inputText, setInputText] = useState('');
  const [conversationError, setConversationError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const activeMessages = useMemo(
    () => (activeConvId ? messages[activeConvId] || [] : []),
    [activeConvId, messages],
  );
  const fromSocialAgent = searchParams.get('from') === 'social-agent';
  const agentTaskId = searchParams.get('agentTaskId');
  const socialAgentReturnUrl = agentTaskId
    ? `/social-agent?taskId=${encodeURIComponent(agentTaskId)}`
    : '/social-agent';

  useEffect(() => {
    const fromQuery =
      searchParams.get('conversationId') ?? searchParams.get('conversation');
    if (!fromQuery || activeConvId === fromQuery) return;
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
      selectConv(id);
    },
    [selectConv],
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const handleSend = useCallback(() => {
    if (!inputText.trim() || !activeConvId) return;
    sendMessage(activeConvId, inputText.trim());
    setInputText('');
  }, [inputText, activeConvId, sendMessage]);

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
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
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
                    placeholder="输入消息..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-textSofter focus:border-lime/50"
                  />
                  <button
                    className={clsx(
                      'cursor-pointer rounded-lg px-5 py-2.5 text-sm font-black transition',
                      inputText.trim()
                        ? 'bg-lime text-white hover:bg-brand2 hover:shadow-glow'
                        : 'bg-surfaceMuted text-textSofter cursor-not-allowed'
                    )}
                    onClick={handleSend}
                    disabled={!inputText.trim()}
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
