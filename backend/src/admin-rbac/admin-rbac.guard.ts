import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ADMIN_PERMISSION_METADATA } from './admin-rbac.decorator';
import type { AdminPermissionKey } from './admin-rbac.constants';
import { AdminRbacService } from './admin-rbac.service';

type AdminRequest = Request & {
  user?: { id?: number };
};

@Injectable()
export class AdminRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: AdminRbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<AdminPermissionKey>(
      ADMIN_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;

    const req = context.switchToHttp().getRequest<AdminRequest>();
    const userId = req.user?.id ?? null;
    const route =
      `${req.method ?? ''} ${req.originalUrl ?? req.url ?? ''}`.trim();
    const allowed = await this.rbac.hasPermission(userId, permission);
    if (!allowed) {
      await this.rbac.recordAudit({
        userId,
        permission,
        route,
        decision: 'denied',
        reason: 'missing_admin_permission',
      });
      throw new ForbiddenException('Admin permission required');
    }

    if (req.method && req.method !== 'GET') {
      await this.rbac.recordAudit({
        userId,
        permission,
        route,
        decision: 'allowed',
        reason: 'admin_action_allowed',
      });
    }
    return true;
  }
}
