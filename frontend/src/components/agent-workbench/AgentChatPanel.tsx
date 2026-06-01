import type { FormEvent, RefObject } from 'react';
import type { SocialAgentChatCandidate, SocialAgentPermissionMode } from '../../api/socialAgentApi';
import type { AgentConfirmAction, AgentRunEvent, AgentWorkbenchMessage } from './agentWorkbenchTypes';
import { AgentComposer } from './AgentComposer';
import { AgentMessageList } from './AgentMessageBubble';
import { AgentRunTrace } from './AgentRunTrace';
import { MobileMatchResults } from './MatchWorkspace';
import { permissionModeLabel } from './permissionModeLabel';
import { QuickPromptCards } from './QuickPromptCards';

export function AgentChatPanel({
  mode,
  messages,
  events,
  candidates,
  input,
  isRunning,
  scrollRef,
  onInput,
  onSubmit,
  onStop,
  onPrompt,
  onAction,
}: {
  mode: SocialAgentPermissionMode;
  messages: AgentWorkbenchMessage[];
  events: AgentRunEvent[];
  candidates: SocialAgentChatCandidate[];
  input: string;
  isRunning: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onStop: () => void;
  onPrompt: (value: string) => void;
  onAction: (action: AgentConfirmAction) => void;
}) {
  const hasStarted = messages.length > 0 || events.length > 0 || candidates.length > 0;

  return (
    <section className="flex h-[calc(100vh-72px)] min-w-0 flex-1 flex-col bg-gradient-to-br from-white via-slate-50 to-[#f5f3ff]">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/75 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-slate-950">FitMeet Agent</h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm">
            你的 AI 社交助手，帮你找到同频的人，自然开启关系。
          </p>
        </div>
        <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700">
          {permissionModeLabel(mode)}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {!hasStarted ? (
            <div className="flex min-h-[56vh] flex-col justify-center">
              <div className="max-w-2xl">
                <h2 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  今天想认识什么样的人？
                </h2>
                <p className="mt-4 text-base leading-8 text-slate-500">
                  告诉 FitMeet Agent 你的需求，它会帮你整理画像、推荐合适的人、生成自然开场白。
                </p>
              </div>
              <div className="mt-8">
                <QuickPromptCards onPick={onPrompt} />
              </div>
              <div className="mt-6 rounded-3xl border border-cyan-100 bg-cyan-50/60 p-4 text-sm leading-7 text-cyan-900">
                FitMeet Agent 不会自动发送好友申请、私信、联系方式或线下邀约。所有关键动作都需要你确认。
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <AgentMessageList messages={messages} />
              <AgentRunTrace events={events} defaultCollapsed={!isRunning && candidates.length > 0} />
              <MobileMatchResults candidates={candidates} mode={mode} onAction={onAction} />
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      <AgentComposer
        value={input}
        isRunning={isRunning}
        onChange={onInput}
        onSubmit={onSubmit}
        onStop={onStop}
        onPrompt={onPrompt}
      />
    </section>
  );
}
