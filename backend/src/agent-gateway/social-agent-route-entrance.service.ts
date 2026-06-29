import { BadRequestException, Injectable } from '@nestjs/common';

import { cleanDisplayText } from '../common/display-text.util';
import type { AgentTask } from './entities/agent-task.entity';
import type {
  SocialAgentIntentRouteResult,
  SocialAgentRouteMessageBody,
} from './social-agent-chat.types';
import { AgentEntryOrchestratorService } from './agent-entry/agent-entry-orchestrator.service';
import { SocialAgentMessageLogService } from './social-agent-message-log.service';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';

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
    private readonly agentEntry: AgentEntryOrchestratorService,
  ) {}

  async enter(input: EnterRouteTurnInput): Promise<EnterRouteTurnResult> {
    const startedAt = Date.now();
    const message = cleanDisplayText(input.body.message, '').trim();
    if (!message) throw new BadRequestException('请输入消息');

    const task = await this.taskLifecycle.ensureConversationTask(
      input.ownerUserId,
      this.number(input.body.taskId),
      message,
      input.body.idempotencyKey ?? null,
      input.body.clientContext?.threadId ?? null,
    );
    await this.messageLog.recordUserMessage(task, message);

    const entry = await this.agentEntry.handle({
      ownerUserId: input.ownerUserId,
      task,
      body: input.body,
      message,
      startedAt,
      signal: input.signal,
    });

    return {
      startedAt,
      message,
      task: entry.task,
      earlyResult: entry.result,
    };
  }

  private number(value: unknown): number | null {
    return parseSocialAgentThreadTaskId(value);
  }
}
