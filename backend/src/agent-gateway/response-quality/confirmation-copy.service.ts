import { Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../../common/display-text.util';

export type ConfirmationAction =
  | 'send_message'
  | 'connect_candidate'
  | 'create_activity'
  | 'share_location'
  | 'confirm_profile_update'
  | 'submit_review';

@Injectable()
export class ConfirmationCopyService {
  title(action: ConfirmationAction): string {
    switch (action) {
      case 'send_message':
        return '发送前请你确认';
      case 'connect_candidate':
        return '加好友前请你确认';
      case 'create_activity':
        return '创建约练前请你确认';
      case 'share_location':
        return '共享位置前请你确认';
      case 'confirm_profile_update':
        return '保存到 Life Graph 前请你确认';
      case 'submit_review':
        return '提交评价前请你确认';
    }
  }

  body(
    action: ConfirmationAction,
    input: Record<string, unknown> = {},
  ): string {
    const name = cleanDisplayText(input.displayName ?? input.nickname, '对方');
    const message = cleanDisplayText(
      input.message ?? input.suggestedOpener,
      '',
    );
    switch (action) {
      case 'send_message':
        return message
          ? `我已经准备好一条给 ${name} 的开场白。确认后才会发送：${message}`
          : `确认后我才会向 ${name} 发送第一条消息。`;
      case 'connect_candidate':
        return `确认后我才会向 ${name} 发起连接。建议先站内沟通，不急着交换联系方式。`;
      case 'create_activity':
        return '确认后我才会创建约练计划。计划会使用公共地点，不共享你的精确位置。';
      case 'share_location':
        return '位置属于敏感信息。确认前我不会发送精确位置，也不会持续共享实时定位。';
      case 'confirm_profile_update':
        return '这些信息会影响后续推荐。确认保存后，你仍然可以在 Life Graph 里查看、撤回或纠正。';
      case 'submit_review':
        return '评价会帮助我更新你的偏好和可信履约记录。确认后才会写入。';
    }
  }
}
