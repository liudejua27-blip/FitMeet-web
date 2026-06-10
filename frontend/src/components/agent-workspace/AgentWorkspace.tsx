import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Footprints,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PersonStanding,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  UserRound,
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
  type FitMeetAlphaCard,
  type FitMeetAlphaCardAction,
  type FitMeetAgentSchemaAction,
  type SocialAgentPermissionMode,
  type UserFacingAgentProgressEvent,
  type UserFacingAgentProgressKind,
  type UserFacingAgentLightStatus,
  type UserFacingAgentResponse,
} from '../../api/socialAgentApi';
import { activitiesApi, type ActivityProof, type SocialActivity } from '../../api/activitiesApi';
import { lifeGraphApi, type LifeGraphResponse } from '../../api/lifeGraphApi';
import { useAuthStore } from '../../stores';
import {
  auditAgentPageModules,
  type AgentPageModuleAuditResult,
} from '../../debug/agentPageModuleAudit';
import { loadAgentTaskEvents, type AgentTaskDebugEvent } from '../../debug/agentTaskEvents';
import {
  AntGuide,
  type AntGuideCopy,
  type AntGuideState,
  type AntGuideTarget,
} from '../agent/ant-guide';
import { AGENT_FLOW_INTERESTS } from './agentFlow.constants';
import { useAgentFlow } from './useAgentFlow';
import {
  createAgentAdapter,
  resolveAgentAdapterMode,
  mapAgentError,
  type AgentError,
  type AgentLifecycle,
  type AgentStreamEvent,
} from './api';

type AgentView = 'home' | 'chat' | 'settings' | 'projects' | 'history';
type AgentThreadMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'done' | 'error';
};
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
type AgentRecoveryState = {
  kind: 'failed' | 'stopped' | 'action_failed' | 'missing_info' | 'unauthorized' | 'safety';
  title: string;
  message: string;
  prompt: string;
  retryable: boolean;
};
type AgentSidebarSectionId =
  | 'new'
  | 'recent'
  | 'profile'
  | 'settings'
  | 'projects'
  | 'history'
  | 'pet';

const AGENT_PET_STORAGE_KEY = 'fitmeet-agent-pet-enabled';
const AGENT_BRAND_ICON_SRC = '/favicon-192.png';

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
    text: '找个跑步搭子',
    detail: '一起跑步，互相激励',
    icon: Footprints,
    tone: 'sage',
    prompt: '今晚想找青岛大学附近跑步搭子',
  },
  {
    text: '今晚出门走走',
    detail: '散步、逛街、喝杯咖啡',
    icon: PersonStanding,
    tone: 'violet',
    prompt: '今晚出门走走，找个低压力的人一起散步',
  },
  {
    text: '这周轻社交',
    detail: '轻松见面，认识新朋友',
    icon: CalendarDays,
    tone: 'blue',
    action: 'weekly',
  },
  {
    text: '帮我整理社交边界',
    detail: '设定偏好，守护舒适感',
    icon: ShieldCheck,
    tone: 'gold',
    action: 'life_graph',
  },
];

const agentWorkbenchCards: Array<{
  label: string;
  title: string;
  detail: string;
  icon: LucideIcon;
}> = [
  {
    label: 'Persona',
    title: '人物画像',
    detail: '先读取你的兴趣、节奏和舒适边界',
    icon: UserRound,
  },
  {
    label: 'Safety',
    title: '权限边界',
    detail: '每次执行前都能看到可用权限',
    icon: ShieldCheck,
  },
  {
    label: 'Match',
    title: '匹配计划',
    detail: '把人、地点、时间排进同一个计划',
    icon: CalendarDays,
  },
  {
    label: 'Memory',
    title: '最近需求',
    detail: '延续上一次的偏好与反馈',
    icon: Clock3,
  },
];

function readStoredPetEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AGENT_PET_STORAGE_KEY) !== 'false';
}

function shouldShowAgentPet({
  petEnabled,
  guideState,
  input,
  isRunning,
  sessionRestoring,
  userResult,
  recovery,
  petNudged,
  surface,
}: {
  petEnabled: boolean;
  guideState: AntGuideState;
  input: string;
  isRunning: boolean;
  sessionRestoring: boolean;
  userResult: UserFacingAgentResponse | null;
  recovery: AgentRecoveryState | null;
  petNudged: boolean;
  surface: 'start' | 'thread';
}) {
  if (!petEnabled) return false;
  if (surface === 'start') {
    return petNudged || guideState !== 'idle' || input.trim().length > 0 || Boolean(recovery);
  }
  return (
    isRunning ||
    sessionRestoring ||
    guideState !== 'idle' ||
    Boolean(userResult) ||
    Boolean(recovery)
  );
}

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
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [sessionRestoring, setSessionRestoring] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lifeGraph, setLifeGraph] = useState<LifeGraphResponse | null>(null);
  const [privacy, setPrivacy] = useState<AgentPrivacySettings>({
    showBodyInfo: false,
    showExactLocation: false,
  });
  const [activityDetail, setActivityDetail] = useState<ActivityDetailState | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [recovery, setRecovery] = useState<AgentRecoveryState | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugEvents, setDebugEvents] = useState<AgentTaskDebugEvent[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [petEnabled, setPetEnabled] = useState(readStoredPetEnabled);
  const [petNudged, setPetNudged] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const finishedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const skipNextRestoreRef = useRef(false);
  const shellView = view === 'chat' || params.taskId ? 'chat' : view;
  const agentAdapterMode = useMemo(() => resolveAgentAdapterMode(), []);
  const isRealAgent = agentAdapterMode === 'real';
  const agentAdapter = useMemo(() => createAgentAdapter(agentAdapterMode), [agentAdapterMode]);
  const agentFlow = useAgentFlow(agentAdapter);
  const completeAgentFlowResponse = agentFlow.completeResponse;
  const routeTaskId = numberFromUnknown(params.taskId);

  useEffect(() => {
    document.title = 'FitMeet Agent';
  }, []);

  useEffect(() => {
    window.localStorage.setItem(AGENT_PET_STORAGE_KEY, String(petEnabled));
  }, [petEnabled]);

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
    if (!isRealAgent || !isLoggedIn) return undefined;
    if (skipNextRestoreRef.current) {
      skipNextRestoreRef.current = false;
      return undefined;
    }
    let cancelled = false;
    setSessionRestoring(true);
    void agentAdapter
      .restoreSession(routeTaskId ?? undefined)
      .then((restored) => {
        if (cancelled || !restored) return;
        setActiveTaskId(restored.taskId ?? null);
        setUserResult(restored.response);
        setRecovery(null);
        completeAgentFlowResponse(restored.response);
        const restoredMessage = publicText(
          restored.response.assistantMessage,
          '我已经恢复了上一次 Agent 会话。',
        );
        setMessages((current) =>
          current.length > 0
            ? current
            : [
                {
                  id: nextId('assistant'),
                  role: 'assistant',
                  content: restoredMessage,
                },
              ],
        );
        if (shellView !== 'chat') navigate('/agent/chat', { replace: true });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSessionRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    agentAdapter,
    completeAgentFlowResponse,
    isLoggedIn,
    isRealAgent,
    navigate,
    routeTaskId,
    shellView,
  ]);

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
    if (userResult && !isRunning) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isRunning, messages, steps, userResult]);

  const submit = async (event?: FormEvent, prompt?: string) => {
    event?.preventDefault();
    const goal = (prompt ?? input).trim();
    if (!goal) {
      agentFlow.showEmptyError();
      setRecovery(createAgentRecoveryFromError(mapAgentError(new Error('MISSING_INFO')), ''));
      return;
    }
    if (isRunning) return;
    if (isRealAgent && !isLoggedIn) {
      openLogin();
      return;
    }

    setMessages((current) => [...current, { id: nextId('user'), role: 'user', content: goal }]);
    setInput('');
    setUserResult(null);
    setRecovery(null);
    setIsRunning(true);
    finishedRef.current = false;
    stopRequestedRef.current = false;
    agentFlow.beginRun();
    setSteps(
      baseSteps.map((step, index) => ({ ...step, status: index === 0 ? 'running' : 'pending' })),
    );

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const finalResult = await agentAdapter.run(
        {
          goal,
          permissionMode: mode,
          taskId: activeTaskId,
          idempotencyKey: `agent-run-${Date.now()}`,
        },
        {
          onEvent: handleAgentStreamEvent,
          signal: controller.signal,
        },
      );
      setActiveTaskId(finalResult.taskId ?? activeTaskId);
      if (!finishedRef.current) finishUserFacing(finalResult.response);
      if (shellView !== 'chat') {
        skipNextRestoreRef.current = true;
        navigate('/agent/chat', { replace: false });
      }
    } catch (error) {
      const stopped = stopRequestedRef.current || isAbortError(error);
      const agentError = stopped
        ? mapAgentError(new DOMException('Aborted', 'AbortError'))
        : agentFlow.failWithError(error);
      const nextRecovery = createAgentRecoveryFromError(agentError, goal);
      setRecovery(nextRecovery);
      if (stopped) {
        finishAssistantDelta();
      } else {
        setMessages((current) => [
          ...current,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content: nextRecovery.message,
          },
        ]);
      }
      setSteps((current) =>
        current.map((step) =>
          step.status === 'running'
            ? { ...step, status: stopped ? 'pending' : 'error' }
            : step,
        ),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      stopRequestedRef.current = false;
    }
  };

  const performCardAction = async (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => {
    if (isRealAgent && !isLoggedIn) {
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
    const lifecycle = lifecycleFromSchemaAction(schemaAction);

    setMessages((current) => [
      ...current,
      {
        id: nextId('user'),
        role: 'user',
        content: publicText(action.label, '继续'),
      },
    ]);
    setUserResult(null);
    setRecovery(null);
    setIsRunning(true);
    finishedRef.current = false;
    stopRequestedRef.current = false;
    agentFlow.beginAction(lifecycle);
    setSteps((current) =>
      mergeStep(
        current,
        stepIdFromSchemaAction(schemaAction),
        lightStatusFromSchemaAction(schemaAction),
        'running',
      ),
    );

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await agentAdapter.performAction(taskId, {
        action: schemaAction,
        idempotencyKey: `agent-action-${taskId}-${action.id}-${Date.now()}`,
        payload: {
          ...(action.payload ?? {}),
          cardId: card.id,
          cardType: card.type,
          cardData: card.data,
        },
      }, {
        onEvent: handleAgentStreamEvent,
        signal: controller.signal,
      });
      setActiveTaskId(next.taskId ?? taskId);
      if (!finishedRef.current) finishUserFacing(next.response);
    } catch (error) {
      const stopped = stopRequestedRef.current || isAbortError(error);
      const agentError = stopped
        ? mapAgentError(new DOMException('Aborted', 'AbortError'))
        : agentFlow.failWithError(error);
      const nextRecovery = createAgentRecoveryFromError(
        agentError,
        publicText(action.label, '继续'),
        'action_failed',
      );
      setRecovery(nextRecovery);
      if (stopped) {
        finishAssistantDelta();
      } else {
        setMessages((current) => [
          ...current,
          {
            id: nextId('assistant'),
            role: 'assistant',
            content: nextRecovery.message,
          },
        ]);
      }
      setSteps((current) =>
        current.map((step) =>
          step.status === 'running'
            ? { ...step, status: stopped ? 'pending' : 'error' }
            : step,
        ),
      );
    } finally {
      setIsRunning(false);
      abortRef.current = null;
      stopRequestedRef.current = false;
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

  const handleAgentStreamEvent = (event: AgentStreamEvent) => {
    agentFlow.handleStreamEvent(event);
    if (event.type === 'assistant_delta') {
      appendAssistantDelta(event.delta);
      return;
    }
    if (event.type === 'assistant_done') {
      finishAssistantDelta();
      return;
    }
    if (event.type === 'progress') {
      setSteps((current) => mergeProgressStep(current, event));
      return;
    }
    if (event.type === 'status') {
      if (typeof event.taskId === 'number' && event.taskId > 0) {
        setActiveTaskId(event.taskId);
      }
      setSteps((current) =>
        mergeStep(current, stepIdFromLightStatus(event.lightStatus), event.lightStatus, 'running'),
      );
    }
    if (event.type === 'result') finishUserFacing(event.result);
  };

  const appendAssistantDelta = (delta: string) => {
    const cleanDelta = publicText(delta, '');
    if (!cleanDelta) return;
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role === 'assistant' && last.status === 'streaming') {
        return [
          ...current.slice(0, -1),
          {
            ...last,
            content: `${last.content}${cleanDelta}`,
          },
        ];
      }
      return [
        ...current,
        {
          id: nextId('assistant-stream'),
          role: 'assistant',
          content: cleanDelta,
          status: 'streaming',
        },
      ];
    });
  };

  const finishAssistantDelta = () => {
    setMessages((current) => {
      const last = current.at(-1);
      if (last?.role !== 'assistant' || last.status !== 'streaming') return current;
      return [...current.slice(0, -1), { ...last, status: 'done' }];
    });
  };

  const finishUserFacing = (finalResult: UserFacingAgentResponse) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    agentFlow.completeResponse(finalResult);
    setUserResult(finalResult);
    setRecovery(null);
    const finalMessage = publicText(
      finalResult.assistantMessage,
      '我已经整理好了，下面是我建议你先看的内容。',
    );
    setMessages((current) => {
      const last = current.at(-1);
      const assistantMessage = {
        id: nextId('assistant'),
        role: 'assistant',
        content: finalMessage,
        status: 'done',
      } satisfies AgentThreadMessage;
      if (last?.role === 'assistant' && last.status === 'streaming') {
        return [
          ...current.slice(0, -1),
          {
            ...last,
            content: last.content.trim() ? last.content : finalMessage,
            status: 'done',
          },
        ];
      }
      if (last?.role === 'assistant' && last.status === 'done' && last.content.trim()) {
        return current;
      }
      return [...current, assistantMessage];
    });
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
    stopRequestedRef.current = true;
    abortRef.current?.abort();
    finishAssistantDelta();
    setIsRunning(false);
    setSteps((current) =>
      current.map((step) => (step.status === 'running' ? { ...step, status: 'pending' } : step)),
    );
  };

  const retryRecovery = () => {
    if (!recovery?.prompt || isRunning) return;
    void submit(undefined, recovery.prompt);
  };

  const currentGoal =
    [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const guideState = agentFlow.guideState;
  const guideTarget = agentFlow.guideTarget;
  const guideCopy = agentFlow.guideCopy;
  const startPetVisible = shouldShowAgentPet({
    petEnabled,
    guideState,
    input,
    isRunning,
    sessionRestoring,
    userResult,
    recovery,
    petNudged,
    surface: 'start',
  });
  const threadPetVisible = shouldShowAgentPet({
    petEnabled,
    guideState,
    input,
    isRunning,
    sessionRestoring,
    userResult,
    recovery,
    petNudged,
    surface: 'thread',
  });
  return (
    <AgentWorkspaceLayout
      isLanding={shellView === 'home' && messages.length === 0 && !isRunning && !userResult}
      currentGoal={currentGoal}
      lifeGraph={lifeGraph}
      petEnabled={petEnabled}
      onPetEnabledChange={setPetEnabled}
      onNewConversation={() => {
        abortRef.current?.abort();
        skipNextRestoreRef.current = true;
        setInput('');
        setMessages([]);
        setSteps(baseSteps);
        setUserResult(null);
        setRecovery(null);
        setActivityDetail(null);
        setDebugEvents([]);
        setDebugOpen(false);
        setActiveTaskId(null);
        setIsRunning(false);
        setPetNudged(false);
        agentFlow.reset();
      }}
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
                guideState={guideState}
                guideTarget={guideTarget}
                guideCopy={guideCopy}
                petEnabled={petEnabled}
                petVisible={startPetVisible}
                onInputFocus={() => {
                  setPetNudged(true);
                  agentFlow.focusInput();
                }}
                onEmptySubmit={() => {
                  setPetNudged(true);
                  agentFlow.showEmptyError();
                }}
              />
            ) : (
              <AgentThread
                input={input}
                onInput={setInput}
                onSubmit={submit}
                onStop={stopRun}
                isRunning={isRunning}
                sessionRestoring={sessionRestoring}
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
                recovery={recovery}
                guideState={guideState}
                guideTarget={guideTarget}
                guideCopy={guideCopy}
                petEnabled={petEnabled}
                petVisible={threadPetVisible}
                flowActiveInterest={agentFlow.activeInterest}
                flowActiveInterestIndex={agentFlow.activeInterestIndex}
                flowLoadingRecommendations={agentFlow.loadingRecommendations}
                flowHighlightRecommendations={agentFlow.highlightRecommendations}
                onInputFocus={() => {
                  setPetNudged(true);
                  agentFlow.focusInput();
                }}
                onEmptySubmit={() => {
                  setPetNudged(true);
                  agentFlow.showEmptyError();
                }}
                onRecommendationFocus={agentFlow.focusRecommendation}
                onSafetyFocus={agentFlow.focusSafety}
                onConfirmFocus={agentFlow.focusConfirmButton}
                onToggleDebug={loadDebugEvents}
                onCloseActivityDetail={() => setActivityDetail(null)}
                onAction={performCardAction}
                onRetryRecovery={retryRecovery}
                endRef={endRef}
              />
            )}
          </section>
        </div>
      )}
    </AgentWorkspaceLayout>
  );
}

function AgentWorkspaceLayout({
  children,
  isLanding,
  currentGoal,
  lifeGraph,
  petEnabled,
  onPetEnabledChange,
  onNewConversation,
}: {
  children: ReactNode;
  isLanding: boolean;
  currentGoal: string;
  lifeGraph: LifeGraphResponse | null;
  petEnabled: boolean;
  onPetEnabledChange: (enabled: boolean) => void;
  onNewConversation: () => void;
}) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<AgentSidebarSectionId>('new');
  const lifeGraphScore = lifeGraph?.completeness.completenessScore ?? 0;
  const recentConversations = [
    currentGoal || '今晚想找慢跑搭子',
    '这周有什么轻松活动',
    '帮我筛选低压力见面',
  ];
  const sidebarItems: Array<{ id: AgentSidebarSectionId; label: string; icon: LucideIcon }> = [
    { id: 'new', label: '新对话', icon: MessageSquarePlus },
    { id: 'recent', label: '最近对话', icon: Clock3 },
    { id: 'profile', label: '人物画像', icon: UserRound },
    { id: 'settings', label: '权限控制', icon: ShieldCheck },
    { id: 'projects', label: '我的匹配', icon: CalendarDays },
    { id: 'history', label: '最近需求', icon: Clock3 },
    { id: 'pet', label: petEnabled ? '隐藏小蚁' : '显示小蚁', icon: Sparkles },
  ];
  const goSidebar = (id: AgentSidebarSectionId) => {
    setActiveSection(id);
    if (id === 'new') {
      onNewConversation();
      navigate('/agent');
      return;
    }
    if (id === 'profile') {
      navigate('/profile/life-graph');
      return;
    }
    if (id === 'settings') {
      navigate('/agent/settings');
      return;
    }
    if (id === 'projects') {
      navigate('/agent/projects');
      return;
    }
    if (id === 'history') {
      navigate('/agent/history');
      return;
    }
    if (id === 'pet') {
      onPetEnabledChange(!petEnabled);
    }
  };

  return (
    <div
      className={clsx(
        'agent-workspace agent-workspace--gpt agent-minimal-shell agent-gpt-copy-shell',
        isLanding && 'agent-workspace--landing',
        sidebarOpen
          ? 'agent-gpt-copy-shell--sidebar-open'
          : 'agent-gpt-copy-shell--sidebar-collapsed',
      )}
    >
      <aside className="agent-gpt-sidebar" aria-label="Agent 导航">
        <div className="agent-gpt-sidebar__top">
          <Link to="/" className="agent-gpt-sidebar__brand" aria-label="FitMeet 首页">
            <img src={AGENT_BRAND_ICON_SRC} alt="" />
            {sidebarOpen ? (
              <span>
                <strong>FitMeet</strong>
                <small>Agent</small>
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            aria-label={sidebarOpen ? '关闭边栏' : '打开边栏'}
            className="agent-gpt-sidebar__toggle"
            onClick={() => setSidebarOpen((current) => !current)}
          >
            {sidebarOpen ? (
              <PanelLeftClose aria-hidden="true" />
            ) : (
              <PanelLeftOpen aria-hidden="true" />
            )}
          </button>
        </div>

        {sidebarOpen ? (
          <div className="agent-gpt-sidebar__body">
            <section className="agent-gui-command-panel" aria-label="Agent 工作模式">
              <div className="agent-gui-mode-tabs" role="tablist" aria-label="工作模式">
                <button type="button" className="is-active" role="tab" aria-selected="true">
                  <Sparkles aria-hidden="true" />
                  Agent
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected="false"
                  onClick={() => goSidebar('profile')}
                >
                  <UserRound aria-hidden="true" />
                  画像
                </button>
              </div>
              <div className="agent-gui-command-list">
                <button
                  type="button"
                  className={clsx('agent-gpt-sidebar__new', activeSection === 'new' && 'is-active')}
                  onClick={() => goSidebar('new')}
                >
                  <MessageSquarePlus aria-hidden="true" />
                  <span>
                    <strong>New Agent</strong>
                    <small>开启一次新的约见任务</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="agent-gui-command"
                  onClick={() => goSidebar('projects')}
                >
                  <CalendarDays aria-hidden="true" />
                  <span>
                    <strong>新需求</strong>
                    <small>整理场景、人选与时间</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="agent-gui-command"
                  onClick={() => goSidebar('settings')}
                >
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>执行边界</strong>
                    <small>检查授权和安全策略</small>
                  </span>
                </button>
              </div>
            </section>

            <section className="agent-gpt-sidebar__section" aria-label="最近对话">
              <div className="agent-gpt-sidebar__section-title">最近对话</div>
              <div className="agent-gpt-sidebar__list">
                {recentConversations.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={clsx(activeSection === 'recent' && 'is-active')}
                    onClick={() => goSidebar('recent')}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>

            <section className="agent-gpt-sidebar__utility" aria-label="Agent 常用功能">
              <button
                type="button"
                className={clsx(
                  'agent-gpt-sidebar__tool',
                  activeSection === 'profile' && 'is-active',
                )}
                onClick={() => goSidebar('profile')}
              >
                <span>
                  <UserRound aria-hidden="true" />
                </span>
                <span>
                  <strong>人物画像</strong>
                  <small>Life Graph 完整度 {lifeGraphScore}%</small>
                </span>
              </button>
              <button
                type="button"
                className={clsx(
                  'agent-gpt-sidebar__tool',
                  activeSection === 'settings' && 'is-active',
                )}
                onClick={() => goSidebar('settings')}
              >
                <span>
                  <ShieldCheck aria-hidden="true" />
                </span>
                <span>
                  <strong>权限控制</strong>
                  <small>管理自动执行边界</small>
                </span>
              </button>
              <button
                type="button"
                className={clsx(
                  'agent-gpt-sidebar__tool',
                  activeSection === 'projects' && 'is-active',
                )}
                onClick={() => goSidebar('projects')}
              >
                <span>
                  <CalendarDays aria-hidden="true" />
                </span>
                <span>
                  <strong>我的匹配</strong>
                  <small>已确认与待跟进</small>
                </span>
              </button>
              <button
                type="button"
                className={clsx(
                  'agent-gpt-sidebar__tool',
                  activeSection === 'history' && 'is-active',
                )}
                onClick={() => goSidebar('history')}
              >
                <span>
                  <Clock3 aria-hidden="true" />
                </span>
                <span>
                  <strong>最近需求</strong>
                  <small>历史推荐与记录</small>
                </span>
              </button>
              <button
                type="button"
                className={clsx('agent-gpt-sidebar__tool', petEnabled && 'is-active')}
                aria-pressed={petEnabled}
                onClick={() => goSidebar('pet')}
              >
                <span>
                  <Sparkles aria-hidden="true" />
                </span>
                <span>
                  <strong>智能小蚁</strong>
                  <small>{petEnabled ? '需要时出现' : '已隐藏'}</small>
                </span>
              </button>
            </section>
          </div>
        ) : (
          <nav className="agent-gpt-sidebar__collapsed-nav">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  className={clsx(activeSection === item.id && 'is-active')}
                  aria-pressed={item.id === 'pet' ? petEnabled : undefined}
                  onClick={() => goSidebar(item.id)}
                >
                  <Icon aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        )}

        <div className="agent-gpt-sidebar__bottom">
          <span>
            <img src={AGENT_BRAND_ICON_SRC} alt="" />
          </span>
          {sidebarOpen ? <strong>开发者模式</strong> : null}
        </div>
      </aside>

      <main className="agent-minimal-main">
        <header className="agent-minimal-topbar">
          <div className="agent-minimal-brand">
            <strong aria-label="FitMeet Agent">
              FitMeet <span>Agent</span>
            </strong>
            <small>让每一次线下认识都更安心</small>
          </div>
          <div className="agent-minimal-status">
            <span>
              <ShieldCheck aria-hidden="true" />
              权限正常
              <i aria-hidden="true" />
            </span>
            <span>
              <ShieldCheck aria-hidden="true" />
              安全优先
            </span>
          </div>
        </header>
        <div className="agent-minimal-surface">{children}</div>
      </main>
    </div>
  );
}

function AgentStartScreen({
  input,
  onInput,
  onSubmit,
  guideState,
  guideTarget,
  guideCopy,
  petEnabled,
  petVisible,
  onInputFocus,
  onEmptySubmit,
}: {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  guideState: AntGuideState;
  guideTarget: AntGuideTarget;
  guideCopy?: AntGuideCopy;
  petEnabled: boolean;
  petVisible: boolean;
  onInputFocus?: () => void;
  onEmptySubmit?: () => void;
}) {
  const pickIdea = (idea: AgentSuggestionItem) => {
    onInput(idea.prompt ?? idea.text);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.agent-gpt-input__textarea')?.focus();
    });
  };

  return (
    <div className="agent-gpt-start agent-gpt-start--product agent-minimal-home agent-gpt-home-clean">
      <div className="agent-minimal-glow" aria-hidden="true" />
      <section className="agent-deepseek-workbench" aria-label="FitMeet Agent 工作台">
        <div className="agent-deepseek-workbench__head">
          <div className="agent-gpt-cover" aria-hidden="true">
            <img src={AGENT_BRAND_ICON_SRC} alt="" />
          </div>
          <div>
            <span>FitMeet Agent</span>
            <h1>今天想让 FitMeet 帮你完成什么连接？</h1>
          </div>
        </div>
        <p>
          像和一个线下社交工作台对话：讲清楚想认识谁、在哪里见、哪些边界不能越过，Agent
          会把画像、权限、匹配和跟进放进同一条任务流。
        </p>
        <div className="agent-deepseek-workbench__grid">
          {agentWorkbenchCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="agent-deepseek-card">
                <span>{card.label}</span>
                <Icon aria-hidden="true" />
                <strong>{card.title}</strong>
                <small>{card.detail}</small>
              </article>
            );
          })}
        </div>
      </section>
      {petEnabled && petVisible ? (
        <AntGuide
          className="agent-workspace-ant-guide agent-workspace-ant-guide--home"
          state={guideState}
          target={guideTarget}
          copy={guideCopy}
          size="md"
        />
      ) : null}
      <div className="agent-deepseek-composer">
        <AgentInput
          input={input}
          onInput={onInput}
          onSubmit={onSubmit}
          onFocusInput={onInputFocus}
          onEmptySubmit={onEmptySubmit}
        />
        <section className="agent-gpt-starter-row" aria-label="示例需求">
          {naturalPromptIdeas.slice(0, 3).map((idea) => (
            <button key={idea.text} type="button" onClick={() => pickIdea(idea)}>
              {idea.text}
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

function AgentThread({
  input,
  onInput,
  onSubmit,
  onStop,
  isRunning,
  sessionRestoring,
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
  recovery,
  guideState,
  guideTarget,
  guideCopy,
  petEnabled,
  petVisible,
  flowActiveInterest,
  flowActiveInterestIndex,
  flowLoadingRecommendations,
  flowHighlightRecommendations,
  onInputFocus,
  onEmptySubmit,
  onRecommendationFocus,
  onSafetyFocus,
  onConfirmFocus,
  onToggleDebug,
  onCloseActivityDetail,
  onAction,
  onRetryRecovery,
  endRef,
}: {
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  onStop: () => void;
  isRunning: boolean;
  sessionRestoring: boolean;
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
  recovery: AgentRecoveryState | null;
  guideState: AntGuideState;
  guideTarget: AntGuideTarget;
  guideCopy?: AntGuideCopy;
  petEnabled: boolean;
  petVisible: boolean;
  flowActiveInterest: string | null;
  flowActiveInterestIndex: number;
  flowLoadingRecommendations: boolean;
  flowHighlightRecommendations: boolean;
  onInputFocus?: () => void;
  onEmptySubmit?: () => void;
  onRecommendationFocus?: () => void;
  onSafetyFocus?: () => void;
  onConfirmFocus?: () => void;
  onToggleDebug: () => void;
  onCloseActivityDetail: () => void;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
  onRetryRecovery: () => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  const assistantIsStreaming = messages.some(
    (message) => message.role === 'assistant' && message.status === 'streaming',
  );
  return (
    <div className="agent-gpt-thread">
      {petEnabled && petVisible ? (
        <AntGuide
          className="agent-workspace-ant-guide agent-workspace-ant-guide--thread"
          state={guideState}
          target={guideTarget}
          copy={guideCopy}
          size="sm"
        />
      ) : null}
      <Conversation className="agent-gpt-thread__messages">
        <ConversationContent className="agent-gpt-thread__content">
          {messages.map((message) => (
            <AgentMessageBubble key={message.id} message={message} />
          ))}
          {isRunning && !assistantIsStreaming ? (
            <AgentThinkingBlock elapsed={elapsed} steps={steps} />
          ) : null}
          {sessionRestoring ? <AgentInlineStatus text="正在恢复上一次对话..." /> : null}
          {flowLoadingRecommendations ? (
            <AgentMockDiscoveryPanel
              activeInterest={flowActiveInterest}
              activeInterestIndex={flowActiveInterestIndex}
            />
          ) : null}
          {userResult ? (
            <AgentPrivacyControls privacy={privacy} onChange={onPrivacyChange} />
          ) : null}
          {userResult ? (
            <UserFacingResult
              result={userResult}
              privacy={privacy}
              highlightRecommendations={flowHighlightRecommendations}
              onAction={onAction}
              onRecommendationFocus={onRecommendationFocus}
              onSafetyFocus={onSafetyFocus}
              onConfirmFocus={onConfirmFocus}
            />
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
          {!isRunning && recovery ? (
            <AgentRecoveryPanel recovery={recovery} onRetry={onRetryRecovery} />
          ) : null}
          <div ref={endRef} />
        </ConversationContent>
        <ConversationScrollButton className="agent-gpt-scroll-button" />
      </Conversation>
      <AgentInput
        compact
        input={input}
        onInput={onInput}
        onSubmit={onSubmit}
        isRunning={isRunning}
        onStop={onStop}
        onFocusInput={onInputFocus}
        onEmptySubmit={onEmptySubmit}
      />
    </div>
  );
}

function AgentRecoveryPanel({
  recovery,
  onRetry,
}: {
  recovery: AgentRecoveryState;
  onRetry: () => void;
}) {
  return (
    <section className="agent-recovery-panel" aria-live="polite">
      <div>
        <strong>{recovery.title}</strong>
        <span>{recovery.message}</span>
      </div>
      <button type="button" onClick={onRetry}>
        <RotateCcw aria-hidden="true" />
        再试一次
      </button>
    </section>
  );
}

function AgentInput({
  compact,
  input,
  onInput,
  onSubmit,
  isRunning,
  onStop,
  onFocusInput,
  onEmptySubmit,
}: {
  compact?: boolean;
  input: string;
  onInput: (value: string) => void;
  onSubmit: (event?: FormEvent, prompt?: string) => void;
  isRunning?: boolean;
  onStop?: () => void;
  onFocusInput?: () => void;
  onEmptySubmit?: () => void;
}) {
  const [emptyWarning, setEmptyWarning] = useState(false);

  return (
    <PromptInput
      className={clsx(
        'agent-gpt-input',
        compact && 'agent-gpt-input--compact',
        emptyWarning && 'is-empty',
      )}
      onSubmit={(message, event) => {
        if (!message.text.trim()) {
          setEmptyWarning(true);
          onEmptySubmit?.();
          window.setTimeout(() => setEmptyWarning(false), 320);
          return;
        }
        onSubmit(event, message.text);
      }}
    >
      <PromptInputBody className="agent-gpt-input__body">
        <span className="agent-input-spark" aria-hidden="true">
          <Sparkles />
        </span>
        <PromptInputTextarea
          aria-label="描述你的社交需求"
          className="agent-gpt-input__textarea"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onFocus={onFocusInput}
          placeholder="例如：今晚找人散步，先站内聊"
          rows={1}
        />
        <span className="agent-model-pill">
          FitMeet Lite
          <ChevronDown aria-hidden="true" />
        </span>
        {isRunning ? (
          <button
            type="button"
            aria-label="停止"
            className="agent-gpt-input__submit agent-gpt-input__submit--stop"
            onClick={onStop}
          >
            <Square aria-hidden="true" />
          </button>
        ) : (
          <PromptInputSubmit aria-label="发送需求" className="agent-gpt-input__submit">
            <Send aria-hidden="true" />
          </PromptInputSubmit>
        )}
      </PromptInputBody>
    </PromptInput>
  );
}

function AgentMockDiscoveryPanel({
  activeInterest,
  activeInterestIndex,
}: {
  activeInterest: string | null;
  activeInterestIndex: number;
}) {
  return (
    <section className="agent-flow-discovery" aria-label="正在发现兴趣场景">
      <div className="agent-flow-discovery__heading">
        <span className="agent-gpt-pulse" aria-hidden="true" />
        <strong>正在发现兴趣场景</strong>
        <small>{activeInterest ? `正在点亮：${activeInterest}` : '开始理解兴趣边界'}</small>
      </div>
      <div className="agent-flow-interest-row" aria-label="兴趣点亮进度">
        {AGENT_FLOW_INTERESTS.map((interest, index) => (
          <span
            key={interest}
            className={clsx(
              'agent-flow-interest-chip',
              index <= activeInterestIndex && 'is-active',
            )}
          >
            {interest}
          </span>
        ))}
      </div>
      <div className="agent-flow-loading-grid" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <span key={item} className="agent-flow-loading-card" />
        ))}
      </div>
    </section>
  );
}

function AgentThinkingBlock({
  elapsed,
  steps,
}: {
  elapsed: number;
  steps: Step[];
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
  highlightRecommendations,
  onAction,
  onRecommendationFocus,
  onSafetyFocus,
  onConfirmFocus,
}: {
  result: UserFacingAgentResponse;
  privacy: AgentPrivacySettings;
  highlightRecommendations?: boolean;
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void;
  onRecommendationFocus?: () => void;
  onSafetyFocus?: () => void;
  onConfirmFocus?: () => void;
}) {
  const candidateCards = result.cards.filter((card) => card.type === 'candidate_card');
  const activityCards = result.cards.filter((card) =>
    ['activity_plan', 'activity_status', 'checkin_card', 'review_card'].includes(card.type),
  );
  const otherCards = result.cards.filter(
    (card) => card.type !== 'candidate_card' && !activityCards.includes(card),
  );
  const hasConfirmableCards = otherCards.some(
    (card) =>
      card.status === 'waiting_confirmation' ||
      card.actions.some(
        (action) =>
          action.requiresConfirmation ||
          action.schemaAction === 'opener.confirm_send' ||
          action.action === 'send_message',
      ),
  );
  const safetyNotes = [
    ...result.safeStatus.boundaryNotes,
    ...result.safeStatus.requiredConfirmations.map((item) => '需要你确认：' + String(item)),
  ]
    .map((note) => publicText(note, ''))
    .filter(Boolean);
  const taskId = findTaskId(result);

  return (
    <div className="agent-gpt-results agent-product-results">
      {otherCards.length ? (
        <section
          className="agent-gpt-result-block agent-natural-cards"
          onFocus={hasConfirmableCards ? onConfirmFocus : undefined}
          onMouseEnter={hasConfirmableCards ? onConfirmFocus : undefined}
        >
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
        <section
          className={clsx(
            'agent-gpt-result-block',
            highlightRecommendations && 'agent-flow-result-block--active',
          )}
          onFocus={onRecommendationFocus}
          onMouseEnter={onRecommendationFocus}
        >
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
        <section
          className="agent-gpt-result-block"
          onFocus={onRecommendationFocus}
          onMouseEnter={onRecommendationFocus}
        >
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
        <section
          className="agent-gpt-result-block agent-natural-cards"
          onFocus={onConfirmFocus}
          onMouseEnter={onConfirmFocus}
        >
          <div className="agent-result-heading">
            <span>待确认</span>
            <h2>我正在等你决定</h2>
            <p>你确认之前，这些动作只会停留在草稿或待办状态。</p>
          </div>
          <div>
            {result.pendingConfirmations.slice(0, 4).map((confirmation) => (
              <AgentNaturalConfirmationCard
                key={`${confirmation.type}-${confirmation.id ?? confirmation.summary}`}
                confirmation={confirmationViewModelFromPending(confirmation, taskId, onAction)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {safetyNotes.length || result.safeStatus.blocked ? (
        <AgentSafetyPanel
          pendingActions={result.pendingConfirmations.length}
          notes={safetyNotes}
          onSafetyFocus={onSafetyFocus}
        />
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

function AgentSafetyPanel({
  pendingActions,
  notes,
  onSafetyFocus,
}: {
  pendingActions: number;
  notes: string[];
  onSafetyFocus?: () => void;
}) {
  return (
    <section
      className="agent-gpt-approval agent-safety-panel"
      tabIndex={0}
      onClick={onSafetyFocus}
      onFocus={onSafetyFocus}
      onMouseEnter={onSafetyFocus}
    >
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

function confirmationViewModelFromPending(
  confirmation: UserFacingAgentResponse['pendingConfirmations'][number],
  taskId: number | null,
  onAction: (card: FitMeetAlphaCard, action: FitMeetAlphaCardAction) => void,
): AgentConfirmationViewModel {
  const id = `${confirmation.type}-${confirmation.id ?? confirmation.summary}`;
  const action = taskId ? actionFromPendingConfirmation(confirmation, taskId) : null;
  const card = action && taskId ? cardFromPendingConfirmation(confirmation, taskId, action) : null;

  return {
    id,
    title: publicText(confirmation.summary, '有一个动作正在等待你确认'),
    body: confirmationLabel(confirmation.actionType, confirmation.riskLevel),
    primaryLabel: confirmationPrimaryLabel(confirmation.actionType),
    secondaryLabels: confirmationSecondaryLabels(confirmation.actionType),
    onPrimary: card && action ? () => onAction(card, action) : undefined,
  };
}

function actionFromPendingConfirmation(
  confirmation: UserFacingAgentResponse['pendingConfirmations'][number],
  taskId: number,
): FitMeetAlphaCardAction | null {
  const actionType = confirmation.actionType.toLowerCase();
  const summary = publicText(confirmation.summary, '确认继续');

  if (actionType.includes('publish') || actionType.includes('activity')) {
    return {
      id: `pending-${confirmation.type}-confirm`,
      label: confirmationPrimaryLabel(confirmation.actionType),
      action: 'create_activity',
      schemaAction: 'activity.confirm_create',
      requiresConfirmation: true,
      payload: {
        taskId,
        pendingConfirmationType: confirmation.type,
        pendingConfirmationId: confirmation.id,
        summary,
      },
    };
  }

  if (actionType.includes('message')) {
    return {
      id: `pending-${confirmation.type}-confirm`,
      label: confirmationPrimaryLabel(confirmation.actionType),
      action: 'send_message',
      schemaAction: 'opener.confirm_send',
      requiresConfirmation: true,
      payload: {
        taskId,
        pendingConfirmationType: confirmation.type,
        pendingConfirmationId: confirmation.id,
        summary,
      },
    };
  }

  if (
    actionType.includes('friend') ||
    actionType.includes('connect') ||
    actionType.includes('candidate') ||
    actionType.includes('save')
  ) {
    return {
      id: `pending-${confirmation.type}-confirm`,
      label: confirmationPrimaryLabel(confirmation.actionType),
      action: 'save_candidate',
      schemaAction: 'candidate.like',
      requiresConfirmation: true,
      payload: {
        taskId,
        pendingConfirmationType: confirmation.type,
        pendingConfirmationId: confirmation.id,
        summary,
      },
    };
  }

  return null;
}

function cardFromPendingConfirmation(
  confirmation: UserFacingAgentResponse['pendingConfirmations'][number],
  taskId: number,
  action: FitMeetAlphaCardAction,
): FitMeetAlphaCard {
  return {
    id: `pending-confirmation:${confirmation.type}:${confirmation.id ?? taskId}`,
    type: 'audit_update',
    title: publicText(confirmation.summary, '待确认动作'),
    body: confirmationLabel(confirmation.actionType, confirmation.riskLevel),
    status: 'waiting_confirmation',
    data: {
      taskId,
      pendingConfirmationType: confirmation.type,
      pendingConfirmationId: confirmation.id,
      actionType: confirmation.actionType,
      riskLevel: confirmation.riskLevel,
    },
    actions: [action],
  };
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

function lifecycleFromSchemaAction(action: FitMeetAgentSchemaAction): AgentLifecycle {
  if (action === 'candidate.generate_opener' || action === 'opener.regenerate') {
    return 'drafting_opener';
  }
  if (action === 'opener.confirm_send') return 'waiting_confirmation';
  if (action.startsWith('candidate.')) return 'searching_candidates';
  if (action.startsWith('activity.')) return 'waiting_confirmation';
  if (action.startsWith('review.') || action.startsWith('life_graph.')) {
    return 'reading_life_graph';
  }
  return 'analyzing_intent';
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
  status: 'pending' | 'running' | 'waiting' | 'done' | 'failed',
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

function createAgentRecoveryFromError(
  error: AgentError,
  prompt: string,
  fallbackKind: AgentRecoveryState['kind'] = 'failed',
): AgentRecoveryState {
  const kindByCode: Partial<Record<AgentError['code'], AgentRecoveryState['kind']>> = {
    ABORTED: 'stopped',
    MISSING_INFO: 'missing_info',
    UNAUTHORIZED: 'unauthorized',
    SAFETY_BLOCKED: 'safety',
  };
  return {
    kind: kindByCode[error.code] ?? fallbackKind,
    title: error.title,
    message: error.message,
    prompt,
    retryable: error.retryable,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  if (error instanceof Error) return error.name === 'AbortError';
  return false;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
