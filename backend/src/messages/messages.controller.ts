import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  getConversations(@CurrentUser() user: User) {
    return this.messagesService.getConversations(user.id);
  }

  @Get('conversations/:id')
  getMessages(@Param('id') id: string, @CurrentUser() user: User) {
    return this.messagesService.getMessages(id, user.id);
  }

  @Post('conversations/:id/send')
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body('text') text: string,
  ) {
    return this.messagesService.sendMessage(id, user.id, text);
  }

  @Post('start')
  startConversation(
    @CurrentUser() user: User,
    @Body('otherUserId') otherUserId: number,
  ) {
    return this.messagesService.startConversation(user.id, otherUserId);
  }

  @Post('public-intents/:id/start')
  startPublicIntentConversation(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('text') text?: string,
  ) {
    return this.messagesService.startPublicIntentConversation(user.id, id, text);
  }

  @Get('unread')
  getUnreadCount(@CurrentUser() user: User) {
    return this.messagesService.getUnreadCount(user.id);
  }
}
