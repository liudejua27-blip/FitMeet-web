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
  private readonly workerId = `${process.pid}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  constructor(
    @InjectRepository(AgentTask)
    private readonly taskRepo: Repository<AgentTask>,
    private readonly reconciler: SocialAgentPublishReconcilerService,
  ) {}

  @Cron('*/2 * * * *')
  async reconcilePublishedTasksCron(): Promise<void> {
    if (process.env.FITMEET_PUBLISH_RECONCILER_ENABLED === '0') return;
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
    }
  }

  async reconcileDuePublishedTasks(
    limit = 25,
  ): Promise<PublishReconcileCronSummary> {
    const summary: PublishReconcileCronSummary = {
      scanned: 0,
      visible: 0,
      needsRepair: 0,
      failed: 0,
    };

    const scanLimit = Math.max(1, Math.min(Math.floor(limit), 100));
    for (let index = 0; index < scanLimit; index += 1) {
      const [task] = await this.claimDuePublishedTasks(1);
      if (!task) break;
      summary.scanned += 1;
      try {
        const result = await this.reconciler.reconcileTask(
          task.ownerUserId,
          task.id,
          this.workerId,
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

  private async claimDuePublishedTasks(limit: number): Promise<AgentTask[]> {
    const statuses = [
      AgentTaskStatus.Succeeded,
      AgentTaskStatus.WaitingResult,
      AgentTaskStatus.AwaitingConfirmation,
    ];
    const now = new Date();
    const leaseExpiresAt = new Date(Date.now() + 90_000);
    const rows: unknown = await this.taskRepo.manager.query(
      `WITH claimable AS (
         SELECT task."id"
         FROM "agent_tasks" task
         WHERE task."status" = ANY($1::varchar[])
           AND COALESCE(
             task."result" #>> '{publishSocialRequest,publicIntentId}',
             task."result" #>> '{chatRun,publicIntentId}',
             task."result" #>> '{activityDraft,publicIntentId}',
             ''
           ) <> ''
           AND COALESCE(task."result" #>> '{publishReconcile,status}', '') <> 'visible'
           AND (
             COALESCE(task."result" #>> '{publishReconcile,status}', '') <> 'running'
             OR NULLIF(task."result" #>> '{publishReconcile,leaseExpiresAt}', '') IS NULL
             OR NULLIF(task."result" #>> '{publishReconcile,leaseExpiresAt}', '')::timestamptz < $2
           )
         ORDER BY task."updatedAt" DESC, task."id" ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE "agent_tasks" task
       SET "result" = jsonb_set(
             COALESCE(task."result", '{}'::jsonb),
             '{publishReconcile}',
             COALESCE(task."result" -> 'publishReconcile', '{}'::jsonb) || $4::jsonb,
             true
           ),
           "updatedAt" = $2
       FROM claimable
       WHERE task."id" = claimable."id"
       RETURNING task.*`,
      [
        statuses,
        now,
        Math.max(1, Math.min(limit, 100)),
        JSON.stringify({
          status: 'running',
          leaseOwner: this.workerId,
          leaseStartedAt: now.toISOString(),
          leaseExpiresAt: leaseExpiresAt.toISOString(),
        }),
      ],
    );
    if (
      Array.isArray(rows) &&
      rows.length === 2 &&
      Array.isArray(rows[0]) &&
      typeof rows[1] === 'number'
    ) {
      return rows[0] as AgentTask[];
    }
    return Array.isArray(rows) ? (rows as AgentTask[]) : [];
  }
}
