import type { DataMessagePartProps, ToolCallMessagePartProps } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/react';
import {
  AlertCircle,
  Brain,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  HeartHandshake,
  History,
  Info,
  Loader2,
  MapPin,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Fragment,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';

import { cn } from '../../lib/utils';
import { AssistantThinkingDots } from './thinking-dots';
import { useFitMeetToolUIActions } from './tool-ui-actions';
import {
  extractCanonicalAssistantCards,
  defaultOpportunityActionsForSchema,
  normalizeActivityOpportunityView,
  normalizeCandidateOpportunityView,
  normalizeGenericCardView,
  normalizeLifeGraphDiffView,
  normalizeMeetLoopTimelineView,
  normalizeSafetyApprovalView,
  type SchemaDrivenAssistantCard,
  type ToolUISchemaAction,
  type ToolUISchemaType,
  toolUISchemaActionFromUnknown,
} from './tool-ui-schema';

type ProcessStatus = 'running' | 'complete' | 'waiting' | 'error';

type ProcessStep = {
  id: string;
  label: string;
  detail?: string;
  status: ProcessStatus;
  kind?: string;
  processType?: string;
  agentName?: string | null;
  metadata?: Record<string, unknown>;
  snapshot?: ProcessStepSnapshot;
};

type ProcessStepSnapshot = {
  schemaVersion: 'fitmeet.step-snapshot.v1';
  observation: string[];
  critique: string | null;
  result: string | null;
};

type ProcessSummary = {
  title: string;
  status: ProcessStatus;
  steps: ProcessStep[];
  resultLines: string[];
  pendingCount: number;
  replayable: boolean;
  forkable: boolean;
  retryable: boolean;
  checkpointActions: CheckpointToolAction[];
  checkpointId?: number | string | null;
  stepId?: string | null;
  resumeContext: ResumeContext;
};

type CheckpointToolActionKey = 'resume' | 'retry' | 'replay' | 'fork';

type CheckpointToolAction = {
  key: CheckpointToolActionKey;
  label: string;
  busyLabel: string;
  endpoint?: string | null;
  method?: string | null;
  idempotencyKey?: string | null;
  stepId?: string | null;
  source: 'backend' | 'fallback';
};

type ToolCategory = 'life_graph' | 'social_match' | 'meet_loop' | 'safety' | 'generic';

type ResumeContext = {
  hasCheckpoint: boolean;
  hasInterrupt: boolean;
  threadId?: string | null;
  checkpointId?: number | string | null;
  parentCheckpointId?: number | string | null;
  mode?: 'resume' | 'retry' | 'replay' | 'fork' | null;
  interruptKind?: string | null;
  idempotencyKey?: string | null;
  sourceStep?: {
    stepId: string;
    label: string | null;
    toolName: string | null;
  } | null;
  stepScope?: {
    mode: 'full_checkpoint' | 'through_step';
    stepCount: number;
    sourceCheckpointId: number | null;
  } | null;
  sideEffectPolicy?: {
    idempotencyKey: string;
    sideEffectsBeforeResume: 'idempotent_only';
    duplicatePolicy: 'reuse_idempotency_key';
  } | null;
};

type ToolGroup = {
  category: ToolCategory;
  title: string;
  description: string;
  steps: ProcessStep[];
};

type PendingConfirmation = {
  id: number | string | null;
  type?: string;
  actionType?: string;
  summary: string;
  riskLevel?: string;
  expiresAt?: string | null;
};

type ResolvedApproval = {
  id: number | string | null;
  decision: 'approved' | 'rejected';
  summary?: string | null;
};

type VisibleCardAction = {
  id: string | null;
  label: string | null;
  requiresConfirmation: boolean;
  schemaAction: ToolUISchemaAction | null | undefined;
  action: string | null;
  payload?: Record<string, unknown>;
  source: 'backend' | 'default';
};

type ToolUICardRenderer = (props: { card: SchemaDrivenAssistantCard }) => ReactNode;

type CardActionCopy = {
  busy: string;
  done: string;
  result: string;
};

type CardActionRuntimeState = {
  busyKey: string | null;
  completedKey: string | null;
  failedKey: string | null;
  error: string | null;
};

type CheckpointActionRuntimeState = {
  busyKey: string | null;
  completedKey: string | null;
  failedKey: string | null;
  error: string | null;
};

const EMPTY_CARD_ACTION_STATE: CardActionRuntimeState = {
  busyKey: null,
  completedKey: null,
  failedKey: null,
  error: null,
};

const EMPTY_CHECKPOINT_ACTION_STATE: CheckpointActionRuntimeState = {
  busyKey: null,
  completedKey: null,
  failedKey: null,
  error: null,
};

const cardActionRuntimeState = new Map<string, CardActionRuntimeState>();
const cardActionRuntimeListeners = new Set<() => void>();
const checkpointActionRuntimeState = new Map<string, CheckpointActionRuntimeState>();
const checkpointActionRuntimeListeners = new Set<() => void>();

const ASSISTANT_CARD_RENDERERS: Record<ToolUISchemaType, ToolUICardRenderer> = {
  'social_match.candidate': CandidateResultCard,
  'social_match.activity': ActivityOpportunityCard,
  'life_graph.diff': LifeGraphDiffCard,
  'meet_loop.timeline': MeetLoopResultCard,
  'safety.approval': SafetyResultCard,
  'generic.card': GenericResultCard,
};

const CARD_ACTION_COPY: Record<ToolUISchemaAction, CardActionCopy> = {
  'candidate.view_detail': {
    busy: '正在打开详情',
    done: '已打开详情',
    result: '已打开详情，我会把后续判断继续放在这段对话里。',
  },
  'candidate.like': {
    busy: '正在记录兴趣',
    done: '已记录兴趣',
    result: '已记录这个偏好，后续推荐会参考它。',
  },
  'candidate.skip': {
    busy: '正在减少类似推荐',
    done: '已跳过',
    result: '已跳过这个机会，后续会减少类似推荐。',
  },
  'candidate.connect': {
    busy: '正在准备邀请',
    done: '已准备邀请',
    result: '已准备邀请请求，真正触达前仍会经过确认。',
  },
  'candidate.generate_opener': {
    busy: '正在生成开场白',
    done: '已生成开场白',
    result: '已生成开场白，真正发送前仍会等你确认。',
  },
  'candidate.more_like_this': {
    busy: '正在找类似选项',
    done: '已找到类似选项',
    result: '已继续查找相似机会，新的选择会回到这段对话。',
  },
  'opener.confirm_send': {
    busy: '正在准备发送',
    done: '已准备发送',
    result: '已进入发送确认流程，发送结果会继续回到这段对话。',
  },
  'opener.regenerate': {
    busy: '正在重新生成',
    done: '已重新生成',
    result: '已重新生成开场白，发送前仍会等你确认。',
  },
  'opener.reject': {
    busy: '正在取消发送',
    done: '已取消发送',
    result: '已取消这次发送，未联系对方。',
  },
  'activity.view_detail': {
    busy: '正在打开详情',
    done: '已打开详情',
    result: '已打开详情，我会把后续判断继续放在这段对话里。',
  },
  'activity.confirm_create': {
    busy: '正在准备发起',
    done: '已准备发起',
    result: '已准备活动发起流程，发布前仍会保留确认边界。',
  },
  'activity.modify_time': {
    busy: '正在准备改期',
    done: '已准备改期',
    result: '已准备时间调整方案，真正改动前仍会等你确认。',
  },
  'activity.modify_location': {
    busy: '正在准备地点调整',
    done: '已准备地点调整',
    result: '已准备地点调整方案，真正改动前仍会等你确认。',
  },
  'activity.check_in': {
    busy: '正在记录到达',
    done: '已记录到达',
    result: '已记录到达状态，后续会继续跟进活动完成情况。',
  },
  'activity.complete': {
    busy: '正在记录完成',
    done: '已记录完成',
    result: '已记录活动完成，下一步可以留下简短评价。',
  },
  'activity.upload_proof': {
    busy: '正在准备证明上传',
    done: '已准备上传',
    result: '已进入证明上传流程，上传内容会按隐私规则处理。',
  },
  'review.submit': {
    busy: '正在提交评价',
    done: '已提交评价',
    result: '已提交这次评价，后续会用于改进推荐和约练闭环。',
  },
  'life_graph.accept_update': {
    busy: '正在确认更新',
    done: '已确认更新',
    result: '已确认这次画像更新，后续会按你的边界使用。',
  },
  'life_graph.reject_update': {
    busy: '正在跳过写入',
    done: '已跳过写入',
    result: '已跳过这次画像写入，不会把它用于长期记忆。',
  },
  'meet_loop.resume': {
    busy: '正在继续邀约',
    done: '已继续邀约',
    result: '已从约练进展继续推进，新的状态会回到消息流。',
  },
  'meet_loop.reschedule': {
    busy: '正在准备改期',
    done: '已准备改期',
    result: '已准备改期流程，改动前会继续征得确认。',
  },
  'safety.approve': {
    busy: '正在确认安全边界',
    done: '已确认边界',
    result: '已确认这一步的安全边界，后续执行仍会保留审计记录。',
  },
  'safety.reject': {
    busy: '正在拒绝这一步',
    done: '已拒绝',
    result: '已拒绝这一步，不会继续执行相关高风险动作。',
  },
};

export function AssistantToolFallback(part: ToolCallMessagePartProps) {
  const state = toolStatus(part.status);
  const resultLines = summarizeUnknownResult(part);
  return (
    <AgentProcessBlock
      summary={{
        title: humanToolName(part.toolName),
        status: state.status,
        steps: [
          {
            id: `${part.toolName || 'step'}-${state.status}`,
            label: state.text,
            status: state.status,
          },
        ],
        resultLines,
        pendingCount: state.status === 'waiting' ? 1 : 0,
        replayable: false,
        forkable: false,
        retryable: false,
        checkpointActions: [],
        resumeContext: {
          hasCheckpoint: false,
          hasInterrupt: state.status === 'waiting',
        },
      }}
    />
  );
}

export function AssistantDataFallback(part: DataMessagePartProps) {
  const summary = summarizeDataPart(part.name, part.data);
  if (part.name === 'fitmeet-thinking') {
    return <AssistantThinkingDots className="my-1" />;
  }
  if (part.name === 'fitmeet-approval') {
    return <ApprovalToolUI data={part.data} summary={summary} />;
  }
  if (part.name === 'fitmeet-process') {
    return <FitMeetProcessToolUI summary={summary} />;
  }
  if (part.name === 'fitmeet-cards') {
    return <FitMeetCardsToolUI data={part.data} summary={summary} />;
  }
  return <AgentProcessBlock summary={summary} />;
}

function FitMeetCardsToolUI({ data, summary }: { data: unknown; summary: ProcessSummary }) {
  const cards = extractCanonicalAssistantCards(data);
  if (cards.length === 0) return <AgentProcessBlock summary={summary} />;

  return (
    <section
      className="my-3 space-y-2 rounded-2xl border border-black/10 bg-[#f7f7f8] px-3 py-3 text-sm text-[#52525b] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      data-testid="assistant-ui-generative-cards"
      aria-label="整理结果"
      data-schema-version="fitmeet.tool-ui.v1"
    >
      <div className="flex items-center gap-2 px-1">
        <StatusBadge status={summary.status}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </StatusBadge>
        <div className="min-w-0">
          <p className="font-medium leading-5 text-[#27272a]">我找到这些选项</p>
          <p className="text-xs leading-5 text-[#71717a]">
            涉及真实发送、连接或发布时，我会先等你确认。
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {cards.map((card) => (
          <div
            key={card.id}
            data-testid="assistant-ui-schema-card"
            data-schema-type={card.schemaType}
            data-schema-version={card.schemaVersion}
          >
            <AssistantCardRenderer card={card} />
          </div>
        ))}
      </div>
    </section>
  );
}

function AssistantCardRenderer({ card }: { card: SchemaDrivenAssistantCard }) {
  const Renderer = ASSISTANT_CARD_RENDERERS[card.schemaType] ?? GenericResultCard;
  return (
    <div data-renderer={card.schemaType}>
      <Renderer card={card} />
    </div>
  );
}

function CandidateResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const opportunity = normalizeCandidateOpportunityView(card);
  const name = opportunity.name;
  const score = opportunity.score != null ? `${Math.round(opportunity.score)} 分` : null;
  const avatarUrl = safeImageSrc(opportunity.avatarUrl);
  const initials = name.slice(0, 1).toUpperCase();
  const hasDistance = Boolean(opportunity.distanceLabel);
  const hasOpener = Boolean(opportunity.suggestedOpener);
  const hasInterests = opportunity.interests.length > 0;

  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5 transition hover:-translate-y-px hover:shadow-sm hover:ring-black/10"
      data-testid="opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-opportunity-type="person"
      data-has-avatar={String(Boolean(avatarUrl || initials))}
      data-has-distance={String(hasDistance)}
      data-has-interests={String(hasInterests)}
      data-has-opener={String(hasOpener)}
      data-action-path="safe-sequenced"
    >
      <div className="flex items-start gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${name} 的头像`}
            className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-black/10"
            loading="lazy"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-sm font-semibold text-white">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">
                推荐对象
              </p>
              <p className="font-medium leading-5 text-[#27272a]">{opportunity.title}</p>
              {opportunity.subtitle ? (
                <p className="mt-0.5 text-xs leading-5 text-[#71717a]">{opportunity.subtitle}</p>
              ) : null}
            </div>
            {score ? (
              <span className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5">
                {score}
              </span>
            ) : null}
          </div>
          <p className="mt-1 leading-6 text-[#52525b]">{opportunity.summary}</p>
          <CandidateIntentChips opportunity={opportunity} />
          <ConfirmedContextChips
            items={opportunity.confirmedContext}
            schemaType={card.schemaType}
          />
          <OpportunityGuardrailStrip
            schemaType={card.schemaType}
            actions={visibleCardActions(card, card.actions)}
            items={[
              {
                id: 'source',
                label: '来源',
                value: candidateSourceGuardrail(opportunity),
              },
              {
                id: 'privacy',
                label: '资料',
                value: candidatePrivacyGuardrail(opportunity),
              },
              {
                id: 'touch',
                label: '触达',
                value: opportunity.invitePolicy ?? '发送邀请、加好友或连接前必须由你确认',
              },
              {
                id: 'recover',
                label: '恢复',
                value: '可跳过、重试开场白，或从确认点继续',
              },
            ]}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {opportunity.area ? (
              <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.area} />
            ) : null}
            {opportunity.time ? (
              <MetaChip icon={<CalendarClock className="h-3 w-3" />} label={opportunity.time} />
            ) : null}
            {opportunity.distanceLabel ? (
              <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.distanceLabel} />
            ) : null}
            {opportunity.safetyBadges.map((badge) => (
              <MetaChip key={badge} icon={<ShieldCheck className="h-3 w-3" />} label={badge} />
            ))}
            {opportunity.interests.map((interest) => (
              <MetaChip key={interest} icon={<Users className="h-3 w-3" />} label={interest} />
            ))}
          </div>
          {opportunity.reasons.length > 0 ? (
            <div className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5">
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                为什么推荐
              </p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                {opportunity.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <CandidateRankingBreakdown items={opportunity.rankingBreakdown} />
          {opportunity.discoverySafetySignals.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 ring-1 ring-emerald-100"
              data-testid="assistant-ui-candidate-discovery-safety"
              aria-label="可发现门槛"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-emerald-950">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                可发现门槛
              </p>
              <ul className="mt-1 grid gap-1 text-xs leading-5 text-emerald-900 sm:grid-cols-2">
                {opportunity.discoverySafetySignals.map((signal) => (
                  <li key={signal} className="flex gap-1.5">
                    <CheckCircle2 className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {opportunity.recommendationProtocol.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
              data-testid="assistant-ui-recommendation-protocol"
              aria-label="推荐协议"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                推荐协议
              </p>
              <dl className="mt-1 grid gap-1.5 text-xs leading-5 text-[#71717a] sm:grid-cols-2">
                {opportunity.recommendationProtocol.map((item) => (
                  <div key={item.key}>
                    <dt className="font-medium text-[#3f3f46]">{item.label}</dt>
                    <dd>{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {opportunity.trustSignals.length > 0 || opportunity.coldStartSignals.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
              data-testid="assistant-ui-candidate-trust-signals"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                推荐边界
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {[...opportunity.trustSignals, ...opportunity.coldStartSignals].map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] leading-5 text-[#52525b] ring-1 ring-black/5"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {opportunity.recentPublicActivity.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
              data-testid="assistant-ui-candidate-recent-public-activity"
              aria-label="最近公开动态"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                最近公开动态
              </p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                {opportunity.recentPublicActivity.map((signal) => (
                  <li key={signal}>• {signal}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {opportunity.preferenceHistorySignals.length > 0 ? (
            <div
              className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5"
              data-testid="assistant-ui-candidate-preference-history"
              aria-label="最近确认偏好"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                最近确认偏好
              </p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                {opportunity.preferenceHistorySignals.map((signal) => (
                  <li key={signal}>• {signal}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <CandidateActionRhythm opportunity={opportunity} />
          {opportunity.explanationSteps.length > 0 ? (
            <CandidateExplanationTrace steps={opportunity.explanationSteps} />
          ) : null}
          {opportunity.suggestedOpener ? (
            <p className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#3f3f46] ring-1 ring-black/5">
              开场白预览：{opportunity.suggestedOpener}
            </p>
          ) : null}
          {opportunity.recommendedNextAction ? (
            <p className="mt-2 text-xs leading-5 text-[#52525b]">
              下一步：{opportunity.recommendedNextAction}
            </p>
          ) : null}
          {opportunity.safetyBoundary ? (
            <p className="mt-2 text-xs leading-5 text-[#71717a]">
              安全边界：{opportunity.safetyBoundary}
            </p>
          ) : null}
          <OpportunityActionPath
            actions={visibleCardActions(card, card.actions)}
            schemaType={card.schemaType}
          />
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function CandidateActionRhythm({
  opportunity,
}: {
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>;
}) {
  const openerStrategy =
    opportunity.openerStrategy ??
    (opportunity.suggestedOpener
      ? '先用开场白轻量试探，确认对方有兴趣后再推进到邀请。'
      : '先围绕共同时间、地点或兴趣轻量开口，确认对方有兴趣后再推进。');
  const items = [
    opportunity.whyNow ? { id: 'why-now', label: '为什么现在', value: opportunity.whyNow } : null,
    { id: 'opener-strategy', label: '怎么开口', value: openerStrategy },
  ].filter(Boolean) as Array<{ id: string; label: string; value: string }>;
  if (items.length === 0) return null;

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-2"
      data-testid="assistant-ui-candidate-action-rhythm"
      aria-label="推荐行动节奏"
    >
      {items.map((item) => (
        <div key={item.id} className="text-xs leading-5" data-candidate-rhythm={item.id}>
          <span className="block font-medium text-[#3f3f46]">{item.label}</span>
          <span className="mt-0.5 block text-[#71717a]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function OpportunityGuardrailStrip({
  schemaType,
  actions,
  items,
}: {
  schemaType: ToolUISchemaType;
  actions: VisibleCardAction[];
  items: Array<{ id: string; label: string; value: string }>;
}) {
  const requiresConfirmation = actions.some((action) => action.requiresConfirmation);
  const visibleItems = items.filter((item) => item.value.trim().length > 0).slice(0, 4);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#fbfbfc] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-4"
      data-testid="assistant-ui-opportunity-guardrails"
      data-schema-type={schemaType}
      data-confirmation-required={requiresConfirmation ? 'true' : 'false'}
      aria-label="机会安全摘要"
    >
      {visibleItems.map((item) => (
        <div key={item.id} className="min-w-0 text-xs leading-5" data-guardrail={item.id}>
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#8a8f98]">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {item.label}
          </span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function candidateSourceGuardrail(
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>,
) {
  const explicit = opportunity.discoverySafetySignals.find(
    (signal) =>
      signal.includes('公开') || signal.includes('可发现') || signal.includes('Agent 匹配'),
  );
  return explicit ?? '只基于公开可发现或已允许 Agent 匹配的信息';
}

function candidatePrivacyGuardrail(
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>,
) {
  const explicit = opportunity.discoverySafetySignals.find(
    (signal) =>
      signal.includes('脱敏') ||
      signal.includes('精确位置') ||
      signal.includes('联系方式') ||
      signal.includes('模糊'),
  );
  return explicit ?? '资料已脱敏，不展示精确位置或私密联系方式';
}

function CandidateRankingBreakdown({
  items,
}: {
  items: ReturnType<typeof normalizeCandidateOpportunityView>['rankingBreakdown'];
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
      data-testid="assistant-ui-candidate-ranking-breakdown"
      aria-label="候选排序依据"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        匹配依据
      </p>
      <div className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <div
            key={item.key}
            className="grid gap-1 rounded-lg bg-[#f7f7f8] px-2.5 py-2 text-xs leading-5 text-[#52525b] sm:grid-cols-[92px_1fr]"
            data-ranking-key={item.key}
          >
            <span className="font-medium text-[#3f3f46]">
              {item.label}
              {item.score != null ? (
                <span className="ml-1 font-normal text-[#8a8f98]">{item.score}</span>
              ) : null}
            </span>
            <span className="text-[#71717a]">{item.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidateIntentChips({
  opportunity,
}: {
  opportunity: ReturnType<typeof normalizeCandidateOpportunityView>;
}) {
  const items = [
    opportunity.relationshipGoal
      ? { id: 'relationship-goal', label: '关系目标', value: opportunity.relationshipGoal }
      : null,
    opportunity.idealType ? { id: 'ideal-type', label: '理想型', value: opportunity.idealType } : null,
    opportunity.invitePolicy
      ? { id: 'invite-policy', label: '邀请边界', value: opportunity.invitePolicy }
      : null,
  ].filter(Boolean) as Array<{ id: string; label: string; value: string }>;
  if (items.length === 0) return null;

  return (
    <div
      className="mt-2 grid gap-1.5 sm:grid-cols-3"
      data-testid="assistant-ui-candidate-intent-chips"
      aria-label="候选机会意图摘要"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl bg-[#f7f7f8] px-2.5 py-2 text-xs leading-5 ring-1 ring-black/5"
          data-candidate-intent={item.id}
        >
          <span className="block text-[11px] text-[#8a8f98]">{item.label}</span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function CandidateExplanationTrace({ steps }: { steps: string[] }) {
  return (
    <details
      className="group/trace mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
      data-testid="candidate-explanation-trace"
      data-schema-type="social_match.candidate"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium leading-5 text-[#3f3f46] marker:hidden">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          推荐依据
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 text-[#a1a1aa] transition-transform group-open/trace:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ol className="mt-1 grid gap-1.5 text-xs leading-5 text-[#71717a] sm:grid-cols-3">
        {steps.slice(0, 3).map((step, index) => (
          <li
            key={`${step}-${index}`}
            className="rounded-lg bg-[#f7f7f8] px-2 py-1.5 ring-1 ring-black/[0.04]"
          >
            {step}
          </li>
        ))}
      </ol>
    </details>
  );
}

function OpportunityActionPath({
  actions,
  schemaType,
}: {
  actions: VisibleCardAction[];
  schemaType: ToolUISchemaType;
}) {
  const steps = actionPathSteps(actions, schemaType);
  if (steps.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5"
      data-testid="assistant-ui-opportunity-path"
      data-schema-type={schemaType}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        安全推进路径
      </p>
      <ol className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={`${step.schemaAction}-${step.label}`}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs leading-5 text-[#52525b] ring-1 ring-black/[0.04]"
            data-schema-action={step.schemaAction}
            data-requires-confirmation={String(step.requiresConfirmation)}
            data-action-source={step.source}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#18181b] text-[10px] font-medium text-white">
              {index + 1}
            </span>
            <span className="min-w-0 truncate">{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function actionPathSteps(actions: VisibleCardAction[], schemaType: ToolUISchemaType) {
  const bySchemaAction = new Map<ToolUISchemaAction, VisibleCardAction>();
  actions.forEach((action) => {
    if (action.schemaAction && !bySchemaAction.has(action.schemaAction)) {
      bySchemaAction.set(action.schemaAction, action);
    }
  });
  const order: ToolUISchemaAction[] =
    schemaType === 'social_match.activity'
      ? [
          'activity.view_detail',
          'activity.modify_time',
          'activity.modify_location',
          'activity.confirm_create',
          'activity.check_in',
          'activity.complete',
          'review.submit',
        ]
      : ['candidate.view_detail', 'candidate.generate_opener', 'candidate.connect'];

  const defaultSteps = new Map(
    defaultOpportunityActionsForSchema(schemaType).map((step) => [step.schemaAction, step]),
  );
  return order
    .map((schemaAction) => {
      const action = bySchemaAction.get(schemaAction);
      const defaultStep = defaultSteps.get(schemaAction);
      if (!action && !defaultStep) return null;
      const requiresConfirmation = action?.requiresConfirmation ?? defaultStep?.requiresConfirmation ?? false;
      return {
        schemaAction,
        requiresConfirmation,
        source: action?.source ?? defaultStep?.source ?? 'default',
        label: actionPathLabel(schemaAction, requiresConfirmation),
      };
    })
    .filter(Boolean) as Array<{
    schemaAction: ToolUISchemaAction;
    requiresConfirmation: boolean;
    source: VisibleCardAction['source'];
    label: string;
  }>;
}

function actionPathLabel(schemaAction: ToolUISchemaAction, requiresConfirmation: boolean) {
  const confirmationRequired =
    requiresConfirmation ||
    schemaAction === 'candidate.connect' ||
    schemaAction === 'opener.confirm_send' ||
    schemaAction === 'activity.confirm_create' ||
    schemaAction === 'life_graph.accept_update';
  if (schemaAction === 'candidate.view_detail') return '先看详情';
  if (schemaAction === 'candidate.generate_opener') return '生成开场白';
  if (schemaAction === 'candidate.connect') {
    return confirmationRequired ? '确认后发邀请' : '发邀请';
  }
  if (schemaAction === 'activity.view_detail') return '查看活动';
  if (schemaAction === 'activity.modify_time') return '调整时间';
  if (schemaAction === 'activity.modify_location') return '调整地点';
  if (schemaAction === 'activity.confirm_create') {
    return confirmationRequired ? '确认后发起' : '发起活动';
  }
  if (schemaAction === 'activity.check_in') return '到达签到';
  if (schemaAction === 'activity.complete') return '记录完成';
  if (schemaAction === 'review.submit') return '提交评价';
  return '继续处理';
}

function ActivityOpportunityCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const opportunity = normalizeActivityOpportunityView(card);
  const imageUrl = safeImageSrc(opportunity.imageUrl);
  const hasDetail = Boolean(
    opportunity.summary ||
      opportunity.location ||
      opportunity.time ||
      opportunity.capacityLabel ||
      opportunity.intensity,
  );

  return (
    <article
      className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 transition hover:-translate-y-px hover:shadow-sm hover:ring-black/10"
      data-testid="activity-opportunity-card"
      data-card-model="assistant-ui-opportunity-card"
      data-opportunity-type="activity"
      data-has-image={String(Boolean(imageUrl))}
      data-has-detail={String(hasDetail)}
      data-action-path="safe-sequenced"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`${opportunity.title} 活动图`}
          className="h-28 w-full object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">
              活动机会
            </p>
            <p className="font-medium leading-5 text-[#27272a]">{opportunity.title}</p>
            {opportunity.subtitle ? (
              <p className="mt-0.5 text-xs leading-5 text-[#71717a]">{opportunity.subtitle}</p>
            ) : null}
          </div>
          {opportunity.host ? (
            <span className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5">
              {opportunity.host}
            </span>
          ) : null}
        </div>
        <p className="mt-2 leading-6 text-[#52525b]">{opportunity.summary}</p>
        <ConfirmedContextChips items={opportunity.confirmedContext} schemaType={card.schemaType} />
        <ActivityStatusStrip opportunity={opportunity} />
        {opportunity.autoPublished ? (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100"
            data-testid="activity-auto-published"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              已同步到发现页
            </span>
            {opportunity.discoverHref ? (
              <a
                href={opportunity.discoverHref}
                className="rounded-full bg-white px-2.5 py-1 font-medium text-emerald-950 ring-1 ring-emerald-100 transition hover:bg-emerald-50"
              >
                查看公开卡片
              </a>
            ) : null}
          </div>
        ) : null}
        <OpportunityGuardrailStrip
          schemaType={card.schemaType}
          actions={visibleCardActions(card, card.actions)}
          items={[
            {
              id: 'source',
              label: '来源',
              value: opportunity.host ? `来自 ${opportunity.host} 或公开活动信息` : '只基于公开或授权活动信息整理',
            },
            {
              id: 'location',
              label: '地点',
              value: opportunity.safetyBoundary ?? '优先公共场所和模糊位置',
            },
            {
              id: 'approval',
              label: '确认',
              value: opportunity.approvalPolicy ?? '创建、邀请或公开发布前必须由你确认',
            },
            {
              id: 'loop',
              label: '闭环',
              value: opportunity.meetLoopNextStep ?? '确认后进入等待回复、改期、评价和画像回写流程',
            },
          ]}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {opportunity.city ? (
            <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.city} />
          ) : null}
          {opportunity.location ? (
            <MetaChip icon={<MapPin className="h-3 w-3" />} label={opportunity.location} />
          ) : null}
          {opportunity.time ? (
            <MetaChip icon={<CalendarClock className="h-3 w-3" />} label={opportunity.time} />
          ) : null}
          {opportunity.capacityLabel ? (
            <MetaChip icon={<Users className="h-3 w-3" />} label={opportunity.capacityLabel} />
          ) : null}
          {opportunity.intensity ? (
            <MetaChip icon={<Sparkles className="h-3 w-3" />} label={opportunity.intensity} />
          ) : null}
          {opportunity.tags.map((tag) => (
            <MetaChip key={tag} icon={<HeartHandshake className="h-3 w-3" />} label={tag} />
          ))}
          {opportunity.safetyBadges.map((badge) => (
            <MetaChip key={badge} icon={<ShieldCheck className="h-3 w-3" />} label={badge} />
          ))}
        </div>
        {opportunity.reasons.length > 0 ? (
          <div className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5">
            <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              为什么适合你
            </p>
            <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
              {opportunity.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {opportunity.explanationSteps.length > 0 ? (
          <div
            className="mt-3 rounded-xl bg-white px-3 py-2 ring-1 ring-black/5"
            data-testid="activity-explanation-steps"
            aria-label="活动推荐路径"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              推荐路径
            </p>
            <ol className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
              {opportunity.explanationSteps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f4f4f5] text-[10px] font-medium text-[#52525b]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {opportunity.activityProtocol.length > 0 ? (
          <div
            className="mt-3 rounded-xl bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-950 ring-1 ring-sky-100"
            data-testid="activity-protocol"
            aria-label="约练执行协议"
          >
            <p className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              约练执行协议
            </p>
            <dl className="mt-1.5 grid gap-1.5">
              {opportunity.activityProtocol.map((item) => (
                <div key={item.key} className="grid gap-0.5 sm:grid-cols-[5.5rem_1fr] sm:gap-2">
                  <dt className="font-medium text-sky-900">{item.label}</dt>
                  <dd className="text-sky-900/80">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {[
          opportunity.safetyBoundary
            ? { label: '安全边界', value: opportunity.safetyBoundary, icon: ShieldCheck }
            : null,
          opportunity.publishPolicy
            ? { label: '公开策略', value: opportunity.publishPolicy, icon: ShieldCheck }
            : null,
          opportunity.approvalPolicy
            ? { label: '执行边界', value: opportunity.approvalPolicy, icon: History }
            : null,
          opportunity.meetLoopNextStep
            ? { label: '约练闭环', value: opportunity.meetLoopNextStep, icon: CalendarClock }
            : null,
          opportunity.checkinReminder
            ? { label: '签到提醒', value: opportunity.checkinReminder, icon: CalendarClock }
            : null,
          opportunity.reviewPrompt
            ? { label: '评价确认', value: opportunity.reviewPrompt, icon: CheckCircle2 }
            : null,
          opportunity.lifeGraphUpdatePreview
            ? { label: '画像回写', value: opportunity.lifeGraphUpdatePreview, icon: Brain }
            : null,
          opportunity.trustScoreUpdatePreview
            ? { label: '可信度', value: opportunity.trustScoreUpdatePreview, icon: Sparkles }
            : null,
        ].filter(Boolean).length > 0 ? (
          <div
            className="mt-3 grid gap-1.5 rounded-xl bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100"
            data-testid="activity-safety-loop"
            aria-label="约练安全闭环"
          >
            {[
              opportunity.safetyBoundary
                ? { label: '安全边界', value: opportunity.safetyBoundary, icon: ShieldCheck }
                : null,
              opportunity.publishPolicy
                ? { label: '公开策略', value: opportunity.publishPolicy, icon: ShieldCheck }
                : null,
              opportunity.approvalPolicy
                ? { label: '执行边界', value: opportunity.approvalPolicy, icon: History }
                : null,
              opportunity.meetLoopNextStep
                ? { label: '约练闭环', value: opportunity.meetLoopNextStep, icon: CalendarClock }
                : null,
              opportunity.checkinReminder
                ? { label: '签到提醒', value: opportunity.checkinReminder, icon: CalendarClock }
                : null,
              opportunity.reviewPrompt
                ? { label: '评价确认', value: opportunity.reviewPrompt, icon: CheckCircle2 }
                : null,
              opportunity.lifeGraphUpdatePreview
                ? { label: '画像回写', value: opportunity.lifeGraphUpdatePreview, icon: Brain }
                : null,
              opportunity.trustScoreUpdatePreview
                ? { label: '可信度', value: opportunity.trustScoreUpdatePreview, icon: Sparkles }
                : null,
            ]
              .filter((item): item is { label: string; value: string; icon: typeof ShieldCheck } =>
                Boolean(item),
              )
              .map(({ label, value, icon: Icon }) => (
                <p key={label} className="flex gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{label}：</span>
                    {value}
                  </span>
                </p>
              ))}
          </div>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-[#52525b]">下一步：{opportunity.nextAction}</p>
        <OpportunityActionPath
          actions={visibleCardActions(card, card.actions)}
          schemaType={card.schemaType}
        />
        <CardActionSummary card={card} actions={card.actions} />
      </div>
    </article>
  );
}

function ActivityStatusStrip({
  opportunity,
}: {
  opportunity: ReturnType<typeof normalizeActivityOpportunityView>;
}) {
  const schedule = [opportunity.time, opportunity.location ?? opportunity.city]
    .filter(Boolean)
    .join(' · ');
  const items = [
    {
      key: 'schedule',
      label: '活动安排',
      value: schedule || opportunity.subtitle || '先确认时间和地点',
      icon: CalendarClock,
    },
    {
      key: 'safety',
      label: '安全边界',
      value: opportunity.safetyBoundary || '优先公共场所和站内沟通',
      icon: ShieldCheck,
    },
    {
      key: 'approval',
      label: '下一步确认',
      value: opportunity.approvalPolicy || '发起、邀请或公开发布前都会先问你',
      icon: CheckCircle2,
    },
  ];

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#fafafa] p-2 ring-1 ring-black/[0.04] sm:grid-cols-3"
      data-testid="activity-status-strip"
      aria-label="活动状态摘要"
    >
      {items.map(({ key, label, value, icon: Icon }) => (
        <div key={key} className="min-w-0 rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04]">
          <p className="flex items-center gap-1.5 text-[11px] font-medium leading-4 text-[#71717a]">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#3f3f46]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ConfirmedContextChips({
  items,
  schemaType,
}: {
  items: string[];
  schemaType: ToolUISchemaType;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5"
      data-testid="assistant-ui-confirmed-context"
      data-schema-type={schemaType}
      aria-label="已确认需求"
    >
      {items.slice(0, 5).map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100"
        >
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          {item}
        </span>
      ))}
    </div>
  );
}

function LifeGraphDiffCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const diff = normalizeLifeGraphDiffView(card);
  const isCounterpartReply = diff.source === 'counterpart_reply';

  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-life-graph-source={diff.source ?? 'unknown'}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          <Brain className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#27272a]">{diff.title}</p>
          <p className="mt-1 text-xs leading-5 text-[#71717a]">{diff.description}</p>
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            data-testid="life-graph-source-boundary"
            data-life-graph-source-label={diff.sourceLabel}
          >
            <MetaChip icon={<ShieldCheck className="h-3 w-3" />} label={diff.sourceLabel} />
            <MetaChip icon={<Sparkles className="h-3 w-3" />} label="确认前不写入长期画像" />
          </div>
          {isCounterpartReply ? (
            <p
              className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-100"
              data-testid="life-graph-counterpart-reply-note"
            >
              这是对方回应后的弱信号：确认前不会写入长期画像，也不会保存私聊原文；确认后仍可撤回或纠正。
            </p>
          ) : null}
          {diff.currentValue || diff.proposedValue ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <DiffPane title="当前" value={diff.currentValue} />
              <DiffPane title="建议" value={diff.proposedValue} emphasized />
            </div>
          ) : null}
          <MemoryWriteChecklist diff={diff} />
          {diff.fields.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {diff.fields.map((field) => (
                <MetaChip key={field} icon={<Sparkles className="h-3 w-3" />} label={field} />
              ))}
              {diff.sensitivityLevel ? (
                <MetaChip
                  icon={<ShieldCheck className="h-3 w-3" />}
                  label={`敏感度：${diff.sensitivityLevel}`}
                />
              ) : null}
            </div>
          ) : null}
          {diff.sourceSignals.length > 0 ? (
            <div className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5">
              <p className="text-xs font-medium leading-5 text-[#3f3f46]">依据</p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                {diff.sourceSignals.map((signal) => (
                  <li key={signal}>• {signal}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {diff.conflicts.length > 0 ? (
            <div className="mt-3 rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
              <p className="flex items-center gap-1.5 text-xs font-medium leading-5 text-amber-900">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                需要确认的冲突
              </p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-amber-800">
                {diff.conflicts.map((conflict) => (
                  <li key={conflict}>• {conflict}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {diff.confirmationBoundary ? (
            <p className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
              确认边界：{diff.confirmationBoundary}
            </p>
          ) : null}
          {diff.privacyBoundary && diff.privacyBoundary !== diff.confirmationBoundary ? (
            <p className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
              隐私边界：{diff.privacyBoundary}
            </p>
          ) : null}
          {diff.revokeHint ? (
            <p
              className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
              data-testid="life-graph-revoke-hint"
            >
              撤回与纠正：{diff.revokeHint}
            </p>
          ) : null}
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function MemoryWriteChecklist({ diff }: { diff: ReturnType<typeof normalizeLifeGraphDiffView> }) {
  const items = [
    {
      id: 'source',
      label: '来源类型',
      value: diff.sourceLabel,
      tone: diff.source === 'counterpart_reply' ? ('safe' as const) : ('neutral' as const),
    },
    {
      id: 'fields',
      label: '写入字段',
      value: diff.fields.length > 0 ? diff.fields.join('、') : '等待确认',
      tone: 'neutral' as const,
    },
    {
      id: 'sensitivity',
      label: '敏感等级',
      value: diff.sensitivityLevel ?? '未标记为敏感',
      tone: diff.sensitivityLevel ? ('warning' as const) : ('neutral' as const),
    },
    {
      id: 'evidence',
      label: '依据来源',
      value:
        diff.sourceSignals.length > 0 ? `${diff.sourceSignals.length} 条对话信号` : '暂无明确依据',
      tone: 'neutral' as const,
    },
    {
      id: 'history',
      label: '历史保留',
      value: '保留旧偏好记录，不直接覆盖',
      tone: 'safe' as const,
    },
    {
      id: 'boundary',
      label: '写入边界',
      value:
        diff.conflicts.length > 0
          ? `${diff.conflicts.length} 个冲突需确认`
          : diff.confirmationBoundary
            ? '仅按边界写入'
            : '确认后写入',
      tone: diff.conflicts.length > 0 ? ('warning' as const) : ('safe' as const),
    },
  ];

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-2"
      data-testid="life-graph-memory-checklist"
      data-conflict-count={String(diff.conflicts.length)}
      data-source-count={String(diff.sourceSignals.length)}
    >
      <p className="col-span-full flex items-center gap-1.5 text-xs font-medium leading-5 text-[#3f3f46]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        记忆写入检查
      </p>
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg bg-white px-2.5 py-2 text-xs leading-5 ring-1 ring-black/[0.04]"
          data-memory-check={item.id}
          data-tone={item.tone}
        >
          <span className="block text-[11px] text-[#8a8f98]">{item.label}</span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function MeetLoopResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const timeline = normalizeMeetLoopTimelineView(card);
  const currentSteps = timeline.steps.filter((step) => step.state === 'current').length;
  const isReplyReceived =
    timeline.stage === 'reply_received' || timeline.connectionState === 'reply_received';
  const isWaitingReply =
    !isReplyReceived &&
    (timeline.stage === 'message_sent' ||
      timeline.stage === 'invite_sent' ||
      timeline.connectionState === 'waiting_reply' ||
      timeline.waitingFor === 'counterpart_reply');
  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-testid="assistant-ui-meet-loop-card"
      data-card-model="assistant-ui-meet-loop-timeline"
      data-connection-state={timeline.connectionState ?? 'unknown'}
      data-step-count={String(timeline.steps.length)}
      data-current-step-count={String(currentSteps)}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          <HeartHandshake className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#27272a]">{timeline.title}</p>
          <p className="mt-1 leading-6 text-[#52525b]">{timeline.description}</p>
          {isReplyReceived ? (
            <div
              className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800 ring-1 ring-emerald-100"
              data-testid="meet-loop-reply-received-note"
              data-counterpart-intent={timeline.counterpartIntent ?? 'unknown'}
            >
              <p className="font-medium">
                {timeline.replyIntentLabel ?? meetLoopCounterpartIntentLabel(timeline.counterpartIntent)}
              </p>
              {timeline.replyIntentDescription ? (
                <p className="mt-1 text-emerald-700">{timeline.replyIntentDescription}</p>
              ) : null}
              {timeline.replyPreview ? (
                <p className="mt-1 text-emerald-700">脱敏摘要：{timeline.replyPreview}</p>
              ) : null}
              <p className="mt-1 text-emerald-700">
                {timeline.nextSafeStep ??
                  '发起约练、继续邀请或创建活动前，我仍会先让你确认。'}
              </p>
            </div>
          ) : null}
          {isWaitingReply ? (
            <div
              className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5"
              data-testid="meet-loop-waiting-reply-note"
              data-waiting-for={timeline.waitingFor ?? 'counterpart_reply'}
              data-side-effect-policy={timeline.sideEffectPolicy ?? 'none'}
            >
              <p className="font-medium text-[#3f3f46]">邀请已发出，正在等待对方回复。</p>
              {timeline.replyPreview ? (
                <p className="mt-1 text-[#71717a]">已发送：{timeline.replyPreview}</p>
              ) : null}
              <p className="mt-1 text-[#71717a]">
                我不会自动追发消息；继续聊天、改期或发起约练前都会再次确认。
              </p>
              {timeline.nextRecoverableActions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {timeline.nextRecoverableActions.map((action) => (
                    <span
                      key={action}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] leading-5 text-[#52525b] ring-1 ring-black/[0.06]"
                    >
                      {meetLoopRecoverableActionLabel(action)}
                    </span>
                  ))}
                </div>
              ) : null}
              {timeline.recoveryProtocol.length > 0 ? (
                <dl
                  className="mt-2 grid gap-1.5 rounded-lg bg-white px-2.5 py-2 ring-1 ring-black/[0.04] sm:grid-cols-2"
                  data-testid="meet-loop-recovery-protocol"
                  aria-label="恢复协议"
                >
                  {timeline.recoveryProtocol.map((item) => (
                    <div key={item.key}>
                      <dt className="font-medium text-[#3f3f46]">{item.label}</dt>
                      <dd className="text-[#71717a]">{item.detail}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}
          <MeetLoopStageOverview timeline={timeline} />
          <ol className="mt-3 space-y-0.5" data-testid="meet-loop-timeline">
            {timeline.steps.map((step) => (
              <li
                key={`${step.key}-${step.label}`}
                className="grid grid-cols-[1.25rem_1fr] gap-2 text-xs"
                data-meet-loop-step={step.key}
                data-meet-loop-state={step.state}
                data-checkpoint-ready={String(step.checkpointReady)}
                data-resume-mode={step.resumeMode ?? 'none'}
              >
                <span className="relative flex justify-center">
                  <span
                    className={cn(
                      'mt-1 h-2.5 w-2.5 rounded-full ring-4',
                      step.state === 'done' && 'bg-emerald-500 ring-emerald-50',
                      step.state === 'current' && 'bg-[#18181b] ring-black/10',
                      step.state === 'next' && 'bg-[#d4d4d8] ring-[#f7f7f8]',
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'rounded-xl px-2.5 py-2 ring-1',
                    step.state === 'done' && 'bg-emerald-50/60 text-emerald-800 ring-emerald-100',
                    step.state === 'current' && 'bg-[#18181b] text-white ring-[#18181b]',
                    step.state === 'next' && 'bg-[#f7f7f8] text-[#71717a] ring-black/5',
                  )}
                >
                  <span className="font-medium">{step.label}</span>
                  <span className="mt-0.5 block leading-5 opacity-80">{step.description}</span>
                  {step.actionLabel || step.checkpointReady || step.resumeMode ? (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {step.actionLabel ? (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-current ring-1 ring-current/10">
                          {step.actionLabel}
                        </span>
                      ) : null}
                      {step.checkpointReady ? (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-current ring-1 ring-current/10">
                          可恢复
                        </span>
                      ) : null}
                      {step.resumeMode ? (
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-current ring-1 ring-current/10">
                          {meetLoopResumeModeLabel(step.resumeMode)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
            下一步：{timeline.nextAction}
          </p>
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function MeetLoopStageOverview({
  timeline,
}: {
  timeline: ReturnType<typeof normalizeMeetLoopTimelineView>;
}) {
  const currentIndex = meetLoopOverviewCurrentIndex(timeline);
  const stages = [
    '发起',
    '等待回复',
    '改期',
    '确认',
    '见面',
    '评价',
    '回写画像',
  ];
  return (
    <div
      className="mt-3 rounded-xl bg-[#fafafa] px-3 py-2 ring-1 ring-black/[0.04]"
      data-testid="meet-loop-stage-overview"
      data-current-stage-index={String(currentIndex)}
      aria-label="约练阶段总览"
    >
      <p className="text-xs font-medium leading-5 text-[#3f3f46]">约练阶段</p>
      <ol className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {stages.map((stage, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'next';
          return (
            <li
              key={stage}
              className={cn(
                'rounded-lg px-2 py-1.5 text-[11px] leading-4 ring-1',
                state === 'done' && 'bg-emerald-50 text-emerald-700 ring-emerald-100',
                state === 'current' && 'bg-[#18181b] text-white ring-[#18181b]',
                state === 'next' && 'bg-white text-[#71717a] ring-black/[0.05]',
              )}
              data-meet-loop-overview-stage={stage}
              data-meet-loop-overview-state={state}
            >
              <span className="font-medium">{stage}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function meetLoopOverviewCurrentIndex(
  timeline: ReturnType<typeof normalizeMeetLoopTimelineView>,
) {
  const text = [
    timeline.stage,
    timeline.connectionState,
    timeline.waitingFor,
    ...timeline.steps.flatMap((step) => [
      step.key,
      step.label,
      step.description,
      step.state === 'current' ? step.key : null,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/write|memory|life graph|画像|回写/.test(text)) return 6;
  if (/review|评价|完成|complete/.test(text)) return 5;
  if (/meet|check.?in|arrived|见面|签到|到达/.test(text)) return 4;
  if (/confirm|confirmed|确认/.test(text)) return 3;
  if (/reschedule|modify|改期|调整/.test(text)) return 2;
  if (/wait|waiting|reply|sent|invite|回复|等待|已发送|邀请/.test(text)) return 1;
  return 0;
}

function meetLoopResumeModeLabel(mode: 'resume' | 'reschedule' | 'review' | 'memory') {
  if (mode === 'reschedule') return '改期';
  if (mode === 'review') return '评价';
  if (mode === 'memory') return '回写';
  return '继续';
}

function meetLoopRecoverableActionLabel(action: string) {
  if (action === 'meet_loop.resume') return '可继续';
  if (action === 'meet_loop.reschedule') return '可改期';
  if (action === 'activity.modify_time') return '可调整时间';
  if (action === 'activity.modify_location') return '可调整地点';
  if (action === 'candidate.connect') return '确认后连接';
  return '可恢复';
}

function meetLoopCounterpartIntentLabel(intent: string | null) {
  if (intent === 'accepted') return '对方愿意继续。';
  if (intent === 'reschedule_requested') return '对方想调整时间。';
  if (intent === 'ask_question') return '对方在追问细节。';
  if (intent === 'declined') return '对方暂不继续。';
  return '对方已回复，可以继续站内聊。';
}

function SafetyResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const approval = normalizeSafetyApprovalView(card);
  return (
    <article
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-testid="assistant-ui-approval-tool"
      data-card-model="assistant-ui-approval-card"
      data-risk-level={approval.riskLevel ?? 'unknown'}
      data-has-checkpoint={String(Boolean(approval.checkpointLabel))}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-5 text-[#27272a]">{approval.title}</p>
          <p className="mt-1 leading-6 text-[#52525b]">{approval.boundary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {approval.riskLevel ? (
              <MetaChip
                icon={<ShieldCheck className="h-3 w-3" />}
                label={`风险等级：${approval.riskLevel}`}
              />
            ) : null}
            <MetaChip
              icon={<CheckCircle2 className="h-3 w-3" />}
              label={approval.confirmationLabel}
            />
            <MetaChip icon={<History className="h-3 w-3" />} label={approval.checkpointLabel} />
          </div>
          {approval.reasons.length > 0 ? (
            <div className="mt-3 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5">
              <p className="text-xs font-medium leading-5 text-[#3f3f46]">为什么需要确认</p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-[#71717a]">
                {approval.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {approval.auditNote ? (
            <p className="mt-2 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#52525b] ring-1 ring-black/5">
              确认记录：{approval.auditNote}
            </p>
          ) : null}
          <ApprovalGuardrailList
            confirmationLabel={approval.confirmationLabel}
            checkpointLabel={approval.checkpointLabel}
            riskLevel={approval.riskLevel}
          />
          <CardActionSummary card={card} actions={card.actions} />
        </div>
      </div>
    </article>
  );
}

function ApprovalGuardrailList({
  confirmationLabel,
  checkpointLabel,
  riskLevel,
}: {
  confirmationLabel: string;
  checkpointLabel: string;
  riskLevel?: string | null;
}) {
  const items = [
    {
      id: 'no_auto',
      label: '确认前不执行',
      value: '不会自动发送、连接或发布',
    },
    {
      id: 'checkpoint',
      label: '状态已保存',
      value: checkpointLabel,
    },
    {
      id: 'decision',
      label: riskLevel ? `风险等级：${riskLevel}` : '需要你决定',
      value: confirmationLabel,
    },
  ];

  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl bg-[#f7f7f8] px-3 py-2 ring-1 ring-black/5 sm:grid-cols-3"
      data-testid="assistant-ui-approval-guardrails"
      data-risk-level={riskLevel ?? 'unknown'}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg bg-white px-2.5 py-2 text-xs leading-5 ring-1 ring-black/[0.04]"
          data-approval-guardrail={item.id}
        >
          <span className="block text-[11px] text-[#8a8f98]">{item.label}</span>
          <span className="mt-0.5 block text-[#3f3f46]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function GenericResultCard({ card }: { card: SchemaDrivenAssistantCard }) {
  const view = normalizeGenericCardView(card);
  return (
    <article className="rounded-2xl bg-white p-3 ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium leading-5 text-[#27272a]">{view.title}</p>
        {view.statusLabel ? (
          <span className="rounded-full bg-[#f7f7f8] px-2 py-0.5 text-[11px] font-medium text-[#52525b] ring-1 ring-black/5">
            {view.statusLabel}
          </span>
        ) : null}
      </div>
      {view.body ? <p className="mt-1 leading-6 text-[#52525b]">{view.body}</p> : null}
      {view.details.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-xl bg-[#f7f7f8] px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5">
          {view.details.map((detail) => (
            <li key={detail}>• {detail}</li>
          ))}
        </ul>
      ) : null}
      <CardActionSummary card={card} actions={card.actions} />
    </article>
  );
}

function FitMeetProcessToolUI({ summary }: { summary: ProcessSummary }) {
  const groups = groupStepsByTool(summary.steps);
  const icon = statusIcon(summary.status);
  const statusLabel = statusText(summary.status);
  const checkpointState = toolCheckpointState(summary);

  return (
    <details
      className="group/process my-3 rounded-2xl border border-black/10 bg-[#f7f7f8] px-4 py-3 text-sm text-[#52525b] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      data-testid="assistant-ui-tool-ui"
      role="group"
      aria-label={`处理过程：${naturalProcessTitle(summary)}`}
      data-render-mode="tool-ui"
      data-process-status={summary.status}
      data-process-step-count={summary.steps.length}
      data-result-count={summary.resultLines.length}
      data-pending-count={summary.pendingCount}
      data-replayable={String(summary.replayable)}
      data-forkable={String(summary.forkable)}
      data-retryable={String(summary.retryable)}
      data-checkpoint-state={checkpointState}
      data-has-checkpoint={summary.resumeContext.hasCheckpoint ? 'true' : 'false'}
      data-step-id={summary.stepId ?? ''}
      open={
        summary.status === 'running' || summary.status === 'waiting' || summary.status === 'error'
      }
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 text-[#27272a] marker:hidden">
        <StatusBadge status={summary.status}>{icon}</StatusBadge>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{naturalProcessTitle(summary)}</span>
          <span className="mt-0.5 block text-xs text-[#71717a]">
            {statusLabel}
            {groups.length > 1 ? ` · ${groups.length} 类能力` : ''}
            {summary.pendingCount > 0 ? ` · ${summary.pendingCount} 个确认` : ''}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[#a1a1aa] transition-transform group-open/process:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mt-4 space-y-3">
        {groups.length > 0 ? <ToolGroupSummaryChips groups={groups} /> : null}
        {groups.length > 0 ? (
          groups.map((group) => <ToolGroupRenderer key={group.category} group={group} />)
        ) : (
          <p className="pl-9 leading-6 text-[#71717a]">这一步会在完成后整理成简短结果。</p>
        )}
        <InterruptResumeState summary={summary} />
        {summary.resultLines.length > 0 ? (
          <ResultSummary lines={summary.resultLines} status={summary.status} />
        ) : null}
        <ExecutableTraceActions summary={summary} />
      </div>
    </details>
  );
}

function ToolGroupSummaryChips({ groups }: { groups: ToolGroup[] }) {
  return (
    <div
      className="flex flex-wrap gap-1.5 pl-1"
      data-testid="assistant-ui-tool-group-summary"
      aria-label="处理能力摘要"
    >
      {groups.map((group) => {
        const status = dominantGroupStatus(group.steps);
        return (
          <span
            key={group.category}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] leading-4 text-[#71717a] ring-1 ring-black/5"
            data-tool-group={group.category}
            data-tool-group-status={status}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status === 'running' && 'bg-blue-500',
                status === 'waiting' && 'bg-amber-500',
                status === 'error' && 'bg-red-500',
                status === 'complete' && 'bg-emerald-500',
              )}
              aria-hidden="true"
            />
            {group.title}
            <span className="text-[#a1a1aa]">{statusText(status)}</span>
          </span>
        );
      })}
    </div>
  );
}

function dominantGroupStatus(steps: ProcessStep[]): ProcessStatus {
  if (steps.some((step) => step.status === 'error')) return 'error';
  if (steps.some((step) => step.status === 'waiting')) return 'waiting';
  if (steps.some((step) => step.status === 'running')) return 'running';
  return 'complete';
}

function ToolGroupRenderer({ group }: { group: ToolGroup }) {
  if (group.category === 'life_graph') return <LifeGraphToolRenderer group={group} />;
  if (group.category === 'social_match') return <SocialMatchToolRenderer group={group} />;
  if (group.category === 'meet_loop') return <MeetLoopToolRenderer group={group} />;
  if (group.category === 'safety') return <SafetyToolRenderer group={group} />;
  return <GenericToolRenderer group={group} />;
}

function LifeGraphToolRenderer({ group }: { group: ToolGroup }) {
  return (
    <ToolCard
      icon={<Brain className="h-4 w-4" />}
      title={group.title}
      description="整理上下文和画像变化，只在需要确认时才写入长期记忆。"
      category={group.category}
      status={dominantGroupStatus(group.steps)}
      stepCount={group.steps.length}
      tone="violet"
    >
      <ProcessTimeline steps={group.steps} />
    </ToolCard>
  );
}

function SocialMatchToolRenderer({ group }: { group: ToolGroup }) {
  return (
    <ToolCard
      icon={<Users className="h-4 w-4" />}
      title={group.title}
      description="只有你明确要找人或活动时，才会进行候选整理。"
      category={group.category}
      status={dominantGroupStatus(group.steps)}
      stepCount={group.steps.length}
      tone="blue"
    >
      <ProcessTimeline steps={group.steps} />
    </ToolCard>
  );
}

function MeetLoopToolRenderer({ group }: { group: ToolGroup }) {
  return (
    <ToolCard
      icon={<CalendarClock className="h-4 w-4" />}
      title={group.title}
      description="把邀约拆成发起、等待、改期、确认和评价这些可恢复节点。"
      category={group.category}
      status={dominantGroupStatus(group.steps)}
      stepCount={group.steps.length}
      tone="emerald"
    >
      <MeetLoopTimeline steps={group.steps} />
    </ToolCard>
  );
}

function SafetyToolRenderer({ group }: { group: ToolGroup }) {
  return (
    <ToolCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title={group.title}
      description="检查安全边界；涉及发消息、连接、发布或隐私变更时需要确认。"
      category={group.category}
      status={dominantGroupStatus(group.steps)}
      stepCount={group.steps.length}
      tone="amber"
    >
      <ProcessTimeline steps={group.steps} />
    </ToolCard>
  );
}

function GenericToolRenderer({ group }: { group: ToolGroup }) {
  return (
    <ToolCard
      icon={<Sparkles className="h-4 w-4" />}
      title={group.title}
      description={group.description}
      category={group.category}
      status={dominantGroupStatus(group.steps)}
      stepCount={group.steps.length}
      tone="zinc"
    >
      <ProcessTimeline steps={group.steps} />
    </ToolCard>
  );
}

function ToolCard({
  icon,
  title,
  description,
  category,
  status,
  stepCount,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  category: ToolCategory;
  status: ProcessStatus;
  stepCount: number;
  tone: 'violet' | 'blue' | 'emerald' | 'amber' | 'zinc';
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5"
      data-testid="assistant-ui-tool-group"
      role="group"
      aria-label={`${title}：${description}`}
      data-tool-category={category}
      data-tool-status={status}
      data-step-count={stepCount}
      data-tone={tone}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7f7f8] text-[#3f3f46]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium leading-5 text-[#27272a]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#71717a]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function AgentProcessBlock({ summary }: { summary: ProcessSummary }) {
  const icon = statusIcon(summary.status);
  const statusLabel = statusText(summary.status);
  const hasDetails = summary.steps.length > 0 || summary.resultLines.length > 0;
  const checkpointState = toolCheckpointState(summary);

  return (
    <details
      className="group/process my-3 rounded-2xl border border-black/10 bg-[#f7f7f8] px-4 py-3 text-sm text-[#52525b] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      data-testid="assistant-ui-tool-fallback"
      role="group"
      aria-label={`处理过程：${summary.title}`}
      data-render-mode="fallback"
      data-process-status={summary.status}
      data-process-step-count={summary.steps.length}
      data-result-count={summary.resultLines.length}
      data-pending-count={summary.pendingCount}
      data-replayable={String(summary.replayable)}
      data-forkable={String(summary.forkable)}
      data-retryable={String(summary.retryable)}
      data-checkpoint-state={checkpointState}
      data-has-checkpoint={summary.resumeContext.hasCheckpoint ? 'true' : 'false'}
      data-step-id={summary.stepId ?? ''}
      open={hasDetails || summary.status === 'waiting' || summary.status === 'error'}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 text-[#27272a] marker:hidden">
        <StatusBadge status={summary.status}>{icon}</StatusBadge>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{summary.title}</span>
          <span className="mt-0.5 block text-xs text-[#71717a]">
            {statusLabel}
            {summary.steps.length > 1 ? ` · ${summary.steps.length} 个步骤` : ''}
            {summary.pendingCount > 0 ? ` · ${summary.pendingCount} 个确认` : ''}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[#a1a1aa] transition-transform group-open/process:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="mt-4 space-y-4 pl-1">
        {hasDetails ? (
          <>
            {summary.steps.length > 0 ? <ProcessTimeline steps={summary.steps} /> : null}
            {summary.resultLines.length > 0 ? (
              <ResultSummary lines={summary.resultLines} status={summary.status} />
            ) : null}
            <InterruptResumeState summary={summary} />
          </>
        ) : (
          <p className="pl-9 leading-6 text-[#71717a]">这一步会在完成后整理成简短结果。</p>
        )}

        <ProcessReplayPanel summary={summary} />
      </div>
    </details>
  );
}

function toolCheckpointState(summary: ProcessSummary) {
  if (summary.status === 'waiting' && summary.resumeContext.hasCheckpoint) return 'waiting';
  if (summary.status === 'error' && summary.retryable) return 'retryable';
  if (summary.replayable && summary.forkable) return 'replayable-forkable';
  if (summary.replayable) return 'replayable';
  if (summary.forkable) return 'forkable';
  if (summary.resumeContext.hasCheckpoint) return 'saved';
  return 'none';
}

function isCurrentProcessStep(step: ProcessStep) {
  return step.status === 'running' || step.status === 'waiting' || step.status === 'error';
}

function ProcessTimeline({ steps }: { steps: ProcessStep[] }) {
  const currentStepCount = steps.filter(isCurrentProcessStep).length;

  return (
    <ol
      className="relative ml-3 space-y-3 border-l border-black/10 pl-5"
      data-testid="assistant-ui-process-timeline"
      data-step-count={steps.length}
      data-current-step-count={currentStepCount}
      aria-label="Agent 处理时间线"
    >
      {steps.map((step, index) => {
        const previousAgentName = steps[index - 1]?.agentName;
        const shouldShowHandoff = Boolean(step.agentName && step.agentName !== previousAgentName);
        const displayAgentName = step.agentName ? collaborativeStepDisplayName(step.agentName) : null;
        const handoffLabel =
          displayAgentName && index > 0
            ? `交给${displayAgentName}`
            : displayAgentName
              ? `正在${displayAgentName}`
              : null;
        const key = step.id || `${step.label}-${index}`;
        const stepCategory = classifyStepCategory(step);
        const semanticKind = step.kind ?? (stepCategory === 'generic' ? 'step' : 'tool');
        const semanticAgentName = displayAgentName ?? defaultAgentNameForCategory(stepCategory);
        const isCurrentStep = isCurrentProcessStep(step);

        return (
          <Fragment key={key}>
            {shouldShowHandoff && handoffLabel ? (
              <li
                className="relative -ml-1 flex items-center gap-2 text-[11px] text-[#8a8f98]"
                data-testid="assistant-ui-subagent-handoff"
                data-agent-name={displayAgentName ?? undefined}
              >
                <span className="absolute -left-[28px] top-1/2 h-px w-4 -translate-y-1/2 bg-black/10" />
                <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">
                  {handoffLabel}
                </span>
              </li>
            ) : null}
            <li
              className="relative"
              data-testid="assistant-ui-process-step"
              data-step-id={step.id}
              data-step-status={step.status}
              data-step-kind={semanticKind}
              data-agent-name={semanticAgentName}
              data-current-step={isCurrentStep ? 'true' : 'false'}
              aria-current={isCurrentStep ? 'step' : undefined}
              aria-label={`${step.label}：${statusText(step.status)}`}
            >
              <span className="absolute -left-[29px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#f7f7f8]">
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    step.status === 'running' && 'bg-blue-500',
                    step.status === 'complete' && 'bg-emerald-500',
                    step.status === 'waiting' && 'bg-amber-500',
                    step.status === 'error' && 'bg-red-500',
                  )}
                />
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-medium leading-5 text-[#3f3f46]">{step.label}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#71717a] ring-1 ring-black/5">
                  {statusText(step.status)}
                </span>
                {step.kind ? (
                  <span className="rounded-full bg-black/[0.03] px-2 py-0.5 text-[11px] text-[#8a8f98] ring-1 ring-black/[0.04]">
                    {stepKindLabel(step.kind)}
                  </span>
                ) : null}
                {step.agentName ? (
                  <span
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#71717a] ring-1 ring-black/5"
                    data-testid="assistant-ui-subagent-chip"
                    data-agent-name={displayAgentName ?? undefined}
                  >
                    {displayAgentName}
                  </span>
                ) : null}
              </div>
              {step.detail ? (
                <p className="mt-1 max-w-[56ch] leading-6 text-[#71717a]">{step.detail}</p>
              ) : null}
              <ApprovalRuntimeHints metadata={step.metadata} />
              {step.snapshot ? <StepSnapshotSummary snapshot={step.snapshot} /> : null}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function ApprovalRuntimeHints({ metadata }: { metadata?: Record<string, unknown> }) {
  if (!metadata || metadata.processType !== 'approval') return null;
  const items = [
    publicDetail(metadata.dryRunPreviewTitle) ??
      (metadata.dryRunAvailable === true ? '发送前预览已准备' : null),
    metadata.sideEffectAllowedBeforeApproval === false ? '确认前不执行真实动作' : null,
    metadata.auditRequired === true ? '会留下确认记录' : null,
    publicDetail(metadata.resumePolicy),
    publicDetail(metadata.executionBoundary),
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
  if (items.length === 0) return null;
  return (
    <div
      className="mt-2 flex flex-wrap gap-1.5"
      data-testid="assistant-ui-approval-runtime-hints"
    >
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] leading-5 text-amber-800 ring-1 ring-amber-100"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function defaultAgentNameForCategory(category: ToolCategory) {
  if (category === 'life_graph') return '画像助手';
  if (category === 'social_match') return '匹配助手';
  if (category === 'meet_loop') return '约见助手';
  if (category === 'safety') return '安全确认';
  return '';
}

function StepSnapshotSummary({ snapshot }: { snapshot: ProcessStepSnapshot }) {
  const rows = [
    snapshot.observation.length > 0
      ? { label: '观察', value: snapshot.observation.join('；') }
      : null,
    snapshot.critique ? { label: '判断', value: snapshot.critique } : null,
    snapshot.result ? { label: '结果', value: snapshot.result } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (rows.length === 0) return null;

  return (
    <dl
      className="mt-2 grid gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-[#71717a] ring-1 ring-black/5"
      data-testid="assistant-ui-step-snapshot"
      data-schema-version={snapshot.schemaVersion}
    >
      {rows.map((row) => (
        <div key={row.label} className="grid gap-0.5 sm:grid-cols-[3rem_1fr]">
          <dt className="font-medium text-[#52525b]">{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MeetLoopTimeline({ steps }: { steps: ProcessStep[] }) {
  const ordered = steps.map((step, index) => ({
    ...step,
    label: meetLoopLabel(step, index),
  }));
  return <ProcessTimeline steps={ordered} />;
}

function ResultSummary({ lines, status }: { lines: string[]; status: ProcessStatus }) {
  return (
    <section
      className={cn(
        'ml-8 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5',
        status === 'error' && 'bg-red-50/40',
        status === 'waiting' && 'bg-amber-50/50',
      )}
      aria-label="结果摘要"
    >
      <p className="mb-1 text-xs font-medium text-[#52525b]">结果摘要</p>
      <div className="space-y-1 leading-6 text-[#71717a]">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function InterruptResumeState({
  summary,
  compact,
}: {
  summary: ProcessSummary;
  compact?: boolean;
}) {
  const context = summary.resumeContext;
  if (!context.hasCheckpoint && !context.hasInterrupt && summary.status !== 'waiting') {
    return null;
  }
  const title =
    summary.status === 'waiting'
      ? '已暂停，等待你确认'
      : summary.status === 'error'
        ? '这一步可以继续处理'
        : '已保存可恢复状态';
  const detail =
    summary.status === 'waiting'
      ? '确认后会沿同一个对话继续，不会重新执行已经确认过的动作。'
      : summary.status === 'error'
        ? '可以重试当前步骤，或基于这次进度重新生成一个新版本。'
        : '后续可以基于这次进度重新生成或生成新版本，不需要从头开始。';
  const chips = [
    context.hasCheckpoint ? '进度已保存' : null,
    context.parentCheckpointId != null ? '接续上一步' : null,
    context.threadId ? '同一对话继续' : null,
    context.idempotencyKey ? '重复提交保护' : null,
    context.stepScope?.mode === 'through_step' ? '只恢复到当前步骤' : null,
    context.sideEffectPolicy ? '幂等保护' : null,
    context.interruptKind ? interruptKindLabel(context.interruptKind) : null,
    context.mode ? resumeModeLabel(context.mode) : null,
  ].filter(Boolean) as string[];

  return (
    <section
      className={cn(
        'rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5',
        compact ? 'mt-3' : 'ml-8',
        summary.status === 'waiting' && 'bg-amber-50/60 ring-amber-200/60',
        summary.status === 'error' && 'bg-red-50/40 ring-red-100',
      )}
      aria-label="中断恢复状态"
    >
      <div className="flex items-start gap-2">
        <StatusBadge status={summary.status}>
          {summary.status === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </StatusBadge>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-5 text-[#3f3f46]">{title}</p>
          <p className="text-xs leading-5 text-[#71717a]">{detail}</p>
          {chips.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#71717a] ring-1 ring-black/5"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <ResumeScopeSummary context={context} />
          <ResumeFlow status={summary.status} context={context} />
        </div>
      </div>
    </section>
  );
}

function ResumeScopeSummary({ context }: { context: ResumeContext }) {
  if (!context.sourceStep && !context.stepScope && !context.sideEffectPolicy) return null;
  const scopeText =
    context.stepScope?.mode === 'through_step'
      ? `会从「${context.sourceStep?.label ?? '当前步骤'}」继续，前面已经完成的步骤不会重复执行。`
      : '会从保存的完整对话状态继续，不会丢失刚才的上下文。';
  const idempotencyText = context.sideEffectPolicy
    ? '涉及发送、创建或写入这类动作时，会复用幂等保护，避免重复执行。'
    : null;

  return (
    <div
      className="mt-2 rounded-lg bg-[#f7f7f8] px-2.5 py-2 text-[11px] leading-5 text-[#71717a] ring-1 ring-black/5"
      data-testid="assistant-ui-resume-scope"
      data-scope-mode={context.stepScope?.mode ?? 'unknown'}
      data-source-step-id={context.sourceStep?.stepId ?? ''}
      data-has-side-effect-policy={String(Boolean(context.sideEffectPolicy))}
    >
      <p>{scopeText}</p>
      {idempotencyText ? <p>{idempotencyText}</p> : null}
    </div>
  );
}

function ResumeFlow({ status, context }: { status: ProcessStatus; context: ResumeContext }) {
  const isWaiting = status === 'waiting';
  const isError = status === 'error';
  const steps = [
    {
      label: context.hasCheckpoint ? '状态已保存' : '准备保存状态',
      state: context.hasCheckpoint ? ('done' as const) : ('current' as const),
    },
    {
      label: isWaiting ? '等待你确认' : isError ? '选择恢复方式' : '可继续追问',
      state: isWaiting || isError ? ('current' as const) : ('done' as const),
    },
    {
      label:
        context.mode === 'fork'
          ? '生成新版本'
          : context.mode === 'replay'
            ? '重新运行这一步'
            : context.mode === 'retry'
              ? '重试当前步骤'
              : '从原步骤继续',
      state: isWaiting || isError ? ('next' as const) : ('done' as const),
    },
  ];

  return (
    <ol
      className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-3"
      data-testid="assistant-ui-resume-flow"
      aria-label="可恢复流程"
    >
      {steps.map((step) => (
        <li
          key={step.label}
          className={cn(
            'rounded-lg px-2 py-1.5 ring-1',
            step.state === 'done' && 'bg-emerald-50 text-emerald-700 ring-emerald-100',
            step.state === 'current' && 'bg-[#18181b] text-white ring-[#18181b]',
            step.state === 'next' && 'bg-white text-[#71717a] ring-black/5',
          )}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function ApprovalToolUI({ data, summary }: { data: unknown; summary: ProcessSummary }) {
  const actions = useFitMeetToolUIActions();
  const messageId = useAuiState((state) => state.message.id);
  const checkpointId = checkpointIdFromData(data);
  const confirmations = extractPendingConfirmations(data);
  const resolvedApproval = extractResolvedApproval(data);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDecision = async (decision: 'approve' | 'reject', confirmation: PendingConfirmation) => {
    if (!confirmation.id) return;
    const key = `${decision}:${confirmation.id}`;
    setBusyKey(key);
    setError(null);
    try {
      const handler = decision === 'approve' ? actions.onApproveApproval : actions.onRejectApproval;
      await handler?.({
        messageId,
        approvalId: confirmation.id,
        checkpointId,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '操作没有完成，请重试。');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section
      className="my-3 rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-[#52525b] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      data-testid="assistant-ui-approval-tool"
      data-density="inline"
      data-has-checkpoint={String(Boolean(checkpointId))}
      data-checkpoint-id={String(checkpointId ?? '')}
      data-approval-state={resolvedApproval ? resolvedApproval.decision : 'pending'}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-6 text-[#27272a]">需要你确认这一步</p>
          <p className="text-xs leading-5 text-[#71717a]">
            我会等你选择后再继续，不会自动执行高风险动作。
          </p>
        </div>
      </div>
      <InterruptResumeState summary={summary} compact />

      <div className="mt-3 space-y-2">
        {confirmations.length > 0 ? (
          confirmations.map((confirmation, index) => (
            <div
              key={`${confirmation.id ?? index}-${confirmation.actionType ?? confirmation.type ?? 'approval'}`}
              className="rounded-xl bg-[#f7f7f8] px-3 py-2.5 ring-1 ring-black/5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-5 text-[#3f3f46]">
                    {confirmation.summary || '确认是否继续执行这一步'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#71717a]">
                    {approvalMetaLine(confirmation)}
                  </p>
                  <ApprovalGuardrailList
                    confirmationLabel="同意后从保存点继续"
                    checkpointLabel={checkpointId ? '进度已保存' : '等待保存点'}
                    riskLevel={confirmation.riskLevel}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ToolActionButton
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    label="拒绝"
                    busyLabel="正在拒绝"
                    busy={busyKey === `reject:${confirmation.id}`}
                    disabled={Boolean(busyKey)}
                    variant="ghost"
                    data-testid="assistant-ui-approval-action"
                    data-approval-action="reject"
                    data-approval-id={String(confirmation.id ?? '')}
                    data-checkpoint-id={String(checkpointId ?? '')}
                    data-action-state={approvalDecisionButtonState(
                      busyKey,
                      `reject:${confirmation.id}`,
                    )}
                    onClick={() => void runDecision('reject', confirmation)}
                  />
                  <ToolActionButton
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    label="同意并继续"
                    busyLabel="正在继续"
                    busy={busyKey === `approve:${confirmation.id}`}
                    disabled={Boolean(busyKey)}
                    variant="primary"
                    data-testid="assistant-ui-approval-action"
                    data-approval-action="approve"
                    data-approval-id={String(confirmation.id ?? '')}
                    data-checkpoint-id={String(checkpointId ?? '')}
                    data-action-state={approvalDecisionButtonState(
                      busyKey,
                      `approve:${confirmation.id}`,
                    )}
                    onClick={() => void runDecision('approve', confirmation)}
                  />
                </div>
              </div>
            </div>
          ))
        ) : resolvedApproval ? (
          <ResolvedApprovalStatus resolvedApproval={resolvedApproval} />
        ) : (
          <ResultSummary lines={summary.resultLines} status={summary.status} />
        )}
      </div>
      {error ? (
        <p
          className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-approval-action-error"
          data-checkpoint-id={String(checkpointId ?? '')}
        >
          {sanitizePublicText(error) ?? '这一步暂时没有完成，可以稍后重试。'}
        </p>
      ) : null}
    </section>
  );
}

function approvalDecisionButtonState(busyKey: string | null, ownKey: string) {
  if (busyKey === ownKey) return 'running';
  if (busyKey) return 'locked';
  return 'idle';
}

function ResolvedApprovalStatus({ resolvedApproval }: { resolvedApproval: ResolvedApproval }) {
  const approved = resolvedApproval.decision === 'approved';
  return (
    <div
      role="status"
      className={cn(
        'rounded-xl px-3 py-2.5 text-xs leading-5 ring-1',
        approved
          ? 'bg-emerald-50/80 text-emerald-800 ring-emerald-100'
          : 'bg-[#f7f7f8] text-[#52525b] ring-black/5',
      )}
    >
      <p className="flex items-center gap-1.5 font-medium">
        {approved ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {approved ? '已同意，我会从保存的步骤继续。' : '已拒绝，这一步不会继续执行。'}
      </p>
      {resolvedApproval.summary ? (
        <p className="mt-1 text-[11px] opacity-80">{resolvedApproval.summary}</p>
      ) : null}
    </div>
  );
}

function ExecutableTraceActions({ summary }: { summary: ProcessSummary }) {
  const actions = useFitMeetToolUIActions();
  const messageId = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetMessageId?: string;
    };
    return custom.fitmeetMessageId ?? state.message.id;
  });
  const [runtimeKey, actionState] = useCheckpointActionRuntimeState(
    messageId,
    summary.checkpointId,
    summary.stepId,
  );
  const [localActionState, setLocalActionState] = useState<CheckpointActionRuntimeState>(
    EMPTY_CHECKPOINT_ACTION_STATE,
  );
  const busyKey = localActionState.busyKey ?? actionState.busyKey;
  const completedKey = localActionState.completedKey ?? actionState.completedKey;
  const failedKey = localActionState.failedKey ?? actionState.failedKey;
  const error = localActionState.error ?? actionState.error;
  const actionItems = summary.checkpointActions
    .map((checkpointAction) => {
      const handler = handlerForCheckpointAction(checkpointAction.key, actions);
      if (!summary.checkpointId || !handler) return null;
      return {
        ...checkpointAction,
        icon: checkpointActionIcon(checkpointAction.key),
        variant:
          checkpointAction.key === 'resume' || checkpointAction.key === 'retry'
            ? ('primary' as const)
            : ('ghost' as const),
        handler,
      };
    })
    .filter(Boolean) as Array<
    CheckpointToolAction & {
      icon: ReactNode;
      variant: 'ghost' | 'primary';
      handler: NonNullable<
        | typeof actions.onResumeState
        | typeof actions.onRetryTool
        | typeof actions.onReplayState
        | typeof actions.onForkState
      >;
    }
  >;

  const runAction = async (item: (typeof actionItems)[number]) => {
    if (!summary.checkpointId) {
      const nextState = {
        busyKey: null,
        completedKey: null,
        failedKey: item.key,
        error: '当前步骤没有可恢复的检查点。',
      };
      setLocalActionState(nextState);
      setCheckpointActionRuntimeState(runtimeKey, nextState);
      return;
    }
    const pendingState = {
      busyKey: item.key,
      completedKey: null,
      failedKey: null,
      error: null,
    };
    setLocalActionState(pendingState);
    setCheckpointActionRuntimeState(runtimeKey, pendingState);
    try {
      await item.handler({
        messageId,
        checkpointId: summary.checkpointId,
        checkpointAction: item.key,
        checkpointEndpoint: item.endpoint ?? null,
        checkpointMethod: item.method ?? null,
        idempotencyKey: item.idempotencyKey ?? summary.resumeContext.idempotencyKey ?? null,
        stepId: item.stepId ?? summary.stepId ?? undefined,
      });
      const completedState = {
        busyKey: null,
        completedKey: item.key,
        failedKey: null,
        error: null,
      };
      setLocalActionState(completedState);
      setCheckpointActionRuntimeState(runtimeKey, completedState);
    } catch (nextError) {
      const failedState = {
        busyKey: null,
        completedKey: null,
        failedKey: item.key,
        error: nextError instanceof Error ? nextError.message : '操作没有完成，请重试。',
      };
      setLocalActionState(failedState);
      setCheckpointActionRuntimeState(runtimeKey, failedState);
    }
  };

  const completedAction = completedKey
    ? actionItems.find((item) => item.key === completedKey)
    : null;
  const failedAction = failedKey ? actionItems.find((item) => item.key === failedKey) : null;
  const completedActionLabel =
    completedAction?.label ?? checkpointActionLabel(completedKey) ?? null;
  const failedActionKey = failedAction?.key ?? failedKey ?? 'unknown';

  if (actionItems.length === 0 && summary.status !== 'error' && !completedActionLabel && !error) {
    return null;
  }

  return (
    <div className="ml-1 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-black/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-[#52525b]">
          {summary.status === 'error' ? '失败后可继续' : '继续处理'}
        </span>
        {actionItems.map((item) => (
          <ToolActionButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            busyLabel={item.busyLabel}
            busy={busyKey === item.key}
            variant={item.variant}
            data-testid="assistant-ui-checkpoint-action"
            data-checkpoint-action={item.key}
            data-checkpoint-id={String(summary.checkpointId ?? '')}
            data-step-id={item.stepId ?? summary.stepId ?? ''}
            data-step-level={item.stepId ?? summary.stepId ? 'true' : 'false'}
            data-action-source={item.source}
            onClick={() => void runAction(item)}
          />
        ))}
      </div>
      {error ? (
        <p
          className="mt-2 text-xs leading-5 text-red-700"
          data-testid="assistant-ui-checkpoint-action-error"
          data-checkpoint-action={failedActionKey}
          data-checkpoint-id={String(summary.checkpointId ?? '')}
          data-step-id={summary.stepId ?? ''}
        >
          {sanitizePublicText(error) ?? '这一步暂时没有完成，可以重新尝试。'}
        </p>
      ) : null}
      {completedActionLabel ? (
        <p
          className="mt-2 text-xs leading-5 text-emerald-700"
          role="status"
          data-testid="assistant-ui-checkpoint-action-result"
          data-checkpoint-action={completedKey ?? 'unknown'}
          data-checkpoint-id={String(summary.checkpointId ?? '')}
          data-step-id={summary.stepId ?? ''}
        >
          已提交“{completedActionLabel}”，我会沿同一对话继续处理。
        </p>
      ) : null}
    </div>
  );
}

function checkpointActionLabel(key: string | null) {
  if (key === 'retry') return '重试这一步';
  if (key === 'replay') return '重新运行这一步';
  if (key === 'fork') return '生成新版本';
  if (key === 'resume') return '继续处理';
  return null;
}

function checkpointActionBusyLabel(key: CheckpointToolActionKey) {
  if (key === 'resume') return '正在继续';
  if (key === 'retry') return '正在重试';
  if (key === 'replay') return '正在重新运行';
  return '正在生成';
}

function checkpointActionIcon(key: CheckpointToolActionKey) {
  if (key === 'resume') return <Send className="h-3.5 w-3.5" />;
  if (key === 'retry') return <RefreshCcw className="h-3.5 w-3.5" />;
  if (key === 'replay') return <History className="h-3.5 w-3.5" />;
  return <GitBranch className="h-3.5 w-3.5" />;
}

function handlerForCheckpointAction(
  key: CheckpointToolActionKey,
  actions: ReturnType<typeof useFitMeetToolUIActions>,
) {
  if (key === 'resume') return actions.onResumeState;
  if (key === 'retry') return actions.onRetryTool;
  if (key === 'replay') return actions.onReplayState;
  return actions.onForkState;
}

function ToolActionButton({
  icon,
  label,
  busyLabel,
  busy,
  disabled,
  variant = 'ghost',
  onClick,
  ...buttonProps
}: {
  icon: ReactNode;
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'ghost' | 'primary';
  onClick: () => void;
} & Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type' | 'onClick' | 'disabled'>) {
  return (
    <button
      {...buttonProps}
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary'
          ? 'bg-[#18181b] text-white hover:bg-[#27272a]'
          : 'bg-white text-[#52525b] ring-1 ring-black/10',
      )}
      onClick={onClick}
      disabled={busy || disabled}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {busy ? (busyLabel ?? '处理中') : label}
    </button>
  );
}

function ProcessReplayPanel({ summary }: { summary: ProcessSummary }) {
  const chips = [
    summary.resumeContext.hasCheckpoint
      ? { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: '进度已保存' }
      : null,
    summary.checkpointId && summary.replayable
      ? { icon: <History className="h-3.5 w-3.5" />, label: '可重新运行这一步' }
      : null,
    summary.checkpointId && summary.forkable
      ? { icon: <GitBranch className="h-3.5 w-3.5" />, label: '可生成新版本' }
      : null,
    summary.checkpointId && summary.retryable
      ? { icon: <RefreshCcw className="h-3.5 w-3.5" />, label: '失败可重试' }
      : null,
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>;

  if (chips.length === 0 && summary.status !== 'error') return null;

  return (
    <details className="group/replay ml-8 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-black/5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-[#52525b] marker:hidden">
        <span>继续处理选项</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-[#a1a1aa] transition-transform group-open/replay:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f7f8] px-2.5 py-1 text-xs text-[#71717a] ring-1 ring-black/5"
          >
            {chip.icon}
            {chip.label}
          </span>
        ))}
      </div>
      {summary.retryable ? (
        <p className="mt-2 text-xs leading-5 text-[#71717a]">
          重试只会从保存的步骤继续；重新运行和新版本会沿同一对话恢复上下文。
        </p>
      ) : null}
    </details>
  );
}

function MetaChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f7f7f8] px-2 py-1 text-[11px] leading-4 text-[#71717a] ring-1 ring-black/5">
      {icon}
      {label}
    </span>
  );
}

function DiffPane({
  title,
  value,
  emphasized,
}: {
  title: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 ring-1',
        emphasized
          ? 'bg-violet-50/70 text-violet-900 ring-violet-100'
          : 'bg-[#f7f7f8] text-[#52525b] ring-black/5',
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8a8f98]">{title}</p>
      <p className="mt-1 text-xs leading-5">{value}</p>
    </div>
  );
}

function cardActionRuntimeKey(messageId: string, cardId: string) {
  return `${messageId}:${cardId}`;
}

function subscribeCardActionRuntime(listener: () => void) {
  cardActionRuntimeListeners.add(listener);
  return () => cardActionRuntimeListeners.delete(listener);
}

function emitCardActionRuntimeChange() {
  cardActionRuntimeListeners.forEach((listener) => listener());
}

function checkpointActionRuntimeKey(
  messageId: string,
  checkpointId: number | string | null | undefined,
  stepId: string | null | undefined,
) {
  if (checkpointId !== null && checkpointId !== undefined && String(checkpointId).length > 0) {
    return `checkpoint:${checkpointId}:${stepId ?? 'run'}`;
  }
  return `message:${messageId}:${stepId ?? 'run'}`;
}

function subscribeCheckpointActionRuntime(listener: () => void) {
  checkpointActionRuntimeListeners.add(listener);
  return () => checkpointActionRuntimeListeners.delete(listener);
}

function emitCheckpointActionRuntimeChange() {
  checkpointActionRuntimeListeners.forEach((listener) => listener());
}

function readCheckpointActionRuntimeState(key: string): CheckpointActionRuntimeState {
  return checkpointActionRuntimeState.get(key) ?? EMPTY_CHECKPOINT_ACTION_STATE;
}

function setCheckpointActionRuntimeState(
  key: string,
  patch: Partial<CheckpointActionRuntimeState>,
) {
  checkpointActionRuntimeState.set(key, {
    ...readCheckpointActionRuntimeState(key),
    ...patch,
  });
  emitCheckpointActionRuntimeChange();
}

function useCheckpointActionRuntimeState(
  messageId: string,
  checkpointId: number | string | null | undefined,
  stepId: string | null | undefined,
) {
  const key = checkpointActionRuntimeKey(messageId, checkpointId, stepId);
  const state = useSyncExternalStore(
    subscribeCheckpointActionRuntime,
    () => readCheckpointActionRuntimeState(key),
    () => EMPTY_CHECKPOINT_ACTION_STATE,
  );
  return [key, state] as const;
}

function readCardActionRuntimeState(key: string): CardActionRuntimeState {
  return cardActionRuntimeState.get(key) ?? EMPTY_CARD_ACTION_STATE;
}

function setCardActionRuntimeState(key: string, patch: Partial<CardActionRuntimeState>) {
  cardActionRuntimeState.set(key, {
    ...readCardActionRuntimeState(key),
    ...patch,
  });
  emitCardActionRuntimeChange();
}

function useCardActionRuntimeState(messageId: string, cardId: string) {
  const key = cardActionRuntimeKey(messageId, cardId);
  const state = useSyncExternalStore(
    subscribeCardActionRuntime,
    () => readCardActionRuntimeState(key),
    () => EMPTY_CARD_ACTION_STATE,
  );
  return [key, state] as const;
}

function CardActionSummary({
  card,
  actions,
}: {
  card: SchemaDrivenAssistantCard;
  actions: SchemaDrivenAssistantCard['actions'];
}) {
  const toolActions = useFitMeetToolUIActions();
  const threadRunning = useAuiState((state) => state.thread.isRunning);
  const messageId = useAuiState((state) => {
    const custom = state.message.metadata.custom as {
      fitmeetMessageId?: string;
    };
    return custom.fitmeetMessageId ?? state.message.id;
  });
  const [runtimeKey, actionState] = useCardActionRuntimeState(messageId, card.id);
  const { busyKey, completedKey, failedKey, error } = actionState;
  const visible = visibleCardActions(card, actions).slice(0, 4);
  const completedAction = completedKey
    ? visible.find((action) => cardActionKey(action) === completedKey)
    : null;
  const failedAction = failedKey
    ? visible.find((action) => cardActionKey(action) === failedKey)
    : null;
  const confirmationNoteId = `tool-action-confirmation-${card.id}`;
  const hasConfirmationActions = visible.some((action) => action.requiresConfirmation);
  if (visible.length === 0) return null;

  const runAction = async (action: (typeof visible)[number]) => {
    if (!toolActions.onCardAction) return;
    const key = cardActionKey(action);
    setCardActionRuntimeState(runtimeKey, {
      busyKey: key,
      completedKey: null,
      failedKey: null,
      error: null,
    });
    try {
      await toolActions.onCardAction({
        messageId,
        taskId: primitiveTaskId(card.data.taskId),
        cardId: card.id,
        action: action.action,
        schemaAction: action.schemaAction,
        payload: payloadForCardAction(card, action),
      });
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: key,
        failedKey: null,
        error: null,
      });
    } catch (nextError) {
      setCardActionRuntimeState(runtimeKey, {
        busyKey: null,
        completedKey: null,
        failedKey: key,
        error: nextError instanceof Error ? nextError.message : '这一步没有完成，请重试。',
      });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((action) => {
          const key = cardActionKey(action);
          const isBusy = busyKey === key;
          const isCompleted = completedKey === key;
          const isFailed = failedKey === key;
          const isLockedByAnotherAction = Boolean(busyKey && !isBusy);
          const executable = Boolean(toolActions.onCardAction && action.schemaAction);
          const actionStateLabel = cardActionStateLabel(action, isBusy, isCompleted, isFailed);
          return (
            <button
              key={`${action.label}-${action.schemaAction ?? action.action ?? 'action'}`}
              type="button"
              aria-describedby={action.requiresConfirmation ? confirmationNoteId : undefined}
              aria-busy={isBusy}
              data-testid="assistant-ui-schema-action"
              data-schema-action={action.schemaAction ?? 'unknown'}
              data-action-source={action.source}
              data-requires-confirmation={action.requiresConfirmation ? 'true' : 'false'}
              data-checkpoint-required={actionRequiresCheckpoint(action) ? 'true' : 'false'}
              data-action-state={
                isBusy ? 'running' : isCompleted ? 'succeeded' : isFailed ? 'failed' : 'idle'
              }
              disabled={!executable || threadRunning || isBusy || isLockedByAnotherAction}
              onClick={() => void runAction(action)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition',
                executable
                  ? 'hover:-translate-y-px hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20'
                  : 'cursor-default',
                action.requiresConfirmation
                  ? 'bg-amber-50 text-amber-800 ring-amber-100'
                  : 'bg-[#f7f7f8] text-[#52525b] ring-black/5',
                isCompleted && 'bg-emerald-50 text-emerald-700 ring-emerald-100',
                isFailed && 'bg-red-50 text-red-700 ring-red-100',
                isBusy && 'cursor-wait opacity-70',
                isLockedByAnotherAction && 'opacity-50',
              )}
            >
              {isBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              ) : isFailed ? (
                <RefreshCcw className="h-3 w-3" aria-hidden="true" />
              ) : action.requiresConfirmation ? (
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Send className="h-3 w-3" aria-hidden="true" />
              )}
              {actionStateLabel}
            </button>
          );
        })}
      </div>
      {hasConfirmationActions ? (
        <p
          id={confirmationNoteId}
          className="text-[11px] leading-5 text-amber-700/90"
          data-testid="assistant-ui-touch-confirmation-note"
          data-contact-boundary="approval-required"
        >
          不会自动触达对方；涉及真实发送、连接或发布时，我会先等你确认。
        </p>
      ) : null}
      {completedKey ? (
        <p
          className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs leading-5 text-emerald-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-card-action-result"
          data-schema-action={completedAction?.schemaAction ?? 'unknown'}
        >
          {completedAction
            ? cardActionResultMessage(completedAction)
            : '这一步已完成，后续结果会继续留在当前对话。'}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-700"
          role="status"
          aria-live="polite"
          data-testid="assistant-ui-card-action-error"
          data-schema-action={failedAction?.schemaAction ?? 'unknown'}
        >
          {sanitizePublicText(error) ?? '这一步暂时没有完成，可以稍后重试。'}
        </p>
      ) : null}
    </div>
  );
}

function payloadForCardAction(
  card: SchemaDrivenAssistantCard,
  action: VisibleCardAction,
): Record<string, unknown> {
  const payload = action.payload ?? defaultCardActionPayload(card);
  if (!action.requiresConfirmation) return payload;
  return stripEmptyPayloadFields({
    ...payload,
    approvalRequired: true,
    checkpointRequired: payload.checkpointRequired ?? true,
    resumeMode: payload.resumeMode ?? 'resume_after_approval',
  });
}

function actionRequiresCheckpoint(action: VisibleCardAction) {
  return (
    action.requiresConfirmation === true ||
    action.payload?.checkpointRequired === true ||
    action.payload?.approvalRequired === true
  );
}

function cardActionKey(action: VisibleCardAction) {
  return action.id ?? action.schemaAction ?? action.action ?? action.label ?? 'action';
}

function cardActionStateLabel(
  action: {
    label: string | null;
    schemaAction: ToolUISchemaAction | null | undefined;
    action: string | null;
  },
  isBusy: boolean,
  isCompleted: boolean,
  isFailed: boolean,
) {
  if (isFailed) return `重试${action.label ?? '这一步'}`;
  if (!isBusy && !isCompleted) return action.label;
  if (action.schemaAction) {
    const copy = CARD_ACTION_COPY[action.schemaAction];
    return isBusy ? copy.busy : copy.done;
  }
  return isBusy ? '处理中' : '已继续处理';
}

function cardActionResultMessage(action: VisibleCardAction) {
  if (action.schemaAction) {
    return CARD_ACTION_COPY[action.schemaAction].result;
  }
  return '这一步已完成，后续结果会继续留在当前对话。';
}

function visibleCardActions(
  card: SchemaDrivenAssistantCard,
  actions: SchemaDrivenAssistantCard['actions'],
): VisibleCardAction[] {
  const defaultPayload = defaultCardActionPayload(card);
  const normalized = actions
    .map((action): VisibleCardAction => {
      const schemaAction = toolUISchemaActionFromUnknown(action.schemaAction);
      const rawAction = publicString(action.action);
      const requiresConfirmation = action.requiresConfirmation === true;
      return {
        id: publicString(action.id),
        label: normalizeVisibleActionLabel(
          publicDetail(action.label),
          schemaAction,
          rawAction,
          requiresConfirmation,
        ),
        requiresConfirmation,
        schemaAction,
        action: rawAction,
        payload: mergeCardActionPayload(defaultPayload, action.payload),
        source: 'backend',
      };
    })
    .filter((action) => action.label);
  const seen = new Set(
    normalized.map((action) => action.schemaAction ?? action.action ?? action.label),
  );
  const defaults = defaultCardActions(card).filter((action) => {
    const key = action.schemaAction ?? action.action ?? action.label;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...normalized, ...defaults];
}

function mergeCardActionPayload(
  defaultPayload: Record<string, unknown>,
  actionPayload: unknown,
): Record<string, unknown> {
  if (!isRecord(actionPayload)) return defaultPayload;
  return stripEmptyPayloadFields({
    ...defaultPayload,
    ...actionPayload,
  });
}

function normalizeVisibleActionLabel(
  label: string | null,
  schemaAction: ToolUISchemaAction | undefined,
  action: string | null,
  requiresConfirmation: boolean,
) {
  if (schemaAction === 'candidate.connect' || action === 'candidate.connect') {
    return requiresConfirmation ? '确认后发邀请' : '发邀请';
  }
  return label;
}

function defaultCardActions(card: SchemaDrivenAssistantCard): VisibleCardAction[] {
  const basePayload = defaultCardActionPayload(card);
  if (card.schemaType === 'social_match.candidate') {
    return [
      {
        id: `${card.id}:view`,
        label: '查看详情',
        requiresConfirmation: false,
        schemaAction: 'candidate.view_detail',
        action: 'candidate.view_detail',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:opener`,
        label: '生成开场白',
        requiresConfirmation: false,
        schemaAction: 'candidate.generate_opener',
        action: 'candidate.generate_opener',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:connect`,
        label: '确认后发邀请',
        requiresConfirmation: true,
        schemaAction: 'candidate.connect',
        action: 'candidate.connect',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'social_match.activity') {
    return [
      {
        id: `${card.id}:view`,
        label: '查看活动详情',
        requiresConfirmation: false,
        schemaAction: 'activity.view_detail',
        action: 'activity.view_detail',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:create`,
        label: '确认后发起',
        requiresConfirmation: true,
        schemaAction: 'activity.confirm_create',
        action: 'activity.confirm_create',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'life_graph.diff') {
    return [
      {
        id: `${card.id}:accept`,
        label: '确认更新',
        requiresConfirmation: true,
        schemaAction: 'life_graph.accept_update',
        action: 'life_graph.accept_update',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:reject`,
        label: '暂不写入',
        requiresConfirmation: false,
        schemaAction: 'life_graph.reject_update',
        action: 'life_graph.reject_update',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  if (card.schemaType === 'meet_loop.timeline') {
    return [
      {
        id: `${card.id}:resume`,
        label: '继续推进',
        requiresConfirmation: true,
        schemaAction: 'meet_loop.resume',
        action: 'meet_loop.resume',
        payload: basePayload,
        source: 'default' as const,
      },
      {
        id: `${card.id}:reschedule`,
        label: '调整时间',
        requiresConfirmation: true,
        schemaAction: 'meet_loop.reschedule',
        action: 'meet_loop.reschedule',
        payload: basePayload,
        source: 'default' as const,
      },
    ];
  }
  return [];
}

function defaultCardActionPayload(card: SchemaDrivenAssistantCard): Record<string, unknown> {
  const opportunity = isRecord(card.data.opportunity) ? card.data.opportunity : {};
  const proposal = isRecord(card.data.proposal) ? card.data.proposal : {};
  const candidate = defaultCandidatePayload(card, opportunity);
  const activity = defaultActivityPayload(card, opportunity);
  const lifeGraph = defaultLifeGraphPayload(card, proposal);
  return stripEmptyPayloadFields({
    taskId: card.data.taskId,
    cardId: card.id,
    cardType: card.type,
    schemaType: card.schemaType,
    ...lifeGraph,
    candidateId: firstPublicPrimitive(
      card.data.candidateId,
      card.data.candidateRecordId,
      card.data.socialRequestCandidateId,
      opportunity.candidateId,
      opportunity.candidateRecordId,
    ),
    targetUserId: firstPublicPrimitive(
      card.data.targetUserId,
      card.data.userId,
      card.data.candidateUserId,
      opportunity.targetUserId,
      opportunity.userId,
      opportunity.candidateUserId,
    ),
    socialRequestId: firstPublicPrimitive(card.data.socialRequestId, opportunity.socialRequestId),
    publicIntentId: firstPublicPrimitive(card.data.publicIntentId, opportunity.publicIntentId),
    ...(card.schemaType === 'social_match.activity' ? activity : {}),
    activityId: firstPublicPrimitive(card.data.activityId, opportunity.activityId),
    candidate: Object.keys(candidate).length > 0 ? candidate : undefined,
    activity: Object.keys(activity).length > 0 ? activity : undefined,
    suggestedOpener:
      publicDetail(opportunity.suggestedOpener) ?? publicDetail(card.data.suggestedOpener),
  });
}

function defaultLifeGraphPayload(
  card: SchemaDrivenAssistantCard,
  proposal: Record<string, unknown>,
) {
  if (card.schemaType !== 'life_graph.diff') return {};
  return stripEmptyPayloadFields({
    proposalId: firstPublicPrimitive(
      card.data.proposalId,
      card.data.lifeGraphProposalId,
      proposal.proposalId,
      proposal.id,
    ),
    fieldIds: lifeGraphFieldIds(card.data, proposal),
    allowConflicts: lifeGraphHasConflicts(card.data, proposal) ? true : undefined,
    reason: publicDetail(card.data.rejectReason) ?? publicDetail(proposal.rejectReason),
  });
}

function lifeGraphFieldIds(
  data: Record<string, unknown>,
  proposal: Record<string, unknown>,
): string[] | undefined {
  const explicit = [
    ...primitiveArray(data.fieldIds),
    ...primitiveArray(data.proposedFieldIds),
    ...primitiveArray(proposal.fieldIds),
    ...primitiveArray(proposal.proposedFieldIds),
  ];
  if (explicit.length > 0) return explicit;
  const fields = Array.isArray(data.fields)
    ? data.fields
    : Array.isArray(proposal.fields)
      ? proposal.fields
      : Array.isArray(data.proposedFields)
        ? data.proposedFields
        : [];
  const fromFields = fields
    .map((field) => {
      if (!isRecord(field)) return null;
      return firstPublicPrimitive(field.proposalFieldId, field.fieldId, field.id);
    })
    .filter((value): value is string | number => value !== null)
    .map(String);
  return fromFields.length > 0 ? fromFields : undefined;
}

function lifeGraphHasConflicts(
  data: Record<string, unknown>,
  proposal: Record<string, unknown>,
): boolean {
  const diff = isRecord(data.diff) ? data.diff : {};
  if (
    primitiveArray(data.conflicts).length > 0 ||
    primitiveArray(data.conflictHints).length > 0 ||
    primitiveArray(diff.conflicts).length > 0
  ) {
    return true;
  }
  const fields = Array.isArray(data.fields)
    ? data.fields
    : Array.isArray(proposal.fields)
      ? proposal.fields
      : Array.isArray(data.proposedFields)
        ? data.proposedFields
        : [];
  return fields.some((field) => {
    if (!isRecord(field)) return false;
    return (
      field.conflict === true ||
      field.status === 'conflict' ||
      field.status === 'revoked_conflict'
    );
  });
}

function primitiveArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => firstPublicPrimitive(item))
    .filter((item): item is string | number => item !== null)
    .map(String);
}

function defaultCandidatePayload(
  card: SchemaDrivenAssistantCard,
  opportunity: Record<string, unknown>,
) {
  if (card.schemaType !== 'social_match.candidate') return {};
  return stripEmptyPayloadFields({
    name:
      publicDetail(opportunity.name) ??
      publicDetail(card.data.displayName) ??
      publicDetail(card.data.name) ??
      card.title,
    title: publicDetail(opportunity.title) ?? card.title,
    area:
      publicDetail(opportunity.area) ??
      publicDetail(card.data.area) ??
      publicDetail(card.data.city),
    time:
      publicDetail(opportunity.time) ??
      publicDetail(card.data.timePreference) ??
      publicDetail(card.data.whyNow),
    score:
      firstPublicPrimitive(opportunity.score, card.data.matchScore, card.data.score) ?? undefined,
  });
}

function defaultActivityPayload(
  card: SchemaDrivenAssistantCard,
  opportunity: Record<string, unknown>,
) {
  if (card.schemaType !== 'social_match.activity') return {};
  return stripEmptyPayloadFields({
    title:
      publicDetail(opportunity.title) ??
      publicDetail(card.data.activityTitle) ??
      publicDetail(card.data.name) ??
      card.title,
    city: publicDetail(opportunity.city) ?? publicDetail(card.data.city),
    location:
      publicDetail(opportunity.location) ??
      publicDetail(card.data.locationName) ??
      publicDetail(card.data.location),
    time:
      publicDetail(opportunity.time) ??
      publicDetail(card.data.timeLabel) ??
      publicDetail(card.data.startTime),
    safetyBoundary:
      publicDetail(opportunity.safetyBoundary) ?? publicDetail(card.data.safetyBoundary),
    checkinReminder:
      publicDetail(opportunity.checkinReminder) ?? publicDetail(card.data.checkinReminder),
    reviewPrompt: publicDetail(opportunity.reviewPrompt) ?? publicDetail(card.data.reviewPrompt),
  });
}

function stripEmptyPayloadFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nextValue]) => {
      if (nextValue == null) return false;
      if (typeof nextValue === 'string') return nextValue.trim().length > 0;
      return true;
    }),
  );
}

function firstPublicPrimitive(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function primitiveTaskId(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

function StatusBadge({ status, children }: { status: ProcessStatus; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        status === 'running' && 'bg-blue-50 text-blue-600',
        status === 'complete' && 'bg-emerald-50 text-emerald-600',
        status === 'waiting' && 'bg-amber-50 text-amber-600',
        status === 'error' && 'bg-red-50 text-red-600',
      )}
    >
      {children}
    </span>
  );
}

function toolStatus(status: ToolCallMessagePartProps['status']) {
  if (status?.type === 'running') {
    return {
      status: 'running' as const,
      text: '正在处理这一步',
    };
  }
  if (status?.type === 'requires-action') {
    return {
      status: 'waiting' as const,
      text: '需要你确认后再继续',
    };
  }
  if (status?.type === 'incomplete') {
    return {
      status: 'error' as const,
      text: '这一步没有完成',
    };
  }
  return {
    status: 'complete' as const,
    text: '已完成这一步',
  };
}

function summarizeDataPart(name: string | undefined, data: unknown): ProcessSummary {
  const record = isRecord(data) ? data : {};
  const checkpointId = checkpointIdFromData(record);
  const runtime = isRecord(record.runtime) ? record.runtime : null;
  const canReplay = checkpointId !== null && runtime?.canReplay === true;
  const canFork = checkpointId !== null && runtime?.canFork === true;
  const resumeContext = resumeContextFromRuntime(runtime, checkpointId);
  const title =
    publicString(record.title) ??
    (name === 'fitmeet-approval'
      ? '需要你确认这一步'
      : name === 'fitmeet-process'
        ? '正在处理'
        : '正在处理');
  const steps = Array.isArray(record.steps)
    ? record.steps.filter(isRecord).map((step, index) => normalizeStep(step, index))
    : [];
  const pendingConfirmations = Array.isArray(record.pendingConfirmations)
    ? record.pendingConfirmations
    : [];
  const hasWaiting =
    pendingConfirmations.length > 0 || steps.some((step) => step.status === 'waiting');
  const hasError = steps.some((step) => step.status === 'error');
  const hasRunning = steps.some((step) => step.status === 'running');
  const status = hasError ? 'error' : hasWaiting ? 'waiting' : hasRunning ? 'running' : 'complete';
  const stepId = stepIdFromRuntime(runtime) ?? targetStepIdFromSteps(steps, status);
  const checkpointActions = checkpointActionsFromRuntime(runtime, {
    checkpointId,
    status,
    canReplay,
    canFork,
    stepId,
  });
  return {
    title,
    status,
    steps,
    resultLines: resultLinesForData(record, pendingConfirmations, steps),
    pendingCount: pendingConfirmations.length,
    replayable: status !== 'running' && steps.length > 0 && canReplay,
    forkable: status === 'complete' && steps.length > 0 && canFork,
    retryable: status === 'error' && canReplay,
    checkpointActions,
    checkpointId,
    stepId,
    resumeContext,
  };
}

function checkpointActionsFromRuntime(
  runtime: Record<string, unknown> | null,
  fallback: {
    checkpointId: number | string | null;
    status: ProcessStatus;
    canReplay: boolean;
    canFork: boolean;
    stepId: string | null;
  },
): CheckpointToolAction[] {
  if (fallback.checkpointId === null) return [];
  const interrupt = isRecord(runtime?.interrupt) ? runtime.interrupt : null;
  const backendActions = [
    ...checkpointActionsFromUnknown(interrupt?.stepActions, 'step'),
    ...checkpointActionsFromUnknown(interrupt?.recoveryActions, 'recovery'),
  ];
  const dedupedBackendActions = dedupeCheckpointActions(backendActions);
  if (dedupedBackendActions.length > 0) return dedupedBackendActions;

  const actions: CheckpointToolAction[] = [];
  if (fallback.status === 'waiting') actions.push(fallbackCheckpointAction('resume', fallback.stepId));
  if (fallback.status === 'error' && fallback.canReplay) {
    actions.push(fallbackCheckpointAction('retry', fallback.stepId));
  }
  if (fallback.status !== 'running' && fallback.canReplay) {
    actions.push(fallbackCheckpointAction('replay', fallback.stepId));
  }
  if (fallback.status === 'complete' && fallback.canFork) {
    actions.push(fallbackCheckpointAction('fork', fallback.stepId));
  }
  return actions;
}

function checkpointActionsFromUnknown(
  value: unknown,
  sourceKind: 'recovery' | 'step',
): CheckpointToolAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const key = checkpointActionKeyFromUnknown(raw.action);
    if (!key) return [];
    const label = publicDetail(raw.label) ?? checkpointActionLabel(key) ?? '继续处理';
    const stepId =
      sourceKind === 'step'
        ? publicString(raw.stepId)
        : publicString(raw.stepId) ?? null;
    return [
      {
        key,
        label,
        busyLabel: checkpointActionBusyLabel(key),
        endpoint: publicString(raw.endpoint),
        method: publicString(raw.method),
        idempotencyKey: publicString(raw.idempotencyKey),
        stepId,
        source: 'backend' as const,
      },
    ];
  });
}

function fallbackCheckpointAction(
  key: CheckpointToolActionKey,
  stepId: string | null,
): CheckpointToolAction {
  return {
    key,
    label: checkpointActionLabel(key) ?? '继续处理',
    busyLabel: checkpointActionBusyLabel(key),
    stepId,
    source: 'fallback',
  };
}

function dedupeCheckpointActions(actions: CheckpointToolAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.key}:${action.stepId ?? 'run'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function checkpointActionKeyFromUnknown(value: unknown): CheckpointToolActionKey | null {
  if (value === 'resume' || value === 'retry' || value === 'replay' || value === 'fork') {
    return value;
  }
  return null;
}

function resumeContextFromRuntime(
  runtime: Record<string, unknown> | null,
  checkpointId: number | string | null,
): ResumeContext {
  const interrupt = isRecord(runtime?.interrupt) ? runtime.interrupt : null;
  const resumeCursor = isRecord(runtime?.resumeCursor) ? runtime.resumeCursor : null;
  const threadId =
    publicString(runtime?.threadId) ??
    publicString(resumeCursor?.threadId) ??
    publicString(interrupt?.threadId);
  const parentCheckpointId =
    (typeof runtime?.parentCheckpointId === 'number' ||
    typeof runtime?.parentCheckpointId === 'string'
      ? runtime.parentCheckpointId
      : null) ??
    (typeof resumeCursor?.parentCheckpointId === 'number' ||
    typeof resumeCursor?.parentCheckpointId === 'string'
      ? resumeCursor.parentCheckpointId
      : null);
  const mode = resumeModeFromUnknown(
    resumeCursor?.action ?? runtime?.checkpointAction ?? interrupt?.resumeAction,
  );
  return {
    hasCheckpoint: checkpointId !== null,
    hasInterrupt: isRecord(interrupt),
    threadId,
    checkpointId,
    parentCheckpointId,
    mode,
    interruptKind: publicString(interrupt?.kind),
    idempotencyKey:
      publicString(runtime?.idempotencyKey) ?? publicString(interrupt?.idempotencyKey),
    sourceStep: resumeSourceStepFromRuntime(runtime),
    stepScope: resumeStepScopeFromRuntime(runtime),
    sideEffectPolicy: resumeSideEffectPolicyFromRuntime(runtime),
  };
}

function stepIdFromRuntime(runtime: Record<string, unknown> | null): string | null {
  const resumeCursor = isRecord(runtime?.resumeCursor) ? runtime.resumeCursor : null;
  return publicString(resumeCursor?.stepId);
}

function resumeSourceStepFromRuntime(runtime: Record<string, unknown> | null): ResumeContext['sourceStep'] {
  const sourceStep = isRecord(runtime?.sourceStep) ? runtime.sourceStep : null;
  const stepId = publicString(sourceStep?.stepId);
  if (!sourceStep || !stepId) return null;
  return {
    stepId,
    label: publicDetail(sourceStep.label),
    toolName: publicDetail(sourceStep.toolName),
  };
}

function resumeStepScopeFromRuntime(runtime: Record<string, unknown> | null): ResumeContext['stepScope'] {
  const stepScope = isRecord(runtime?.stepScope) ? runtime.stepScope : null;
  if (!stepScope) return null;
  const mode = stepScope.mode === 'through_step' ? 'through_step' : 'full_checkpoint';
  const stepCount = publicNumber(stepScope.stepCount) ?? 0;
  const sourceCheckpointId =
    typeof stepScope.sourceCheckpointId === 'number' ||
    typeof stepScope.sourceCheckpointId === 'string'
      ? Number(stepScope.sourceCheckpointId)
      : null;
  return {
    mode,
    stepCount,
    sourceCheckpointId: Number.isFinite(sourceCheckpointId) ? sourceCheckpointId : null,
  };
}

function resumeSideEffectPolicyFromRuntime(
  runtime: Record<string, unknown> | null,
): ResumeContext['sideEffectPolicy'] {
  const policy = isRecord(runtime?.sideEffectPolicy) ? runtime.sideEffectPolicy : null;
  const idempotencyKey = publicString(policy?.idempotencyKey);
  if (!policy || !idempotencyKey) return null;
  return {
    idempotencyKey,
    sideEffectsBeforeResume: 'idempotent_only',
    duplicatePolicy: 'reuse_idempotency_key',
  };
}

function groupStepsByTool(steps: ProcessStep[]): ToolGroup[] {
  const grouped = new Map<ToolCategory, ProcessStep[]>();
  for (const step of steps) {
    const category = classifyStepCategory(step);
    grouped.set(category, [...(grouped.get(category) ?? []), step]);
  }
  const order: ToolCategory[] = ['life_graph', 'social_match', 'meet_loop', 'safety', 'generic'];
  return order
    .map((category) => {
      const categorySteps = grouped.get(category);
      if (!categorySteps?.length) return null;
      return {
        category,
        ...categoryCopy(category),
        steps: categorySteps,
      };
    })
    .filter(Boolean) as ToolGroup[];
}

function classifyStepCategory(step: ProcessStep): ToolCategory {
  const processType = (step.processType ?? '').toLowerCase();
  if (/candidate|social_match|rank/.test(processType)) return 'social_match';
  if (/opportunity|meet_loop/.test(processType)) return 'meet_loop';
  if (/memory|slot|life_graph/.test(processType)) return 'life_graph';
  if (/approval|safety/.test(processType)) return 'safety';
  const text = `${step.id} ${step.kind ?? ''} ${step.label} ${step.detail ?? ''}`.toLowerCase();
  if (/clarify|补充|关键信息|确认需要补充|等待用户补充/.test(text)) return 'generic';
  if (/life|graph|profile|memory|画像|记忆|偏好|上下文/.test(text)) return 'life_graph';
  if (/match|candidate|social|search|rank|recommend|筛选|查找|候选|推荐|匹配/.test(text)) {
    return 'social_match';
  }
  if (/meet|activity|invite|schedule|loop|约练|邀约|活动|改期|见面|评价/.test(text)) {
    return 'meet_loop';
  }
  if (/safety|approval|confirm|permission|risk|安全|确认|审批|权限|边界/.test(text)) {
    return 'safety';
  }
  return 'generic';
}

function categoryCopy(category: ToolCategory): Pick<ToolGroup, 'title' | 'description'> {
  if (category === 'life_graph') {
    return {
      title: '上下文整理',
      description: '整理用户画像、偏好和记忆边界。',
    };
  }
  if (category === 'social_match') {
    return {
      title: '匹配整理',
      description: '查找、召回和排序候选人或活动。',
    };
  }
  if (category === 'meet_loop') {
    return {
      title: '邀约进展',
      description: '管理邀约、改期、确认、评价与回写。',
    };
  }
  if (category === 'safety') {
    return {
      title: '安全确认',
      description: '检查风险、权限和需要确认的动作。',
    };
  }
  return {
    title: '处理进度',
    description: '整理当前步骤和可继续的状态。',
  };
}

function naturalProcessTitle(summary: ProcessSummary) {
  if (
    summary.steps.some((step) =>
      /clarify|补充|关键信息|确认需要补充/i.test(`${step.id} ${step.label} ${step.detail ?? ''}`),
    )
  ) {
    if (summary.status === 'waiting') return '等待你补充信息';
    return summary.status === 'running' ? '正在确认需要补充的信息' : '已确认需要补充的信息';
  }
  if (summary.status === 'waiting') return '需要你确认后继续';
  if (summary.status === 'error') return '这一步没有完成';
  if (summary.steps.some((step) => classifyStepCategory(step) === 'social_match')) {
    return summary.status === 'running' ? '正在整理合适选项' : '已整理相关选项';
  }
  if (summary.steps.some((step) => classifyStepCategory(step) === 'life_graph')) {
    return summary.status === 'running' ? '正在结合上下文' : '已整理上下文';
  }
  return summary.status === 'running' ? '正在处理' : '已处理';
}

function meetLoopLabel(step: ProcessStep, index: number) {
  const text = `${step.id} ${step.label}`.toLowerCase();
  if (/invite|发起|邀约/.test(text))
    return step.label.includes('发起') ? step.label : `发起：${step.label}`;
  if (/reply|等待|回复/.test(text))
    return step.label.includes('等待') ? step.label : `等待回复：${step.label}`;
  if (/reschedule|改期/.test(text))
    return step.label.includes('改期') ? step.label : `改期：${step.label}`;
  if (/confirm|确认/.test(text))
    return step.label.includes('确认') ? step.label : `确认：${step.label}`;
  if (/review|评价/.test(text))
    return step.label.includes('评价') ? step.label : `评价：${step.label}`;
  if (/life|graph|回写/.test(text))
    return step.label.includes('回写') ? step.label : `回写画像：${step.label}`;
  const defaults = ['发起', '等待回复', '确认', '见面', '评价'];
  return `${defaults[index] ?? '下一步'}：${step.label}`;
}

function extractPendingConfirmations(data: unknown): PendingConfirmation[] {
  if (!isRecord(data) || !Array.isArray(data.pendingConfirmations)) return [];
  return data.pendingConfirmations.filter(isRecord).map((item) => ({
    id:
      typeof item.id === 'number' || typeof item.id === 'string' || item.id === null
        ? item.id
        : null,
    type: publicString(item.type) ?? undefined,
    actionType: publicString(item.actionType) ?? undefined,
    summary: publicDetail(item.summary) ?? '确认是否继续执行这一步',
    riskLevel: publicString(item.riskLevel) ?? undefined,
    expiresAt: publicString(item.expiresAt),
  }));
}

function extractResolvedApproval(data: unknown): ResolvedApproval | null {
  if (!isRecord(data) || !isRecord(data.resolvedApproval)) return null;
  const decision = publicString(data.resolvedApproval.decision);
  if (decision !== 'approved' && decision !== 'rejected') return null;
  const id = data.resolvedApproval.id;
  return {
    id: typeof id === 'number' || typeof id === 'string' || id === null ? id : null,
    decision,
    summary: publicDetail(data.resolvedApproval.summary),
  };
}

function checkpointIdFromData(data: unknown): number | string | null {
  if (!isRecord(data)) return null;
  const runtime = isRecord(data.runtime) ? data.runtime : null;
  const value = runtime?.checkpointId ?? data.checkpointId;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function targetStepIdFromSteps(steps: ProcessStep[], status: ProcessStatus): string | null {
  const target =
    status === 'error'
      ? [...steps].reverse().find((step) => step.status === 'error')
      : ([...steps]
          .reverse()
          .find((step) => step.status === 'complete' || step.status === 'waiting') ?? steps.at(-1));
  return target?.id?.trim() || null;
}

function approvalMetaLine(confirmation: PendingConfirmation) {
  const parts = [
    confirmation.riskLevel ? `风险级别：${confirmation.riskLevel}` : null,
    confirmation.actionType ? `动作：${approvalActionLabel(confirmation.actionType)}` : null,
    confirmation.expiresAt ? `有效期至：${confirmation.expiresAt}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '这一步会影响实际动作，需要你确认。';
}

function approvalActionLabel(actionType: string) {
  if (/connect/i.test(actionType)) return '连接候选人';
  if (/send|message/i.test(actionType)) return '发送消息';
  if (/activity|create|publish/i.test(actionType)) return '发起或发布活动';
  if (/privacy|profile|life|memory/i.test(actionType)) return '更新隐私或记忆';
  if (/pay|payment/i.test(actionType)) return '支付相关操作';
  return sanitizePublicText(actionType) ?? '需要确认的操作';
}

function normalizeStep(step: Record<string, unknown>, index: number): ProcessStep {
  const rawStatus = publicString(step.status);
  const status: ProcessStatus =
    rawStatus === 'running'
      ? 'running'
      : rawStatus === 'waiting'
        ? 'waiting'
        : rawStatus === 'error' || rawStatus === 'failed'
          ? 'error'
          : 'complete';
  return {
    id: publicString(step.id) ?? `step-${index}`,
    label: humanStepLabel(publicString(step.label), publicString(step.kind), status),
    detail: publicDetail(step.detail) ?? undefined,
    status,
    kind: publicString(step.kind) ?? undefined,
    processType: publicString(step.processType) ?? undefined,
    agentName: publicString(step.agentName) ?? undefined,
    metadata: isRecord(step.metadata) ? step.metadata : undefined,
    snapshot: normalizeStepSnapshot(step.snapshot),
  };
}

function collaborativeStepDisplayName(agentName: string): string {
  const normalized = agentName.toLowerCase();
  if (agentName.includes('画像')) return '画像助手';
  if (agentName.includes('匹配')) return '匹配助手';
  if (agentName.includes('约见') || agentName.includes('约练')) return '约见助手';
  if (agentName.includes('安全')) return '安全确认';
  if (agentName.includes('计算')) return '结果整理';
  if (normalized.includes('life') || normalized.includes('graph')) return '画像助手';
  if (normalized.includes('social') || normalized.includes('match')) return '匹配助手';
  if (normalized.includes('meet') || normalized.includes('loop')) return '约见助手';
  if (normalized.includes('math')) return '结果整理';
  return '整理结果';
}

function normalizeStepSnapshot(value: unknown): ProcessStepSnapshot | undefined {
  if (!isRecord(value) || value.schemaVersion !== 'fitmeet.step-snapshot.v1') return undefined;
  const observation = Array.isArray(value.observation)
    ? value.observation
        .map((item) => publicDetail(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, 6)
    : [];
  const critique = publicDetail(value.critique);
  const result = publicDetail(value.result);
  if (observation.length === 0 && !critique && !result) return undefined;
  return {
    schemaVersion: 'fitmeet.step-snapshot.v1',
    observation,
    critique,
    result,
  };
}

function resultLinesForData(
  record: Record<string, unknown>,
  pendingConfirmations: unknown[],
  steps: ProcessStep[],
) {
  const explicit = publicDetail(record.summary);
  if (explicit) return [explicit];
  if (pendingConfirmations.length > 0) {
    return ['这一步会影响实际动作，我会等你确认后再继续。'];
  }
  const lastError = [...steps].reverse().find((step) => step.status === 'error');
  if (lastError) {
    return [lastError.detail ?? '这一步没有完成，我可以重新尝试或换一种方式处理。'];
  }
  const completed = steps.filter((step) => step.status === 'complete');
  if (completed.length > 0) {
    return [`已完成 ${completed.length} 个步骤，结果会继续合并到回复里。`];
  }
  const running = steps.find((step) => step.status === 'running');
  if (running) return ['正在处理，我会把有用结果整理成自然回复。'];
  return ['已整理为可读结果。'];
}

function summarizeUnknownResult(part: ToolCallMessagePartProps) {
  const maybeResult = (part as { result?: unknown }).result;
  const line = publicDetail(maybeResult);
  return line ? [line] : [];
}

function statusIcon(status: ProcessStatus) {
  if (status === 'running') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  }
  if (status === 'waiting') {
    return <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (status === 'error') {
    return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
}

function statusText(status: ProcessStatus) {
  if (status === 'running') return '进行中';
  if (status === 'waiting') return '等待确认';
  if (status === 'error') return '需要重试';
  return '已完成';
}

function stepKindLabel(kind: string) {
  const normalized = kind.toLowerCase();
  if (/tool|call|action/.test(normalized)) return '处理';
  if (/observe|result|observation/.test(normalized)) return '观察';
  if (/approval|confirm|interrupt/.test(normalized)) return '中断';
  if (/status|phase|step/.test(normalized)) return '状态';
  return '步骤';
}

function resumeModeLabel(mode: NonNullable<ResumeContext['mode']>) {
  if (mode === 'retry') return '重试当前步骤';
  if (mode === 'replay') return '重新运行这一步';
  if (mode === 'fork') return '生成新版本';
  return '确认后继续';
}

function interruptKindLabel(kind: string) {
  const normalized = kind.toLowerCase();
  if (/approval|confirm|human/.test(normalized)) return '人工确认';
  if (/safety|risk/.test(normalized)) return '安全检查';
  if (/missing|clarify|input/.test(normalized)) return '需要补充信息';
  return '可恢复中断';
}

function resumeModeFromUnknown(value: unknown): ResumeContext['mode'] {
  if (value === 'retry' || value === 'replay' || value === 'fork' || value === 'resume') {
    return value;
  }
  return null;
}

function humanStepLabel(label: string | null, kind: string | null, status: ProcessStatus) {
  const safeLabel = label ? sanitizePublicText(label) : null;
  if (safeLabel) return safeLabel;
  if (status === 'waiting') return '等待你确认下一步';
  if (status === 'error') return '处理时遇到问题';
  if (kind === 'tool') return '正在整理相关信息';
  if (kind === 'status') return '正在确认当前状态';
  return '正在思考下一步';
}

function humanToolName(name: string) {
  if (!name) return '正在处理';
  if (/approval|safety/i.test(name)) return '需要你确认这一步';
  if (/search|match|candidate|social/i.test(name)) return '正在整理合适的信息';
  if (/profile|life|graph|memory/i.test(name)) return '正在整理上下文';
  if (/meet|invite|schedule/i.test(name)) return '正在整理约定步骤';
  return '正在处理这一步';
}

function publicDetail(value: unknown) {
  if (typeof value === 'string') return sanitizePublicText(value);
  if (isRecord(value)) {
    const keys = ['title', 'message', 'summary', 'detail', 'status'];
    for (const key of keys) {
      const candidate = publicString(value[key]);
      const sanitized = candidate ? sanitizePublicText(candidate) : null;
      if (sanitized) return sanitized;
    }
  }
  return null;
}

function publicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function publicNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeImageSrc(value: string | null) {
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

function sanitizePublicText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || isInternalDebugText(trimmed)) return null;
  const withoutForbidden = trimmed
    .replace(/\bLife\s+Graph\s+Agent\b/gi, '画像助手')
    .replace(/\bSocial\s+Match\s+Agent\b/gi, '匹配助手')
    .replace(/\bMeet\s+Loop\s+Agent\b/gi, '约见助手')
    .replace(/\bSafety\s+Agent\b/gi, '安全确认')
    .replace(/\bsubagent(s)?\b/gi, '协作步骤')
    .replace(/\btool[_\s-]?call(s)?\b/gi, '处理步骤')
    .replace(/\btool[_\s-]?result(s)?\b/gi, '处理结果')
    .replace(/\btrace[Ii]d\b/g, '')
    .replace(/\bagent[Tt]race\b/g, '')
    .replace(/\bplan(n)?er\b/gi, '下一步')
    .replace(/\bcheckpoint\b/gi, '保存进度')
    .replace(/\breplay\b/gi, '重新运行')
    .replace(/\bfork\b/gi, '新版本')
    .replace(/\braw\s+JSON\b/gi, '')
    .replace(/\bJSON\b/g, '数据')
    .replace(new RegExp('\\bst' + 'ack\\b', 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutForbidden || isInternalDebugText(withoutForbidden)) return null;
  return withoutForbidden.length > 120
    ? `${withoutForbidden.slice(0, 118).trim()}…`
    : withoutForbidden;
}

function isInternalDebugText(value: string) {
  const normalized = value.toLowerCase();
  const technicalMatches = [
    /\btraceid\b/,
    /\bagenttrace\b/,
    /\bplanner\b/,
    /\btool[_\s-]?calls?\b/,
    /\btool[_\s-]?results?\b/,
    /\braw\s+json\b/,
    /\brawjson\b/,
    /\bstructuredintent\b/,
    /\bcheckpoint\b/,
    /\breplay\b/,
    /\bfork\b/,
    /\bdebug\b/,
    /\binternal\b/,
    /\bruntime\b/,
    new RegExp('\\bst' + 'ack\\b'),
    /\bhidden[-_\w]*\b/,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (technicalMatches >= 2) return true;
  return (
    technicalMatches >= 1 &&
    !/[\u4e00-\u9fff]/.test(value) &&
    /\b(should|become|public|complete|ready|failed|pending|runtime|metadata)\b/.test(normalized)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
