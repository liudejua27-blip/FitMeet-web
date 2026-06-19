import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { Repository } from 'typeorm';

import type {
  ConfirmLifeGraphSecurityRequestDto,
  CreateLifeGraphSecurityRequestDto,
} from './dto/life-graph.dto';
import {
  LifeGraphSecurityRequest,
  type LifeGraphSecurityRequestType,
} from './entities/life-graph-security-request.entity';
import { LifeGraphService } from './life-graph.service';

@Injectable()
export class LifeGraphSecurityRequestService {
  constructor(
    @InjectRepository(LifeGraphSecurityRequest)
    private readonly requests: Repository<LifeGraphSecurityRequest>,
    private readonly lifeGraph: LifeGraphService,
  ) {}

  async createRequest(
    userId: number,
    type: LifeGraphSecurityRequestType,
    input?: CreateLifeGraphSecurityRequestDto,
  ) {
    const code = this.generateCode();
    const now = Date.now();
    const cooldownMs = this.cooldownMs(type);
    const expiresMs = this.positiveEnv(
      'LIFE_GRAPH_SECURITY_EXPIRES_MS',
      172800000,
    );
    const request = await this.requests.save(
      this.requests.create({
        requestedByUserId: userId,
        type,
        status: cooldownMs > 0 ? 'pending_cooldown' : 'ready',
        confirmationCodeHash: this.hashCode(code),
        availableAt: new Date(now + cooldownMs),
        expiresAt: new Date(now + expiresMs),
        notificationEmail: input?.notificationEmail?.trim() || null,
        notificationStatus: this.notificationStatus(),
        metadata: {
          notifications: [
            {
              stage: 'created',
              status: this.notificationStatus(),
              at: new Date(now).toISOString(),
            },
          ],
        },
      }),
    );
    return this.toDto(request, code);
  }

  async confirmExportRequest(
    userId: number,
    requestId: number,
    input: ConfirmLifeGraphSecurityRequestDto,
  ) {
    const request = await this.loadConfirmable(
      userId,
      requestId,
      'export',
      input,
    );
    const exported = await this.lifeGraph.exportLifeGraph(userId);
    const executed = await this.markExecuted(request, 'export_executed');
    return {
      request: this.toDto(executed),
      export: exported,
    };
  }

  async confirmDeleteRequest(
    userId: number,
    requestId: number,
    input: ConfirmLifeGraphSecurityRequestDto,
  ) {
    const request = await this.loadConfirmable(
      userId,
      requestId,
      'delete',
      input,
    );
    const result = await this.lifeGraph.deleteLifeGraphMemory(userId, {
      includeAuditLogs: input.includeAuditLogs,
    });
    const executed = await this.markExecuted(request, 'delete_executed');
    return {
      request: this.toDto(executed),
      result,
    };
  }

  private async loadConfirmable(
    userId: number,
    requestId: number,
    type: LifeGraphSecurityRequestType,
    input: ConfirmLifeGraphSecurityRequestDto,
  ) {
    const request = await this.requests.findOne({
      where: { id: requestId, requestedByUserId: userId, type },
    });
    if (!request) throw new NotFoundException('Life Graph request not found');
    const now = new Date();
    if (request.expiresAt.getTime() <= now.getTime()) {
      request.status = 'expired';
      await this.requests.save(request);
      throw new ConflictException({
        code: 'life_graph_request_expired',
        message: 'This Life Graph security request has expired.',
      });
    }
    if (request.executedAt) {
      throw new ConflictException({
        code: 'life_graph_request_already_executed',
        message: 'This Life Graph security request has already been executed.',
      });
    }
    if (request.availableAt.getTime() > now.getTime()) {
      throw new ConflictException({
        code: 'life_graph_cooldown_active',
        message: 'This request is still in its cooldown period.',
        availableAt: request.availableAt.toISOString(),
      });
    }
    if (
      request.confirmationCodeHash !== this.hashCode(input.confirmationCode)
    ) {
      throw new BadRequestException({
        code: 'life_graph_confirmation_code_invalid',
        message: 'The confirmation code is invalid.',
      });
    }
    request.status = 'ready';
    request.confirmedAt = now;
    request.metadata = this.appendNotification(request.metadata, 'confirmed');
    return this.requests.save(request);
  }

  private async markExecuted(request: LifeGraphSecurityRequest, stage: string) {
    request.status = 'executed';
    request.executedAt = new Date();
    request.metadata = this.appendNotification(request.metadata, stage);
    return this.requests.save(request);
  }

  private toDto(request: LifeGraphSecurityRequest, code?: string) {
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      requestedByUserId: request.requestedByUserId,
      availableAt: request.availableAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      confirmedAt: request.confirmedAt?.toISOString() ?? null,
      executedAt: request.executedAt?.toISOString() ?? null,
      notificationEmail: request.notificationEmail,
      notificationStatus: request.notificationStatus,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      devConfirmationCode:
        process.env.NODE_ENV === 'production' ? undefined : code,
    };
  }

  private appendNotification(metadata: Record<string, unknown>, stage: string) {
    const currentNotifications: unknown[] = Array.isArray(
      metadata.notifications,
    )
      ? metadata.notifications
      : [];
    return {
      ...metadata,
      notifications: [
        ...currentNotifications,
        {
          stage,
          status: this.notificationStatus(),
          at: new Date().toISOString(),
        },
      ],
    };
  }

  private generateCode(): string {
    return String(randomInt(100000, 999999));
  }

  private hashCode(code: string): string {
    const secret =
      process.env.LIFE_GRAPH_SECURITY_SECRET ??
      process.env.JWT_SECRET ??
      'fitmeet-life-graph-security';
    return createHash('sha256')
      .update(`${secret}:${code.trim()}`)
      .digest('hex');
  }

  private cooldownMs(type: LifeGraphSecurityRequestType): number {
    const key =
      type === 'export'
        ? 'LIFE_GRAPH_EXPORT_COOLDOWN_MS'
        : 'LIFE_GRAPH_DELETE_COOLDOWN_MS';
    const fallback = type === 'export' ? 600000 : 86400000;
    return this.positiveEnv(
      key,
      process.env.NODE_ENV === 'test' ? 0 : fallback,
    );
  }

  private positiveEnv(key: string, fallback: number): number {
    const parsed = Number(process.env[key]);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.trunc(parsed);
  }

  private notificationStatus(): 'sent' | 'skipped' | 'failed' {
    return process.env.SECURITY_EMAIL_PROVIDER ? 'sent' : 'skipped';
  }
}
