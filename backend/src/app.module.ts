import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIModule } from './ai/ai.module';
import { AiMatchModule } from './ai-match/ai-match.module';
import { AgentGatewayModule } from './agent-gateway/agent-gateway.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ClubsModule } from './clubs/clubs.module';
import { CoachesModule } from './coaches/coaches.module';
import { CommentsModule } from './comments/comments.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { EventsModule } from './events/events.module';
import { FriendsModule } from './friends/friends.module';
import { KafkaModule } from './kafka/kafka.module';
import { MeetsModule } from './meets/meets.module';
import { MessagesModule } from './messages/messages.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PostsModule } from './posts/posts.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { RedisModule } from './redis/redis.module';
import { SafetyModule } from './safety/safety.module';
import { SearchModule } from './search/search.module';
import { SocialRequestsModule } from './social-requests/social-requests.module';
import { MatchModule } from './match/match.module';
import { ActivitiesModule } from './activities/activities.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? ['.env.production.local', '.env.production']
          : [
              '.env.development.local',
              '.env.local',
              '.env.development',
              '.env',
            ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const defaultSynchronize = nodeEnv === 'production' ? 'false' : 'true';

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: Number(configService.get<string>('DB_PORT') ?? 5432),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          migrationsRun:
            nodeEnv === 'production' &&
            configService.get<string>('DB_MIGRATIONS_RUN', 'true') !== 'false',
          synchronize:
            configService.get<string>('DB_SYNCHRONIZE', defaultSynchronize) ===
            'true',
          extra: {
            max: 100,
            min: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
          },
          logging: nodeEnv !== 'production',
          retryAttempts: nodeEnv === 'test' ? 1 : 9,
          retryDelay: nodeEnv === 'test' ? 500 : 3000,
        };
      },
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');

        return {
          uri: configService.get<string>('MONGO_URI'),
          maxPoolSize: 50,
          minPoolSize: 10,
          socketTimeoutMS: 45000,
          serverSelectionTimeoutMS: 5000,
          retryAttempts: nodeEnv === 'test' ? 1 : 9,
          retryDelay: nodeEnv === 'test' ? 500 : 3000,
        };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 1000,
      },
    ]),
    ScheduleModule.forRoot(),
    RedisModule,
    KafkaModule.forRoot(),
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
    SearchModule,
    EventsModule,
    RecommendationsModule,
    ModerationModule,
    SafetyModule,
    ClubsModule,
    AiMatchModule,
    AIModule,
    AgentGatewayModule,
    SocialRequestsModule,
    MatchModule,
    ActivitiesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
