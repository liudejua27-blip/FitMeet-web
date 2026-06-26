import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { fitMeetCoreOpenApi } from './openapi/fitmeet-core.openapi';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      release: this.releaseMetadata(),
    };
  }

  @Get('ready')
  async getReadiness() {
    const checks = {
      postgres: await this.checkPostgres(),
      reminderTables: await this.checkReminderTables(),
      mongo: await this.checkMongo(),
      redis: await this.checkRedis(),
    };
    const ready = Object.values(checks).every((check) => check.status === 'ok');

    if (!ready) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_NOT_READY',
        message: 'Service dependencies are not ready',
        details: checks,
      });
    }

    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      release: this.releaseMetadata(),
      checks,
    };
  }

  @Get('openapi/fitmeet-core.json')
  getFitMeetCoreOpenApi() {
    return fitMeetCoreOpenApi;
  }

  private async checkPostgres() {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' as const, latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'error' as const, latencyMs: Date.now() - startedAt };
    }
  }

  private async checkReminderTables() {
    const startedAt = Date.now();
    const requiredTables = [
      'social_agent_reminder_preferences',
      'social_agent_reminders',
    ];
    try {
      const rows = (await this.dataSource.query(
        `SELECT table_name AS "tableName"
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])`,
        [requiredTables],
      )) as Array<{ tableName?: string | null }>;
      const present = new Set(
        rows.map((row) => row.tableName).filter(Boolean),
      );
      const missing = requiredTables.filter((table) => !present.has(table));
      if (missing.length > 0) {
        return {
          status: 'error' as const,
          latencyMs: Date.now() - startedAt,
          missingTables: missing,
        };
      }
      return {
        status: 'ok' as const,
        latencyMs: Date.now() - startedAt,
        tables: requiredTables,
      };
    } catch {
      return { status: 'error' as const, latencyMs: Date.now() - startedAt };
    }
  }

  private async checkMongo() {
    const startedAt = Date.now();
    try {
      const db = this.mongoConnection.db;
      if (!db || Number(this.mongoConnection.readyState) !== 1) {
        throw new Error('Mongo connection is not ready');
      }
      await db.admin().ping();
      return { status: 'ok' as const, latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'error' as const, latencyMs: Date.now() - startedAt };
    }
  }

  private async checkRedis() {
    const startedAt = Date.now();
    try {
      const pong = await this.redisService.getClient().ping();
      return {
        status: pong === 'PONG' ? ('ok' as const) : ('error' as const),
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return { status: 'error' as const, latencyMs: Date.now() - startedAt };
    }
  }

  private releaseMetadata() {
    return {
      commit: process.env.FITMEET_RELEASE_COMMIT || 'unknown',
      source: process.env.FITMEET_RELEASE_SOURCE || 'runtime',
      builtAt: process.env.FITMEET_RELEASE_BUILT_AT || null,
    };
  }
}
