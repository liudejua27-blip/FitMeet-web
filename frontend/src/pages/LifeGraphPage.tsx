import clsx from 'clsx';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  lifeGraphApi,
  type LifeGraphAuditLog,
  type LifeGraphCompleteness,
  type LifeGraphField,
  type LifeGraphFieldCategory,
  type LifeGraphFieldSource,
  type LifeGraphMissingField,
  type LifeGraphProposal,
  type LifeGraphProposedField,
  type LifeGraphResponse,
} from '../api/lifeGraphApi';
import { WebsiteLayout } from '../components/website/WebsitePlatform';

type SectionKey =
  | 'identity'
  | 'social_intent'
  | 'lifestyle'
  | 'fitness_activity'
  | 'trust_safety'
  | 'interaction_memory';

type SectionConfig = {
  key: SectionKey;
  title: string;
  subtitle: string;
  category: LifeGraphFieldCategory;
  fields: FieldConfig[];
  matchImpact: string;
};

type FieldConfig = {
  key: string;
  label: string;
  hint: string;
  sensitive?: boolean;
  hiddenRaw?: boolean;
};

type EditingField = {
  category: LifeGraphFieldCategory;
  fieldKey: string;
  label: string;
  originalValue: unknown;
};

const sectionConfigs: SectionConfig[] = [
  {
    key: 'identity',
    title: 'Identity Graph',
    subtitle: 'Agent 用来理解你所在的城市、语言和常活动区域。',
    category: 'identity',
    matchImpact: '影响附近候选、语言和时区排序',
    fields: [
      { key: 'country', label: '国家/地区', hint: '用于全球化匹配与合规体验' },
      { key: 'region', label: '区域', hint: '帮助判断城市圈和跨区活动' },
      { key: 'city', label: '城市', hint: '附近机会和候选排序的基础' },
      { key: 'timezone', label: '时区', hint: '跨城市、跨国家匹配时使用' },
      { key: 'nearbyArea', label: '常活动区域', hint: '让 Agent 优先找真正方便见面的人' },
      { key: 'school', label: '学校/公司', hint: '可选，用于共同生活圈线索' },
      { key: 'preferredLanguage', label: '语言', hint: '决定 Agent 沟通与候选语言偏好' },
      { key: 'verifiedStatus', label: '实名状态', hint: '只展示可理解的认证摘要' },
    ],
  },
  {
    key: 'social_intent',
    title: 'Social Intent Graph',
    subtitle: '记录你现在想认识谁、怎么认识，以及哪些行为不接受。',
    category: 'social_intent',
    matchImpact: '影响候选类型、开场白和关系边界',
    fields: [
      { key: 'currentSocialGoal', label: '当前社交目标', hint: '例如跑步搭子、拍照搭子、周末活动' },
      { key: 'preferredPeople', label: '想认识的人', hint: 'Agent 会用它过滤明显不合适的候选' },
      { key: 'preferredSocialStyle', label: '社交方式偏好', hint: '例如先聊天后见面、低压力开场' },
      { key: 'unacceptableBehaviors', label: '不接受行为', hint: '用于风控提醒和推荐避让' },
      { key: 'relationshipGoal', label: '关系目标', hint: '区分搭子、朋友、教练、活动伙伴等' },
      { key: 'temporaryIntent', label: '临时需求', hint: '短期场景，过期后可撤回' },
    ],
  },
  {
    key: 'lifestyle',
    title: 'Lifestyle Graph',
    subtitle: '描述你的生活节奏、可约时间和活动半径。',
    category: 'lifestyle',
    matchImpact: '影响时间重叠、夜间安全和见面成本',
    fields: [
      { key: 'activeHours', label: '常活跃时间', hint: '决定 Agent 什么时候更适合推荐或发起沟通' },
      { key: 'availableTimes', label: '可约时间', hint: '候选时间重叠的核心信号' },
      { key: 'weekendAvailability', label: '周末可约时间', hint: '周末活动和约练排序会优先使用' },
      { key: 'activityRadius', label: '活动半径', hint: '避免推荐距离过远的候选' },
      { key: 'acceptsNightMeet', label: '是否接受夜间活动', hint: '影响夜间约见风险策略' },
      { key: 'routinePreference', label: '生活节奏', hint: '例如规律、弹性、早起或夜间活跃' },
    ],
  },
  {
    key: 'fitness_activity',
    title: 'Fitness Activity Graph',
    subtitle: '让运动和活动推荐从标签匹配升级到真实习惯匹配。',
    category: 'fitness_activity',
    matchImpact: '影响运动偏好、强度和公共场所边界',
    fields: [
      { key: 'sportsPreferences', label: '运动偏好', hint: '例如跑步、羽毛球、健身、徒步' },
      { key: 'exerciseFrequency', label: '运动频率', hint: '帮助避免强度不匹配' },
      { key: 'fitnessGoals', label: '健身目标', hint: '用于教练、约练和活动推荐' },
      { key: 'preferredIntensity', label: '运动强度', hint: '轻松、进阶或高强度' },
      { key: 'acceptsMixedGenderWorkout', label: '是否接受混合性别约练', hint: '尊重用户边界' },
      { key: 'publicPlaceOnly', label: '是否只接受公共场所', hint: '第一次见面安全策略会优先使用' },
    ],
  },
  {
    key: 'trust_safety',
    title: 'Trust Safety Graph',
    subtitle: '只展示你能理解的安全摘要，不展示黑箱风控细节。',
    category: 'trust_safety',
    matchImpact: '影响高风险动作确认、候选可信度和安全第一步',
    fields: [
      { key: 'realNameVerified', label: '实名认证状态', hint: '用于可信候选排序' },
      { key: 'activityCompletionRate', label: '活动履约摘要', hint: '只展示概括，不展示内部模型分数' },
      { key: 'requiresStrictConfirmation', label: '高风险动作确认设置', hint: '发消息、见面、定位等动作的确认边界' },
      { key: 'safetyReminder', label: '安全提醒', hint: 'Agent 会在需要时提醒公共场所与确认步骤' },
      { key: 'riskFlags', label: '安全状态摘要', hint: '隐藏具体风控细节', sensitive: true, hiddenRaw: true },
    ],
  },
  {
    key: 'interaction_memory',
    title: 'Interaction Memory Graph',
    subtitle: '记录你和 Agent 协作时形成的偏好记忆。',
    category: 'interaction_memory',
    matchImpact: '影响解释风格、开场白和推荐避让',
    fields: [
      { key: 'preferredAgentTone', label: 'Agent 语气偏好', hint: '例如直接、温和、简洁或更有陪伴感' },
      { key: 'rejectedCandidateReasons', label: '最近拒绝原因摘要', hint: '避免重复推荐你不喜欢的类型' },
      { key: 'openerStylePreference', label: '常用开场白风格', hint: '决定候选卡里的开场建议' },
      { key: 'lastSuccessfulMatchReasons', label: '成功匹配原因', hint: '复用有效的匹配信号' },
      { key: 'dislikedRecommendationPatterns', label: '不喜欢的推荐类型', hint: '用于长期避让' },
    ],
  },
];

const sourceLabels: Record<LifeGraphFieldSource, string> = {
  manual: '你手动填写',
  ai_inferred: 'AI 从对话中识别',
  activity_generated: '来自活动记录',
  device_authorized: '来自设备授权',
  system_generated: '系统生成',
  imported_from_social_profile: '从旧画像导入',
};

const actionLabels: Record<string, string> = {
  created: '创建了字段',
  updated: '更新了字段',
  confirmed: '确认了画像',
  revoked: '撤回了字段',
  rejected: '拒绝了推断',
  imported: '导入了旧画像',
  ai_proposed: 'AI 识别了更新',
  conflict_detected: '发现字段冲突',
};

const categoryLabels: Record<LifeGraphFieldCategory, string> = {
  identity: '身份画像',
  social_intent: '社交意图',
  lifestyle: '生活节奏',
  fitness_activity: '运动活动',
  trust_safety: '安全边界',
  interaction_memory: '交互记忆',
  privacy_boundary: '隐私边界',
};

export function LifeGraphPage() {
  const navigate = useNavigate();
  const auditRef = useRef<HTMLDivElement | null>(null);
  const [graph, setGraph] = useState<LifeGraphResponse | null>(null);
  const [completeness, setCompleteness] = useState<LifeGraphCompleteness | null>(null);
  const [auditLogs, setAuditLogs] = useState<LifeGraphAuditLog[]>([]);
  const [proposal, setProposal] = useState<LifeGraphProposal | null>(null);
  const [editing, setEditing] = useState<EditingField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const loadLifeGraph = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [graphResult, completenessResult, auditResult] = await Promise.allSettled([
        lifeGraphApi.getMe(),
        lifeGraphApi.getCompleteness(),
        lifeGraphApi.getAudit(),
      ]);

      if (graphResult.status === 'fulfilled') {
        setGraph(graphResult.value);
        setProposal(graphResult.value.pendingProposal ?? null);
      } else {
        throw graphResult.reason;
      }

      if (completenessResult.status === 'fulfilled') {
        setCompleteness(completenessResult.value);
      } else if (graphResult.status === 'fulfilled') {
        setCompleteness(graphResult.value.completeness);
      }

      if (auditResult.status === 'fulfilled') {
        setAuditLogs(auditResult.value);
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLifeGraph();
  }, [loadLifeGraph]);

  useEffect(() => {
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ eventType?: string }>).detail;
      if (
        detail?.eventType === 'life_graph:updated' ||
        detail?.eventType === 'life_graph:proposal_created' ||
        detail?.eventType === 'life_graph:field_revoked' ||
        detail?.eventType === 'life_graph:completeness_changed'
      ) {
        void loadLifeGraph();
      }
    };
    window.addEventListener('fitmeet:realtime', onRealtime);
    return () => window.removeEventListener('fitmeet:realtime', onRealtime);
  }, [loadLifeGraph]);

  const effectiveCompleteness = completeness ?? graph?.completeness ?? null;
  const fieldsById = useMemo(() => flattenFields(graph), [graph]);

  const beginEdit = (category: LifeGraphFieldCategory, fieldKey: string, label: string) => {
    const field = fieldsById.get(fieldId(category, fieldKey));
    setEditing({ category, fieldKey, label, originalValue: field?.fieldValue ?? '' });
    setDraftValue(formatFieldValue(field?.fieldValue ?? ''));
    setActionMessage('');
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;

    setBusyKey(fieldId(editing.category, editing.fieldKey));
    setActionMessage('');
    try {
      await lifeGraphApi.updateMe({
        fields: [
          {
            category: editing.category,
            fieldKey: editing.fieldKey,
            fieldValue: parseDraftValue(draftValue, editing.originalValue),
            confirmedByUser: true,
            reason: '用户在 Life Graph 页面手动编辑',
          },
        ],
      });
      setEditing(null);
      setDraftValue('');
      setActionMessage('已保存到你的 Life Graph。');
      await loadLifeGraph();
    } catch (saveError) {
      setActionMessage(friendlyError(saveError));
    } finally {
      setBusyKey('');
    }
  };

  const confirmExistingField = async (field: LifeGraphField) => {
    setBusyKey(fieldId(field.category, field.fieldKey));
    setActionMessage('');
    try {
      await lifeGraphApi.updateMe({
        fields: [
          {
            category: field.category,
            fieldKey: field.fieldKey,
            fieldValue: field.fieldValue,
            confirmedByUser: true,
            reason: '用户确认 AI 识别字段',
          },
        ],
      });
      setActionMessage('已确认这条画像。');
      await loadLifeGraph();
    } catch (confirmError) {
      setActionMessage(friendlyError(confirmError));
    } finally {
      setBusyKey('');
    }
  };

  const revokeField = async (field: LifeGraphField | { category: LifeGraphFieldCategory; fieldKey: string }) => {
    setBusyKey(fieldId(field.category, field.fieldKey));
    setActionMessage('');
    try {
      await lifeGraphApi.revokeField({
        category: field.category,
        fieldKey: field.fieldKey,
        reason: '用户在 Life Graph 页面撤回或关闭用于匹配',
      });
      setActionMessage('已撤回，这条信息不会继续用于匹配信号。');
      await loadLifeGraph();
    } catch (revokeError) {
      setActionMessage(friendlyError(revokeError));
    } finally {
      setBusyKey('');
    }
  };

  const confirmProposal = async (fieldIds?: string[]) => {
    if (!proposal) return;
    setBusyKey('proposal');
    setActionMessage('');
    try {
      const updated = await lifeGraphApi.confirmUpdate({ proposalId: proposal.proposalId, fieldIds });
      setProposal(updated.status === 'confirmed' ? null : updated);
      setActionMessage('已保存 Agent 识别的画像更新。');
      await loadLifeGraph();
    } catch (proposalError) {
      setActionMessage(friendlyError(proposalError));
    } finally {
      setBusyKey('');
    }
  };

  const rejectProposal = async (fieldIds?: string[]) => {
    if (!proposal) return;
    setBusyKey('proposal');
    setActionMessage('');
    try {
      const updated = await lifeGraphApi.rejectUpdate({
        proposalId: proposal.proposalId,
        fieldIds,
        reason: '用户在 Life Graph 页面选择不保存',
      });
      setProposal(updated.status === 'rejected' ? null : updated);
      setActionMessage('已忽略这次 AI 识别，不会写入正式画像。');
      await loadLifeGraph();
    } catch (proposalError) {
      setActionMessage(friendlyError(proposalError));
    } finally {
      setBusyKey('');
    }
  };

  const askAgentForMissingFields = (missingFields: LifeGraphMissingField[]) => {
    const labels = missingFields.slice(0, 3).map((field) => field.label).join('、');
    navigate('/social-agent', {
      state: {
        suggestedPrompt: labels
          ? `请追问我这几项 Life Graph 信息：${labels}。`
          : '请帮我完善 Life Graph。',
      },
    });
  };

  const scrollToAudit = () => {
    auditRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return <LifeGraphSkeleton />;
  }

  if (error && !graph) {
    return (
      <WebsiteLayout>
        <main className="platform-legacy-page min-h-screen bg-base px-4 py-8 text-cream sm:px-6">
        <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-sm font-black text-humanBright">Life Graph 暂时无法同步</p>
          <h1 className="mt-3 text-3xl font-black">我们没有展示技术错误，只把问题说清楚。</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-textMuted">{error}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-md bg-human px-4 py-2 text-sm font-black text-white" onClick={() => void loadLifeGraph()}>
              重新同步
            </button>
            <button className="rounded-md border border-white/10 px-4 py-2 text-sm font-black text-cream" onClick={() => navigate('/social-agent')}>
              让 Agent 帮我完善画像
            </button>
          </div>
        </div>
        </main>
      </WebsiteLayout>
    );
  }

  return (
    <WebsiteLayout>
      <main className="platform-legacy-page min-h-screen bg-base text-cream">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:py-8">
        <LifeGraphHeader
          graph={graph}
          completeness={effectiveCompleteness}
          onAskAgent={() => askAgentForMissingFields(effectiveCompleteness?.missingFields ?? [])}
          onManualEdit={() => {
            const firstMissing = effectiveCompleteness?.missingFields?.[0];
            if (firstMissing) beginEdit(firstMissing.category, firstMissing.fieldKey, firstMissing.label);
          }}
          onAudit={scrollToAudit}
        />

        {actionMessage ? (
          <div className="rounded-lg border border-human/30 bg-humanDim px-4 py-3 text-sm font-bold text-cream">
            {actionMessage}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
          <LifeGraphSummaryCard graph={graph} fields={fieldsById} completeness={effectiveCompleteness} />
          <LifeGraphCompletenessPanel
            completeness={effectiveCompleteness}
            onSelectSection={(category) => {
              const element = document.getElementById(`life-graph-section-${category}`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>

        <LifeGraphProposalCard
          proposal={proposal}
          busy={busyKey === 'proposal'}
          onConfirmAll={() => void confirmProposal()}
          onRejectAll={() => void rejectProposal()}
          onConfirmField={(fieldIdValue) => void confirmProposal([fieldIdValue])}
          onRejectField={(fieldIdValue) => void rejectProposal([fieldIdValue])}
        />

        <MissingFieldsPanel
          missingFields={effectiveCompleteness?.missingFields ?? []}
          onAskAgent={askAgentForMissingFields}
          onManualEdit={(field) => beginEdit(field.category, field.fieldKey, field.label)}
        />

        <div className="grid gap-5 xl:grid-cols-2">
          {sectionConfigs.map((section) => (
            <LifeGraphSectionCard
              key={section.key}
              section={section}
              fields={fieldsById}
              completeness={effectiveCompleteness?.modules?.[section.category] ?? 0}
              missingFields={effectiveCompleteness?.missingFields ?? []}
              editing={editing}
              draftValue={draftValue}
              busyKey={busyKey}
              onDraftChange={setDraftValue}
              onStartEdit={beginEdit}
              onCancelEdit={() => {
                setEditing(null);
                setDraftValue('');
              }}
              onSaveEdit={(event) => void saveEdit(event)}
              onConfirm={confirmExistingField}
              onRevoke={(field) => void revokeField(field)}
            />
          ))}
        </div>

        <div ref={auditRef}>
          <LifeGraphAuditTimeline logs={auditLogs} fields={fieldsById} onRefresh={() => void loadLifeGraph()} />
        </div>

        <PrivacyBoundaryNotice />
      </div>
      </main>
    </WebsiteLayout>
  );
}

export function LifeGraphHeader({
  graph,
  completeness,
  onAskAgent,
  onManualEdit,
  onAudit,
}: {
  graph: LifeGraphResponse | null;
  completeness: LifeGraphCompleteness | null;
  onAskAgent: () => void;
  onManualEdit: () => void;
  onAudit: () => void;
}) {
  const profile = graph?.profile;
  const score = Math.round(completeness?.completenessScore ?? profile?.completenessScore ?? 0);
  const place = [profile?.city, profile?.region].filter(Boolean).join(' / ') || '待补充城市区域';

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,106,0,0.18),rgba(34,211,238,0.08)_46%,rgba(255,255,255,0.04))] p-5 shadow-panel sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-humanBright">
            FitMeet Agent Memory
          </div>
          <h1 className="mt-4 text-4xl font-black leading-tight text-cream sm:text-5xl">Life Graph</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-textMuted sm:text-base">
            你的 AI 生活社交画像，决定 Agent 如何理解你、推荐谁、如何保护你的边界。
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <HeaderPill label="画像完整度" value={`${score}%`} strong />
            <HeaderPill label="当前目标" value={profile?.currentSocialGoal || '等待 Agent 追问'} />
            <HeaderPill label="城市/区域" value={place} />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <button className="rounded-md bg-human px-4 py-3 text-sm font-black text-white shadow-glow" onClick={onAskAgent}>
            让 Agent 帮我完善画像
          </button>
          <button className="rounded-md border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-black text-cream" onClick={onManualEdit}>
            手动编辑
          </button>
          <button className="rounded-md border border-white/12 bg-black/20 px-4 py-3 text-sm font-black text-textMuted" onClick={onAudit}>
            查看审计记录
          </button>
        </div>
      </div>
    </section>
  );
}

function HeaderPill({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <span className="shrink-0 text-textSofter">{label}</span>
      <span className={clsx('truncate font-black', strong ? 'text-humanBright' : 'text-cream')}>{value}</span>
    </span>
  );
}

export function LifeGraphSummaryCard({
  graph,
  fields,
  completeness,
}: {
  graph: LifeGraphResponse | null;
  fields: Map<string, LifeGraphField>;
  completeness: LifeGraphCompleteness | null;
}) {
  const summary = graph?.profile?.aiSummary || buildFallbackSummary(fields, completeness);
  const suitablePeople = [
    valueFor(fields, 'social_intent', 'preferredPeople'),
    valueFor(fields, 'social_intent', 'preferredSocialStyle'),
  ].filter(Boolean);
  const activityTypes = [
    valueFor(fields, 'fitness_activity', 'sportsPreferences'),
    valueFor(fields, 'social_intent', 'currentSocialGoal'),
  ].filter(Boolean);
  const safetyNotes = [
    valueFor(fields, 'fitness_activity', 'publicPlaceOnly') === 'true' ? '首次见面优先公共场所' : '',
    valueFor(fields, 'lifestyle', 'acceptsNightMeet') === 'false' ? '不推荐夜间约见' : '',
    valueFor(fields, 'trust_safety', 'requiresStrictConfirmation') === 'true' ? '关键动作需要确认' : '',
  ].filter(Boolean);
  const uncertain = (completeness?.missingFields ?? []).slice(0, 3).map((field) => field.label);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-aiCyan">AI Summary</p>
          <h2 className="mt-2 text-2xl font-black">Agent 当前理解</h2>
        </div>
        <span className="rounded-md border border-aiCyan/25 bg-aiCyan/10 px-3 py-1 text-xs font-black text-aiCyan">
          可解释
        </span>
      </div>
      <p className="mt-4 text-base leading-8 text-cream">{summary}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryMiniBlock title="适合匹配的人" items={suitablePeople} empty="等待补充想认识的人与社交方式" />
        <SummaryMiniBlock title="推荐活动类型" items={activityTypes} empty="等待补充运动偏好或当前目标" />
        <SummaryMiniBlock title="当前不确定项" items={uncertain} empty="关键画像已经比较清楚" />
        <SummaryMiniBlock title="安全边界摘要" items={safetyNotes} empty="尚未设置明确安全边界" />
      </div>
    </section>
  );
}

function SummaryMiniBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black text-textSofter">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={item} className="rounded-md bg-white/[0.07] px-2.5 py-1 text-xs font-bold text-cream">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm leading-6 text-textMuted">{empty}</span>
        )}
      </div>
    </div>
  );
}

export function LifeGraphCompletenessPanel({
  completeness,
  onSelectSection,
}: {
  completeness: LifeGraphCompleteness | null;
  onSelectSection: (category: LifeGraphFieldCategory) => void;
}) {
  const score = Math.round(completeness?.completenessScore ?? 0);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-humanBright">Completeness</p>
          <h2 className="mt-2 text-2xl font-black">画像完整度</h2>
        </div>
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-human/30 bg-humanDim text-2xl font-black text-humanBright">
          {score}%
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {sectionConfigs.map((section) => {
          const moduleScore = Math.round(completeness?.modules?.[section.category] ?? 0);
          const missingCount = (completeness?.missingFields ?? []).filter(
            (field) => field.category === section.category,
          ).length;
          return (
            <button
              key={section.key}
              className="w-full rounded-lg border border-white/10 bg-black/20 p-3 text-left transition hover:border-human/40 hover:bg-humanDim"
              onClick={() => onSelectSection(section.category)}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black text-cream">{categoryLabels[section.category]}</p>
                  <p className="mt-1 text-xs text-textMuted">
                    {missingCount ? `缺失 ${missingCount} 项，会影响匹配` : '关键字段已具备'}
                  </p>
                </div>
                <span className="text-sm font-black text-humanBright">{moduleScore}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-human" style={{ width: `${clampPercent(moduleScore)}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function LifeGraphSectionCard({
  section,
  fields,
  completeness,
  missingFields,
  editing,
  draftValue,
  busyKey,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onConfirm,
  onRevoke,
}: {
  section: SectionConfig;
  fields: Map<string, LifeGraphField>;
  completeness: number;
  missingFields: LifeGraphMissingField[];
  editing: EditingField | null;
  draftValue: string;
  busyKey: string;
  onDraftChange: (value: string) => void;
  onStartEdit: (category: LifeGraphFieldCategory, fieldKey: string, label: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (event: FormEvent<HTMLFormElement>) => void;
  onConfirm: (field: LifeGraphField) => void;
  onRevoke: (field: LifeGraphField | { category: LifeGraphFieldCategory; fieldKey: string }) => void;
}) {
  return (
    <section id={`life-graph-section-${section.category}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-textSofter">{section.title}</p>
          <h2 className="mt-2 text-xl font-black text-cream">{categoryLabels[section.category]}</h2>
          <p className="mt-2 text-sm leading-6 text-textMuted">{section.subtitle}</p>
        </div>
        <div className="min-w-[72px] text-right">
          <p className="text-lg font-black text-humanBright">{Math.round(completeness)}%</p>
          <p className="text-xs text-textSofter">完整度</p>
        </div>
      </div>
      <p className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-textMuted">
        {section.matchImpact}
      </p>
      <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
        {section.fields.map((fieldConfig) => {
          const field = fields.get(fieldId(section.category, fieldConfig.key));
          const missing = missingFields.some(
            (missingField) =>
              missingField.category === section.category && missingField.fieldKey === fieldConfig.key,
          );
          return (
            <LifeGraphFieldRow
              key={fieldConfig.key}
              category={section.category}
              config={fieldConfig}
              field={field}
              missing={missing}
              editing={editing}
              draftValue={draftValue}
              busy={busyKey === fieldId(section.category, fieldConfig.key)}
              onDraftChange={onDraftChange}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onConfirm={onConfirm}
              onRevoke={onRevoke}
            />
          );
        })}
      </div>
    </section>
  );
}

export function LifeGraphFieldRow({
  category,
  config,
  field,
  missing,
  editing,
  draftValue,
  busy,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onConfirm,
  onRevoke,
}: {
  category: LifeGraphFieldCategory;
  config: FieldConfig;
  field?: LifeGraphField;
  missing: boolean;
  editing: EditingField | null;
  draftValue: string;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onStartEdit: (category: LifeGraphFieldCategory, fieldKey: string, label: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (event: FormEvent<HTMLFormElement>) => void;
  onConfirm: (field: LifeGraphField) => void;
  onRevoke: (field: LifeGraphField | { category: LifeGraphFieldCategory; fieldKey: string }) => void;
}) {
  const isEditing = editing?.category === category && editing.fieldKey === config.key;
  const revoked = Boolean(field?.revoked);
  const displayValue = config.hiddenRaw ? safetySummary(field) : formatFieldValue(field?.fieldValue);
  const canConfirm = field && field.source === 'ai_inferred' && !field.confirmedByUser && !revoked;

  return (
    <div className={clsx('bg-black/10 p-4', revoked && 'opacity-65')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-cream">{config.label}</p>
            {missing ? <Badge tone="warn">缺失</Badge> : null}
            {revoked ? <Badge tone="muted">已撤回</Badge> : null}
            {field?.confirmedByUser ? <Badge tone="ok">已确认</Badge> : field ? <Badge tone="ai">待确认</Badge> : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-textSofter">{config.hint}</p>
          {isEditing ? (
            <form className="mt-3 flex flex-col gap-3 sm:flex-row" onSubmit={onSaveEdit}>
              <input
                className="min-h-11 flex-1 rounded-md border border-white/12 bg-base px-3 py-2 text-sm font-bold text-cream outline-none ring-human/30 focus:ring-2"
                value={draftValue}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={`补充${config.label}`}
              />
              <div className="flex gap-2">
                <button className="rounded-md bg-human px-3 py-2 text-sm font-black text-white" disabled={busy}>
                  {busy ? '保存中' : '保存'}
                </button>
                <button className="rounded-md border border-white/10 px-3 py-2 text-sm font-black text-textMuted" type="button" onClick={onCancelEdit}>
                  取消
                </button>
              </div>
            </form>
          ) : (
            <p className={clsx('mt-3 text-sm font-bold leading-6', field && !revoked ? 'text-cream' : 'text-textSofter')}>
              {field ? displayValue || '已记录，等待补充具体内容' : '尚未补充'}
            </p>
          )}
          {field ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-textSofter">
              <span>{sourceLabels[field.source]}</span>
              <span>置信度 {Math.round((field.confidence ?? 0) * 100)}%</span>
              <span>{field.editable ? '可编辑' : '受保护字段'}</span>
            </div>
          ) : null}
        </div>
        {!isEditing ? (
          <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
            <button
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-cream"
              onClick={() => onStartEdit(category, config.key, config.label)}
              disabled={busy || field?.editable === false}
            >
              编辑
            </button>
            {canConfirm ? (
              <button className="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-xs font-black text-mint" onClick={() => onConfirm(field)} disabled={busy}>
                确认
              </button>
            ) : null}
            {field && !revoked ? (
              <>
                {!field.confirmedByUser && field.source === 'ai_inferred' ? (
                  <button className="rounded-md border border-white/10 px-3 py-2 text-xs font-black text-textMuted" onClick={() => onRevoke(field)} disabled={busy}>
                    忽略
                  </button>
                ) : null}
                <button className="rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-black text-coral" onClick={() => onRevoke(field)} disabled={busy}>
                  撤回
                </button>
                <button className="rounded-md border border-white/10 px-3 py-2 text-xs font-black text-textMuted" onClick={() => onRevoke(field)} disabled={busy}>
                  关闭用于匹配
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MissingFieldsPanel({
  missingFields,
  onAskAgent,
  onManualEdit,
}: {
  missingFields: LifeGraphMissingField[];
  onAskAgent: (fields: LifeGraphMissingField[]) => void;
  onManualEdit: (field: LifeGraphMissingField) => void;
}) {
  const visible = missingFields.slice(0, 6);
  return (
    <section className="rounded-2xl border border-human/20 bg-humanDim p-5 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-humanBright">Missing Signals</p>
          <h2 className="mt-2 text-2xl font-black">这些信息会让匹配更准确</h2>
          <p className="mt-2 text-sm leading-6 text-textMuted">
            Agent 会优先追问真正影响候选排序、安全策略和开场方式的字段。
          </p>
        </div>
        <button className="rounded-md bg-human px-4 py-3 text-sm font-black text-white" onClick={() => onAskAgent(visible)}>
          让 Agent 追问这 {Math.min(visible.length || 3, 3)} 项
        </button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.length ? (
          visible.map((field) => (
            <div key={`${field.category}-${field.fieldKey}`} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-cream">{field.label}</p>
                  <p className="mt-2 text-sm leading-6 text-textMuted">{missingFieldReason(field)}</p>
                </div>
                <Badge tone={field.priority === 'high' ? 'warn' : 'muted'}>{priorityLabel(field.priority)}</Badge>
              </div>
              <button className="mt-4 rounded-md border border-white/10 px-3 py-2 text-xs font-black text-cream" onClick={() => onManualEdit(field)}>
                手动补充
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-6 text-textMuted md:col-span-2 xl:col-span-3">
            当前没有高优先级缺失项。你仍然可以让 Agent 继续优化语气、开场白和隐私边界。
          </div>
        )}
      </div>
    </section>
  );
}

export function LifeGraphProposalCard({
  proposal,
  busy,
  onConfirmAll,
  onRejectAll,
  onConfirmField,
  onRejectField,
}: {
  proposal: LifeGraphProposal | null;
  busy: boolean;
  onConfirmAll: () => void;
  onRejectAll: () => void;
  onConfirmField: (fieldId: string) => void;
  onRejectField: (fieldId: string) => void;
}) {
  if (!proposal || proposal.proposedFields.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-aiCyan">Pending Proposal</p>
            <h2 className="mt-2 text-xl font-black">暂无待确认画像更新</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-textMuted">
            当 Agent 从对话中识别到可保存的画像，会先在这里等待你确认。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-aiCyan/20 bg-aiCyan/10 p-5 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-aiCyan">Pending Proposal</p>
          <h2 className="mt-2 text-2xl font-black">Agent 从你的对话中识别到以下画像更新，是否保存？</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-textMuted">{proposal.aiSummary}</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-md bg-aiCyan px-4 py-2 text-sm font-black text-base" onClick={onConfirmAll} disabled={busy}>
            全部保存
          </button>
          <button className="rounded-md border border-white/10 px-4 py-2 text-sm font-black text-cream" onClick={onRejectAll} disabled={busy}>
            不保存
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {proposal.proposedFields.map((field) => (
          <ProposalField
            key={field.proposalFieldId}
            field={field}
            busy={busy}
            onConfirm={() => onConfirmField(field.proposalFieldId)}
            onReject={() => onRejectField(field.proposalFieldId)}
          />
        ))}
      </div>
    </section>
  );
}

function ProposalField({
  field,
  busy,
  onConfirm,
  onReject,
}: {
  field: LifeGraphProposedField;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-cream">
            {fieldLabel(field.category, field.fieldKey)}：{formatFieldValue(field.fieldValue)}
          </p>
          <p className="mt-2 text-sm leading-6 text-textMuted">{field.reason}</p>
        </div>
        {field.conflict ? <Badge tone="warn">冲突</Badge> : <Badge tone="ai">AI 识别</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-textSofter">
        <span>{categoryLabels[field.category]}</span>
        <span>置信度 {Math.round(field.confidence * 100)}%</span>
        {field.oldValue !== null ? <span>将从 {formatFieldValue(field.oldValue)} 更新</span> : null}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="rounded-md border border-mint/30 bg-mint/10 px-3 py-2 text-xs font-black text-mint" onClick={onConfirm} disabled={busy}>
          确认保存
        </button>
        <button className="rounded-md border border-white/10 px-3 py-2 text-xs font-black text-textMuted" onClick={onReject} disabled={busy}>
          忽略
        </button>
      </div>
    </div>
  );
}

export function LifeGraphAuditTimeline({
  logs,
  fields,
  onRefresh,
}: {
  logs: LifeGraphAuditLog[];
  fields: Map<string, LifeGraphField>;
  onRefresh: () => void;
}) {
  const visibleLogs = logs.slice(0, 8);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-textSofter">Audit Timeline</p>
          <h2 className="mt-2 text-2xl font-black">最近画像更新记录</h2>
        </div>
        <button className="rounded-md border border-white/10 px-3 py-2 text-xs font-black text-cream" onClick={onRefresh}>
          刷新
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {visibleLogs.length ? (
          visibleLogs.map((log) => {
            const field = fields.get(fieldId(log.category, log.fieldKey));
            return (
              <article key={log.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-cream">
                      {actionLabels[log.action] ?? '更新了画像'}：{fieldLabel(log.category, log.fieldKey)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-textMuted">
                      {auditSentence(log, field)}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-textSofter">{formatDateTime(log.createdAt)}</span>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-6 text-textMuted">
            暂无画像更新记录。你确认、撤回或编辑字段后，这里会出现可审计时间线。
          </div>
        )}
      </div>
    </section>
  );
}

export function PrivacyBoundaryNotice() {
  return (
    <section className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,106,0,0.08))] p-5">
      <p className="text-sm leading-7 text-textMuted">
        你可以随时编辑、撤回或关闭任何画像字段。FitMeet 不会在未经确认的情况下自动共享你的精确位置、联系方式、支付信息或健康数据。
      </p>
    </section>
  );
}

function LifeGraphSkeleton() {
  return (
    <WebsiteLayout>
      <main className="platform-legacy-page min-h-screen bg-base px-4 py-6 text-cream sm:px-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-72 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="h-72 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
          </div>
        </div>
      </main>
    </WebsiteLayout>
  );
}

function Badge({ children, tone }: { children: string; tone: 'ok' | 'warn' | 'ai' | 'muted' }) {
  return (
    <span
      className={clsx(
        'rounded-md px-2 py-0.5 text-xs font-black',
        tone === 'ok' && 'border border-mint/30 bg-mint/10 text-mint',
        tone === 'warn' && 'border border-human/30 bg-humanDim text-humanBright',
        tone === 'ai' && 'border border-aiCyan/30 bg-aiCyan/10 text-aiCyan',
        tone === 'muted' && 'border border-white/10 bg-white/[0.05] text-textSofter',
      )}
    >
      {children}
    </span>
  );
}

function flattenFields(graph: LifeGraphResponse | null): Map<string, LifeGraphField> {
  const map = new Map<string, LifeGraphField>();
  Object.values(graph?.fields ?? {}).forEach((fields) => {
    fields?.forEach((field) => map.set(fieldId(field.category, field.fieldKey), field));
  });
  return map;
}

function fieldId(category: LifeGraphFieldCategory, fieldKey: string) {
  return `${category}:${fieldKey}`;
}

function fieldLabel(category: LifeGraphFieldCategory, fieldKey: string) {
  return (
    sectionConfigs
      .find((section) => section.category === category)
      ?.fields.find((field) => field.key === fieldKey)?.label ?? fieldKey
  );
}

function valueFor(fields: Map<string, LifeGraphField>, category: LifeGraphFieldCategory, key: string) {
  const field = fields.get(fieldId(category, key));
  if (!field || field.revoked) return '';
  return formatFieldValue(field.fieldValue);
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(formatFieldValue).filter(Boolean).join('、');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${formatFieldValue(item)}`)
      .join('；');
  }
  return String(value);
}

function parseDraftValue(value: string, originalValue: unknown): unknown {
  const trimmed = value.trim();
  if (typeof originalValue === 'boolean') {
    return ['是', 'true', 'yes', '1', '接受'].includes(trimmed.toLowerCase());
  }
  if (Array.isArray(originalValue)) {
    return trimmed
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof originalValue === 'number') {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : originalValue;
  }
  if (/^(是|否|true|false)$/i.test(trimmed)) {
    return ['是', 'true'].includes(trimmed.toLowerCase());
  }
  return trimmed;
}

function safetySummary(field?: LifeGraphField) {
  if (!field || field.revoked) return '暂无需要展示的安全摘要';
  if (Array.isArray(field.fieldValue) && field.fieldValue.length > 0) return '已有安全提醒，具体风控细节不公开展示';
  if (field.fieldValue) return '安全提醒已启用，具体风控细节不公开展示';
  return '暂无需要展示的安全摘要';
}

function buildFallbackSummary(fields: Map<string, LifeGraphField>, completeness: LifeGraphCompleteness | null) {
  const city = valueFor(fields, 'identity', 'city') || valueFor(fields, 'identity', 'nearbyArea');
  const goal = valueFor(fields, 'social_intent', 'currentSocialGoal');
  const style = valueFor(fields, 'social_intent', 'preferredSocialStyle');
  const missing = completeness?.missingFields?.[0]?.label;
  return [
    city ? `你当前主要活动范围在${city}` : '你的城市和常活动区域还不完整',
    goal ? `主要社交目标是${goal}` : '当前社交目标仍待确认',
    style ? `更适合${style}的社交节奏` : 'Agent 还需要了解你的社交方式偏好',
    missing ? `其中 ${missing} 会明显影响下一次匹配置信度。` : '关键画像已经可以支持基础匹配。',
  ].join('，');
}

function missingFieldReason(field: LifeGraphMissingField) {
  const key = field.fieldKey;
  if (key === 'availableTimes' || key === 'weekendAvailability') return '这会影响候选人的时间重叠判断。';
  if (key === 'acceptsNightMeet') return '这会影响夜间约见是否高风险或不推荐。';
  if (key === 'publicPlaceOnly') return '这会影响第一次见面的安全步骤。';
  if (key === 'city' || key === 'nearbyArea') return '这会影响附近候选的距离和生活圈排序。';
  if (key === 'sportsPreferences') return '这会影响运动搭子和活动推荐的准确度。';
  if (key === 'preferredSocialStyle') return '这会影响 Agent 生成开场白和推进节奏。';
  return `这会影响${categoryLabels[field.category]}相关的匹配置信度。`;
}

function priorityLabel(priority: LifeGraphMissingField['priority']) {
  if (priority === 'high') return '强影响';
  if (priority === 'medium') return '中影响';
  return '轻影响';
}

function auditSentence(log: LifeGraphAuditLog, field?: LifeGraphField) {
  if (log.action === 'ai_proposed') return `Agent 识别了可能有用的信息，来源是${sourceLabels[log.source]}，等待用户确认。`;
  if (log.action === 'confirmed') return `用户确认了这项画像，之后可用于匹配和解释。`;
  if (log.action === 'revoked') return `用户撤回了这项画像，它不会继续作为匹配强信号。`;
  if (log.action === 'rejected') return `用户选择不保存这次 AI 推断。`;
  if (log.action === 'conflict_detected') return `AI 推断与已有字段不同，需要用户明确确认后才能覆盖。`;
  const value = formatFieldValue(log.newValue ?? field?.fieldValue);
  return value ? `当前记录为：${value}` : '这项画像发生了更新。';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function friendlyError(error: unknown) {
  if (error instanceof Error && error.message) {
    if (/^\s*[{[]/.test(error.message) || /stack|trace|exception/i.test(error.message)) {
      return 'Life Graph 暂时没有同步成功，请稍后重试。';
    }
    return error.message;
  }
  return 'Life Graph 暂时没有同步成功，请稍后重试。';
}
