import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  socialAgentApi,
  type FitMeetAlphaCard,
  type SocialAgentChatCandidate,
  type SocialAgentChatRunResult,
  type SocialAgentChatStreamEvent,
  type SocialAgentPermissionMode,
} from '../../api/socialAgentApi';
import { agentInboxApi, type AgentInboxEvent } from '../../api/agentInboxApi';
import { lifeGraphApi, type LifeGraphResponse } from '../../api/lifeGraphApi';
import { useAuthStore } from '../../stores';
import {
  LifeGraphOnboardingModal,
  useLifeGraphAgentResults,
} from './LifeGraphAgentFlow';

type AgentView = 'home' | 'chat' | 'settings' | 'projects' | 'history';
type Message = { id: string; role: 'user' | 'assistant'; content: string };
type StepState = 'pending' | 'running' | 'success' | 'waiting' | 'error';
type Step = { id: string; label: string; status: StepState };
type ActionState = 'idle' | 'loading' | 'success' | 'error';
type ActionLogItem = { id: string; label: string; detail: string; status: '完成' | '失败' | '等待确认' };
type NaturalPromptIdea = {
  text: string;
  detail: string;
  prompt?: string;
  action?: 'life_graph' | 'rhythm' | 'weekly' | 'changes';
};

const baseSteps: Step[] = [
  { id: 'understand', label: '正在理解你的需求', status: 'pending' },
  { id: 'profile', label: '正在结合你的 Life Graph', status: 'pending' },
  { id: 'search', label: '正在筛选合适的人', status: 'pending' },
  { id: 'rank', label: '正在排除时间不合适的人', status: 'pending' },
  { id: 'safety_filter', label: '正在检查安全边界', status: 'pending' },
  { id: 'icebreaker', label: '正在生成开场白', status: 'pending' },
  { id: 'approval', label: '正在等待你确认', status: 'pending' },
];

const naturalPromptIdeas: NaturalPromptIdea[] = [
  {
    text: '帮我找今晚附近能一起散步的人',
    detail: '适合还没想好具体活动，只想低压力认识人。',
    prompt: '最近有点无聊，想找个人走走',
  },
  {
    text: '今晚想找青岛大学附近跑步搭子',
    detail: '我会结合时间、运动强度、区域和安全边界筛选。',
    prompt: '今晚想找青岛大学附近跑步搭子',
  },
  {
    text: '看看我的 Life Graph 还缺什么',
    detail: '补齐会影响推荐准确度的少量关键信息。',
    action: 'life_graph',
  },
  {
    text: '推荐我这周适合参加的活动',
    detail: '优先低压力、公共场所、时间更合适的活动。',
    action: 'weekly',
  },
  {
    text: '分析一下我最近的生活节奏',
    detail: '看看你最近更适合运动、散步、聊天还是休息。',
    action: 'rhythm',
  },
  {
    text: '我最近更适合认识什么样的人',
    detail: '根据你的反馈和边界，解释更适合的候选类型。',
    action: 'changes',
  },
];

export function AgentWorkspace({ view }: { view: AgentView }) {
  const params = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [steps, setSteps] = useState<Step[]>(baseSteps);
  const [result, setResult] = useState<SocialAgentChatRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<SocialAgentPermissionMode>('limited_auto');
  const [elapsed, setElapsed] = useState(0);
  const [lifeGraphOpen, setLifeGraphOpen] = useState(false);
  const [lifeGraph, setLifeGraph] = useState<LifeGraphResponse | null>(null);
  const [inboxEvents, setInboxEvents] = useState<AgentInboxEvent[]>([]);
  const { setResult: setLifeGraphResult, resultNode: lifeGraphResultNode } = useLifeGraphAgentResults();
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const finishedRef = useRef(false);
  const shellView = view === 'chat' || params.taskId ? 'chat' : view;

  useEffect(() => {
    document.title = 'FitMeet Agent';
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let cancelled = false;
    void Promise.allSettled([
      lifeGraphApi.getMe(),
      agentInboxApi.events({ limit: 6, unreadOnly: true }),
    ]).then(([graphResult, inboxResult]) => {
      if (cancelled) return;
      if (graphResult.status === 'fulfilled') setLifeGraph(graphResult.value);
      if (inboxResult.status === 'fulfilled') setInboxEvents(inboxResult.value.events);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isRunning) {
      setElapsed(0);
      return undefined;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(1, Math.round((Date.now() - started) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, steps, result]);

  const submit = async (event?: FormEvent, prompt?: string) => {
    event?.preventDefault();
    const goal = (prompt ?? input).trim();
    if (!goal || isRunning) return;
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    setMessages((current) => [...current, { id: nextId('user'), role: 'user', content: goal }]);
    setInput('');
    setResult(null);
    setIsRunning(true);
    finishedRef.current = false;
    setSteps(baseSteps.map((step, index) => ({ ...step, status: index === 0 ? 'running' : 'pending' })));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const finalResult = await socialAgentApi.runChatStream(
        { goal, permissionMode: mode, idempotencyKey: `agent-workspace-${Date.now()}` },
        handleStreamEvent,
        controller.signal,
      );
      if (!finishedRef.current) finish(finalResult);
      navigate(`/agent/chat/${finalResult.taskId}`, { replace: false });
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content: '这次请求没有顺利完成。我已经保留当前上下文，你可以稍后重试，或者把需求说得更具体一些。',
        },
      ]);
      setSteps((current) => current.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)));
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStreamEvent = (event: SocialAgentChatStreamEvent) => {
    if (event.type === 'step') {
      setSteps((current) => mergeStep(current, event.step.id, event.step.label, event.step.status));
    }
    if (event.type === 'result') finish(event.result);
  };

  const finish = (finalResult: SocialAgentChatRunResult) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setResult(finalResult);
    setMessages((current) => [
      ...current,
      {
        id: nextId('assistant'),
        role: 'assistant',
        content:
          finalResult.assistantMessage ||
          (finalResult.candidates.length > 0
            ? `我先为你筛出 ${finalResult.candidates.length} 个候选结果。联系、见面和敏感信息交换都需要你确认后执行。`
            : '暂时没有足够合适的真实结果。你可以补充时间、地点、偏好或安全边界，我会继续缩小范围。'),
      },
    ]);
    setSteps((current) =>
      current.map((step) => ({
        ...step,
        status:
          step.id === 'approval'
            ? 'waiting'
            : step.status === 'pending' || step.status === 'running'
              ? 'success'
              : step.status,
      })),
    );
  };

  const stopRun = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setSteps((current) => current.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)));
  };

  const startLifeGraph = () => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    setLifeGraphOpen(true);
  };

  const showLifeGraphResult = (type: 'rhythm' | 'weekly' | 'changes') => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    setLifeGraphResult(type);
  };

  const currentGoal = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  return (
    <AgentWorkspaceLayout
      mode={mode}
      result={result}
      steps={steps}
      currentGoal={currentGoal}
      lifeGraph={lifeGraph}
      inboxEvents={inboxEvents}
    >
      {shellView === 'settings' ? (
        <AgentSettings mode={mode} onModeChange={setMode} />
      ) : shellView === 'projects' ? (
        <AgentReservedView title="我的匹配" body="这里会沉淀你确认过、收藏过和等待继续沟通的匹配对象。" />
      ) : shellView === 'history' ? (
        <AgentReservedView title="最近需求" body="这里会展示你过去发起的社交需求、Agent 推荐和确认记录。" />
      ) : (
        <div className="agent-gpt-stage agent-gpt-stage--simple">
          <section className={clsx('agent-gpt-chat', messages.length > 0 && 'agent-gpt-chat--active')}>
            {messages.length === 0 && !isRunning && !result ? (
              <AgentStartScreen
                input={input}
                onInput={setInput}
                onSubmit={submit}
                isLoggedIn={isLoggedIn}
                onStartLifeGraph={startLifeGraph}
                onShowLifeGraphResult={showLifeGraphResult}
                lifeGraphResultNode={lifeGraphResultNode}
              />
            ) : (
              <AgentThread
                input={input}
                onInput={setInput}
                onSubmit={submit}
                onStop={stopRun}
                isRunning={isRunning}
                elapsed={elapsed}
                steps={steps}
                messages={messages}
                result={result}
                endRef={endRef}
              />
            )}
          </section>
          <LifeGraphOnboardingModal open={lifeGraphOpen} onClose={() => setLifeGraphOpen(false)} />
        </div>
      )}
    </AgentWorkspaceLayout>
  );
}

function AgentWorkspaceLayout({
  children,
  mode,
  result,
  steps,
  currentGoal,
  lifeGraph,
  inboxEvents,
}: {
  children: ReactNode;
  mode: SocialAgentPermissionMode;
  result: SocialAgentChatRunResult | null;
  steps: Step[];
  currentGoal: string;
  lifeGraph: LifeGraphResponse | null;
  inboxEvents: AgentInboxEvent[];
}) {
  const activeStep = steps.find((step) => step.status === 'running') ?? steps.find((step) => step.status === 'waiting');
  const pendingActions = result?.approvalRequiredActions.length ?? 0;
  const inboxHint = inboxEvents.find((event) => event.eventType.includes('recommended'));
  return (
    <div className="agent-workspace agent-workspace--gpt">
      <aside className="agent-gpt-sidebar agent-assistant-context" aria-label="FitMeet Agent 轻量上下文">
        <Link to="/" className="agent-gpt-brand">
          <span>F</span>
          <strong>FitMeet Agent</strong>
        </Link>
        <section>
          <span>当前目标</span>
          <p>{currentGoal || '还没有新的社交目标'}</p>
        </section>
        <section>
          <span>Life Graph 摘要</span>
          <p>{lifeGraph?.dynamicInsights?.summary || lifeGraph?.profile.aiSummary || '我会先用低压力、公共场所和需要确认的方式推进。'}</p>
          <small>完整度 {lifeGraph?.completeness.completenessScore ?? 0}%</small>
        </section>
        <section>
          <span>Agent 正在关注</span>
          <p>{activeStep?.label || '时间、地点、社交压力和安全边界'}</p>
        </section>
        <section>
          <span>待确认动作</span>
          <p>{pendingActions > 0 ? `${pendingActions} 个动作等待你确认` : '暂时没有越权动作'}</p>
        </section>
        {inboxHint ? (
          <section>
            <span>Agent Inbox</span>
            <p>{inboxHint.contentPreview || '今天我帮你发现了可能适合的搭子。要看看吗？'}</p>
            <Link to="/agent-inbox">查看</Link>
          </section>
        ) : null}
      </aside>
      <main className="agent-gpt-main">
        <header className="agent-assistant-top">
          <div>
            <strong>FitMeet Agent</strong>
            <span>私人社交生活助理</span>
          </div>
          <div>
            <span>{modeLabel(mode)}</span>
            <span>Life Graph {lifeGraph?.completeness.completenessScore ?? 0}%</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function AgentStartScreen({
  input,
  onInput,
  onSubmit,
  isLoggedIn,
  onStartLifeGraph,
  onShowLifeGraphResult,
  lifeGraphResultNode,
}: {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  isLoggedIn: boolean;
  onStartLifeGraph: () => void;
  onShowLifeGraphResult: (type: 'rhythm' | 'weekly' | 'changes') => void;
  lifeGraphResultNode: ReactNode;
}) {
  const pickIdea = (idea: (typeof naturalPromptIdeas)[number]) => {
    if (idea.action === 'life_graph') {
      onStartLifeGraph();
      return;
    }
    if (idea.action === 'rhythm' || idea.action === 'weekly' || idea.action === 'changes') {
      onShowLifeGraphResult(idea.action);
      return;
    }
    onSubmit(undefined, idea.prompt ?? idea.text);
  };

  return (
    <div className="agent-gpt-start agent-gpt-start--product">
      <div className="agent-gpt-start__copy">
        <span className="agent-beta-pill">私人社交生活助理</span>
        <h1>今天想认识谁，或想做点什么？</h1>
        <p>
          你可以直接说想找什么人、想做什么事；如果还不确定，我会先轻轻补问，再帮你找更合适的人或活动。
        </p>
        {!isLoggedIn ? <small>登录后我会结合你的 Life Graph，但关键动作仍然需要你确认。</small> : null}
      </div>
      <AgentInput input={input} onInput={onInput} onSubmit={onSubmit} />
      <section className="agent-natural-prompts" aria-label="你可以这样问我">
        <span>你可以这样问我</span>
        <div>
          {naturalPromptIdeas.map((idea) => (
            <button key={idea.text} type="button" onClick={() => pickIdea(idea)}>
              <strong>{idea.text}</strong>
              <small>{idea.detail}</small>
            </button>
          ))}
        </div>
      </section>
      {lifeGraphResultNode}
    </div>
  );
}

function AgentThread({
  input,
  onInput,
  onSubmit,
  onStop,
  isRunning,
  elapsed,
  steps,
  messages,
  result,
  endRef,
}: {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  onStop: () => void;
  isRunning: boolean;
  elapsed: number;
  steps: Step[];
  messages: Message[];
  result: SocialAgentChatRunResult | null;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="agent-gpt-thread">
      <div className="agent-gpt-thread__messages">
        {messages.map((message) => (
          <AgentMessageBubble key={message.id} message={message} />
        ))}
        {isRunning ? <AgentThinkingBlock elapsed={elapsed} steps={steps} onStop={onStop} /> : null}
        {result ? <ProgressiveResult result={result} onPick={onSubmit} /> : null}
        <div ref={endRef} />
      </div>
      <AgentInput compact input={input} onInput={onInput} onSubmit={onSubmit} />
    </div>
  );
}

function AgentInput({
  compact,
  input,
  onInput,
  onSubmit,
}: {
  compact?: boolean;
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
}) {
  return (
    <form className={clsx('agent-gpt-input', compact && 'agent-gpt-input--compact')} onSubmit={(event) => onSubmit(event)}>
      <textarea
        aria-label="描述你的社交需求"
        value={input}
        onChange={(event) => onInput(event.target.value)}
        placeholder="告诉我你想找什么人、想做什么事，或者让我看看你最近适合认识谁"
        rows={1}
      />
      <button type="submit" aria-label="发送需求">
        <ArrowUpIcon />
      </button>
    </form>
  );
}

function AgentThinkingBlock({
  elapsed,
  steps,
  onStop,
}: {
  elapsed: number;
  steps: Step[];
  onStop: () => void;
}) {
  const active = steps.find((step) => step.status === 'running') ?? steps.find((step) => step.status === 'waiting');
  return (
    <div className="agent-gpt-thinking">
      <div>
        <span className="agent-gpt-pulse" />
        <strong>{active?.label ?? 'Agent 正在处理'}</strong>
        <small>{elapsed}s</small>
      </div>
      <button type="button" onClick={onStop}>停止</button>
    </div>
  );
}

function AgentMessageBubble({ message }: { message: Message }) {
  return <div className={clsx('agent-gpt-message', message.role === 'user' && 'agent-gpt-message--user')}>{message.content}</div>;
}

function ProgressiveResult({
  result,
  onPick,
}: {
  result: SocialAgentChatRunResult;
  onPick: (event?: FormEvent, prompt?: string) => void;
}) {
  const [actionState, setActionState] = useState<Record<string, ActionState>>({});
  const [actionLog, setActionLog] = useState<ActionLogItem[]>([]);
  const missingSignals = collectMissingSignals(result);
  const safetyNotes = collectSafetyNotes(result);

  const runAction = async (key: string, label: string, action: () => Promise<{ status?: string; requiresApproval?: boolean }>) => {
    if (actionState[key] === 'loading') return;
    setActionState((current) => ({ ...current, [key]: 'loading' }));
    try {
      const response = await action();
      const pendingApproval = response.requiresApproval || response.status === 'pending_approval';
      setActionState((current) => ({ ...current, [key]: 'success' }));
      setActionLog((current) => [
        {
          id: nextId('audit'),
          label,
          detail: pendingApproval ? '已提交确认流，等待你在安全边界内继续确认。' : '动作已完成，并写入本次 Agent 审计记录。',
          status: pendingApproval ? '等待确认' : '完成',
        },
        ...current,
      ]);
    } catch {
      setActionState((current) => ({ ...current, [key]: 'error' }));
      setActionLog((current) => [
        {
          id: nextId('audit'),
          label,
          detail: '动作没有完成。你可以稍后重试，或者让 Agent 重新生成更稳妥的方案。',
          status: '失败',
        },
        ...current,
      ]);
    }
  };

  const publishDraft = () => {
    if (!result.socialRequestDraft) return;
    void runAction('publish-draft', '确认创建本次社交需求', () =>
      socialAgentApi.publishSocialRequest(result.taskId, {
        ...result.socialRequestDraft,
        metadata: { source: 'agent_workspace', userConfirmed: true },
      }),
    );
  };

  return (
    <div className="agent-gpt-results agent-product-results">
      <NaturalCardStack cards={result.cards ?? []} actionLog={actionLog} />
      {result.socialRequestDraft ? (
        <AgentDraftCard draft={result.socialRequestDraft} state={actionState['publish-draft']} onPublish={publishDraft} />
      ) : null}
      <AgentMissingInfoPanel missingSignals={missingSignals} onPick={onPick} />
      {result.candidates.length > 0 ? (
        <section className="agent-gpt-result-block">
          <div className="agent-result-heading">
            <span>匹配结果</span>
            <h2>为你推荐的人</h2>
            <p>下面是 Agent 根据需求、授权画像和安全边界筛出的候选。联系、见面和敏感信息交换都需要你确认。</p>
          </div>
          <div className="agent-gpt-candidates">
            {result.candidates.slice(0, 4).map((candidate) => (
              <AgentCandidateCard
                key={`${candidate.candidateRecordId ?? candidate.userId}-${candidate.nickname}`}
                candidate={candidate}
                taskId={result.taskId}
                actionState={actionState}
                onRunAction={runAction}
                onPick={onPick}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="agent-gpt-result-block">
          <h2>暂时没有足够合适的候选</h2>
          <p>可以补充时间、地点、活动类型、接受范围或安全边界，Agent 会继续收敛。</p>
        </section>
      )}
      <section className="agent-next-actions">
        <span>下一步</span>
        <div>
          {['缩小到 3 公里内', '只看今晚有空的人', '生成低压力开场白', '补充我的社交边界'].map((action) => (
            <button key={action} type="button" onClick={() => onPick(undefined, action)}>
              {action}
            </button>
          ))}
        </div>
      </section>
      <AgentSafetyPanel pendingActions={result.approvalRequiredActions.length} notes={safetyNotes} />
      <AgentFeedbackPanel onPick={onPick} />
    </div>
  );
}

function NaturalCardStack({
  cards,
  actionLog,
}: {
  cards: FitMeetAlphaCard[];
  actionLog: ActionLogItem[];
}) {
  const usefulCards = cards.filter((card) => card.type !== 'candidate_card').slice(0, 4);
  if (!usefulCards.length && actionLog.length === 0) return null;
  return (
    <section className="agent-gpt-result-block agent-natural-cards">
      <div className="agent-result-heading">
        <span>确认与提醒</span>
        <h2>我会在这些动作前停下来</h2>
        <p>你确认前，我不会发送消息、加好友、创建活动或共享敏感信息。</p>
      </div>
      <div>
        {usefulCards.map((card) => (
          <article key={card.id}>
            <strong>{card.title}</strong>
            {card.body ? <p>{String(card.body)}</p> : null}
          </article>
        ))}
        {actionLog.slice(0, 3).map((item) => (
          <article key={item.id}>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentDraftCard({
  draft,
  state,
  onPublish,
}: {
  draft: NonNullable<SocialAgentChatRunResult['socialRequestDraft']>;
  state?: ActionState;
  onPublish: () => void;
}) {
  return (
    <section className="agent-gpt-result-block agent-draft-card">
      <div className="agent-result-heading">
        <span>需求理解</span>
        <h2>我理解你的需求</h2>
      </div>
      <p>{String(draft.description ?? draft.rawText ?? draft.title ?? 'Agent 已生成一个可确认的社交需求草稿。')}</p>
      <div className="agent-gpt-tags">
        {draft.city ? <span>{String(draft.city)}</span> : null}
        {draft.activityType ? <span>{String(draft.activityType)}</span> : null}
        {draft.interestTags?.slice(0, 4).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <div className="agent-confirm-row">
        <p>确认后可创建本次需求，让 Agent 继续推进候选人、活动或约练计划。</p>
        <button type="button" onClick={onPublish} disabled={state === 'loading'}>
          {state === 'loading' ? '创建中...' : state === 'success' ? '已创建' : '确认创建需求'}
        </button>
      </div>
    </section>
  );
}

function AgentMissingInfoPanel({
  missingSignals,
  onPick,
}: {
  missingSignals: string[];
  onPick: (event?: FormEvent, prompt?: string) => void;
}) {
  const defaults = ['补充今晚可见面的时间范围', '补充可接受距离和见面地点', '补充不希望触碰的社交边界'];
  const items = missingSignals.length ? missingSignals.slice(0, 4) : defaults;
  return (
    <section className="agent-gpt-result-block agent-missing-info">
      <div className="agent-result-heading">
        <span>补问信息</span>
        <h2>还可以让匹配更准</h2>
        <p>这些信息不是负担，只是帮助 Agent 缩小范围。你可以只补充愿意授权的部分。</p>
      </div>
      <div>
        {items.map((item) => (
          <button key={item} type="button" onClick={() => onPick(undefined, item)}>
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function AgentCandidateCard({
  candidate,
  taskId,
  actionState,
  onRunAction,
  onPick,
}: {
  candidate: SocialAgentChatCandidate;
  taskId: number;
  actionState: Record<string, ActionState>;
  onRunAction: (key: string, label: string, action: () => Promise<{ status?: string; requiresApproval?: boolean }>) => void;
  onPick: (event?: FormEvent, prompt?: string) => void;
}) {
  const [openerConfirmVisible, setOpenerConfirmVisible] = useState(false);
  const reasons = uniqueList([...(candidate.candidateExplanation?.fitReasons ?? []), ...(candidate.matchReasons ?? []), ...(candidate.reasons ?? [])]);
  const lifeGraph = candidate.candidateExplanation?.lifeGraphExplanation ?? candidate.lifeGraphExplanation;
  const warnings = uniqueList([
    ...(candidate.riskWarnings ?? []),
    ...(candidate.risk?.warnings ?? []),
    ...(candidate.candidateExplanation?.awkwardPoints ?? []),
  ]);
  const targetUserId = candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId;
  const message = candidate.candidateExplanation?.suggestedOpener || candidate.suggestedOpener || candidate.suggestedMessage;
  const payload = buildCandidatePayload(candidate);
  const messageKey = `message-${candidate.candidateRecordId ?? targetUserId}`;
  const displayName = candidate.displayName || candidate.nickname;
  const recommendationLine =
    String(candidateCardData(candidate, 'recommendationLine') || '') ||
    `我推荐 ${displayName}，不是只看兴趣相同，而是你们的时间、区域和边界比较接近。`;
  const whyNow =
    String(candidateCardData(candidate, 'whyNow') || '') ||
    '现在适合先从低压力开场开始，再根据对方回复决定是否约见。';
  const safetyBoundary =
    String(candidateCardData(candidate, 'safetyBoundary') || '') ||
    '第一次建议选择公共场所，先站内沟通，不共享精确位置。';
  const lifeGraphUpdatePreview =
    String(candidateCardData(candidate, 'lifeGraphUpdatePreview') || '') ||
    '如果这次约练完成，我会更新你的低压力运动社交偏好，并提高同区域、公共场所搭子的推荐权重。';

  return (
    <article className="agent-gpt-candidate">
      <div className="agent-gpt-candidate__avatar" style={{ background: candidate.color || '#111827' }}>
        {(candidate.displayName || candidate.nickname || 'F').slice(0, 1)}
      </div>
      <div>
        <h3>{displayName}</h3>
        <p>
          {candidate.city || '同城'} / 匹配度 {Math.round(candidate.matchScore ?? candidate.score ?? 0)}
        </p>
        {candidate.distanceKm != null ? <small>{candidate.distanceKm.toFixed(1)} km 附近</small> : null}
      </div>
      {recommendationLine ? (
        <div className="agent-candidate-recommendation">
          <strong>一句话推荐</strong>
          <p>{recommendationLine}</p>
        </div>
      ) : null}
      <div className="agent-candidate-reasons">
        <strong>具体适合原因</strong>
        <ul>
          {reasons.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
      {whyNow ? (
        <div className="agent-safe-step">
          <strong>为什么现在适合</strong>
          <p>{whyNow}</p>
        </div>
      ) : null}
      {lifeGraph ? (
        <div className="agent-lifegraph-explain">
          <strong>Life Graph 如何参与</strong>
          <p>可信度：{confidenceLabel(lifeGraph.confidenceLevel)}</p>
          <div>
            {lifeGraph.usedSignals.slice(0, 4).map((signal) => (
              <span key={signal}>{signal}</span>
            ))}
          </div>
          {lifeGraph.boundaryNotes.length ? <small>{lifeGraph.boundaryNotes.slice(0, 2).join('；')}</small> : null}
        </div>
      ) : null}
      {warnings.length ? (
        <div className="agent-candidate-warning">
          <strong>安全提示</strong>
          <p>{warnings.slice(0, 2).join('；')}</p>
        </div>
      ) : safetyBoundary ? (
        <div className="agent-candidate-warning">
          <strong>安全提示</strong>
          <p>{safetyBoundary}</p>
        </div>
      ) : null}
      {candidate.candidateExplanation?.safeFirstStep || candidate.emotionalInsight?.safeFirstStep ? (
        <div className="agent-safe-step">
          <strong>建议第一步</strong>
          <p>{candidate.candidateExplanation?.safeFirstStep || candidate.emotionalInsight?.safeFirstStep}</p>
        </div>
      ) : null}
      {message ? (
        <blockquote>
          <span>开场白草稿</span>
          {message}
        </blockquote>
      ) : null}
      {openerConfirmVisible && message ? (
        <div className="agent-opener-confirm">
          <strong>发送前请你确认</strong>
          <p>我已经准备好开场白。确认前不会发送，也不会加好友或共享联系方式。</p>
          <blockquote>{message}</blockquote>
          <button
            type="button"
            disabled={actionState[messageKey] === 'loading'}
            onClick={() =>
              onRunAction(messageKey, `向 ${displayName} 发送开场白`, () =>
                socialAgentApi.sendCandidateMessage(taskId, {
                  ...payload,
                  targetUserId,
                  candidateUserId: candidate.candidateUserId ?? targetUserId,
                  message: message || '你好，我在 FitMeet 上看到我们这次需求比较匹配，想先低压力聊聊。',
                  suggestedOpener: message,
                }),
              )
            }
          >
            {buttonText(actionState[messageKey], '确认发送')}
          </button>
        </div>
      ) : null}
      {lifeGraphUpdatePreview ? (
        <div className="agent-safe-step">
          <strong>完成后我会更新什么</strong>
          <p>{lifeGraphUpdatePreview}</p>
        </div>
      ) : null}
      <div className="agent-candidate-actions">
        <button
          type="button"
          disabled={!message}
          onClick={() => setOpenerConfirmVisible(true)}
        >
          生成开场白
        </button>
        <button type="button" onClick={() => onPick(undefined, '看看更多类似的人')}>
          看看更多
        </button>
        <button type="button" onClick={() => onPick(undefined, '只看同校的人')}>
          只看同校
        </button>
        <button type="button" onClick={() => onPick(undefined, '只看女生')}>
          只看女生
        </button>
        <button type="button" onClick={() => onPick(undefined, `帮我和 ${displayName} 创建一次公共场所约练`)}>
          创建约练
        </button>
        <button type="button" onClick={() => onPick(undefined, `我不喜欢 ${displayName} 这个推荐，重新匹配`)}>
          不喜欢这个推荐
        </button>
      </div>
    </article>
  );
}

function AgentSafetyPanel({ pendingActions, notes }: { pendingActions: number; notes: string[] }) {
  return (
    <section className="agent-gpt-approval agent-safety-panel">
      <div className="agent-result-heading">
        <span>安全边界</span>
        <h2>等待你确认</h2>
        <p>
          当前有 {pendingActions} 个关键动作等待确认。即使没有待确认动作，Agent 也不会自动交换联系方式、共享位置或发起线下见面。
        </p>
      </div>
      <div>
        {(notes.length ? notes : ['联系前需要你确认', '见面建议选择公共场所', '不会自动共享手机号、微信或实时位置']).slice(0, 5).map((note) => (
          <span key={note}>{note}</span>
        ))}
      </div>
    </section>
  );
}

function AgentFeedbackPanel({ onPick }: { onPick: (event?: FormEvent, prompt?: string) => void }) {
  return (
    <section className="agent-feedback-panel" aria-label="反馈推荐质量">
      {['推荐有用，继续收敛', '不合适，重新匹配', '安全边界再严格一点'].map((feedback) => (
        <button key={feedback} type="button" onClick={() => onPick(undefined, feedback)}>
          {feedback}
        </button>
      ))}
    </section>
  );
}

function AgentSettings({
  mode,
  onModeChange,
}: {
  mode: SocialAgentPermissionMode;
  onModeChange: (mode: SocialAgentPermissionMode) => void;
}) {
  return (
    <div className="agent-gpt-stage">
      <section className="agent-gpt-results">
        <div className="agent-gpt-result-block">
          <div className="agent-result-heading">
            <span>Agent 设置</span>
            <h2>权限模式</h2>
            <p>Alpha 阶段默认采用确认优先策略。发消息、加好友、创建活动、交换联系方式和敏感画像更新都需要你确认。</p>
          </div>
          <div className="agent-gpt-tags">
            {(['assist', 'confirm', 'limited_auto'] as SocialAgentPermissionMode[]).map((item) => (
              <button key={item} type="button" onClick={() => onModeChange(item)} className={clsx(mode === item && 'is-active')}>
                {modeLabel(item)}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentReservedView({ title, body }: { title: string; body: string }) {
  return (
    <div className="agent-gpt-stage">
      <section className="agent-gpt-results">
        <div className="agent-gpt-result-block">
          <div className="agent-result-heading">
            <span>FitMeet Agent</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
          <Link to="/agent" className="agent-link-button">发起新需求</Link>
        </div>
      </section>
    </div>
  );
}

function collectMissingSignals(result: SocialAgentChatRunResult): string[] {
  const signals = new Set<string>();
  result.candidates.forEach((candidate) => {
    candidate.lifeGraphExplanation?.missingSignals?.forEach((item) => signals.add(item));
    candidate.candidateExplanation?.lifeGraphExplanation?.missingSignals?.forEach((item) => signals.add(item));
  });
  result.cards?.forEach((card) => {
    const missing = card.data.missingInformation;
    if (Array.isArray(missing)) missing.forEach((item) => signals.add(String(item)));
  });
  return Array.from(signals).filter(Boolean);
}

function collectSafetyNotes(result: SocialAgentChatRunResult): string[] {
  const notes = new Set<string>();
  result.safety?.boundaryNotes?.forEach((item) => notes.add(item));
  result.safety?.requiredConfirmations?.forEach((item) => notes.add(`需要确认：${item}`));
  result.candidates.forEach((candidate) => {
    candidate.riskWarnings?.forEach((item) => notes.add(item));
    candidate.risk?.warnings?.forEach((item) => notes.add(item));
    candidate.candidateExplanation?.awkwardPoints?.forEach((item) => notes.add(item));
  });
  return Array.from(notes).filter(Boolean);
}

function buildCandidatePayload(candidate: SocialAgentChatCandidate) {
  const targetUserId = candidate.targetUserId ?? candidate.candidateUserId ?? candidate.userId;
  return {
    targetUserId,
    candidateUserId: candidate.candidateUserId ?? targetUserId,
    candidateRecordId: candidate.candidateRecordId,
    publicIntentId: candidate.publicIntentId ?? null,
    socialRequestId: candidate.socialRequestId,
    candidate: { ...candidate, targetUserId },
  };
}

function candidateCardData(candidate: SocialAgentChatCandidate, key: string): unknown {
  const record = candidate as unknown as Record<string, unknown>;
  return record[key];
}

function mergeStep(steps: Step[], id: string, label: string, status: 'pending' | 'running' | 'done' | 'failed'): Step[] {
  const nextStatus: StepState = status === 'done' ? 'success' : status === 'failed' ? 'error' : status;
  const index = steps.findIndex((step) => step.id === id);
  if (index >= 0) {
    return steps.map((step, itemIndex) =>
      itemIndex === index ? { ...step, label, status: nextStatus } : step.status === 'running' && nextStatus === 'running' ? { ...step, status: 'success' } : step,
    );
  }
  return [...steps.map((step) => (step.status === 'running' ? { ...step, status: 'success' as const } : step)), { id, label, status: nextStatus }];
}

function buttonText(state: ActionState | undefined, fallback: string) {
  if (state === 'loading') return '处理中...';
  if (state === 'success') return '已提交';
  if (state === 'error') return '重试';
  return fallback;
}

function confidenceLabel(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return '高';
  if (value === 'medium') return '中';
  return '低';
}

function uniqueList(items: Array<string | undefined | null>) {
  return Array.from(new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean)));
}

function modeLabel(mode: SocialAgentPermissionMode) {
  if (mode === 'assist') return '只建议';
  if (mode === 'confirm') return '每步确认';
  if (mode === 'limited_auto') return '低风险自动，高风险确认';
  return mode;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5l6 6-1.4 1.4-3.6-3.6V19h-2V8.8l-3.6 3.6L6 11l6-6z" fill="currentColor" />
    </svg>
  );
}
