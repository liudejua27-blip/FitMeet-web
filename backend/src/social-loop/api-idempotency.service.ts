import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ApiIdempotencyRecord } from '../users/api-idempotency-record.entity';
import { SocialLoopErrorCode, socialConflict } from './social-loop.errors';

type ApiIdempotencyOperation<T extends Record<string, unknown>> = (
  manager: EntityManager,
) => Promise<T>;

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ApiIdempotencyService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ApiIdempotencyRecord)
    private readonly repo: Repository<ApiIdempotencyRecord>,
  ) {}

  async run<T extends Record<string, unknown>>(
    ownerUserId: number,
    scope: string,
    idempotencyKey: string | undefined,
    payload: unknown,
    operation: ApiIdempotencyOperation<T>,
  ): Promise<T> {
    const normalizedKey = idempotencyKey?.trim();
    if (!normalizedKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const requestHash = this.hashPayload(payload);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ApiIdempotencyRecord);
      const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
      await repo
        .createQueryBuilder()
        .insert()
        .values({
          ownerUserId,
          scope,
          idempotencyKey: normalizedKey,
          requestHash,
          status: 'processing',
          responseStatus: null,
          responseBody: null,
          expiresAt,
        })
        .orIgnore()
        .execute();

      const record = await repo.findOne({
        where: { ownerUserId, scope, idempotencyKey: normalizedKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) {
        throw new BadRequestException(
          'Idempotency record could not be claimed',
        );
      }
      if (record.requestHash !== requestHash) {
        throw socialConflict(SocialLoopErrorCode.IdempotencyKeyReused, {
          message: 'Idempotency-Key was already used with a different payload.',
        });
      }
      if (record.status === 'completed' && record.responseBody) {
        return record.responseBody as T;
      }

      const response = await operation(manager);
      record.status = 'completed';
      record.responseStatus = 200;
      record.responseBody = response;
      await repo.save(record);
      return response;
    });
  }

  private hashPayload(payload: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(this.sortValue(payload)))
      .digest('hex');
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, this.sortValue(entry)]),
      );
    }
    return value;
  }
}
