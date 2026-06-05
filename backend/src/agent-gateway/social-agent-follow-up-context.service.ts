import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  cleanDisplayText,
  sanitizeForDisplay,
} from '../common/display-text.util';
import {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventActor,
  AgentTaskEventType,
} from './entities/agent-task.entity';
import { rememberSocialAgentShortTerm } from './social-agent-memory.util';
import type { SocialAgentFollowUpContext } from './social-agent-chat.types';

@Injectable()
export class SocialAgentFollowUpContextService {
  private readonly logger = new Logger(SocialAgentFollowUpContextService.name);

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @InjectRepository(AgentTaskEvent)
    private readonly eventRepo: Repository<AgentTaskEvent>,
  ) {}

  async appendFollowUpContext(
    task: AgentTask,
    userMessage: string,
  ): Promise<SocialAgentFollowUpContext> {
    const existing = this.readLatestFollowUpContext(task, userMessage);
    if (existing && this.isRecentIsoTime(existing.appendedAt, 10_000)) {
      return { ...existing, alreadyAppended: true };
    }

    const previousGoal = cleanDisplayText(task.goal, '');
    const refreshedGoal = this.composeFollowUpGoal(previousGoal, userMessage);
    const appendedAt = new Date().toISOString();
    const followUpRecord = {
      userMessage,
      previousGoal,
      refreshedGoal,
      appendedAt,
      receivedAt: appendedAt,
    };

    task.goal = refreshedGoal;
    task.result = {
      ...(task.result ?? {}),
      latestFollowUp: followUpRecord,
      followUps: this.appendRecordList(
        task.result?.followUps,
        followUpRecord,
        20,
      ),
    };
    const memory = this.isRecord(task.memory?.shortTerm)
      ? task.memory.shortTerm
      : {};
    rememberSocialAgentShortTerm(task, {
      latestUserFollowUp: userMessage,
      previousGoal,
      currentGoal: refreshedGoal,
      followUps: this.appendRecordList(memory.followUps, followUpRecord, 20),
    });
    await this.taskRepo.save(task);
    await this.writeEvent(
      task,
      AgentTaskEventType.SocialAgentContextAppended,
      '用户补充已写入当前任务上下文',
      { userMessage, previousGoal, refreshedGoal, appendedAt },
      AgentTaskEventActor.User,
    );

    return {
      task,
      userMessage,
      previousGoal,
      refreshedGoal,
      appendedAt,
      alreadyAppended: false,
    };
  }

  readLatestFollowUpContext(
    task: AgentTask,
    expectedMessage?: string,
  ): SocialAgentFollowUpContext | null {
    const latest = this.isRecord(task.result?.latestFollowUp)
      ? task.result.latestFollowUp
      : null;
    if (!latest) return null;
    const userMessage = cleanDisplayText(latest.userMessage, '').trim();
    if (!userMessage) return null;
    if (expectedMessage && userMessage !== expectedMessage) return null;
    const refreshedGoal = cleanDisplayText(latest.refreshedGoal, '').trim();
    if (!refreshedGoal) return null;
    return {
      task,
      userMessage,
      previousGoal: cleanDisplayText(latest.previousGoal, ''),
      refreshedGoal,
      appendedAt:
        cleanDisplayText(latest.appendedAt ?? latest.receivedAt, '') ||
        new Date().toISOString(),
      alreadyAppended: true,
    };
  }

  private async writeEvent(
    task: AgentTask,
    eventType: AgentTaskEventType,
    summary: string,
    payload: Record<string, unknown> = {},
    actor: AgentTaskEventActor = AgentTaskEventActor.Agent,
  ) {
    try {
      await this.eventRepo.save(
        this.eventRepo.create({
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          eventType,
          actor,
          summary: this.safeVarchar(summary, 500),
          payload: sanitizeForDisplay(payload) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'social_agent.follow_up_event_write_failed',
          taskId: task.id,
          eventType,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private appendRecordList(
    value: unknown,
    item: Record<string, unknown>,
    limit: number,
  ): Record<string, unknown>[] {
    const previous = Array.isArray(value)
      ? value.filter((entry) => this.isRecord(entry))
      : [];
    return [...previous, item].slice(-limit);
  }

  private isRecentIsoTime(value: string, maxAgeMs: number): boolean {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && Date.now() - timestamp <= maxAgeMs;
  }

  private composeFollowUpGoal(
    previousGoal: string,
    userMessage: string,
  ): string {
    const prior = cleanDisplayText(previousGoal, '').trim();
    const followUp = cleanDisplayText(userMessage, '').trim();
    if (!prior) return followUp;
    return [
      '当前社交需求如下。用户补充拥有最高优先级；如果补充里出现“改成、换成、不要、先、明天、城市、活动类型”等约束，请覆盖原需求中的冲突字段。',
      `原需求：${prior}`,
      `用户补充：${followUp}`,
    ].join('\n');
  }

  private safeVarchar(value: unknown, max = 80): string {
    const text = cleanDisplayText(value, '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1))}…`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
