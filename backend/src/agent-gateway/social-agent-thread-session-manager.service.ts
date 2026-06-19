import { Injectable } from '@nestjs/common';

import { AgentTaskPermissionMode } from './entities/agent-task.entity';
import { SocialAgentTaskLifecycleService } from './social-agent-task-lifecycle.service';
import { inferSocialAgentThreadTitle } from './social-agent-thread-title.util';

@Injectable()
export class SocialAgentThreadSessionManager {
  constructor(
    private readonly taskLifecycle: SocialAgentTaskLifecycleService,
  ) {}

  async getOrCreateActiveThread(userId: number) {
    return this.taskLifecycle.ensureConversationTask(
      userId,
      null,
      '新对话',
      null,
      null,
    );
  }

  async createThreadOnlyWhenUserExplicitlyStartsNewChat(userId: number) {
    return this.taskLifecycle.createOrReuseTask({
      ownerUserId: userId,
      goal: '',
      permissionMode: AgentTaskPermissionMode.Confirm,
      idempotencyKey: `agent-thread:${userId}:${Date.now()}`,
    });
  }

  bindThreadToTask(threadId: string | number, taskId: number) {
    return { threadId: `agent-task:${taskId}`, taskId };
  }

  async resolveActiveThreadForMessage(input: {
    userId: number;
    taskId?: number | null;
    threadId?: string | number | null;
    message: string;
    idempotencyKey?: string | null;
  }) {
    return this.taskLifecycle.ensureConversationTask(
      input.userId,
      input.taskId ?? null,
      input.message,
      input.idempotencyKey ?? null,
      input.threadId ?? null,
    );
  }

  generateThreadTitleFromIntent(goal: string) {
    return inferSocialAgentThreadTitle({ goal, firstMessage: goal });
  }
}
