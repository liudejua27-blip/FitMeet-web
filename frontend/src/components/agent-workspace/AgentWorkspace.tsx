import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  ChevronsLeft,
  Clock3,
  Dumbbell,
  Eye,
  Footprints,
  Home,
  LockKeyhole,
  MapPin,
  PersonStanding,
  Plus,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '../ai-elements/confirmation';
import {
  Message as AiMessage,
  MessageContent as AiMessageContent,
  MessageResponse,
} from '../ai-elements/message';
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
} from '../ai-elements/prompt-input';
import {
  socialAgentApi,
  type FitMeetAlphaCard,
  type FitMeetAlphaCardAction,
  type FitMeetAgentSchemaAction,
  type SocialAgentPermissionMode,
  type UserFacingAgentProgressEvent,
  type UserFacingAgentProgressKind,
  type UserFacingAgentLightStatus,
  type UserFacingAgentResponse,
  type UserFacingAgentStreamEvent,
} from '../../api/socialAgentApi';
import { activitiesApi, type ActivityProof, type SocialActivity } from '../../api/activitiesApi';
import { lifeGraphApi, type LifeGraphResponse } from '../../api/lifeGraphApi';
import { useAuthStore } from '../../stores';
import {
  auditAgentPageModules,
  type AgentPageModuleAuditResult,
} from '../../debug/agentPageModuleAudit';
import { loadAgentTaskEvents, type AgentTaskDebugEvent } from '../../debug/agentTaskEvents';
import { LifeGraphOnboardingModal } from './LifeGraphAgentFlow';
import { useLifeGraphAgentResults } from './useLifeGraphAgentResults';

type AgentView = 'home' | 'chat' | 'settings' | 'projects' | 'history';
type AgentThreadMessage = { id: string; role: 'user' | 'assistant'; content: string };
type StepState = 'pending' | 'running' | 'success' | 'waiting' | 'error';
type Step = {
  id: string;
  label: string;
  status: StepState;
  kind?: UserFacingAgentProgressKind;
  detail?: string;
};
type AgentSuggestionItem = {
  text: string;
  detail: string;
  icon: LucideIcon;
  tone: 'sage' | 'blue' | 'gold' | 'clay' | 'mint' | 'violet';
  prompt?: string;
  action?: 'life_graph' | 'rhythm' | 'weekly' | 'changes';
};
type AgentConfirmationViewModel = {
  id: string;
  title: string;
  body: string;
  primaryLabel?: string;
  secondaryLabels?: string[];
  onPrimary?: () => void;
  onSecondary?: (label: string) => void;
};
type AgentPrivacySettings = {
  showBodyInfo: boolean;
  showExactLocation: boolean;
};
type ActivityDetailState = {
  activity: SocialActivity;
  proofs: ActivityProof[];
};

const technicalPublicTextPattern =
  /\b(traceId|agentTrace|structuredIntent|planner|tool\s*call|toolCall|toolCalls|DeepSeek|OpenAI|raw JSON|stack)\b|Life Graph Agent|Social Match Agent|Meet Loop Agent|工具调用|数据库字段|错误堆栈/i;

const baseSteps: Step[] = [
  { id: 'understand', label: '正在理解你的需求', status: 'pending' },
  { id: 'profile', label: '正在结合你的 Life Graph', status: 'pending' },
  { id: 'search', label: '正在筛选合适的人', status: 'pending' },
  { id: 'rank', label: '正在排除时间不合适的人', status: 'pending' },
  { id: 'safety_filter', label: '正在检查安全边界', status: 'pending' },
  { id: 'icebreaker', label: '正在生成开场白', status: 'pending' },
  { id: 'approval', label: '正在等待你确认', status: 'pending' },
];

const naturalPromptIdeas: AgentSuggestionItem[] = [
  {
    text: '今晚想出门走走',
    detail: '找一个同城、低压力、不会尬聊的人。',
    icon: PersonStanding,
    tone: 'sage',
    prompt: '今晚想出门走走，找个低压力的人一起散步',
  },
  {
    text: '找个跑步搭子',
    detail: '时间、距离和强度都别太拧巴。',
    icon: Footprints,
    tone: 'blue',
    prompt: '今晚想找青岛大学附近跑步搭子',
  },
  {
    text: '整理我的社交边界',
    detail: '哪些可以主动，哪些需要慢一点。',
    icon: ShieldCheck,
    tone: 'gold',
    action: 'life_graph',
  },
  {
    text: '这周有什么轻松活动',
    detail: '不卷、不赶场，能自然认识人。',
    icon: CalendarDays,
    tone: 'clay',
    action: 'weekly',
  },
  {
    text: '看看我最近的节奏',
    detail: '适合热闹一点，还是先恢复能量。',
    icon: ChartNoAxesCombined,
    tone: 'mint',
    action: 'rhythm',
  },
  {
    text: '谁和我节奏接近',
    detail: '从作息、活动和聊天方式里找线索。',
    icon: UsersRound,
    tone: 'violet',
    action: 'changes',
  },
];

export function AgentWorkspace({ view }: { view: AgentView }) {
  const params = useParams();
  const navigate = useNavigate();
  const { isLoggedIn, openLogin } = useAuthStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AgentThreadMessage[]>([]);
  const [steps, setSteps] = useState<Step[]>(baseSteps);
  const [userResult, setUserResult] = useState<UserFacingAgentResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<SocialAgentPermissionMode>('limited_auto');
  const [elapsed, setElapsed] = useState(0);
  const [lifeGraphOpen, setLifeGraphOpen] = useState(false);
  const [lifeGraph, setLifeGraph] = useState<LifeGraphResponse | null>(null);
  const [privacy, setPrivacy] = useState<AgentPrivacySettings>({
    showBodyInfo: false,
    showExactLocation: false,
  });
  const [activityDetail, setActivityDetail] = useState<ActivityDetailState | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugEvents, setDebugEvents] = useState<AgentTaskDebugEvent[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const { setResult: setLifeGraphResult, resultNode: lifeGraphResultNode } =
    useLifeGraphAgentResults();
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
    void lifeGraphApi
      .getMe()
      .then((graphResult) => {
        if (cancelled) return;
        setLifeGraph(graphResult);
      })
      .catch(() => undefined);
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
  }, [messages, steps, userResult]);

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
    setUserResult(null);
    setIsRunning(true);
    finishedRef.current = false;
    setSteps(
      baseSteps.map((step, index) => ({ ...step, status: index === 0 ? 'running' : 'pending' })),
    );

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const finalResult = await socialAgentApi.runUserFacingStream(
        { goal, permissionMode: mode, idempotencyKey: `agent-workspace-${Date.now()}` },
        handleUserFacingStreamEvent,
        controller.signal,
      );
      if (!finishedRef.current) finishUserFacing(finalResult);
      if (shellView !== 'chat') navigate('/agent/chat', { replace: false });
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content:
            '这次请求没有顺利完成。我已经保留当前对话，你可以稍后重试，或者把需求说得更具体一些。',
        },
      ]);
      setSteps((current) =>
        current.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const performCardAction = async (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }
    if (isRunning) return;

    const schemaAction = action.schemaAction ?? schemaActionFromLegacy(action.action);
    const taskId = numberFromUnknown(action.payload?.taskId ?? card.data.taskId);
    if (schemaAction === 'activity.view_detail' || action.action === 'view_activity') {
      await openActivityDetail(
        numberFromUnknown(action.payload?.activityId ?? card.data.activityId),
      );
      return;
    }
    if (!taskId) {
      await submit(undefined, action.label);
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: nextId('user'),
        role: 'user',
        content: publicText(action.label, '继续'),
      },
    ]);
    setUserResult(null);
    setIsRunning(true);
    finishedRef.current = false;
    setSteps((current) =>
      mergeStep(
        current,
        stepIdFromSchemaAction(schemaAction),
        lightStatusFromSchemaAction(schemaAction),
        'running',
      ),
    );

    try {
      const next = await socialAgentApi.performAction({
        taskId,
        action: schemaAction,
        payload: {
          ...(action.payload ?? {}),
          cardId: card.id,
          cardType: card.type,
          cardData: card.data,
        },
      });
      finishUserFacing(next);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: nextId('assistant'),
          role: 'assistant',
          content:
            '这一步没有顺利完成。我没有执行任何高风险动作，你可以稍后再试，或者换一种说法继续。',
        },
      ]);
      setSteps((current) =>
        current.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const openActivityDetail = async (activityId: number | null) => {
    if (!activityId) return;
    setActivityLoading(true);
    try {
      setActivityDetail(await activitiesApi.get(activityId));
    } finally {
      setActivityLoading(false);
    }
  };

  const loadDebugEvents = async () => {
    const taskId = findTaskId(userResult);
    setDebugOpen((open) => !open);
    if (!taskId || debugEvents.length > 0 || debugLoading) return;
    setDebugLoading(true);
    try {
      setDebugEvents(await loadAgentTaskEvents(taskId));
    } finally {
      setDebugLoading(false);
    }
  };

  const handleUserFacingStreamEvent = (event: UserFacingAgentStreamEvent) => {
    if (event.type === 'progress') {
      setSteps((current) => mergeProgressStep(current, event));
      return;
    }
    if (event.type === 'status') {
      setSteps((current) =>
        mergeStep(current, stepIdFromLightStatus(event.lightStatus), event.lightStatus, 'running'),
      );
    }
    if (event.type === 'result') finishUserFacing(event.result);
  };

  const finishUserFacing = (finalResult: UserFacingAgentResponse) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setUserResult(finalResult);
    setMessages((current) => [
      ...current,
      {
        id: nextId('assistant'),
        role: 'assistant',
        content: publicText(
          finalResult.assistantMessage,
          '我已经整理好了，下面是我建议你先看的内容。',
        ),
      },
    ]);
    setSteps((current) =>
      current.map((step) => ({
        ...step,
        status:
          step.id === stepIdFromLightStatus(finalResult.lightStatus)
            ? 'success'
            : step.status === 'pending' || step.status === 'running'
              ? 'success'
              : step.status,
      })),
    );
  };

  const stopRun = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setSteps((current) =>
      current.map((step) => (step.status === 'running' ? { ...step, status: 'error' } : step)),
    );
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

  const currentGoal =
    [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  return (
    <AgentWorkspaceLayout
      mode={mode}
      onModeChange={setMode}
      userResult={userResult}
      isLanding={shellView === 'home' && messages.length === 0 && !isRunning && !userResult}
      steps={steps}
      currentGoal={currentGoal}
      lifeGraph={lifeGraph}
    >
      {shellView === 'settings' ? (
        <AgentSettings mode={mode} onModeChange={setMode} />
      ) : shellView === 'projects' ? (
        <AgentReservedView
          title="我的匹配"
          body="这里会沉淀你确认过、收藏过和等待继续沟通的匹配对象。"
        />
      ) : shellView === 'history' ? (
        <AgentReservedView
          title="最近需求"
          body="这里会展示你过去发起的社交需求、Agent 推荐和确认记录。"
        />
      ) : (
        <div className="agent-gpt-stage agent-gpt-stage--simple">
          <section
            className={clsx('agent-gpt-chat', messages.length > 0 && 'agent-gpt-chat--active')}
          >
            {messages.length === 0 && !isRunning && !userResult ? (
              <AgentStartScreen
                input={input}
                onInput={setInput}
                onSubmit={submit}
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
                userResult={userResult}
                privacy={privacy}
                onPrivacyChange={setPrivacy}
                activityDetail={activityDetail}
                activityLoading={activityLoading}
                debugOpen={debugOpen}
                debugEvents={debugEvents}
                debugLoading={debugLoading}
                onToggleDebug={loadDebugEvents}
                onCloseActivityDetail={() => setActivityDetail(null)}
                onAction={performCardAction}
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
  onModeChange,
  userResult,
  isLanding,
  steps,
  currentGoal,
  lifeGraph,
}: {
  children: ReactNode;
  mode: SocialAgentPermissionMode;
  onModeChange: (mode: SocialAgentPermissionMode) => void;
  userResult: UserFacingAgentResponse | null;
  isLanding: boolean;
  steps: Step[];
  currentGoal: string;
  lifeGraph: LifeGraphResponse | null;
}) {
  const activeStep =
    steps.find((step) => step.status === 'running') ??
    steps.find((step) => step.status === 'waiting');
  const pendingActions = userResult?.pendingConfirmations.length ?? 0;
  const lifeGraphScore = lifeGraph?.completeness.completenessScore ?? 0;
  return (
    <div
      className={clsx(
        'agent-workspace agent-workspace--gpt',
        isLanding && 'agent-workspace--landing',
      )}
    >
      <aside className="agent-gpt-sidebar agent-assistant-context" aria-label="轻量上下文">
        <div className="agent-sidebar-head">
          <Link to="/" className="agent-gpt-brand">
            <Sparkles aria-hidden="true" />
            <strong>FitMeet Agent</strong>
          </Link>
          <button type="button" className="agent-sidebar-collapse" aria-label="收起侧栏">
            <ChevronsLeft aria-hidden="true" />
          </button>
        </div>

        <nav className="agent-sidebar-nav" aria-label="Agent 导航">
          <Link to="/agent" className="is-active">
            <Home aria-hidden="true" />
            首页
          </Link>
        </nav>

        <section className="agent-side-card agent-side-card--goal">
          <header>
            <Target aria-hidden="true" />
            <span>当前目标</span>
          </header>
          <div className="agent-side-inner">
            <strong>{currentGoal || '还没有新的社交目标'}</strong>
            <p>
              告诉我你的想法，
              <br />
              我来帮你规划下一步。
            </p>
            <button type="button">
              <Plus aria-hidden="true" />
              设定新目标
            </button>
          </div>
        </section>

        <section className="agent-side-card agent-side-card--life">
          <header>
            <TrendingUp aria-hidden="true" />
            <span>Life Graph 摘要</span>
          </header>
          <div className="agent-life-summary">
            <div
              className="agent-life-ring"
              style={{ '--score': `${lifeGraphScore}%` } as CSSProperties}
            >
              <strong>{lifeGraphScore}%</strong>
            </div>
            <div>
              <strong>完整度</strong>
              <p>我会先帮你降低压力，公共场所和需要确认的方式推进。</p>
              <Link to="/profile/life-graph">
                查看详情
                <ChevronRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="agent-side-card agent-side-card--focus">
          <header>
            <Eye aria-hidden="true" />
            <span>我正在关注</span>
          </header>
          <p>{activeStep?.label || '时间、地点、社交压力和安全边界'}</p>
          <div className="agent-focus-icons" aria-hidden="true">
            <span>
              <Clock3 />
            </span>
            <span>
              <MapPin />
            </span>
            <span>
              <ShieldCheck />
            </span>
          </div>
        </section>

        <section className="agent-side-card agent-side-card--pending">
          <header>
            <LockKeyhole aria-hidden="true" />
            <span>待确认动作</span>
          </header>
          <p>{pendingActions > 0 ? `${pendingActions} 个动作等待你确认` : '暂时没有待确认动作'}</p>
          <small>
            所有建议都会在执行前
            <br />
            与您确认。
          </small>
          <span className="agent-pending-check" aria-hidden="true">
            <Check />
          </span>
        </section>

        <div className="agent-sidebar-footer" aria-hidden="true">
          <span />
          <SlidersHorizontal />
          <span />
        </div>
      </aside>
      <main className="agent-gpt-main">
        <header className="agent-assistant-top">
          <div className="agent-main-brand">
            <Sparkles aria-hidden="true" />
            <span>
              <strong>FitMeet Agent</strong>
              <small>私人社交活动助理</small>
            </span>
          </div>
          <div>
            <AgentPermissionSelect mode={mode} onModeChange={onModeChange} compact />
            <span className="agent-life-pill">
              Life Graph {lifeGraphScore}% <i aria-hidden="true" />
            </span>
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
  onStartLifeGraph,
  onShowLifeGraphResult,
  lifeGraphResultNode,
}: {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  onStartLifeGraph: () => void;
  onShowLifeGraphResult: (type: 'rhythm' | 'weekly' | 'changes') => void;
  lifeGraphResultNode: ReactNode;
}) {
  const pickIdea = (idea: AgentSuggestionItem) => {
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
      <AgentInput input={input} onInput={onInput} onSubmit={onSubmit} />
      <div className="agent-start-proof" aria-label="Agent 安全边界">
        <span>
          <ShieldCheck aria-hidden="true" />
          站内先聊
        </span>
        <span>
          <MapPin aria-hidden="true" />
          公共场所优先
        </span>
        <span>
          <LockKeyhole aria-hidden="true" />
          确认后才执行
        </span>
      </div>
      <section
        className="agent-natural-prompts agent-natural-prompts--elements"
        aria-label="你可以这样问我"
      >
        <div className="agent-prompt-divider" aria-hidden="true">
          <span />
          <strong>试试这样开始</strong>
          <span />
        </div>
        <div className="agent-natural-prompts__list">
          {naturalPromptIdeas.map((idea) => {
            const Icon = idea.icon;
            return (
              <button
                key={idea.text}
                type="button"
                className={clsx(
                  'agent-natural-suggestion',
                  `agent-natural-suggestion--${idea.tone}`,
                )}
                onClick={() => pickIdea(idea)}
              >
                <span className="agent-natural-suggestion__icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="agent-natural-suggestion__copy">
                  <strong>{idea.text}</strong>
                  <small>{idea.detail}</small>
                </span>
                <ChevronRight className="agent-natural-suggestion__arrow" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
      <div className="agent-start-footer" aria-hidden="true">
        <span />
        <Dumbbell />
        <PersonStanding />
        <UsersRound />
        <ShieldCheck />
        <p>理解你的节奏，守护你的边界，陪你自然连接。</p>
        <span />
      </div>
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
  userResult,
  privacy,
  onPrivacyChange,
  activityDetail,
  activityLoading,
  debugOpen,
  debugEvents,
  debugLoading,
  onToggleDebug,
  onCloseActivityDetail,
  onAction,
  endRef,
}: {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  onStop: () => void;
  isRunning: boolean;
  elapsed: number;
  steps: Step[];
  messages: AgentThreadMessage[];
  userResult: UserFacingAgentResponse | null;
  privacy: AgentPrivacySettings;
  onPrivacyChange: (settings: AgentPrivacySettings) => void;
  activityDetail: ActivityDetailState | null;
  activityLoading: boolean;
  debugOpen: boolean;
  debugEvents: AgentTaskDebugEvent[];
  debugLoading: boolean;
  onToggleDebug: () => void;
  onCloseActivityDetail: () => void;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="agent-gpt-thread">
      <Conversation className="agent-gpt-thread__messages">
        <ConversationContent className="agent-gpt-thread__content">
          {messages.map((message) => (
            <AgentMessageBubble key={message.id} message={message} />
          ))}
          {isRunning ? (
            <AgentThinkingBlock elapsed={elapsed} steps={steps} onStop={onStop} />
          ) : null}
          {!isRunning && userResult ? <AgentProgressSummary steps={steps} /> : null}
          {userResult ? (
            <AgentPrivacyControls privacy={privacy} onChange={onPrivacyChange} />
          ) : null}
          {userResult ? (
            <UserFacingResult result={userResult} privacy={privacy} onAction={onAction} />
          ) : null}
          {activityLoading ? <AgentInlineStatus text="正在读取活动详情..." /> : null}
          {activityDetail ? (
            <AgentActivityDetailPanel
              detail={activityDetail}
              privacy={privacy}
              onClose={onCloseActivityDetail}
            />
          ) : null}
          {userResult ? (
            <AgentDebugPanel
              open={debugOpen}
              loading={debugLoading}
              events={debugEvents}
              steps={steps}
              result={userResult}
              onToggle={onToggleDebug}
            />
          ) : null}
          <div ref={endRef} />
        </ConversationContent>
        <ConversationScrollButton className="agent-gpt-scroll-button" />
      </Conversation>
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
    <PromptInput
      className={clsx('agent-gpt-input', compact && 'agent-gpt-input--compact')}
      onSubmit={(message, event) => onSubmit(event, message.text)}
    >
      <PromptInputBody className="agent-gpt-input__body">
        <PromptInputTextarea
          aria-label="描述你的社交需求"
          className="agent-gpt-input__textarea"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          placeholder="例如：今晚想找个人慢跑，别太远，先站内聊"
          rows={1}
        />
        <PromptInputSubmit aria-label="发送需求" className="agent-gpt-input__submit">
          <Send aria-hidden="true" />
        </PromptInputSubmit>
      </PromptInputBody>
    </PromptInput>
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
  const active =
    steps.find((step) => step.status === 'running') ??
    steps.find((step) => step.status === 'waiting');
  const visibleSteps = steps.filter((step) => step.status !== 'pending');
  return (
    <div className="agent-gpt-thinking">
      <section className="agent-gpt-thinking__body" aria-live="polite" aria-label="Agent 输出状态">
        <div className="agent-gpt-thinking__summary">
          <span className="agent-gpt-pulse" />
          <strong>{active?.label ?? '正在处理'}</strong>
          <small>{elapsed}s</small>
        </div>
        <div className="agent-gpt-step-list">
          {visibleSteps.map((step) => (
            <AgentProgressRow key={step.id} step={step} />
          ))}
        </div>
      </section>
      <button type="button" onClick={onStop}>
        停止
      </button>
    </div>
  );
}

function AgentProgressSummary({ steps }: { steps: Step[] }) {
  const visibleSteps = steps.filter((step) => step.status !== 'pending');
  if (!visibleSteps.length) return null;

  return (
    <div className="agent-gpt-progress-summary" aria-label="Agent 输出状态">
      <div className="agent-gpt-step-list">
        {visibleSteps.map((step) => (
          <AgentProgressRow key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function AgentProgressRow({ step }: { step: Step }) {
  return (
    <details
      className={clsx(`is-${step.status}`, step.kind && `agent-gpt-step--${step.kind}`)}
      open={step.status === 'running' || step.status === 'waiting'}
    >
      <summary>
        {step.kind ? <span>{stepKindLabel(step.kind)}</span> : null}
        <strong>{step.label}</strong>
      </summary>
      <small>{step.detail || '这一步的状态已记录，点击可收起或展开。'}</small>
    </details>
  );
}

function AgentMessageBubble({ message }: { message: AgentThreadMessage }) {
  return (
    <AiMessage
      from={message.role}
      className={clsx('agent-gpt-message', message.role === 'user' && 'agent-gpt-message--user')}
    >
      <AiMessageContent className="agent-gpt-message__content">
        {message.role === 'assistant' ? (
          <MessageResponse>{message.content}</MessageResponse>
        ) : (
          message.content
        )}
      </AiMessageContent>
    </AiMessage>
  );
}

function UserFacingResult({
  result,
  privacy,
  onAction,
}: {
  result: UserFacingAgentResponse;
  privacy: AgentPrivacySettings;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
}) {
  const candidateCards = result.cards.filter((card) => card.type === 'candidate_card');
  const activityCards = result.cards.filter((card) =>
    ['activity_plan', 'activity_status', 'checkin_card', 'review_card'].includes(card.type),
  );
  const otherCards = result.cards.filter(
    (card) => card.type !== 'candidate_card' && !activityCards.includes(card),
  );
  const safetyNotes = [
    ...result.safeStatus.boundaryNotes,
    ...result.safeStatus.requiredConfirmations.map((item) => '需要你确认：' + String(item)),
  ]
    .map((note) => publicText(note, ''))
    .filter(Boolean);

  return (
    <div className="agent-gpt-results agent-product-results">
      {otherCards.length ? (
        <section className="agent-gpt-result-block agent-natural-cards">
          <div className="agent-result-heading">
            <span>我会先停下来确认</span>
            <h2>这些动作不会自动执行</h2>
            <p>发送消息、加好友、创建线下活动、共享位置和敏感画像更新，都需要你明确确认。</p>
          </div>
          <div>
            {otherCards.slice(0, 4).map((card) => (
              <UserFacingGenericCard
                key={card.id}
                card={card}
                privacy={privacy}
                onAction={onAction}
              />
            ))}
          </div>
        </section>
      ) : null}

      {candidateCards.length ? (
        <section className="agent-gpt-result-block">
          <div className="agent-result-heading">
            <span>推荐给你的人</span>
            <h2>我为什么觉得合适</h2>
            <p>我会把推荐理由、安全边界和下一步建议说清楚；确认前不会替你联系任何人。</p>
          </div>
          <div className="agent-gpt-candidates">
            {candidateCards.slice(0, 4).map((card) => (
              <UserFacingCandidateCard
                key={card.id}
                card={card}
                privacy={privacy}
                onAction={onAction}
              />
            ))}
          </div>
        </section>
      ) : null}

      {activityCards.length ? (
        <section className="agent-gpt-result-block">
          <div className="agent-result-heading">
            <span>约练闭环</span>
            <h2>活动状态会持续可见</h2>
            <p>签到、上传证明、完成和评价会按时间线显示；涉及位置和身体信息默认隐藏。</p>
          </div>
          <div className="agent-activity-grid">
            {activityCards.slice(0, 4).map((card) => (
              <AgentActivityCard key={card.id} card={card} privacy={privacy} onAction={onAction} />
            ))}
          </div>
        </section>
      ) : null}

      {result.pendingConfirmations.length ? (
        <section className="agent-gpt-result-block agent-natural-cards">
          <div className="agent-result-heading">
            <span>待确认</span>
            <h2>我正在等你决定</h2>
            <p>你确认之前，这些动作只会停留在草稿或待办状态。</p>
          </div>
          <div>
            {result.pendingConfirmations.slice(0, 4).map((confirmation) => (
              <AgentNaturalConfirmationCard
                key={`${confirmation.type}-${confirmation.id ?? confirmation.summary}`}
                confirmation={{
                  id: `${confirmation.type}-${confirmation.id ?? confirmation.summary}`,
                  title: publicText(confirmation.summary, '有一个动作正在等待你确认'),
                  body: confirmationLabel(confirmation.actionType, confirmation.riskLevel),
                  primaryLabel: confirmationPrimaryLabel(confirmation.actionType),
                  secondaryLabels: confirmationSecondaryLabels(confirmation.actionType),
                }}
              />
            ))}
          </div>
        </section>
      ) : null}

      {safetyNotes.length || result.safeStatus.blocked ? (
        <AgentSafetyPanel pendingActions={result.pendingConfirmations.length} notes={safetyNotes} />
      ) : null}

      {!result.cards.length && !result.pendingConfirmations.length ? (
        <section className="agent-gpt-result-block">
          <h2>我先理解到这里</h2>
          <p>你可以继续补充时间、地点、社交压力、运动强度或安全边界，我会接着往下筛。</p>
        </section>
      ) : null}
    </div>
  );
}

function UserFacingGenericCard({
  card,
  privacy,
  onAction,
}: {
  card: FitMeetAlphaCard;
  privacy: AgentPrivacySettings;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
}) {
  if (card.type === 'profile_proposal') {
    return <AgentLifeGraphProposalCard card={card} onAction={onAction} />;
  }
  const body = card.body
    ? privacyText(publicText(card.body, '确认前我不会继续执行。'), privacy)
    : '';
  return (
    <article>
      <strong>{publicText(card.title, '需要你确认')}</strong>
      {body ? <p>{body}</p> : null}
      {cardDataText(card, 'lifeGraphUpdatePreview') ? (
        <p>{cardDataText(card, 'lifeGraphUpdatePreview')}</p>
      ) : null}
      {false ? (
        <AgentNaturalConfirmationCard
          confirmation={{
            id: `card-${card.id}`,
            title: '我会先等你确认',
            body:
              cardDataText(card, 'suggestedOpener') ||
              cardDataText(card, 'safetyBoundary') ||
              '这个动作现在只是草稿。你确认之前，我不会发送消息、加好友、创建活动或共享位置。',
            primaryLabel: '确认继续',
            secondaryLabels: ['再自然一点', '重新生成', '取消'],
          }}
        />
      ) : null}
      {card.actions.length ? (
        <div className="agent-card-actions">
          {card.actions.slice(0, 5).map((action) => (
            <button key={action.id} type="button" onClick={() => onAction(card, action)}>
              {publicText(action.label, '继续')}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function UserFacingCandidateCard({
  card,
  privacy,
  onAction,
}: {
  card: FitMeetAlphaCard;
  privacy: AgentPrivacySettings;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
}) {
  const fitReasons = cardDataList(card, 'fitReasons');
  const suggestedOpener = cardDataText(card, 'suggestedOpener');
  const matchScore =
    cardDataTextAny(card, ['matchScore', 'score', 'matchingScore']) ||
    cardDataNumberText(card, ['score']);
  const candidateMeta = [
    ['区域', cardDataTextAny(card, ['area', 'region', 'city', 'locationPreference'])],
    ['时间', cardDataTextAny(card, ['timePreference', 'availableTime', 'timeWindow'])],
    ['运动', cardDataTextAny(card, ['sportType', 'activityType', 'activity'])],
    ['社交偏好', cardDataTextAny(card, ['socialPreference', 'socialStyle'])],
    [
      '下一步',
      cardDataTextAny(card, ['nextActionSuggestion', 'nextStep']) || nextActionLabel(card),
    ],
  ].filter(([, value]) => Boolean(value));
  const sensitiveMeta = [
    [
      '身体信息',
      privacy.showBodyInfo
        ? cardDataTextAny(card, ['bodyInfo', 'healthStats', 'fitnessProfile'])
        : '默认隐藏',
    ],
    [
      '精确位置',
      privacy.showExactLocation
        ? cardDataTextAny(card, ['preciseLocation', 'exactLocation', 'latLng']) ||
          coordinateText(card)
        : '默认隐藏',
    ],
  ].filter(([, value]) => Boolean(value));
  return (
    <article className="agent-gpt-candidate">
      <div className="agent-gpt-candidate__avatar">{publicText(card.title, 'F').slice(0, 1)}</div>
      <div>
        <h3>{publicText(card.title, '推荐候选人')}</h3>
        <p>{matchScore || '匹配度已结合你的需求估算'}</p>
      </div>
      {candidateMeta.length || sensitiveMeta.length ? (
        <div className="agent-candidate-meta">
          {[...candidateMeta, ...sensitiveMeta].map(([label, value]) => (
            <span
              key={label}
              className={label === '身体信息' || label === '精确位置' ? 'is-sensitive' : undefined}
            >
              <small>{label}</small>
              <strong>{value}</strong>
            </span>
          ))}
        </div>
      ) : null}
      <div className="agent-candidate-recommendation">
        <strong>一句话推荐</strong>
        <p>
          {cardDataText(card, 'recommendationLine') ||
            publicText(card.body, '你们在时间、地点、活动偏好和第一次见面边界上比较接近。')}
        </p>
      </div>
      {fitReasons.length ? (
        <div className="agent-candidate-reasons">
          <strong>具体适合原因</strong>
          <ul>
            {fitReasons.slice(0, 5).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {cardDataText(card, 'whyNow') ? (
        <div className="agent-safe-step">
          <strong>为什么现在适合</strong>
          <p>{cardDataText(card, 'whyNow')}</p>
        </div>
      ) : null}
      <div className="agent-candidate-warning">
        <strong>安全边界</strong>
        <p>
          {cardDataText(card, 'safetyBoundary') ||
            '第一次建议选择公共场所，先站内沟通，不共享精确位置。'}
        </p>
      </div>
      {suggestedOpener ? (
        <blockquote>
          <span>建议开场方式</span>
          {suggestedOpener}
        </blockquote>
      ) : null}
      {false ? (
        <AgentNaturalConfirmationCard
          confirmation={{
            id: `opener-${card.id}`,
            title: '这条消息会发送给对方。我先帮你写好了，你确认后我再发。',
            body:
              suggestedOpener || '我会保持轻松、礼貌、低压力的语气，并提醒第一次见面选择公共场所。',
            primaryLabel: '确认发送',
            secondaryLabels: ['语气更自然', '更简短', '重新生成', '取消'],
          }}
        />
      ) : null}
      {card.actions.length ? (
        <div className="agent-card-actions">
          {card.actions.slice(0, 6).map((action) => (
            <button key={action.id} type="button" onClick={() => onAction(card, action)}>
              {publicText(action.label, '下一步')}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function AgentPrivacyControls({
  privacy,
  onChange,
}: {
  privacy: AgentPrivacySettings;
  onChange: (settings: AgentPrivacySettings) => void;
}) {
  return (
    <section className="agent-privacy-controls" aria-label="隐私显示控制">
      <div>
        <strong>隐私显示</strong>
        <span>身体信息和精确位置默认隐藏，仅本人可在当前页面临时查看。</span>
      </div>
      <button
        type="button"
        className={clsx(privacy.showBodyInfo && 'is-active')}
        onClick={() => onChange({ ...privacy, showBodyInfo: !privacy.showBodyInfo })}
      >
        身体信息
      </button>
      <button
        type="button"
        className={clsx(privacy.showExactLocation && 'is-active')}
        onClick={() => onChange({ ...privacy, showExactLocation: !privacy.showExactLocation })}
      >
        精确位置
      </button>
    </section>
  );
}

function AgentInlineStatus({ text }: { text: string }) {
  return (
    <div className="agent-inline-status" aria-live="polite">
      <span className="agent-gpt-pulse" />
      <strong>{text}</strong>
    </div>
  );
}

function AgentLifeGraphProposalCard({
  card,
  onAction,
}: {
  card: FitMeetAlphaCard;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
}) {
  const updates =
    cardDataListAny(card, ['proposedFields', 'lifeGraphUpdates', 'updates', 'fields']) ||
    cardDataRecords(card, ['proposedUpdates', 'patches'])
      .map((item) => recordText(item, ['label', 'field', 'key', 'summary']))
      .filter(Boolean);
  const acceptAction = findCardAction(
    card,
    ['life_graph.accept_update'],
    ['confirm_profile_update'],
  );
  const rejectAction = findCardAction(card, ['life_graph.reject_update']);

  return (
    <article className="agent-lifegraph-proposal">
      <div>
        <strong>{publicText(card.title, 'Life Graph 更新建议')}</strong>
        <p>
          {publicText(
            card.body,
            'Agent 发现了可能需要写入用户画像的信息。确认之前，这些内容不会写入数据库。',
          )}
        </p>
      </div>
      {updates.length ? (
        <ul>
          {updates.slice(0, 6).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <AgentNaturalConfirmationCard
        confirmation={{
          id: `life-graph-${card.id}`,
          title: '确认后才会更新 Life Graph',
          body: '你可以接受这次画像更新，也可以拒绝或继续调整。未确认时只保留在当前建议卡片中。',
          primaryLabel: acceptAction ? publicText(acceptAction.label, '确认更新') : '确认更新',
          secondaryLabels: [rejectAction ? publicText(rejectAction.label, '拒绝更新') : '拒绝更新'],
          onPrimary: acceptAction ? () => onAction(card, acceptAction) : undefined,
          onSecondary: rejectAction ? () => onAction(card, rejectAction) : undefined,
        }}
      />
    </article>
  );
}

function AgentActivityCard({
  card,
  privacy,
  onAction,
}: {
  card: FitMeetAlphaCard;
  privacy: AgentPrivacySettings;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
}) {
  const activityId = numberFromUnknown(card.data.activityId ?? card.data.id);
  const status = cardDataTextAny(card, ['status', 'activityStatus']) || card.status || 'draft';
  const location = privacy.showExactLocation
    ? cardDataTextAny(card, ['locationName', 'location', 'exactLocation']) || '位置待确认'
    : cardDataTextAny(card, ['city', 'area', 'region']) || '精确位置默认隐藏';
  const timeline = activityTimelineRows(status);
  const detailAction = activityId
    ? ({
        id: `view-activity-${activityId}`,
        label: '查看详情',
        action: 'view_activity',
        schemaAction: 'activity.view_detail',
        requiresConfirmation: false,
        payload: { activityId },
      } satisfies FitMeetAlphaCardAction)
    : null;

  return (
    <article className="agent-activity-card">
      <div className="agent-activity-card__top">
        <span>{activityStatusLabel(status)}</span>
        <strong>{publicText(card.title, '约练活动')}</strong>
        <p>{publicText(card.body, '活动进度会在这里持续更新。')}</p>
      </div>
      <div className="agent-activity-meta">
        <span>
          <small>地点</small>
          <strong>{location}</strong>
        </span>
        <span>
          <small>证明</small>
          <strong>
            {cardDataTextAny(card, ['proofStatus', 'proofPolicy']) || '可上传 / 待确认'}
          </strong>
        </span>
      </div>
      <ol className="agent-activity-timeline">
        {timeline.map((step) => (
          <li
            key={step.label}
            className={clsx(step.done && 'is-done', step.current && 'is-current')}
          >
            {step.label}
          </li>
        ))}
      </ol>
      <div className="agent-card-actions">
        {detailAction ? (
          <button type="button" onClick={() => onAction(card, detailAction)}>
            查看详情
          </button>
        ) : null}
        {card.actions.slice(0, 5).map((action) => (
          <button key={action.id} type="button" onClick={() => onAction(card, action)}>
            {publicText(action.label, '继续')}
          </button>
        ))}
      </div>
    </article>
  );
}

function AgentActivityDetailPanel({
  detail,
  privacy,
  onClose,
}: {
  detail: ActivityDetailState;
  privacy: AgentPrivacySettings;
  onClose: () => void;
}) {
  const { activity, proofs } = detail;
  const location = privacy.showExactLocation
    ? [activity.locationName, activity.city].filter(Boolean).join(' · ')
    : activity.city || '精确位置默认隐藏';

  return (
    <section className="agent-activity-detail" aria-label="活动详情">
      <header>
        <div>
          <span>{activityStatusLabel(activity.status)}</span>
          <h3>{activity.title}</h3>
          <p>{activity.description}</p>
        </div>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="agent-activity-meta">
        <span>
          <small>地点</small>
          <strong>{location}</strong>
        </span>
        <span>
          <small>时间</small>
          <strong>{formatDateTime(activity.startTime) || '待确认'}</strong>
        </span>
        <span>
          <small>证明策略</small>
          <strong>{activity.proofRequired ? activity.proofPolicy : '无需证明'}</strong>
        </span>
      </div>
      <ol className="agent-activity-timeline">
        {activityTimelineRows(activity.status).map((step) => (
          <li
            key={step.label}
            className={clsx(step.done && 'is-done', step.current && 'is-current')}
          >
            {step.label}
          </li>
        ))}
      </ol>
      <div className="agent-proof-list">
        <strong>签到 / 证明 / 评价</strong>
        {proofs.length ? (
          proofs.slice(0, 5).map((proof) => (
            <p key={proof.id}>
              {proof.proofType} · {proof.status} · {formatDateTime(proof.createdAt)}
            </p>
          ))
        ) : (
          <p>还没有上传证明或签到记录。</p>
        )}
      </div>
    </section>
  );
}

function AgentDebugPanel({
  open,
  loading,
  events,
  steps,
  result,
  onToggle,
}: {
  open: boolean;
  loading: boolean;
  events: AgentTaskDebugEvent[];
  steps: Step[];
  result: UserFacingAgentResponse;
  onToggle: () => void;
}) {
  const [auditCode, setAuditCode] = useState('');
  const [auditPrompt, setAuditPrompt] = useState(
    'Activity 状态显示；推理折叠块小型化；Life Graph 用户确认；权限下拉框联动；隐私开关行为；前端调试日志；推荐卡片完整信息',
  );
  const [auditResult, setAuditResult] = useState<AgentPageModuleAuditResult | null>(null);

  const runModuleAudit = () => {
    setAuditResult(auditAgentPageModules({ pageCode: auditCode, featurePrompt: auditPrompt }));
  };

  return (
    <section className="agent-debug-panel">
      <button type="button" onClick={onToggle}>
        {open ? '收起调试日志' : '查看调试日志'}
      </button>
      {open ? (
        <div>
          <div className="agent-debug-grid">
            <article>
              <strong>状态</strong>
              {steps
                .filter((step) => step.status !== 'pending')
                .map((step) => (
                  <p key={step.id}>
                    {stepKindLabel(step.kind ?? 'status')} · {step.label} · {step.status}
                  </p>
                ))}
            </article>
            <article>
              <strong>API 返回</strong>
              <pre>{debugResultText(result)}</pre>
            </article>
          </div>
          <article>
            <strong>工具 / 事件</strong>
            {loading ? <p>正在读取调试事件...</p> : null}
            {!loading && !events.length ? <p>当前结果没有关联到可读取的 taskId。</p> : null}
            {events.slice(0, 12).map((event) => (
              <details key={event.id}>
                <summary>
                  {event.eventType} · {event.actor} · {formatDateTime(event.createdAt)}
                </summary>
                <p>{publicText(event.summary, '事件已记录')}</p>
                <pre>{safeJson(event.payload)}</pre>
              </details>
            ))}
          </article>
          <article className="agent-module-audit">
            <strong>模块缺失扫描</strong>
            <p>粘贴 /agent 页面代码和功能提示词，输出缺失模块列表。</p>
            <textarea
              aria-label="页面代码"
              value={auditCode}
              onChange={(event) => setAuditCode(event.target.value)}
              placeholder="粘贴 AgentWorkspace.tsx 或相关页面代码"
              rows={5}
            />
            <textarea
              aria-label="功能提示词"
              value={auditPrompt}
              onChange={(event) => setAuditPrompt(event.target.value)}
              rows={3}
            />
            <button type="button" onClick={runModuleAudit}>
              输出缺失模块列表
            </button>
            {auditResult ? (
              <div className="agent-module-audit__result">
                <span>
                  已检查 {auditResult.checked} 项，缺失 {auditResult.missing} 项
                </span>
                {auditResult.missingModules.length ? (
                  <ul>
                    {auditResult.missingModules.map((module) => (
                      <li key={module}>{module}</li>
                    ))}
                  </ul>
                ) : (
                  <p>未发现缺失模块。</p>
                )}
              </div>
            ) : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}

function AgentSafetyPanel({ pendingActions, notes }: { pendingActions: number; notes: string[] }) {
  return (
    <section className="agent-gpt-approval agent-safety-panel">
      <div className="agent-result-heading">
        <span>安全边界</span>
        <h2>等待你确认</h2>
        <p>
          当前有 {pendingActions}{' '}
          个关键动作等待确认。即使没有待确认动作，我也不会自动交换联系方式、共享位置或发起线下见面。
        </p>
      </div>
      <div>
        {(notes.length
          ? notes
          : ['联系前需要你确认', '见面建议选择公共场所', '不会自动共享手机号、微信或实时位置']
        )
          .slice(0, 5)
          .map((note) => (
            <span key={note}>{note}</span>
          ))}
      </div>
    </section>
  );
}

function AgentNaturalConfirmationCard({
  confirmation,
}: {
  confirmation: AgentConfirmationViewModel;
}) {
  return (
    <Confirmation
      approval={{ id: confirmation.id }}
      className="agent-natural-confirmation"
      state="approval-requested"
    >
      <ConfirmationRequest>
        <ConfirmationTitle className="agent-natural-confirmation__title">
          {confirmation.title}
        </ConfirmationTitle>
        <p>{confirmation.body}</p>
        <ConfirmationActions className="agent-natural-confirmation__actions">
          <ConfirmationAction onClick={confirmation.onPrimary}>
            {confirmation.primaryLabel ?? '确认'}
          </ConfirmationAction>
          {(confirmation.secondaryLabels ?? ['修改一下', '取消']).map((label) => (
            <ConfirmationAction
              key={label}
              variant="outline"
              onClick={() => confirmation.onSecondary?.(label)}
            >
              {label}
            </ConfirmationAction>
          ))}
        </ConfirmationActions>
      </ConfirmationRequest>
    </Confirmation>
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
            <span>权限设置</span>
            <h2>权限模式</h2>
            <p>
              默认采用确认优先策略。发消息、加好友、创建活动、交换联系方式和敏感画像更新都需要你确认。
            </p>
          </div>
          <AgentPermissionSelect mode={mode} onModeChange={onModeChange} />
          <div className="agent-gpt-tags">
            {(['assist', 'limited_auto', 'open'] as SocialAgentPermissionMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onModeChange(item)}
                className={clsx(mode === item && 'is-active')}
              >
                {modeLabel(item)}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AgentPermissionSelect({
  mode,
  onModeChange,
  compact,
}: {
  mode: SocialAgentPermissionMode;
  onModeChange: (mode: SocialAgentPermissionMode) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={clsx('agent-permission-select', compact && 'agent-permission-select--compact')}
    >
      <ShieldCheck aria-hidden="true" />
      <span>权限</span>
      <select
        aria-label="权限模式"
        value={normalizePermissionMode(mode)}
        onChange={(event) => onModeChange(event.target.value as SocialAgentPermissionMode)}
      >
        <option value="assist">基础权限</option>
        <option value="limited_auto">正常权限</option>
        <option value="open">开放权限</option>
      </select>
    </label>
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
          <Link to="/agent" className="agent-link-button">
            发起新需求
          </Link>
        </div>
      </section>
    </div>
  );
}

function cardDataText(card: FitMeetAlphaCard, key: string): string {
  const value = card.data[key];
  if (typeof value === 'number') return String(Math.round(value));
  return publicText(value, '');
}

function cardDataList(card: FitMeetAlphaCard, key: string): string[] {
  const value = card.data[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => publicText(item, ''))
    .filter(Boolean)
    .slice(0, 8);
}

function cardDataTextAny(card: FitMeetAlphaCard, keys: string[]): string {
  for (const key of keys) {
    const value = cardDataText(card, key);
    if (value) return value;
  }
  return '';
}

function cardDataNumberText(card: FitMeetAlphaCard, keys: string[]): string {
  for (const key of keys) {
    const value = card.data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value <= 1 ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;
    }
  }
  return '';
}

function cardDataListAny(card: FitMeetAlphaCard, keys: string[]): string[] {
  for (const key of keys) {
    const values = cardDataList(card, key);
    if (values.length) return values;
  }
  return [];
}

function cardDataRecords(card: FitMeetAlphaCard, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = card.data[key];
    if (!Array.isArray(value)) continue;
    const records = value.filter(isRecord);
    if (records.length) return records;
  }
  return [];
}

function recordText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = publicText(record[key], '');
    if (value) return value;
  }
  return '';
}

function findCardAction(
  card: FitMeetAlphaCard,
  schemaActions: FitMeetAgentSchemaAction[],
  legacyActions: FitMeetAlphaCardAction['action'][] = [],
): FitMeetAlphaCardAction | undefined {
  return card.actions.find(
    (action) =>
      (action.schemaAction && schemaActions.includes(action.schemaAction)) ||
      legacyActions.includes(action.action),
  );
}

function nextActionLabel(card: FitMeetAlphaCard): string {
  const primary = card.actions.find((action) =>
    ['send_message', 'connect_candidate', 'create_activity', 'view_activity'].includes(
      action.action,
    ),
  );
  return primary ? publicText(primary.label, '') : '';
}

function coordinateText(card: FitMeetAlphaCard): string {
  const lat = card.data.lat ?? card.data.latitude;
  const lng = card.data.lng ?? card.data.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
  return '';
}

function privacyText(text: string, privacy: AgentPrivacySettings): string {
  if (!text) return '';
  if (!privacy.showExactLocation) {
    return text.replace(/(-?\d{1,3}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/g, '精确位置已隐藏');
  }
  return text;
}

function activityStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return '草稿';
    case 'pending_confirm':
      return '待确认';
    case 'confirmed':
      return '已确认';
    case 'in_progress':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return status || '待更新';
  }
}

function activityTimelineRows(status: string) {
  const order = ['draft', 'pending_confirm', 'confirmed', 'in_progress', 'completed'];
  const labels = ['创建', '确认', '签到', '上传证明', '评价'];
  const normalized = status === 'cancelled' ? 'completed' : status;
  const index = Math.max(0, order.indexOf(normalized));
  return labels.map((label, itemIndex) => ({
    label,
    done: itemIndex < index || normalized === 'completed',
    current: itemIndex === index && normalized !== 'completed',
  }));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return publicText(value, '');
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function findTaskId(result: UserFacingAgentResponse | null): number | null {
  if (!result) return null;
  for (const card of result.cards) {
    const fromCard = numberFromUnknown(card.data.taskId ?? card.data.agentTaskId);
    if (fromCard) return fromCard;
    for (const action of card.actions) {
      const fromAction = numberFromUnknown(action.payload?.taskId ?? action.payload?.agentTaskId);
      if (fromAction) return fromAction;
    }
  }
  return null;
}

function debugResultText(result: UserFacingAgentResponse): string {
  return safeJson({
    lightStatus: result.lightStatus,
    permissionMode: result.permissionMode,
    cardTypes: result.cards.map((card) => card.type),
    pendingConfirmations: result.pendingConfirmations.length,
    safeStatus: result.safeStatus,
  });
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2).slice(0, 3000);
  } catch {
    return '无法序列化调试数据';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function confirmationLabel(actionType: string, riskLevel: string): string {
  const action = actionType.includes('activity')
    ? '创建线下活动'
    : actionType.includes('location')
      ? '共享位置'
      : actionType.includes('friend') || actionType.includes('connect')
        ? '加好友'
        : actionType.includes('message')
          ? '发送消息'
          : '继续执行';
  const risk = riskLevel === 'high' ? '高风险' : riskLevel === 'medium' ? '中等风险' : '低风险';
  return `${action}需要你确认；当前为${risk}动作。`;
}

function confirmationPrimaryLabel(actionType: string): string {
  if (actionType.includes('activity')) return '确认创建';
  if (actionType.includes('location')) return '确认共享';
  if (actionType.includes('friend') || actionType.includes('connect')) return '确认加好友';
  if (actionType.includes('message')) return '确认发送';
  return '确认继续';
}

function confirmationSecondaryLabels(actionType: string): string[] {
  if (actionType.includes('activity')) return ['修改时间', '修改地点', '取消'];
  if (actionType.includes('message')) return ['语气更自然', '更简短', '取消'];
  if (actionType.includes('location')) return ['改成大致区域', '取消'];
  return ['再调整一下', '取消'];
}

function schemaActionFromLegacy(
  action: FitMeetAlphaCardAction['action'],
): FitMeetAgentSchemaAction {
  switch (action) {
    case 'send_message':
      return 'opener.confirm_send';
    case 'connect_candidate':
    case 'save_candidate':
      return 'candidate.like';
    case 'create_activity':
      return 'activity.confirm_create';
    case 'generate_opener':
      return 'candidate.generate_opener';
    case 'see_more':
    case 'filter_school':
    case 'filter_gender_female':
    case 'refine_request':
      return 'candidate.more_like_this';
    case 'dislike_candidate':
      return 'candidate.skip';
    case 'check_in':
      return 'activity.check_in';
    case 'view_activity':
      return 'activity.view_detail';
    case 'upload_proof':
      return 'activity.upload_proof';
    case 'submit_review':
      return 'review.submit';
    case 'confirm_profile_update':
      return 'life_graph.accept_update';
    default:
      return 'candidate.more_like_this';
  }
}

function stepIdFromSchemaAction(action: FitMeetAgentSchemaAction): string {
  if (action.startsWith('candidate.')) return 'search';
  if (action.startsWith('opener.')) return 'icebreaker';
  if (action.startsWith('activity.')) return 'activity_plan';
  if (action.startsWith('review.')) return 'life_graph_update';
  if (action.startsWith('life_graph.')) return 'life_graph_update';
  return 'understand';
}

function lightStatusFromSchemaAction(action: FitMeetAgentSchemaAction): UserFacingAgentLightStatus {
  if (action === 'candidate.generate_opener' || action === 'opener.regenerate') {
    return '正在生成开场白';
  }
  if (action === 'opener.confirm_send') return '正在等待你确认';
  if (action.startsWith('candidate.')) return '正在筛选合适的人';
  if (action.startsWith('activity.')) return '正在创建约练计划';
  if (action.startsWith('review.') || action.startsWith('life_graph.')) {
    return '正在更新你的 Life Graph';
  }
  return '正在理解你的需求';
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function stepIdFromLightStatus(status: UserFacingAgentLightStatus): string {
  if (status.includes('Life Graph')) return 'profile';
  if (status.includes('筛选')) return 'search';
  if (status.includes('排除')) return 'rank';
  if (status.includes('安全')) return 'safety_filter';
  if (status.includes('开场白')) return 'icebreaker';
  if (status.includes('确认')) return 'approval';
  if (status.includes('约练')) return 'activity_plan';
  if (status.includes('更新')) return 'life_graph_update';
  return 'understand';
}

function mergeProgressStep(steps: Step[], event: UserFacingAgentProgressEvent): Step[] {
  const nextStatus: StepState =
    event.state === 'done'
      ? 'success'
      : event.state === 'failed'
        ? 'error'
        : event.state === 'waiting'
          ? 'waiting'
          : 'running';
  const label = publicText(event.title, event.kind === 'tool' ? '正在调用工具' : '分析中');
  const detail = event.detail ? publicStepLabel(event.id, event.detail) : undefined;
  const index = steps.findIndex((step) => step.id === event.id);
  const nextStep: Step = {
    id: event.id,
    label,
    status: nextStatus,
    kind: event.kind,
    detail,
  };

  if (index >= 0) {
    return steps.map((step, itemIndex) =>
      itemIndex === index
        ? nextStep
        : step.status === 'running' && nextStatus === 'running'
          ? { ...step, status: 'success' }
          : step,
    );
  }

  return [
    ...steps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    nextStep,
  ];
}

function mergeStep(
  steps: Step[],
  id: string,
  label: string,
  status: 'pending' | 'running' | 'done' | 'failed',
): Step[] {
  const nextStatus: StepState =
    status === 'done' ? 'success' : status === 'failed' ? 'error' : status;
  const publicLabel = publicStepLabel(id, label);
  const index = steps.findIndex((step) => step.id === id);
  if (index >= 0) {
    return steps.map((step, itemIndex) =>
      itemIndex === index
        ? { ...step, label: publicLabel, status: nextStatus }
        : step.status === 'running' && nextStatus === 'running'
          ? { ...step, status: 'success' }
          : step,
    );
  }
  return [
    ...steps.map((step) =>
      step.status === 'running' ? { ...step, status: 'success' as const } : step,
    ),
    { id, label: publicLabel, status: nextStatus },
  ];
}

function publicText(value: unknown, fallback: string) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (technicalPublicTextPattern.test(text)) return fallback;
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(text)) return fallback;
  return text;
}

function publicStepLabel(id: string, label: string) {
  const key = `${id} ${label}`.toLowerCase();
  if (/approval|confirm|human/.test(key)) return '正在等待你确认';
  if (/update|trust|review/.test(key)) return '正在更新你的 Life Graph';
  if (/activity|plan|meet|offline/.test(key)) return '正在创建约练计划';
  if (/opener|icebreaker|message/.test(key)) return '正在生成开场白';
  if (/safe|guard|risk|boundary/.test(key)) return '正在检查安全边界';
  if (/rank|time|schedule/.test(key)) return '正在排除时间不合适的人';
  if (/match|search|candidate|social/.test(key)) return '正在筛选合适的人';
  if (/life|profile|graph|memory/.test(key)) return '正在结合你的 Life Graph';
  if (/understand|intent|think|route/.test(key)) return '正在理解你的需求';

  const allowed = baseSteps.map((step) => step.label);
  return allowed.includes(label) ? label : '正在理解你的需求';
}

function stepKindLabel(kind: UserFacingAgentProgressKind) {
  if (kind === 'tool') return '工具';
  if (kind === 'analysis') return '分析';
  return '状态';
}

function modeLabel(mode: SocialAgentPermissionMode) {
  if (mode === 'assist') return '基础权限';
  if (mode === 'confirm' || mode === 'manual_confirm') return '每步确认';
  if (mode === 'limited_auto') return '正常权限';
  if (mode === 'open' || mode === 'lab') return '开放权限';
  return mode;
}

function normalizePermissionMode(mode: SocialAgentPermissionMode): SocialAgentPermissionMode {
  if (mode === 'confirm' || mode === 'manual_confirm') return 'limited_auto';
  if (mode === 'lab') return 'open';
  return mode;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
