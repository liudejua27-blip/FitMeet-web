export function canonicalAgentApprovalActionType(
  actionType: string | null | undefined,
): string {
  const raw = (actionType ?? '').trim().toLowerCase();
  if (!raw) return '';

  if (
    raw === 'post_publish' ||
    raw === 'public_publish' ||
    raw === 'publish_activity' ||
    raw === 'publish_to_discover' ||
    raw === 'sync_to_hall' ||
    raw === 'create_post' ||
    raw === 'create_social_request'
  ) {
    return 'publish_social_request';
  }
  if (
    raw === 'send_candidate_message' ||
    raw === 'invite_candidate' ||
    raw === 'opener.confirm_send'
  ) {
    return 'send_invite';
  }
  if (
    raw === 'add_friend' ||
    raw === 'contact_request' ||
    raw === 'candidate.connect'
  ) {
    return 'connect_candidate';
  }
  if (raw === 'contact_exchange') return 'exchange_contact';
  if (
    raw === 'share_location' ||
    raw === 'precise_location' ||
    raw === 'share_precise_location'
  ) {
    return 'reveal_precise_location';
  }
  if (
    raw === 'life_graph.accept_update' ||
    raw === 'memory_write' ||
    raw === 'write_memory' ||
    raw === 'long_term_memory'
  ) {
    return 'life_graph_writeback';
  }
  if (raw === 'confirm_profile_update' || raw === 'profile_update') {
    return 'update_sensitive_profile';
  }
  if (raw === 'create_meet') return 'create_activity';
  return raw;
}

export function agentApprovalActionLabel(
  actionType: string | null | undefined,
): string {
  switch (canonicalAgentApprovalActionType(actionType)) {
    case 'publish_social_request':
      return '发布到发现';
    case 'send_invite':
      return '发送邀请';
    case 'send_message':
      return '发送消息';
    case 'connect_candidate':
      return '加好友并聊天';
    case 'exchange_contact':
      return '交换联系方式';
    case 'reveal_precise_location':
      return '公开精确位置';
    case 'update_sensitive_profile':
      return '更新私密偏好';
    case 'life_graph_writeback':
      return '记住这条偏好';
    case 'create_activity':
      return '发布约练';
    case 'join_activity':
      return '参与活动';
    case 'invite_activity':
      return '发送活动邀请';
    case 'offline_meeting':
      return '确认线下见面';
    case 'payment':
      return '支付相关操作';
    case 'submit_proof':
    case 'submit_completion_proof':
    case 'photo_upload':
      return '提交完成证明';
    default:
      return '需要确认的操作';
  }
}

export function agentApprovalEffectText(
  actionType: string | null | undefined,
): string {
  switch (canonicalAgentApprovalActionType(actionType)) {
    case 'publish_social_request':
      return '把约练卡公开到发现页，公开前会过滤联系方式、精确住址和私密资料字段。';
    case 'send_invite':
      return '把这条邀请发给对方，并推进这次约练状态。';
    case 'send_message':
      return '把这条消息发给对方，并留下可追溯的安全记录。';
    case 'connect_candidate':
      return '向对方发起好友/聊天请求，确认前不会触达对方。';
    case 'exchange_contact':
      return '交换联系方式；确认前不会展示手机号、微信或外部联系方式。';
    case 'reveal_precise_location':
      return '公开你确认过的位置范围；精确地点需要明确同意。';
    case 'update_sensitive_profile':
      return '更新你的私密偏好，并保留可撤回的确认记录。';
    case 'life_graph_writeback':
      return '把这条稳定偏好记住，用于后续匹配；你可以撤回或删除。';
    case 'create_activity':
      return '发布这次约练，并进入约练流程。';
    case 'join_activity':
    case 'invite_activity':
      return '推进活动参与或邀请状态。';
    case 'offline_meeting':
      return '确认线下见面安排，并留下安全记录。';
    case 'payment':
      return '进入支付相关确认流程，确认前不会扣款。';
    case 'submit_proof':
    case 'submit_completion_proof':
    case 'photo_upload':
      return '提交完成证明或图片材料。';
    default:
      return '确认后才会执行这次操作。';
  }
}

export function agentApprovalUserFacingText(
  value: string | null | undefined,
): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  return raw
    .replace(/确认连接候选人/g, '确认加好友并聊天')
    .replace(/连接候选人之前先确认/g, '加好友并聊天前需要你确认')
    .replace(/连接候选人前预览/g, '加好友并聊天前预览')
    .replace(/连接候选人/g, '加好友并聊天')
    .replace(/向候选人发送约练邀请/g, '向对方发送约练邀请')
    .replace(/候选人/g, '对方')
    .replace(/发送站内消息/g, '发送消息')
    .replace(/创建线下活动/g, '发布约练')
    .replace(/写入长期记忆/g, '记住这条偏好')
    .replace(/更新敏感画像/g, '更新私密偏好')
    .replace(/状态已保存/g, '我会等你确认')
    .replace(/进度已保存/g, '我会等你确认')
    .replace(/确认前不执行/g, '确认前不会执行')
    .replace(/等待保存点继续/g, '确认后继续')
    .replace(/等待保存点/g, '等待你确认')
    .replace(/保存点/g, '当前进度');
}
