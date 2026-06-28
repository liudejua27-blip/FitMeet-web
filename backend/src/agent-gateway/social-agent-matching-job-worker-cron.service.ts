import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { FeatureFlagService } from '../common/feature-flag.service';
import { shouldRunWorkerRole } from '../common/process-role.util';
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
    private readonly featureFlags: FeatureFlagService = new FeatureFlagService(),
  ) {}

  @Cron('*/15 * * * * *')
  async processMatchingJobsCron(): Promise<void> {
    if (!this.featureFlags.isEnabled('matching_worker')) return;
    if (!shouldRunWorkerRole('worker-matching')) return;
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
