import { BadRequestException, Injectable, Optional } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { SocialAgentMainAgentTurnService } from './social-agent-main-agent-turn.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';
import { WorkoutLoopService } from './workout-loop/workout-loop.service';

type EnterRouteTurnInput = {
  ownerUserId: number;
  body: SocialAgentRouteMessageBody;
  signal?: AbortSignal | null;
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
    @Optional()
    private readonly workoutLoop?: WorkoutLoopService,
  ) {}

  async enter(input: EnterRouteTurnInput): Promise<EnterRouteTurnResult> {
    const startedAt = Date.now();
    const message = cleanDisplayText(input.body.message, '').trim();
    if (!message) throw new BadRequestException('请输入消息');

    let task = await this.taskLifecycle.ensureConversationTask(
      input.ownerUserId,
      this.number(input.body.taskId),
      message,
      input.body.idempotencyKey ?? null,
      input.body.clientContext?.threadId ?? null,
    );
    await this.messageLog.recordUserMessage(task, message);

    const workoutLoop = await this.workoutLoop?.tryHandleEntrance({
      ownerUserId: input.ownerUserId,
      task,
      message,
    });
    if (workoutLoop) {
      return {
        startedAt,
        message,
        task: workoutLoop.task,
        earlyResult: workoutLoop.result,
      };
    }

    const mainAgentTurn = await this.mainAgentTurn.handleRouteTurn({
      ownerUserId: input.ownerUserId,
      task,
      message,
      hasCandidates: input.body.hasCandidates === true,
      startedAt,
      signal: input.signal,
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
    return parseSocialAgentThreadTaskId(value);
  }
}
