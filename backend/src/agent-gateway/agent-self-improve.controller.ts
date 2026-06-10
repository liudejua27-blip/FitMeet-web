import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { AdminRbacGuard } from '../admin-rbac/admin-rbac.guard';
import { RequireAdminPermission } from '../admin-rbac/admin-rbac.decorator';
import { AgentSelfImproveService } from './agent-self-improve.service';
import type {
  AgentSkillPatchRiskLevel,
  AgentSkillPatchStatus,
} from './entities/agent-self-improve.entity';

type FitMeetRequest = Request & {
  user: { id: number };
};

type CreatePatchBody = {
  reflectionRunId?: number | null;
  patchType?: string;
  title?: string;
  rationale?: string;
  target?: string;
  patch?: Record<string, unknown>;
  riskLevel?: AgentSkillPatchRiskLevel;
};

type EvaluatePatchBody = {
  evalCaseIds?: number[];
  result?: Record<string, unknown>;
};

type ReviewPatchBody = {
  reason?: string | null;
};

type PublishPatchBody = {
  rolloutPercent?: number | null;
};

type PatchEffectBody = {
  metric?: string;
  value?: number;
  sampleSize?: number | null;
  note?: string | null;
};

@Controller('social-agent/self-improve')
@UseGuards(AuthGuard('jwt'), AdminRbacGuard)
export class AgentSelfImproveController {
  constructor(private readonly selfImprove: AgentSelfImproveService) {}

  @Get('reflections')
  @RequireAdminPermission('agent:l5:read')
  listReflections(@Query('limit') limit?: string) {
    return this.selfImprove.listReflectionRuns(Number(limit));
  }

  @Get('eval-cases')
  @RequireAdminPermission('agent:l5:read')
  listEvalCases(@Query('limit') limit?: string) {
    return this.selfImprove.listEvalCases(Number(limit));
  }

  @Get('failure-clusters')
  @RequireAdminPermission('agent:l5:read')
  listFailureClusters(@Query('limit') limit?: string) {
    return this.selfImprove.clusterReflectionFailures(Number(limit));
  }

  @Post('runner/run-once')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  runAutomationOnce(@Req() req: FitMeetRequest) {
    return this.selfImprove.runAutomationOnce(req.user.id);
  }

  @Get('patches')
  @RequireAdminPermission('agent:l5:read')
  listPatches(
    @Query('status') status?: AgentSkillPatchStatus,
    @Query('limit') limit?: string,
  ) {
    return this.selfImprove.listSkillPatches(status ?? null, Number(limit));
  }

  @Post('patches')
  @RequireAdminPermission('self_improve:approve')
  createPatch(@Body() body: CreatePatchBody) {
    return this.selfImprove.createSkillPatch({
      reflectionRunId: body.reflectionRunId ?? null,
      patchType: body.patchType ?? '',
      title: body.title ?? '',
      rationale: body.rationale,
      target: body.target,
      patch: body.patch,
      riskLevel: body.riskLevel,
    });
  }

  @Post('patches/:id/evaluate')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  evaluatePatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EvaluatePatchBody,
  ) {
    return this.selfImprove.evaluateSkillPatch(id, body ?? {});
  }

  @Post('patches/:id/run-evals')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  runPatchEvals(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EvaluatePatchBody,
  ) {
    return this.selfImprove.runSkillPatchEval(id, body ?? {});
  }

  @Post('patches/:id/approve')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  approvePatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.selfImprove.approveSkillPatch(id, req.user.id);
  }

  @Post('patches/:id/reject')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  rejectPatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReviewPatchBody,
  ) {
    return this.selfImprove.rejectSkillPatch(id, req.user.id, body?.reason);
  }

  @Post('patches/:id/publish')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  publishPatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PublishPatchBody,
  ) {
    return this.selfImprove.publishSkillPatch(id, req.user.id, body ?? {});
  }

  @Post('patches/:id/rollback')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  rollbackPatch(
    @Req() req: FitMeetRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReviewPatchBody,
  ) {
    return this.selfImprove.rollbackSkillPatch(id, req.user.id, body?.reason);
  }

  @Post('patches/:id/effects')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  recordPatchEffect(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PatchEffectBody,
  ) {
    return this.selfImprove.recordSkillPatchEffect(id, {
      metric: body.metric ?? '',
      value: Number(body.value),
      sampleSize: body.sampleSize ?? null,
      note: body.note,
    });
  }

  @Post('patches/:id/reconcile-canary')
  @HttpCode(200)
  @RequireAdminPermission('self_improve:approve')
  reconcileCanary(@Param('id', ParseIntPipe) id: number) {
    return this.selfImprove.reconcileCanaryPatch(id);
  }
}
