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
    };
  }

  @Get('ready')
  async getReadiness() {
    const checks = {
      postgres: await this.checkPostgres(),
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
}
