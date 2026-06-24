import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentTask, AgentTaskStatus } from './entities/agent-task.entity';
import { SocialAgentPublishReconcilerService } from './social-agent-publish-reconciler.service';

type PublishReconcileCronSummary = {
  scanned: number;
  visible: number;
  needsRepair: number;
  failed: number;
};

@Injectable()
export class SocialAgentPublishReconcilerCronService {
  private readonly logger = new Logger(
    SocialAgentPublishReconcilerCronService.name,
  );
  private running = false;

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly reconciler: SocialAgentPublishReconcilerService,
  ) {}

  @Cron('*/2 * * * *')
  async reconcilePublishedTasksCron(): Promise<void> {
    if (process.env.FITMEET_PUBLISH_RECONCILER_ENABLED === '0') return;
    if (this.running) return;
    this.running = true;
    try {
      const summary = await this.reconcileDuePublishedTasks();
      if (summary.scanned > 0) {
        this.logger.log({
          event: 'social_agent.publish_reconciler.summary',
          ...summary,
        });
      }
    } catch (error) {
      this.logger.warn({
        event: 'social_agent.publish_reconciler.failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }

  async reconcileDuePublishedTasks(
    limit = 25,
  ): Promise<PublishReconcileCronSummary> {
    const tasks = await this.findDuePublishedTasks(limit);
    const summary: PublishReconcileCronSummary = {
      scanned: tasks.length,
      visible: 0,
      needsRepair: 0,
      failed: 0,
    };

    for (const task of tasks) {
      try {
        const result = await this.reconciler.reconcileTask(
          task.ownerUserId,
          task.id,
        );
        if (result.status === 'visible') summary.visible += 1;
        else summary.needsRepair += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn({
          event: 'social_agent.publish_reconciler.task_failed',
          taskId: task.id,
          ownerUserId: task.ownerUserId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  }

  private findDuePublishedTasks(limit: number): Promise<AgentTask[]> {
    const statuses = [
      AgentTaskStatus.Succeeded,
      AgentTaskStatus.WaitingResult,
      AgentTaskStatus.AwaitingConfirmation,
    ];
    return this.taskRepo
      .createQueryBuilder('task')
      .where('task.status IN (:...statuses)', { statuses })
      .andWhere(
        `COALESCE(
          task."result" #>> '{publishSocialRequest,publicIntentId}',
          task."result" #>> '{chatRun,publicIntentId}',
          task."result" #>> '{activityDraft,publicIntentId}',
          ''
        ) <> ''`,
      )
      .andWhere(
        `COALESCE(task."result" #>> '{publishReconcile,status}', '') <> 'visible'`,
      )
      .orderBy('task.updatedAt', 'DESC')
      .limit(Math.max(1, Math.min(limit, 100)))
      .getMany();
  }
}
