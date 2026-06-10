import { Logger } from '@nestjs/common';
import type { Logger as TypeOrmLogger } from 'typeorm';

import { AgentObservabilityRegistry } from './agent-observability.registry';

export class AgentObservabilityTypeOrmLogger implements TypeOrmLogger {
  private readonly logger = new Logger(AgentObservabilityTypeOrmLogger.name);

  constructor(private readonly verbose: boolean) {}

  logQuery(query: string): void {
    if (!this.verbose) return;
    this.logger.debug(
      JSON.stringify({
        event: 'db.query',
        operation: this.operationName(query),
      }),
    );
  }

  logQueryError(error: string | Error, query: string): void {
    const operation = this.operationName(query);
    const failureReason = this.safeText(error);
    AgentObservabilityRegistry.current()?.recordDbQuery({
      operation,
      latencyMs: 0,
      success: false,
      failureReason,
    });
    this.logger.error(
      JSON.stringify({
        event: 'db.query_error',
        operation,
        failureReason,
      }),
    );
  }

  logQuerySlow(time: number, query: string): void {
    const operation = this.operationName(query);
    AgentObservabilityRegistry.current()?.recordDbQuery({
      operation,
      latencyMs: time,
      success: true,
    });
    this.logger.warn(
      JSON.stringify({
        event: 'db.slow_query',
        operation,
        latencyMs: time,
      }),
    );
  }

  logSchemaBuild(message: string): void {
    if (this.verbose) this.logger.log(message);
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (!this.verbose && level !== 'warn') return;
    const text = this.safeText(message);
    if (level === 'warn') {
      this.logger.warn(text);
    } else {
      this.logger.log(text);
    }
  }

  private operationName(query: string): string {
    return (
      query
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .join('_')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_') || 'unknown'
    );
  }

  private safeText(value: unknown): string {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
