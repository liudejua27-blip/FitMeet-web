import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SocialAgentMatchingJobProcessorService } from './social-agent-matching-job-processor.service';

@Injectable()
export class SocialAgentMatchingJobWorkerCronService {
  private readonly logger = new Logger(
    SocialAgentMatchingJobWorkerCronService.name,
  );
  private readonly workerId = `${process.pid}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  constructor(
    private readonly processor: SocialAgentMatchingJobProcessorService,
  ) {}

  @Cron('*/15 * * * * *')
  async processMatchingJobsCron(): Promise<void> {
    if (process.env.FITMEET_MATCHING_JOB_WORKER_ENABLED === '0') return;
    try {
      const summary = await this.processDueMatchingJobs();
      if (summary.claimed > 0) {
        this.logger.log({
          event: 'social_agent.matching_job_worker.summary',
          ...summary,
        });
      }
    } catch (error) {
      this.logger.warn({
        event: 'social_agent.matching_job_worker.failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  processDueMatchingJobs(limit = 10) {
    return this.processor.processDueJobs({
      workerId: this.workerId,
      limit,
      leaseMs: 60_000,
    });
  }
}
