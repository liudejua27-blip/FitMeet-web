import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { Conversation, ConversationSchema } from './conversation.schema';
import { Message, MessageSchema } from './message.schema';
import {
  AgentMessageEvent,
  AgentMessageEventSchema,
} from './agent-message-event.schema';
import { User } from '../users/user.entity';
import { AuthModule } from '../auth/auth.module';
import { AgentConnection } from '../agent-gateway/entities/agent-connection.entity';
import { AgentActivityLog } from '../agent-gateway/entities/agent-activity-log.entity';
import { AgentActionLog } from '../agent-gateway/entities/agent-action-log.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { AgentSideEffectLedger } from '../agent-gateway/entities/agent-side-effect-ledger.entity';
import { AgentSideEffectLedgerService } from '../agent-gateway/agent-side-effect-ledger.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: AgentMessageEvent.name, schema: AgentMessageEventSchema },
    ]),
    TypeOrmModule.forFeature([
      User,
      AgentConnection,
      AgentActivityLog,
      AgentActionLog,
      PublicSocialIntent,
      UserSocialRequest,
      AgentSideEffectLedger,
    ]),
    AuthModule,
    RealtimeModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, AgentSideEffectLedgerService],
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
