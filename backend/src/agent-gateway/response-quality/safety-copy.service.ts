import { Injectable } from '@nestjs/common';

import type { FitMeetAgentSafety } from '../fitmeet-alpha-agent.types';
import { TonePolicyService } from './tone-policy.service';

@Injectable()
export class SafetyCopyService {
  constructor(private readonly tone: TonePolicyService) {}

  refusal(safety: FitMeetAgentSafety): string {
    const reason = safety.reasons
      .map((item) => this.tone.cleanUserText(item, ''))
      .filter(Boolean)[0];
    if (reason) {
      return `这个请求我不能继续帮你推进，因为它涉及${reason.replace(/风险$/, '')}风险。可以换成公开、尊重边界的社交需求，比如周末下午找同城运动搭子。`;
    }
    return '这个请求不适合继续推进。我可以帮你改成更安全、公开、尊重边界的社交方式。';
  }

  boundaryIntro(): string {
    return '我可以帮你筛选、解释和准备开场，但发消息、加好友、创建线下活动、共享位置或保存私密资料前，都需要你确认。';
  }

  boundaryNotes(safety?: FitMeetAgentSafety): string[] {
    const notes = safety?.boundaryNotes?.length
      ? safety.boundaryNotes
      : [
          '第一次见面建议选择白天、公开、人多、方便离开的地点。',
          '不会自动共享手机号、微信或精确位置。',
          '任何线下邀请都需要你确认后才会继续。',
        ];
    return notes
      .map((item) => this.tone.cleanUserText(item, ''))
      .filter(Boolean)
      .slice(0, 4);
  }

  activityBoundary(): string {
    return '建议选择公共场所，不共享精确位置；如果节奏不舒服，可以随时结束或改期。';
  }
}
