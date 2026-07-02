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
import { TaskIntentsService } from './task-intents.service';

@Controller()
export class TaskIntentsController {
  constructor(private readonly tasks: TaskIntentsService) {}

  @Get('public/task-intents')
  listPublicTaskIntents(
    @Query('page') page = '1',
    @Query('limit') limit = '30',
    @Query('q') q?: string,
    @Query('city') city?: string,
    @Query('category') category?: string,
    @Query('requestType') requestType?: string,
    @Query('status') status?: string,
  ) {
    return this.tasks.listPublicTaskIntents({
      page: Number(page),
      limit: Number(limit),
      q,
      city,
      category,
      requestType,
      status,
    });
  }

  @Get('public/task-intents/:id')
  getPublicTaskIntent(@Param('id') id: string) {
    return this.tasks.getPublicTaskIntent(id);
  }

  @Post('public/task-intents/:id/applications')
  @UseGuards(JwtAuthGuard)
  createTaskApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { message?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tasks.createApplication(user.id, id, body, idempotencyKey);
  }

  @Get('users/me/task-intent-applications')
  @UseGuards(JwtAuthGuard)
  listMyTaskApplications(
    @CurrentUser() user: User,
    @Query('role') role?: 'owner' | 'applicant',
  ) {
    return this.tasks.listMine(user.id, role ?? 'applicant');
  }

  @Post('task-intent-applications/:id/accept')
  @UseGuards(JwtAuthGuard)
  acceptTaskApplication(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tasks.acceptApplication(user.id, id, body, idempotencyKey);
  }

  @Post('task-intent-applications/:id/reject')
  @UseGuards(JwtAuthGuard)
  rejectTaskApplication(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tasks.rejectApplication(user.id, id, body, idempotencyKey);
  }

  @Post('task-intent-applications/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelTaskApplication(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tasks.cancelApplication(user.id, id, body, idempotencyKey);
  }
}
