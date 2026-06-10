import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_PERMISSIONS,
  ADMIN_ROLES,
  type AdminPermissionKey,
} from './admin-rbac.constants';
import {
  AdminAuditLog,
  AdminPermission,
  AdminRole,
  AdminUserRole,
} from './entities/admin-rbac.entity';

type AuditInput = {
  userId?: number | null;
  permission?: string | null;
  route?: string;
  decision: 'allowed' | 'denied' | 'system';
  reason?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AdminRbacService {
  private bootstrapPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(AdminRole)
    private readonly roles: Repository<AdminRole>,
    @InjectRepository(AdminPermission)
    private readonly permissions: Repository<AdminPermission>,
    @InjectRepository(AdminUserRole)
    private readonly userRoles: Repository<AdminUserRole>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogs: Repository<AdminAuditLog>,
  ) {}

  async ensureBootstrapFromEnv(): Promise<void> {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.bootstrap();
    }
    return this.bootstrapPromise;
  }

  async hasPermission(
    userId: number | null | undefined,
    permission: AdminPermissionKey,
  ): Promise<boolean> {
    if (!userId) return false;
    await this.ensureBootstrapFromEnv();
    const assignments = await this.userRoles.find({ where: { userId } });
    const granted = new Set<string>();
    assignments.forEach((assignment) => {
      (ADMIN_ROLE_PERMISSIONS[assignment.roleKey] ?? []).forEach((item) =>
        granted.add(item),
      );
    });
    return granted.has(permission);
  }

  async listRoles() {
    await this.ensureBootstrapFromEnv();
    const roles = await this.roles.find({ order: { key: 'ASC' } });
    return roles.map((role) => ({
      ...role,
      permissions: ADMIN_ROLE_PERMISSIONS[role.key] ?? [],
    }));
  }

  async createRole(input: {
    key?: string;
    name?: string;
    description?: string;
    permissions?: string[];
  }) {
    await this.ensureBootstrapFromEnv();
    const key = this.normalizeKey(input.key);
    const role = await this.roles.save(
      this.roles.create({
        key,
        name: input.name?.trim() || key,
        description: input.description?.trim() || '',
      }),
    );
    if (Array.isArray(input.permissions)) {
      ADMIN_ROLE_PERMISSIONS[key] = input.permissions.filter(Boolean);
    }
    return { ...role, permissions: ADMIN_ROLE_PERMISSIONS[key] ?? [] };
  }

  async listUserRoles(userId: number) {
    await this.ensureBootstrapFromEnv();
    const assignments = await this.userRoles.find({
      where: { userId },
      order: { roleKey: 'ASC' },
    });
    return {
      userId,
      roles: assignments.map((assignment) => assignment.roleKey),
      permissions: this.permissionsForRoles(
        assignments.map((assignment) => assignment.roleKey),
      ),
    };
  }

  async setUserRoles(input: {
    userId: number;
    roleKeys: string[];
    grantedByUserId?: number | null;
  }) {
    await this.ensureBootstrapFromEnv();
    const roleKeys = Array.from(
      new Set(input.roleKeys.map((roleKey) => this.normalizeKey(roleKey))),
    );
    const knownRoles = await this.roles.find({ where: { key: In(roleKeys) } });
    const knownRoleKeys = new Set(knownRoles.map((role) => role.key));
    await this.userRoles.delete({ userId: input.userId });
    if (knownRoleKeys.size > 0) {
      await this.userRoles.save(
        Array.from(knownRoleKeys).map((roleKey) =>
          this.userRoles.create({
            userId: input.userId,
            roleKey,
            grantedByUserId: input.grantedByUserId ?? null,
          }),
        ),
      );
    }
    await this.recordAudit({
      userId: input.grantedByUserId ?? null,
      permission: 'rbac:manage',
      route: `/admin/rbac/users/${input.userId}/roles`,
      decision: 'allowed',
      reason: 'admin_roles_updated',
      metadata: {
        targetUserId: input.userId,
        roleKeys: Array.from(knownRoleKeys),
      },
    });
    return this.listUserRoles(input.userId);
  }

  async listAuditLogs(limit?: number) {
    return this.auditLogs.find({
      order: { createdAt: 'DESC' },
      take: this.limit(limit),
    });
  }

  async recordAudit(input: AuditInput) {
    await this.auditLogs.save(
      this.auditLogs.create({
        userId: input.userId ?? null,
        permission: input.permission ?? null,
        route: input.route ?? '',
        decision: input.decision,
        reason: input.reason ?? '',
        metadata: input.metadata ?? {},
      }),
    );
  }

  private async bootstrap(): Promise<void> {
    await this.permissions.upsert(
      ADMIN_PERMISSIONS.map((permission) => ({
        key: permission.key,
        description: permission.description,
      })),
      ['key'],
    );
    await this.roles.upsert(
      ADMIN_ROLES.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
      })),
      ['key'],
    );

    const bootstrapUserIds = this.bootstrapUserIds();
    if (bootstrapUserIds.length === 0) return;
    await this.userRoles.upsert(
      bootstrapUserIds.map((userId) => ({
        userId,
        roleKey: 'owner_admin',
        grantedByUserId: null,
      })),
      ['userId', 'roleKey'],
    );
  }

  private bootstrapUserIds(): number[] {
    const ids = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
    if (process.env.NODE_ENV !== 'production') {
      ids.push(1);
    }
    return Array.from(new Set(ids));
  }

  private permissionsForRoles(roleKeys: string[]) {
    const permissions = new Set<string>();
    roleKeys.forEach((roleKey) => {
      (ADMIN_ROLE_PERMISSIONS[roleKey] ?? []).forEach((permission) =>
        permissions.add(permission),
      );
    });
    return Array.from(permissions).sort();
  }

  private normalizeKey(value?: string): string {
    return (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private limit(value?: number): number {
    if (!Number.isFinite(value) || !value || value <= 0) return 50;
    return Math.min(200, Math.trunc(value));
  }
}
