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
import { ConnectionsService } from './connections.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post('connections/requests')
  createRequest(
    @CurrentUser() user: User,
    @Body()
    body: {
      targetUserId?: number;
      message?: string;
      contextType?: string;
      contextId?: string;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.connections.createRequest(user.id, body, idempotencyKey);
  }

  @Get('connections/requests')
  listRequests(
    @CurrentUser() user: User,
    @Query('box') box?: 'inbox' | 'outbox',
    @Query('status') status?: string,
  ) {
    return this.connections.listRequests(user.id, box ?? 'inbox', status);
  }

  @Post('connections/requests/:id/accept')
  acceptRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.connections.acceptRequest(user.id, id, body, idempotencyKey);
  }

  @Post('connections/requests/:id/reject')
  rejectRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.connections.rejectRequest(user.id, id, body, idempotencyKey);
  }

  @Post('connections/requests/:id/cancel')
  cancelRequest(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.connections.cancelRequest(user.id, id, body, idempotencyKey);
  }

  @Get('relationships/users/:userId')
  getRelationship(
    @CurrentUser() user: User,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.connections.getRelationshipState(user.id, userId);
  }
}
