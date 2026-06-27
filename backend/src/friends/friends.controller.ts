import {
  Controller,
  Delete,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ConnectionsService } from '../social-loop/connections.service';

@Controller()
export class FriendsController {
  constructor(
    private readonly friendsService: FriendsService,
    private readonly connectionsService: ConnectionsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('friends')
  getFriends(@Request() req: AuthenticatedRequest) {
    return this.connectionsService.listFriends(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('friends/:id')
  deleteFriend(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.connectionsService.deleteFriend(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/:id/follow')
  toggleFollow(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.friendsService.toggleFollow(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/:id/following')
  isFollowing(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.friendsService.isFollowing(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('following/ids')
  getFollowedIds(@Request() req: AuthenticatedRequest) {
    return this.friendsService.getFollowedUserIds(req.user.id);
  }
}
