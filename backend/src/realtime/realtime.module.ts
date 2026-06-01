import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Notification, NotificationSchema } from '../notifications/notification.schema';
import { RealtimeEventService } from './realtime-event.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  providers: [RealtimeGateway, RealtimeEventService],
  exports: [RealtimeEventService],
})
export class RealtimeModule {}
