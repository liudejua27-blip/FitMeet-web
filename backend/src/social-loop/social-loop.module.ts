import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicSocialIntent } from '../agent-gateway/entities/public-social-intent.entity';
import { Follow } from '../friends/follow.entity';
import { MeetParticipant } from '../meets/meet-participant.entity';
import { Meet } from '../meets/meet.entity';
import { UserBlock } from '../safety/user-block.entity';
import { SocialPolicyModule } from '../social-policy/social-policy.module';
import { ApiIdempotencyRecord } from '../users/api-idempotency-record.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { ApiIdempotencyService } from './api-idempotency.service';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionRequest } from './connection-request.entity';
import { ContactPermissionGrant } from './contact-permission-grant.entity';
import { ContactPermission } from './contact-permission.entity';
import { ContactPolicyService } from './contact-policy.service';
import { DomainOutboxEvent } from './domain-outbox-event.entity';
import { Friendship } from './friendship.entity';
import { PublicIntentApplicationsController } from './public-intent-applications.controller';
import { PublicIntentApplicationsService } from './public-intent-applications.service';
import { PublicIntentApplication } from './public-intent-application.entity';

@Module({
  imports: [
    UsersModule,
    SocialPolicyModule,
    TypeOrmModule.forFeature([
      ApiIdempotencyRecord,
      ConnectionRequest,
      Friendship,
      ContactPermission,
      ContactPermissionGrant,
      PublicIntentApplication,
      DomainOutboxEvent,
      PublicSocialIntent,
      Meet,
      MeetParticipant,
      User,
      Follow,
      UserBlock,
    ]),
  ],
  controllers: [ConnectionsController, PublicIntentApplicationsController],
  providers: [
    ApiIdempotencyService,
    ContactPolicyService,
    ConnectionsService,
    PublicIntentApplicationsService,
  ],
  exports: [
    ApiIdempotencyService,
    ContactPolicyService,
    ConnectionsService,
    PublicIntentApplicationsService,
    TypeOrmModule,
  ],
})
export class SocialLoopModule {}
