import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ActivitiesService } from './activities.service';
import {
  CheckinActivityDto,
  CreateActivityDto,
  RespondActivityProofDto,
  ReviewActivityDto,
  SubmitActivityProofDto,
} from './dto/activity.dto';

@Controller()
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Public()
  @Get('activity-templates')
  listTemplates() {
    return this.activities.listTemplates();
  }

  @Public()
  @Get('activities/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const activity = await this.activities.findOne(id);
    const proofs = await this.activities.listProofs(id);
    return { activity, proofs };
  }

  @Public()
  @Get('activities/:id/icebreakers')
  async icebreakers(@Param('id', ParseIntPipe) id: number) {
    return { tasks: await this.activities.findIcebreakers(id) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateActivityDto) {
    return this.activities.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/join')
  join(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.activities.join(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/confirm')
  confirm(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.activities.confirm(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/checkin')
  checkin(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CheckinActivityDto,
  ) {
    return this.activities.checkin(id, req.user.id, dto);
  }

  /** Alias of /activities/:id/checkin to match unified MeetPage entries. */
  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/check-in')
  checkInAlias(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CheckinActivityDto,
  ) {
    return this.activities.checkin(id, req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/proof')
  proof(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitActivityProofDto,
  ) {
    return this.activities.submitProof(id, req.user.id, dto);
  }

  /** Alias of /activities/:id/proof. */
  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/upload-proof')
  uploadProofAlias(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitActivityProofDto,
  ) {
    return this.activities.submitProof(id, req.user.id, dto);
  }

  /** Counterpart accepts/rejects a pending proof. */
  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/proofs/:proofId/respond')
  respondProof(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('proofId', ParseIntPipe) proofId: number,
    @Body() dto: RespondActivityProofDto,
  ) {
    return this.activities.respondToProof(
      id,
      proofId,
      req.user.id,
      dto.accept,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/complete')
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.activities.complete(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/cancel')
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.activities.cancel(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activities/:id/review')
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewActivityDto,
  ) {
    return this.activities.review(id, req.user.id, dto.rating, dto.comment);
  }
}
