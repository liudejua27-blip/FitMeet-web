import clsx from 'clsx';
import type { AgentWorkbenchMessage } from './agentWorkbenchTypes';

export function AgentMessageList({
  messages,
}: {
  messages: AgentWorkbenchMessage[];
}) {
  return (
    <div className="space-y-5">
      {messages.map((message) => (
        <AgentMessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

export function AgentMessageBubble({ message }: { message: AgentWorkbenchMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[86%] rounded-3xl px-4 py-3 text-sm leading-7 shadow-sm',
          isUser
            ? 'bg-slate-950 text-white'
            : 'border border-slate-200 bg-white text-slate-800',
        )}
      >
        {message.content.split('\n').map((line) => (
          <p key={line || message.id} className="whitespace-pre-wrap">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
