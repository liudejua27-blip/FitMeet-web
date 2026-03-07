import {
  Controller, Get, Post, Param, Body,
  UseGuards, Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Request() req) {
    return this.notificationsService.findByUser(req.user.id);
  }

  @Get('unread')
  getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Post(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  @Post('read-all')
  markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Post()
  create(@Request() req, @Body() data: any) {
    return this.notificationsService.create({
      ...data,
      userId: req.user.id,
    });
  }
}
