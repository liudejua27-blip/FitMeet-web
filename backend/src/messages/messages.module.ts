import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { Conversation, ConversationSchema } from './conversation.schema';
import { Message, MessageSchema } from './message.schema';
import {
  AgentInboxEvent,
  AgentInboxEventSchema,
} from './agent-inbox-event.schema';
import { User } from '../users/user.entity';
import { AuthModule } from '../auth/auth.module';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { AgentActivityLog } from '../agent-gateway/entities/agent-activity-log.entity';
import { AgentActionLog } from '../agent-gateway/entities/agent-action-log.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: AgentInboxEvent.name, schema: AgentInboxEventSchema },
    ]),
    TypeOrmModule.forFeature([
      User,
      AgentConnection,
      AgentActivityLog,
      AgentActionLog,
      PublicSocialIntent,
      UserSocialRequest,
    ]),
    AuthModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
