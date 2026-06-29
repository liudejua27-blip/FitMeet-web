import type { ToolUISchemaAction } from './tool-ui-schema';

export type ToolUICardActionCopy = {
  busy: string;
  done: string;
  result: string;
};

export const TOOL_UI_SCHEMA_ACTIONS = [
  'candidate.view_detail',
  'candidate.like',
  'candidate.skip',
  'candidate.feedback.good_fit',
  'candidate.feedback.bad_fit',
  'candidate.feedback.too_far',
  'candidate.feedback.time_mismatch',
  'candidate.feedback.style_mismatch',
  'candidate.connect',
  'matching.relax_distance',
  'matching.relax_time',
  'matching.relax_tags',
  'candidate.generate_opener',
  'candidate.more_like_this',
  'opener.confirm_send',
  'opener.regenerate',
  'opener.reject',
  'activity.view_detail',
  'publish_to_discover',
  'social_intent.decline_publish',
  'social_intent.dismiss',
  'social_intent.retry_publish',
  'activity.confirm_create',
  'activity.modify_time',
  'activity.modify_location',
  'activity.skip_publish',
  'activity.check_in',
  'activity.complete',
  'activity.upload_proof',
  'review.submit',
  'life_graph.accept_update',
  'life_graph.reject_update',
  'meet_loop.resume',
  'meet_loop.reschedule',
  'safety.approve',
  'safety.reject',
  'slot_completion.use_default_safety',
  'slot_completion.custom_safety',
  'slot_completion.cancel',
  'loop_choice.workout',
  'loop_choice.friend',
  'loop_choice.travel',
  'clarification.yes',
  'clarification.no',
  'workout_intake.submit',
  'workout_intake.use_defaults',
  'workout_intake.cancel',
  'workout_draft.publish',
  'workout_draft.private_match',
  'workout_draft.edit',
  'workout_draft.cancel',
  'public_intent_application.accept',
  'public_intent_application.reject',
  'public_intent_application.view_profile',
  'public_intent_application.open_conversation',
] as const satisfies readonly ToolUISchemaAction[];

export const TOOL_UI_CARD_ACTION_COPY: Record<ToolUISchemaAction, ToolUICardActionCopy> = {
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
  'candidate.feedback.good_fit': {
    busy: '正在记录反馈',
    done: '已记录合适',
    result: '已记录“合适”，后续候选质量会参考这个信号。',
  },
  'candidate.feedback.bad_fit': {
    busy: '正在记录反馈',
    done: '已记录不合适',
    result: '已记录“不合适”，后续会减少类似候选。',
  },
  'candidate.feedback.too_far': {
    busy: '正在记录反馈',
    done: '已记录太远',
    result: '已记录“太远”，后续会优先收紧地点范围。',
  },
  'candidate.feedback.time_mismatch': {
    busy: '正在记录反馈',
    done: '已记录时间不对',
    result: '已记录“时间不对”，后续会更重视时间匹配。',
  },
  'candidate.feedback.style_mismatch': {
    busy: '正在记录反馈',
    done: '已记录风格不对',
    result: '已记录“风格不对”，后续会调整互动风格偏好。',
  },
  'candidate.connect': {
    busy: '正在准备邀请',
    done: '已准备邀请',
    result: '已准备好友申请，确认前不会触达对方。',
  },
  'matching.relax_distance': {
    busy: '正在扩大距离重新匹配',
    done: '已扩大距离',
    result: '已扩大距离并重新开始匹配，我会继续等待结果。',
  },
  'matching.relax_time': {
    busy: '正在放宽时间重新匹配',
    done: '已放宽时间',
    result: '已放宽时间并重新开始匹配，我会继续等待结果。',
  },
  'matching.relax_tags': {
    busy: '正在减少偏好限制',
    done: '已减少偏好限制',
    result: '已减少非核心偏好限制并重新开始匹配。',
  },
  'candidate.generate_opener': {
    busy: '正在生成开场白',
    done: '已生成开场白',
    result: '开场白草稿已准备好，不会自动发送给对方。',
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
    result: '已重新生成开场白草稿，不会自动发送给对方。',
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
  publish_to_discover: {
    busy: '正在发布',
    done: '已发布',
    result: '已发布到发现页，公开可发现用户可以看到这张约练卡。',
  },
  'activity.confirm_create': {
    busy: '正在准备发布',
    done: '已准备发布',
    result: '已准备发布到发现，确认前不会公开。',
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
  'activity.skip_publish': {
    busy: '正在取消发布',
    done: '已取消发布',
    result: '已取消发布，不会出现在发现页，也不会继续匹配。',
  },
  'social_intent.decline_publish': {
    busy: '正在取消发布',
    done: '已取消发布',
    result: '已取消发布，不会出现在发现页，也不会继续匹配。',
  },
  'social_intent.dismiss': {
    busy: '正在隐藏卡片',
    done: '已隐藏卡片',
    result: '已隐藏这张约练卡，不会出现在发现页，也不会继续匹配。',
  },
  'social_intent.retry_publish': {
    busy: '正在重试发布',
    done: '已重试',
    result: '已重新尝试发布约练卡。',
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
    result: '已确认这次资料更新，后续会按你的边界使用。',
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
    result: '已确认安全边界，后续执行会保留确认记录。',
  },
  'safety.reject': {
    busy: '正在取消',
    done: '已取消',
    result: '已取消，不会继续执行相关高风险动作。',
  },
  'slot_completion.use_default_safety': {
    busy: '正在补齐安全设置',
    done: '已补齐安全设置',
    result: '已按默认安全设置继续生成约练卡。',
  },
  'slot_completion.custom_safety': {
    busy: '正在准备自定义边界',
    done: '请补充边界',
    result: '请直接输入你的安全边界，我会继续生成约练卡。',
  },
  'slot_completion.cancel': {
    busy: '正在取消',
    done: '已取消',
    result: '已取消这次约练卡草稿，不会发布到发现页。',
  },
  'loop_choice.workout': {
    busy: '正在进入约练闭环',
    done: '已进入约练闭环',
    result: '已进入约练闭环，我会帮你整理本次约练卡。',
  },
  'loop_choice.friend': {
    busy: '正在记录选择',
    done: '已记录选择',
    result: '交友闭环即将支持。当前可以先使用约练闭环。',
  },
  'loop_choice.travel': {
    busy: '正在记录选择',
    done: '已记录选择',
    result: '旅游闭环即将支持。当前可以先使用约练闭环。',
  },
  'clarification.yes': {
    busy: '正在确认',
    done: '已确认',
    result: '已按这个理解继续生成约练卡。',
  },
  'clarification.no': {
    busy: '正在切换填写',
    done: '已切换',
    result: '已切换为手动填写约练需求。',
  },
  'workout_intake.submit': {
    busy: '正在生成约练卡',
    done: '已生成约练卡',
    result: '已根据本次填写生成约练卡，确认前不会公开。',
  },
  'workout_intake.use_defaults': {
    busy: '正在套用默认安全设置',
    done: '已套用默认设置',
    result: '已使用默认安全设置继续生成约练卡。',
  },
  'workout_intake.cancel': {
    busy: '正在取消',
    done: '已取消',
    result: '已取消本次约练卡，不会发布或匹配。',
  },
  'workout_draft.publish': {
    busy: '正在发布',
    done: '已发布',
    result: '已发布到发现页，并进入约练匹配队列。',
  },
  'workout_draft.private_match': {
    busy: '正在保存草稿',
    done: '已保存草稿',
    result: '已保存为不公开约练卡，不会出现在发现页。',
  },
  'workout_draft.edit': {
    busy: '正在打开修改',
    done: '已打开修改',
    result: '可以继续修改本次约练需求。',
  },
  'workout_draft.cancel': {
    busy: '正在取消',
    done: '已取消',
    result: '已取消这次约练卡，不会发布或匹配。',
  },
  'public_intent_application.accept': {
    busy: '正在接受报名',
    done: '已接受',
    result: '已接受报名并准备站内会话，后续可以到消息页继续。',
  },
  'public_intent_application.reject': {
    busy: '正在拒绝报名',
    done: '已拒绝',
    result: '已拒绝这条报名申请，不会创建会话或约练参与关系。',
  },
  'public_intent_application.view_profile': {
    busy: '正在打开资料',
    done: '已打开资料',
    result: '已打开对方资料，接受前不会自动触达对方。',
  },
  'public_intent_application.open_conversation': {
    busy: '正在打开消息页',
    done: '已打开消息页',
    result: '已打开消息页，可以继续确认约练细节。',
  },
};
