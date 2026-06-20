import { Injectable } from '@nestjs/common';

import type {
  SocialAgentEventV2,
  SocialAgentEventV2EnvelopeInput,
} from './social-agent-event-v2.types';
import { parseSocialAgentThreadTaskId } from './social-agent-thread-id.util';

@Injectable()
export class SocialAgentEventV2Service {
  private seqByRun = new Map<string, number>();

  envelope(input: SocialAgentEventV2EnvelopeInput): SocialAgentEventV2 {
    const runId = input.runId || this.runIdFor(input);
    const seq = (this.seqByRun.get(runId) ?? 0) + 1;
    this.seqByRun.set(runId, seq);
    const taskId =
      typeof input.taskId === 'number' && Number.isFinite(input.taskId)
        ? input.taskId
        : parseSocialAgentThreadTaskId(input.threadId);
    const threadId =
      taskId != null
        ? `agent-task:${taskId}`
        : input.threadId != null && `${input.threadId}`.trim()
          ? `${input.threadId}`.trim()
          : `user-${input.userId}`;
    const eventId = `${runId}:${seq}`;
    return {
      type: input.type,
      eventId,
      seq,
      createdAt: new Date().toISOString(),
      userId: String(input.userId),
      threadId,
      taskId,
      runId,
      ...(input.messageId ? { messageId: input.messageId } : {}),
      stage: input.stage,
      visibility: input.visibility ?? 'user_visible',
      ...(input.display ? { display: input.display } : {}),
      ...(input.payload ? { payload: input.payload } : {}),
    };
  }

  resetRun(runId: string | null | undefined): void {
    if (runId) this.seqByRun.delete(runId);
  }

  private runIdFor(input: SocialAgentEventV2EnvelopeInput): string {
    return [
      'social-codex',
      input.userId,
      input.threadId ?? input.taskId ?? 'new',
      Date.now(),
      Math.random().toString(36).slice(2, 8),
    ].join(':');
  }
}
