import { Controller, Get } from '@nestjs/common';

import { SocialAgentMetricsService } from './social-agent-metrics.service';

@Controller('social-agent/metrics')
export class SocialAgentMetricsController {
  constructor(private readonly metrics: SocialAgentMetricsService) {}

  @Get()
  snapshot() {
    return this.metrics.snapshot();
  }
}
