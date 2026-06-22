export type SocialCodexProcessState = 'running' | 'done' | 'waiting' | 'failed' | 'completed';

export type SocialCodexStageCopy = {
  running: string;
  done: string;
  waiting?: string;
  failed?: string;
  label: string;
  detail?: string;
};

export const SOCIAL_CODEX_STAGE_COPY: Record<string, SocialCodexStageCopy> = {
  detect_social_intent: {
    running: '正在理解你的需求',
    done: '已理解你的需求',
    label: '理解需求',
    detail: '会先判断这是普通聊天，还是需要进入约练/社交流程。',
  },
  hydrate_context: {
    running: '正在读取你的偏好',
    done: '已读取你的偏好',
    label: '读取上下文',
    detail: '会结合最近对话、当前任务和已确认偏好。',
  },
  profile_gate: {
    running: '正在检查必要信息',
    done: '画像门槛已满足',
    waiting: '匹配前还差一点人物画像',
    label: '检查画像',
    detail: '普通聊天不会被阻塞，匹配、发布和邀请前才需要补齐。',
  },
  slot_filling: {
    running: '正在整理你的关键信息',
    done: '已记录你的关键信息',
    label: '补齐信息',
    detail: '已回答的时间、地点、活动和边界不会反复追问。',
  },
  create_opportunity_card: {
    running: '正在补齐约练卡',
    done: '这张约练卡可以发布到发现',
    label: '生成约练卡',
    detail: '会先整理成草稿，发布前仍需要你确认。',
  },
  publish_to_discover: {
    running: '正在准备同步到发现',
    done: '这张约练卡可以发布到发现',
    label: '发布到发现',
    detail: '发布前会检查可见内容和安全边界。',
  },
  search_candidates: {
    running: '正在筛选公开可发现的人',
    done: '已筛选公开可发现的人',
    label: '查找候选',
    detail: '只使用公开可发现的信息，联系对方前仍需要你确认。',
  },
  safety_filter: {
    running: '正在检查安全边界',
    done: '已检查安全边界',
    label: '安全检查',
    detail: '涉及位置、联系方式和陌生人连接时会继续征得确认。',
  },
  rank_candidates: {
    running: '正在整理合适机会',
    done: '已整理合适机会',
    label: '整理推荐',
    detail: '会优先解释为什么这些候选更合适。',
  },
  generate_opener: {
    running: '正在生成开场白',
    done: '已生成开场白',
    label: '生成开场白',
    detail: '发送前你可以修改语气和内容。',
  },
  approval: {
    running: '需要你确认后继续',
    done: '已处理你的确认',
    waiting: '需要你确认后继续',
    label: '等待确认',
    detail: '确认前不会执行真实发布、邀请或联系动作。',
  },
  send_invite: {
    running: '正在准备邀请',
    done: '邀请已准备好',
    label: '发送邀请',
    detail: '发送前会展示对方可见内容，并等待你确认。',
  },
  life_graph_writeback: {
    running: '正在整理画像变化建议',
    done: '已整理画像变化建议',
    label: '更新记忆',
    detail: '只沉淀稳定偏好，敏感信息会先征得确认。',
  },
};

export const SOCIAL_CODEX_INTERNAL_PROCESS_LABELS: Record<string, string> = {
  route_conversation_turn: '正在组织回复',
  route_profile_turn: SOCIAL_CODEX_STAGE_COPY.hydrate_context.running,
  route_search_turn: SOCIAL_CODEX_STAGE_COPY.search_candidates.running,
  route_action_turn: SOCIAL_CODEX_STAGE_COPY.approval.running,
  candidate_confirmation_check: '正在确认候选动作',
  hydrate_context: SOCIAL_CODEX_STAGE_COPY.hydrate_context.running,
  profile_gate: SOCIAL_CODEX_STAGE_COPY.profile_gate.running,
  slot_filling: SOCIAL_CODEX_STAGE_COPY.slot_filling.running,
  slot_filled: '已记住你刚补充的信息',
  slot_completed: SOCIAL_CODEX_STAGE_COPY.slot_filling.done,
  create_opportunity_card: SOCIAL_CODEX_STAGE_COPY.create_opportunity_card.running,
  publish_to_discover: SOCIAL_CODEX_STAGE_COPY.publish_to_discover.running,
  search_candidates: SOCIAL_CODEX_STAGE_COPY.search_candidates.running,
  candidate_search_started: SOCIAL_CODEX_STAGE_COPY.search_candidates.running,
  candidate_search_done: '已整理合适机会',
  safety_filter: SOCIAL_CODEX_STAGE_COPY.safety_filter.running,
  rank_candidates: SOCIAL_CODEX_STAGE_COPY.rank_candidates.running,
  generate_opener: SOCIAL_CODEX_STAGE_COPY.generate_opener.running,
  send_invite: SOCIAL_CODEX_STAGE_COPY.send_invite.running,
  life_graph_writeback: SOCIAL_CODEX_STAGE_COPY.life_graph_writeback.running,
  tool_call_started: '正在整理当前信息',
  tool_result_done: '已整理当前信息',
};

export function socialCodexStageTitle(
  stage: unknown,
  state: SocialCodexProcessState,
): string | null {
  const copy = stageCopy(stage);
  if (!copy) return null;
  if (state === 'failed') return copy.failed ?? '刚才连接不稳';
  if (state === 'waiting') return copy.waiting ?? copy.running;
  if (state === 'done' || state === 'completed') return copy.done;
  return copy.running;
}

export function socialCodexStageDetail(stage: unknown, state: SocialCodexProcessState) {
  const copy = stageCopy(stage);
  if (!copy) return null;
  if (state === 'failed') return '我保留了这段需求，你可以继续处理或重新发送。';
  return copy.detail ?? null;
}

export function socialCodexStageLabel(stage: unknown) {
  return stageCopy(stage)?.label ?? '处理进度';
}

export function socialCodexProcessLabelForInternalName(value: unknown) {
  if (typeof value !== 'string') return null;
  return SOCIAL_CODEX_INTERNAL_PROCESS_LABELS[value.trim().toLowerCase()] ?? null;
}

export function isGenericSocialCodexProcessTitle(value: unknown) {
  if (typeof value !== 'string') return false;
  return isGenericProcessText(value);
}

function isGenericProcessText(value: string) {
  const normalized = value.replace(/\s+/g, '');
  const tokenSets = [
    ['这一步', '处理', '完成'],
    ['已完成', '这一步'],
    ['处理', '完成'],
    ['已处理'],
    ['正在', '处理'],
    ['正在', '处理', '这一步'],
    ['正在', '推进', '当前', '进度'],
    ['正在', '处理', '当前', '步骤'],
    ['正在', '思考'],
    ['这次', '处理', '没有', '完成'],
    ['这一步', '没有', '完成'],
    ['这一步', '需要', '重试'],
    ['刚才', '连接', '不稳'],
    ['已完成'],
    ['完成'],
    ['处理中'],
    ['已整理', '结果'],
    ['已整理', '当前', '进度'],
    ['工具'],
    ['步骤'],
    ['调用'],
  ];
  return tokenSets.some((tokens) => tokens.every((token) => normalized.includes(token)));
}

export function isKnownSocialCodexStageTitle(value: unknown) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return Object.values(SOCIAL_CODEX_STAGE_COPY).some(
    (copy) =>
      normalized === copy.running ||
      normalized === copy.done ||
      normalized === copy.waiting ||
      normalized === copy.failed,
  );
}

function stageCopy(stage: unknown) {
  if (typeof stage !== 'string') return null;
  return SOCIAL_CODEX_STAGE_COPY[stage.trim().toLowerCase()] ?? null;
}
