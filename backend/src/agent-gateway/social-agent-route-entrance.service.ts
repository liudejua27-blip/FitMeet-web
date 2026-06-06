import { BadRequestException, Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';

type EnterRouteTurnInput = {
  ownerUserId: number;
  body: SocialAgentRouteMessageBody;
};

type EnterRouteTurnResult = {
  startedAt: number;
  message: string;
  task: AgentTask;
  earlyResult: SocialAgentIntentRouteResult | null;
};

@Injectable()
export class SocialAgentRouteEntranceService {
  constructor(
    private readonly messageLog: SocialAgentMessageLogService,
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
    private readonly mainAgentTurn: SocialAgentMainAgentTurnService,
  ) {}

  async enter(input: EnterRouteTurnInput): Promise<EnterRouteTurnResult> {
    const startedAt = Date.now();
    const message = cleanDisplayText(input.body.message, '').trim();
    if (!message) throw new BadRequestException('请输入消息');

    let task = await this.taskLifecycle.ensureConversationTask(
      input.ownerUserId,
      this.number(input.body.taskId),
      message,
    );
    await this.messageLog.recordUserMessage(task, message);

    const mainAgentTurn = await this.mainAgentTurn.handleRouteTurn({
      ownerUserId: input.ownerUserId,
      task,
      message,
      hasCandidates: input.body.hasCandidates === true,
      startedAt,
    });

    task = mainAgentTurn.task;
    return {
      startedAt,
      message,
      task,
      earlyResult: mainAgentTurn.result,
    };
  }

  private number(value: unknown): number | null {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
}
