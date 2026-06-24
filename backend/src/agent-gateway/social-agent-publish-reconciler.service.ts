import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';

@Injectable()
export class SocialAgentPublishReconcilerService {
  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    @Optional()
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo?: Repository<PublicSocialIntent>,
  ) {}

  async reconcileTask(ownerUserId: number, taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task || task.ownerUserId !== ownerUserId) {
      throw new NotFoundException('Agent task not found');
    }
    const publicIntentId = this.publicIntentIdFromTask(task);
    if (!publicIntentId || !this.publicIntentRepo) {
      await this.markNeedsRepair(
        task,
        'publish_reconcile_missing_public_intent',
      );
      return {
        status: 'needs_repair',
        taskId,
        publicIntentId: publicIntentId ?? null,
      };
    }
    const intent = await this.publicIntentRepo.findOne({
      where: { id: publicIntentId },
    });
    if (!intent || intent.mode !== 'public') {
      await this.markNeedsRepair(task, 'publish_reconcile_readback_failed');
      return { status: 'needs_repair', taskId, publicIntentId };
    }
    task.statusReason = 'publish_reconcile_public_intent_visible';
    task.result = {
      ...(task.result ?? {}),
      publishReconcile: {
        status: 'visible',
        publicIntentId,
        checkedAt: new Date().toISOString(),
      },
    };
    await this.taskRepo.save(task);
    return { status: 'visible', taskId, publicIntentId };
  }

  private async markNeedsRepair(task: AgentTask, reason: string) {
    task.status = AgentTaskStatus.AwaitingConfirmation;
    task.statusReason = reason;
    task.result = {
      ...(task.result ?? {}),
      publishReconcile: {
        status: 'needs_repair',
        reason,
        checkedAt: new Date().toISOString(),
      },
    };
    await this.taskRepo.save(task);
  }

  private publicIntentIdFromTask(task: AgentTask): string | null {
    const result = this.record(task.result);
    const publish = this.record(result.publishSocialRequest);
    const chatRun = this.record(result.chatRun);
    const draft = this.record(result.activityDraft);
    return (
      this.text(publish.publicIntentId) ||
      this.text(chatRun.publicIntentId) ||
      this.text(draft.publicIntentId) ||
      null
    );
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string | null {
    const text =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value).trim()
          : '';
    return text || null;
  }
}
