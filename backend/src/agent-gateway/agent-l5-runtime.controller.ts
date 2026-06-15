import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { AdminRbacGuard } from '../admin-rbac/admin-rbac.guard';
import { RequireAdminPermission } from '../admin-rbac/admin-rbac.decorator';
import { AgentL5RuntimeService } from './agent-l5-runtime.service';
import { AgentSelfImproveService } from './agent-self-improve.service';
import type { FitMeetAlphaAgentName } from './fitmeet-alpha-agent.types';
import { FitMeetSubagentWorkerRuntimeService } from './fitmeet-subagent-worker-runtime.service';
import { AgentObservabilityService } from './agent-observability.service';
import { SubagentWorkerQueueService } from './subagent-worker-queue.service';
import { LifeGraphComplianceService } from '../life-graph/life-graph-compliance.service';
import { SocialAgentMessageFeedbackService } from './social-agent-message-feedback.service';

type UserSatisfactionBody = {
  score?: number;
  source?: string | null;
  traceId?: string | null;
};

type LifeGraphRetentionBody = {
  dryRun?: boolean;
};

@Controller('social-agent/l5')
@UseGuards(AuthGuard('jwt'), AdminRbacGuard)
export class AgentL5RuntimeController {
  constructor(
    private readonly l5Runtime: AgentL5RuntimeService,
    private readonly selfImprove: AgentSelfImproveService,
    private readonly subagentWorkerRuntime: FitMeetSubagentWorkerRuntimeService,
    private readonly observability: AgentObservabilityService,
    private readonly subagentWorkerQueue: SubagentWorkerQueueService,
    private readonly lifeGraphCompliance: LifeGraphComplianceService,
    private readonly messageFeedback: SocialAgentMessageFeedbackService,
  ) {}

  @Get('dashboard')
  @RequireAdminPermission('agent:l5:read')
  async dashboard(
    @Request() _req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const dashboard = await this.l5Runtime.dashboard(Number(limit));
    const autoRuns = await this.selfImprove.listAutoRuns(Number(limit));
    const workerLanes = this.subagentWorkerRuntime.snapshot();
    const workerJobs = await this.subagentWorkerQueue.listJobs({
      limit: Number(limit),
    });
    const workerHeartbeats = await this.subagentWorkerQueue.listHeartbeats(
      Number(limit),
    );
    const workerFailures = await this.subagentWorkerQueue.listFailures(
      Number(limit),
    );
    const observability = this.observability.snapshot();
    const messageFeedback = await this.messageFeedback.listRecent(
      Number(limit),
    );
    return {
      ...dashboard,
      summary: {
        ...dashboard.summary,
        autoRuns: autoRuns.length,
        residentSubagentWorkers: workerLanes.length,
        activeSubagentWorkers: workerLanes.filter(
          (lane) => lane.status === 'running',
        ).length,
        subagentWorkerJobs: workerJobs.length,
        failedSubagentWorkerJobs: workerJobs.filter(
          (job) => job.status === 'failed',
        ).length,
        activeAlerts: Array.isArray(observability.alerts)
          ? observability.alerts.length
          : 0,
        messageFeedback: messageFeedback.length,
        negativeMessageFeedback: messageFeedback.filter(
          (item) => item.value === 'negative',
        ).length,
      },
      autoRuns,
      messageFeedback,
      workerLanes,
      workerJobs,
      workerHeartbeats,
      workerFailures,
      observability,
    };
  }

  @Get('replay-samples')
  @RequireAdminPermission('agent:l5:read')
  listReplaySamples(
    @Request() _req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.l5Runtime.listReplaySamples(Number(limit));
  }

  @Get('subagent-memory')
  @RequireAdminPermission('agent:l5:read')
  listSubagentMemory(
    @Request() _req: AuthenticatedRequest,
    @Query('agentName') agentName?: string,
    @Query('limit') limit?: string,
  ) {
    return this.l5Runtime.listSubagentMemory({
      agentName: agentName || null,
      limit: Number(limit),
    });
  }

  @Get('meet-loop-states')
  @RequireAdminPermission('agent:l5:read')
  listMeetLoopStates(
    @Request() _req: AuthenticatedRequest,
    @Query('stage') stage?: string,
    @Query('limit') limit?: string,
  ) {
    return this.l5Runtime.listMeetLoopStates({
      stage: stage || null,
      limit: Number(limit),
    });
  }

  @Get('patch-effects')
  @RequireAdminPermission('agent:l5:read')
  listPatchEffects(
    @Request() _req: AuthenticatedRequest,
    @Query('patchId') patchId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.l5Runtime.listPatchEffects({
      patchId: patchId ? Number(patchId) : null,
      limit: Number(limit),
    });
  }

  @Get('auto-runs')
  @RequireAdminPermission('agent:l5:read')
  listAutoRuns(
    @Request() _req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.selfImprove.listAutoRuns(Number(limit));
  }

  @Get('subagent-worker-lanes')
  @RequireAdminPermission('agent:l5:read')
  listSubagentWorkerLanes(
    @Request() _req: AuthenticatedRequest,
    @Query('agentName') agentName?: string,
  ) {
    return this.subagentWorkerRuntime.snapshot(
      agentName ? (agentName as FitMeetAlphaAgentName) : undefined,
    );
  }

  @Get('subagent-worker-jobs')
  @RequireAdminPermission('agent:l5:read')
  listSubagentWorkerJobs(
    @Request() _req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('queueName') queueName?: string,
    @Query('limit') limit?: string,
  ) {
    return this.subagentWorkerQueue.listJobs({
      status: status || null,
      queueName: queueName || null,
      limit: Number(limit),
    });
  }

  @Post('subagent-worker-jobs/:id/requeue')
  @HttpCode(200)
  @RequireAdminPermission('agent:l5:write')
  requeueSubagentWorkerJob(
    @Request() _req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.subagentWorkerQueue.requeue(Number(id));
  }

  @Post('subagent-worker-jobs/:id/cancel')
  @HttpCode(200)
  @RequireAdminPermission('agent:l5:write')
  cancelSubagentWorkerJob(
    @Request() _req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.subagentWorkerQueue.cancel(Number(id));
  }

  @Get('observability')
  @RequireAdminPermission('observability:read')
  observabilitySnapshot() {
    return this.observability.snapshot();
  }

  @Post('observability/satisfaction')
  @HttpCode(200)
  @RequireAdminPermission('observability:alert:manage')
  recordUserSatisfaction(@Body() body: UserSatisfactionBody) {
    this.observability.recordUserSatisfaction({
      traceId: body.traceId ?? null,
      score: Number(body.score),
      source: body.source ?? 'agent_l5_admin',
    });
    return this.observability.snapshot();
  }

  @Get('compliance/life-graph-access-audits')
  @RequireAdminPermission('life_graph:compliance:read')
  listLifeGraphAccessAudits(
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.lifeGraphCompliance.listAccessAuditLogs({
      userId: userId ? Number(userId) : null,
      limit: Number(limit),
    });
  }

  @Get('compliance/life-graph-retention')
  @RequireAdminPermission('life_graph:compliance:read')
  lifeGraphRetentionPolicy() {
    return this.lifeGraphCompliance.retentionPolicy();
  }

  @Post('compliance/life-graph-retention/apply')
  @HttpCode(200)
  @RequireAdminPermission('life_graph:compliance:write')
  applyLifeGraphRetention(
    @Request() req: AuthenticatedRequest,
    @Body() body: LifeGraphRetentionBody,
  ) {
    return this.lifeGraphCompliance.applyRetentionPolicy({
      dryRun: body?.dryRun !== false,
      actorUserId: req.user.id,
    });
  }
}
