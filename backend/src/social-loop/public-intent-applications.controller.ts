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
import { PublicIntentApplicationsService } from './public-intent-applications.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PublicIntentApplicationsController {
  constructor(private readonly applications: PublicIntentApplicationsService) {}

  @Post('public/social-intents/:id/applications')
  createApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { message?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applications.createApplication(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }

  @Get('public/social-intents/:id/applications')
  listForIntent(@CurrentUser() user: User, @Param('id') id: string) {
    return this.applications.listForIntent(user.id, id);
  }

  @Get('users/me/public-intent-applications')
  listMine(
    @CurrentUser() user: User,
    @Query('role') role?: 'owner' | 'applicant',
  ) {
    return this.applications.listMine(user.id, role ?? 'applicant');
  }

  @Post('public-intent-applications/:id/accept')
  acceptApplication(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applications.acceptApplication(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }

  @Post('public-intent-applications/:id/reject')
  rejectApplication(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applications.rejectApplication(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }

  @Post('public-intent-applications/:id/cancel')
  cancelApplication(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applications.cancelApplication(
      user.id,
      id,
      body,
      idempotencyKey,
    );
  }
}
