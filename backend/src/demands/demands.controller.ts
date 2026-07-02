import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import {
  CancelDemandDto,
  CreateDemandDto,
  CreateDemandInvitationDto,
  DemandCandidateQueryDto,
  DemandInvitationQueryDto,
  DemandQueryDto,
  DemandVisibilityMutationDto,
  ResolveDemandInvitationDto,
} from './demands.dto';
import { DemandsService } from './demands.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class DemandsController {
  constructor(private readonly demands: DemandsService) {}

  @Post('demands')
  createDemand(
    @CurrentUser() user: User,
    @Body() body: CreateDemandDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.createDemand(user.id, body, idempotencyKey);
  }

  @Get('users/me/demands')
  listMyDemands(@CurrentUser() user: User, @Query() query: DemandQueryDto) {
    return this.demands.listMyDemands(user.id, query);
  }

  @Get('demands/:id')
  getDemand(@CurrentUser() user: User, @Param('id') id: string) {
    return this.demands.getDemand(user.id, id);
  }

  @Get('demands/:id/candidates')
  getDemandCandidates(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: DemandCandidateQueryDto,
  ) {
    return this.demands.getDemandCandidates(user.id, id, query.limit ?? 10);
  }

  @Post('demands/:id/publish')
  publishDemand(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: DemandVisibilityMutationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.publishDemand(user.id, id, body, idempotencyKey);
  }

  @Post('demands/:id/hide')
  hideDemand(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: DemandVisibilityMutationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.hideDemand(user.id, id, body, idempotencyKey);
  }

  @Post('demands/:id/cancel')
  cancelDemand(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CancelDemandDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.cancelDemand(user.id, id, body, idempotencyKey);
  }

  @Post('meet-invitations')
  createMeetInvitation(
    @CurrentUser() user: User,
    @Body() body: CreateDemandInvitationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.createDemandInvitation(user.id, body, idempotencyKey);
  }

  @Get('users/me/meet-invitations')
  listMyMeetInvitations(
    @CurrentUser() user: User,
    @Query() query: DemandInvitationQueryDto,
  ) {
    return this.demands.listMyDemandInvitations(user.id, query);
  }

  @Get('meet-invitations/:id')
  getMeetInvitation(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.demands.getDemandInvitation(user.id, id);
  }

  @Post('meet-invitations/:id/accept')
  acceptMeetInvitation(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResolveDemandInvitationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.acceptDemandInvitation(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }

  @Post('meet-invitations/:id/reject')
  rejectMeetInvitation(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResolveDemandInvitationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.rejectDemandInvitation(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }

  @Post('meet-invitations/:id/cancel')
  cancelMeetInvitation(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResolveDemandInvitationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.demands.cancelDemandInvitation(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }
}
