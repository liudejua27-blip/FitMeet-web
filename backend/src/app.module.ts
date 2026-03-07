import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { CoachesModule } from './coaches/coaches.module';
import { CommentsModule } from './comments/comments.module';
import { FriendsModule } from './friends/friends.module';
import { MeetsModule } from './meets/meets.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { GiftsModule } from './gifts/gifts.module';
import { UploadsModule } from './uploads/uploads.module';
import { SearchModule } from './search/search.module';
import { EventsModule } from './events/events.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // 开发环境开启，自动建表
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    KafkaModule,
    UploadsModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    CoachesModule,
    CommentsModule,
    FriendsModule,
    MeetsModule,
    MessagesModule,
    NotificationsModule,
    PostsModule,
    GiftsModule,
    SearchModule,
    EventsModule,
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    RecommendationsModule,
    ModerationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
