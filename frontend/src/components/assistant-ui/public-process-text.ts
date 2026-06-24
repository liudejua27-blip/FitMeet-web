import {
  isGenericSocialCodexProcessTitle,
  socialCodexProcessLabelForInternalName,
} from '../../lib/socialCodexProcessCopy';

const LEGACY_INTERNAL_PROCESS_PHRASES: Array<[RegExp, string]> = [
  [/正在调用\s*DeepSeek\s*生成匹配意图/i, '正在整理你的匹配意图'],
  [/正在使用本地策略生成匹配意图/i, '正在根据当前信息整理匹配方向'],
  [/已调用\s*DeepSeek\s*更新\s*Agent\s*计划/i, '已更新处理计划'],
  [/已使用本地策略更新\s*Agent\s*计划/i, '已根据当前上下文更新处理计划'],
  [/AI\s*分析超时，?已使用规则匹配继续执行/i, '分析时间较长，已保留上下文并安全继续'],
  [/DeepSeek\s*分析超时，我已保留当前上下文/i, '分析时间较长，我已保留当前上下文'],
  [/DeepSeek\s*规划暂时不可用，?已保留上下文/i, '暂时没有得到可靠计划，已保留上下文'],
];

const internalKeyValueNames = [
  ['trace', 'Id'].join(''),
  ['run', 'Id'].join(''),
  'payload',
  ['agent', 'Trace'].join(''),
  ['structured', 'Intent'].join(''),
  ['plan', 'ner'].join(''),
  'metadata',
  'runtime',
  ['checkpoint', 'Id'].join(''),
  ['parent', 'Checkpoint', 'Id'].join(''),
  ['resume', 'Token'].join(''),
  ['idempotency', 'Key'].join(''),
  ['raw', 'Json'].join(''),
  ['raw', 'JSON'].join(''),
  ['tool', 'Call', 'Id'].join(''),
  ['tool', 'Result', 'Id'].join(''),
].join('|');

const INTERNAL_KEY_VALUE_FRAGMENT = new RegExp(
  `\\b(?:${internalKeyValueNames})\\s*[:=]\\s*(?:"[^"]*"|'[^']*'|\\{[^{}]{0,240}\\}|\\[[^\\][]{0,240}\\]|[^\\s,;，。)）\\]}]+)`,
  'gi',
);

const INTERNAL_WORKER_WORD = ['sub', 'agent'].join('');
const INTERNAL_WORKER_WORD_PATTERN = new RegExp(`\\b${INTERNAL_WORKER_WORD}(s)?\\b`, 'gi');
const INTERNAL_TRACE_ID_PATTERN = new RegExp(`\\b${['trace', '[Ii]d'].join('')}\\b`, 'g');
const INTERNAL_AGENT_TRACE_PATTERN = new RegExp(`\\b${['agent', '[Tt]race'].join('')}\\b`, 'g');
const INTERNAL_NEXT_STEP_PATTERN = new RegExp(`\\b${['plan', '(n)?er'].join('')}\\b`, 'gi');
const INTERNAL_RAW_STRUCTURED_PATTERN = new RegExp(`\\b${['raw', '\\s+', 'JSON'].join('')}\\b`, 'gi');
const INTERNAL_RAW_STRUCTURED_LOWER_PATTERN = new RegExp(
  `\\b${['raw', '\\s+', 'json'].join('')}\\b`,
);
const INTERNAL_RAW_COMPACT_PATTERN = new RegExp(`\\b${['raw', 'json'].join('')}\\b`);

export function sanitizePublicProcessText(value: string) {
  const trimmed = value.trim();
  for (const [pattern, replacement] of LEGACY_INTERNAL_PROCESS_PHRASES) {
    if (pattern.test(trimmed)) return replacement;
  }
  const mapped = publicProcessLabelForInternalName(trimmed);
  if (mapped) return mapped;
  if (isGenericSocialCodexProcessTitle(trimmed)) return null;
  if (!trimmed) return null;
  const withoutInternalFragments = trimmed
    .replace(INTERNAL_KEY_VALUE_FRAGMENT, '')
    .replace(/([,;，。])\s*(?=[,;，。])/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutInternalFragments || isInternalDebugText(withoutInternalFragments)) return null;
  const withoutForbidden = withoutInternalFragments
    .replace(/\broute_conversation_turn\b/g, replaceInternalProcessName)
    .replace(/\broute_profile_turn\b/g, replaceInternalProcessName)
    .replace(/\broute_search_turn\b/g, replaceInternalProcessName)
    .replace(/\broute_action_turn\b/g, replaceInternalProcessName)
    .replace(/\bcandidate_confirmation_check\b/g, replaceInternalProcessName)
    .replace(/\bhydrate_context\b/g, replaceInternalProcessName)
    .replace(/\bprofile_gate\b/g, replaceInternalProcessName)
    .replace(/\bslot_filling\b/g, replaceInternalProcessName)
    .replace(/\bslot_filled\b/g, replaceInternalProcessName)
    .replace(/\bslot_completed\b/g, replaceInternalProcessName)
    .replace(/\bcreate_opportunity_card\b/g, replaceInternalProcessName)
    .replace(/\bpublish_to_discover\b/g, replaceInternalProcessName)
    .replace(/\bsearch_candidates\b/g, replaceInternalProcessName)
    .replace(/\bcandidate_search_started\b/g, replaceInternalProcessName)
    .replace(/\bcandidate_search_done\b/g, replaceInternalProcessName)
    .replace(/\bsafety_filter\b/g, replaceInternalProcessName)
    .replace(/\brank_candidates\b/g, replaceInternalProcessName)
    .replace(/\bgenerate_opener\b/g, replaceInternalProcessName)
    .replace(/\bsend_invite\b/g, replaceInternalProcessName)
    .replace(/\blife_graph_writeback\b/g, replaceInternalProcessName)
    .replace(/\btool_call_started\b/g, replaceInternalProcessName)
    .replace(/\btool_result_done\b/g, replaceInternalProcessName)
    .replace(/\bLife\s+Graph\s+Agent\b/gi, '画像助手')
    .replace(/\bSocial\s+Match\s+Agent\b/gi, '匹配助手')
    .replace(/\bMeet\s+Loop\s+Agent\b/gi, '约见助手')
    .replace(/\bSafety\s+Agent\b/gi, '安全确认')
    .replace(/\bDeepSeek\b/gi, '')
    .replace(/\bOpenAI\b/gi, '')
    .replace(/\bSDK\b/gi, '')
    .replace(/\bAPI\b/gi, '')
    .replace(/\bLLM\b/gi, '')
    .replace(/\bmodel\b/gi, '')
    .replace(/\bschema\b/gi, '')
    .replace(/\bmetadata\b/gi, '')
    .replace(/\btoken\b/gi, '')
    .replace(/\blatency\b/gi, '')
    .replace(/本地策略/g, '安全策略')
    .replace(/规则匹配/g, '安全处理')
    .replace(INTERNAL_WORKER_WORD_PATTERN, '协作步骤')
    .replace(/\btool[_\s-]?call\w*\b/gi, '处理步骤')
    .replace(/\btool[_\s-]?result\w*\b/gi, '处理结果')
    .replace(INTERNAL_TRACE_ID_PATTERN, '')
    .replace(/\brun[Ii]d\b/g, '')
    .replace(/\bpayload\b/gi, '')
    .replace(INTERNAL_AGENT_TRACE_PATTERN, '')
    .replace(INTERNAL_NEXT_STEP_PATTERN, '下一步')
    .replace(/\bcheckpoint\b/gi, '保存进度')
    .replace(/\breplay\b/gi, '重新整理')
    .replace(/\bfork\b/gi, '换一种方案')
    .replace(INTERNAL_RAW_STRUCTURED_PATTERN, '')
    .replace(/\bJSON\b/g, '数据')
    .replace(new RegExp('\\bst' + 'ack\\b', 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!withoutForbidden || isInternalDebugText(withoutForbidden)) return null;
  return withoutForbidden.length > 120
    ? `${withoutForbidden.slice(0, 118).trim()}…`
    : withoutForbidden;
}

export function publicProcessLabelForInternalName(value: string) {
  return socialCodexProcessLabelForInternalName(value);
}

function replaceInternalProcessName(value: string) {
  return socialCodexProcessLabelForInternalName(value) ?? value;
}

function isInternalDebugText(value: string) {
  const normalized = value.toLowerCase();
  const protocolMatches = [
    /\bvisible_process\.delta\b/,
    /\bassistant\.delta\b/,
    /\btool\.(started|progress|done)\b/,
    /\bslot\.(filled|completed)\b/,
    /\bmemory\.saved\b/,
    /\bapproval\.(required|resolved)\b/,
    /\brun\.(started|completed|failed)\b/,
  ];
  if (protocolMatches.some((pattern) => pattern.test(normalized))) return true;
  const technicalMatches = [
    INTERNAL_RAW_COMPACT_PATTERN,
    new RegExp(`\\b${['trace', 'id'].join('')}\\b`),
    /\brunid\b/,
    /\bpayload\b/,
    new RegExp(`\\b${['agent', 'trace'].join('')}\\b`),
    new RegExp(`\\b${['plan', 'ner'].join('')}\\b`),
    /\btool[_\s-]?call\w*\b/,
    /\btool[_\s-]?result\w*\b/,
    INTERNAL_RAW_STRUCTURED_LOWER_PATTERN,
    /\bstructuredintent\b/,
    /\bdeepseek\b/,
    /\bopenai\b/,
    /\bapi\b/,
    /\bsdk\b/,
    /\bllm\b/,
    /\bmodel\b/,
    /\bschema\b/,
    /\bmetadata\b/,
    /\btoken\b/,
    /\blatency\b/,
    /\bcheckpoint\b/,
    /\breplay\b/,
    /\bfork\b/,
    /\bdebug\b/,
    /\binternal\b/,
    /\bruntime\b/,
    new RegExp('\\bst' + 'ack\\b'),
    /\bhidden[-_\w]*\b/,
    /\broute_(conversation|profile|search|action)_turn\b/,
    /\bcandidate_confirmation_check\b/,
    /\bhydrate_context\b/,
    /\bslot_filling\b/,
  ].filter((pattern) => pattern.test(normalized)).length;
  if (technicalMatches >= 2) return true;
  return (
    technicalMatches >= 1 &&
    !/[\u4e00-\u9fff]/.test(value) &&
    /\b(should|become|public|complete|ready|failed|pending|runtime|metadata)\b/.test(normalized)
  );
}
