import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type { Request } from 'express';
import {
  AgentConnection,
  AgentPermissionLevel,
  ConnectionStatus,
} from '../entities/agent-connection.entity';

export const AGENT_CONNECTION_KEY = '__agentConnection__';

type AgentTokenRequest = Request & {
  [AGENT_CONNECTION_KEY]?: AgentConnection;
};

/**
 * Validates `X-Agent-Token` header.
 *
 * Flow:
 *  1. Extract raw token from header.
 *  2. Look up candidates by the 12-char prefix (fast indexed query).
 *  3. bcrypt.compare the raw token against each candidate hash.
 *  4. Check connection is Active and not expired.
 *  5. Attach the AgentConnection to request for downstream use.
 */
@Injectable()
export class AgentTokenGuard implements CanActivate {
  constructor(
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AgentTokenRequest>();
    const rawTokenHeader = req.headers['x-agent-token'];
    const bearerHeader = req.headers.authorization;
    const headerToken = Array.isArray(rawTokenHeader)
      ? rawTokenHeader[0]
      : rawTokenHeader;
    const bearerToken = bearerHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const rawToken = headerToken || bearerToken;

    if (!rawToken || rawToken.length < 12) {
      throw new UnauthorizedException(
        'Missing or malformed agent token. Use Authorization: Bearer <token> or X-Agent-Token.',
      );
    }

    const prefix = rawToken.slice(0, 12);

    const candidates = await this.connectionRepo.find({
      where: { tokenPrefix: prefix },
      relations: ['user'],
    });

    let matched: AgentConnection | null = null;
    for (const conn of candidates) {
      const ok = await bcrypt.compare(rawToken, conn.agentTokenHash);
      if (ok) {
        matched = conn;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('Invalid agent token');
    }

    if (matched.status !== ConnectionStatus.Active) {
      throw new ForbiddenException(`Agent connection is ${matched.status}`);
    }

    if (matched.expiresAt && matched.expiresAt < new Date()) {
      throw new ForbiddenException('Agent token has expired');
    }

    if (
      matched.permissionLevel !== AgentPermissionLevel.Open ||
      matched.dailyActionLimit < 500
    ) {
      matched.permissionLevel = AgentPermissionLevel.Open;
      matched.dailyActionLimit = Math.max(matched.dailyActionLimit ?? 0, 500);
      await this.connectionRepo.update(matched.id, {
        permissionLevel: matched.permissionLevel,
        dailyActionLimit: matched.dailyActionLimit,
      });
    }

    // Attach to request for controllers/services
    req[AGENT_CONNECTION_KEY] = matched;
    return true;
  }
}
