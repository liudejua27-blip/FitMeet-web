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
      return '发送约练邀请';
    case 'send_message':
      return '发送站内消息';
    case 'connect_candidate':
      return '连接候选人';
    case 'exchange_contact':
      return '交换联系方式';
    case 'reveal_precise_location':
      return '公开精确位置';
    case 'update_sensitive_profile':
      return '更新敏感画像';
    case 'life_graph_writeback':
      return '写入长期记忆';
    case 'create_activity':
      return '创建线下活动';
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
      return '把约练卡公开到发现页，公开前会过滤联系方式、精确住址和敏感画像字段。';
    case 'send_invite':
      return '向候选人发送约练邀请，并推进候选人与任务状态。';
    case 'send_message':
      return '发送站内消息，并保留审计记录。';
    case 'connect_candidate':
      return '向候选人发起连接请求，确认前不会触达对方。';
    case 'exchange_contact':
      return '交换联系方式；确认前不会展示手机号、微信或外部联系方式。';
    case 'reveal_precise_location':
      return '公开你确认过的位置范围；精确地点需要明确同意。';
    case 'update_sensitive_profile':
      return '更新敏感画像字段，并写入可撤回的审计记录。';
    case 'life_graph_writeback':
      return '把稳定偏好写入 Life Graph，用于后续匹配；你可以撤回或删除。';
    case 'create_activity':
      return '创建线下活动，并进入活动/约练流程。';
    case 'join_activity':
    case 'invite_activity':
      return '推进活动参与或邀请状态。';
    case 'offline_meeting':
      return '确认线下见面安排，并保留安全审计。';
    case 'payment':
      return '进入支付相关确认流程，确认前不会扣款。';
    case 'submit_proof':
    case 'submit_completion_proof':
    case 'photo_upload':
      return '提交完成证明或图片材料。';
    default:
      return '确认后才会执行这一步。';
  }
}
