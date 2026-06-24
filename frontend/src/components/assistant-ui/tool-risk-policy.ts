const LOW_RISK_ACTION_PATTERN =
  /^(candidate\.like|candidate\.save|candidate\.favorite|candidate\.bookmark|candidate\.generate_opener|candidate\.view_detail|candidate\.skip|candidate\.more_like_this|save_candidate|favorite_candidate|bookmark_candidate|collect_candidate|generate_opener|draft_opener|view_candidate|skip_candidate)$/i;

const DRAFT_ONLY_OPENER_PATTERN =
  /generate_opener|draft|开场白|草稿/;

const NON_SENDING_DRAFT_PATTERN =
  /不会(?:自动)?发送|不(?:会)?发送|未发送|只(?:会)?生成|仅(?:会)?生成|仅.*草稿|只.*草稿/;

const HIGH_RISK_SOCIAL_ACTION_PATTERN =
  /确认.*发送|发送邀请|私信|邀请|连接|加好友|好友|发布到发现|公开位置|联系方式|精确位置/;

const LOW_RISK_TEXT_PATTERN =
  /save|like|favorite|collect|bookmark|generate_opener|draft|收藏|喜欢|保存|开场白|草稿/;

const HIGH_RISK_TEXT_PATTERN =
  /send|message|invite|connect|friend|publish|contact|location|发送|私信|邀请|连接|好友|发布|联系|位置/;

export function isLowRiskApprovalActionType(value: string | null | undefined) {
  if (!value) return false;
  return LOW_RISK_ACTION_PATTERN.test(value.trim());
}

export function isDraftOnlyOpenerApprovalText(value: string | null | undefined) {
  const text = value?.trim().toLowerCase();
  if (!text) return false;
  return (
    DRAFT_ONLY_OPENER_PATTERN.test(text) &&
    NON_SENDING_DRAFT_PATTERN.test(text) &&
    !HIGH_RISK_SOCIAL_ACTION_PATTERN.test(text)
  );
}

export function isLowRiskApprovalText(value: string | null | undefined) {
  const text = value?.trim().toLowerCase();
  if (!text) return false;
  if (isDraftOnlyOpenerApprovalText(text)) return true;
  return LOW_RISK_TEXT_PATTERN.test(text) && !HIGH_RISK_TEXT_PATTERN.test(text);
}
