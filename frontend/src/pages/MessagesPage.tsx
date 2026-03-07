import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import clsx from 'clsx';
import { useMessageStore } from '../stores';

export const MessagesPage = () => {
  const {
    conversations,
    activeConvId,
    messages,
    selectConv,
    closeConv,
    sendMessage,
  } = useMessageStore();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const activeMessages = useMemo(
    () => (activeConvId ? messages[activeConvId] || [] : []),
    [activeConvId, messages],
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
    <div className="min-h-screen">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] h-[calc(100vh-64px)]">
        {/* Conversation List */}
        <div
          className={clsx(
            'border-r border-border overflow-y-auto',
            activeConvId ? 'hidden lg:block' : 'block'
          )}
        >
          <div className="sticky top-0 z-10 bg-base/95 backdrop-blur-xl border-b border-border px-5 py-4">
            <h2 className="font-display font-bold text-lg text-white">💬 消息</h2>
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
                onClick={() => selectConv(conv.id)}
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-[#09090A]"
                    style={{ background: conv.color }}
                  >
                    {conv.avatar}
                  </div>
                  {conv.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-lime border-2 border-base" />
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
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-[#09090A]"
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
                          ? 'bg-lime text-[#09090A] rounded-br-md'
                          : 'bg-surface border border-border text-white rounded-bl-md'
                      )}
                    >
                      <p>{msg.text}</p>
                      <div
                        className={clsx(
                          'text-[10px] mt-1',
                          msg.isMine ? 'text-[#09090A]/60' : 'text-textSofter'
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
                    className="flex-1 bg-surface border border-border rounded-full px-4 py-2.5 text-sm text-white placeholder:text-textSofter outline-none focus:border-lime/30 transition"
                  />
                  <button
                    className={clsx(
                      'px-5 py-2.5 rounded-full text-sm font-bold transition cursor-pointer',
                      inputText.trim()
                        ? 'bg-lime text-[#09090A] hover:bg-[#d4ff1a]'
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
