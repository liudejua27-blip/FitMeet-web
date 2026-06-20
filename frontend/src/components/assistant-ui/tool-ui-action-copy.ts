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
  'candidate.connect',
  'candidate.generate_opener',
  'candidate.more_like_this',
  'opener.confirm_send',
  'opener.regenerate',
  'opener.reject',
  'activity.view_detail',
  'activity.confirm_create',
  'activity.modify_time',
  'activity.modify_location',
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
