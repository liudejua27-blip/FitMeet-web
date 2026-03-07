import {
  Controller, Get, Post, Param, UseGuards, Request, ParseIntPipe,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('friends')
  getFriends(@Request() req) {
    return this.friendsService.getFriends(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/:id/follow')
  toggleFollow(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.friendsService.toggleFollow(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('users/:id/following')
  isFollowing(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.friendsService.isFollowing(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('following/ids')
  getFollowedIds(@Request() req) {
    return this.friendsService.getFollowedUserIds(req.user.id);
  }
}
