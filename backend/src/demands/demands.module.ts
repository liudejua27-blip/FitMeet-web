import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentGatewayModule } from '../agent-gateway/agent-gateway.module';
import { CandidateSearchIndex } from '../agent-gateway/entities/candidate-search-index.entity';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { UserBlock } from '../safety/user-block.entity';
import { DomainOutboxEvent } from '../social-loop/domain-outbox-event.entity';
import { SocialLoopModule } from '../social-loop/social-loop.module';
import { User } from '../users/user.entity';
import { DemandCandidate } from './demand-candidate.entity';
import { DemandInvitation } from './demand-invitation.entity';
import { Demand } from './demand.entity';
import { DemandsController } from './demands.controller';
import { DemandsService } from './demands.service';
import { PublicTaskIntent } from './public-task-intent.entity';
import { TaskIntentApplication } from './task-intent-application.entity';
import { TaskIntentsController } from './task-intents.controller';
import { TaskIntentsService } from './task-intents.service';

@Module({
  imports: [
    SocialLoopModule,
    forwardRef(() => AgentGatewayModule),
    TypeOrmModule.forFeature([
      CandidateSearchIndex,
      Demand,
      DemandCandidate,
      DemandInvitation,
      DomainOutboxEvent,
      PublicSocialIntent,
      PublicTaskIntent,
      TaskIntentApplication,
      User,
      UserBlock,
    ]),
  ],
  controllers: [DemandsController, TaskIntentsController],
  providers: [DemandsService, TaskIntentsService],
  exports: [DemandsService, TaskIntentsService],
})
export class DemandsModule {}
