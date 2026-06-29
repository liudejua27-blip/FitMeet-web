import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIModule } from './ai/ai.module';
import { AgentGatewayModule } from './agent-gateway/agent-gateway.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { FriendsModule } from './friends/friends.module';
import { MeetsModule } from './meets/meets.module';
import { MessagesModule } from './messages/messages.module';
import { ModerationModule } from './moderation/moderation.module';
import { RedisModule } from './redis/redis.module';
import { SafetyModule } from './safety/safety.module';
import { SocialRequestsModule } from './social-requests/social-requests.module';
import { SocialLoopModule } from './social-loop/social-loop.module';
import { MatchModule } from './match/match.module';
import { ActivitiesModule } from './activities/activities.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { LifeGraphModule } from './life-graph/life-graph.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AgentObservabilityTypeOrmLogger } from './agent-gateway/agent-observability-typeorm.logger';
import { AdminRbacModule } from './admin-rbac/admin-rbac.module';

const shouldSkipThrottling = () =>
  process.env.FITMEET_DISABLE_THROTTLE === 'true';

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

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
        const defaultSynchronize = 'false';
        const databaseUrl = configService.get<string>('DATABASE_URL');
        const dbSsl =
          configService.get<string>('DB_SSL') === 'true' ||
          configService.get<string>('PGSSLMODE') === 'require';

        return {
          type: 'postgres',
          ...(databaseUrl
            ? { url: databaseUrl }
            : {
                host: configService.get<string>('DB_HOST'),
                port: Number(configService.get<string>('DB_PORT') ?? 5432),
                username: configService.get<string>('DB_USERNAME'),
                password: configService.get<string>('DB_PASSWORD'),
                database: configService.get<string>('DB_DATABASE'),
              }),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/[0-9]*{.ts,.js}'],
          migrationsTransactionMode: 'each',
          migrationsRun:
            nodeEnv === 'production' &&
            configService.get<string>('DB_MIGRATIONS_RUN', 'false') === 'true',
          synchronize:
            configService.get<string>('DB_SYNCHRONIZE', defaultSynchronize) ===
            'true',
          ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
          extra: {
            max: parsePositiveInteger(
              configService.get<string>('DB_POOL_MAX'),
              30,
            ),
            min: parsePositiveInteger(
              configService.get<string>('DB_POOL_MIN'),
              2,
            ),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
          },
          logger: new AgentObservabilityTypeOrmLogger(nodeEnv !== 'production'),
          logging: nodeEnv !== 'production',
          maxQueryExecutionTime: Number(
            configService.get<string>('DB_SLOW_QUERY_MS') ?? 500,
          ),
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
        skipIf: shouldSkipThrottling,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
        skipIf: shouldSkipThrottling,
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 1000,
        skipIf: shouldSkipThrottling,
      },
    ]),
    ScheduleModule.forRoot(),
    RedisModule,
    AdminRbacModule,
    UploadsModule,
    UsersModule,
    RealtimeModule,
    LifeGraphModule,
    WaitlistModule,
    AuthModule,
    FriendsModule,
    MeetsModule,
    MessagesModule,
    ModerationModule,
    SafetyModule,
    AIModule,
    AgentGatewayModule,
    SocialRequestsModule,
    SocialLoopModule,
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
