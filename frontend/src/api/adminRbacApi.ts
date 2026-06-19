import { requestProtected } from './baseClient';
import { fitMeetCoreEndpoints } from './fitmeetCoreContract';

export type AdminRoleDto = {
  id: number;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type AdminUserRolesDto = {
  userId: number;
  roles: string[];
  permissions: string[];
};

export type AdminAuditLogDto = {
  id: number;
  userId: number | null;
  permission: string | null;
  route: string;
  decision: 'allowed' | 'denied' | 'system';
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export const adminRbacApi = {
  roles() {
    return requestProtected<AdminRoleDto[]>(fitMeetCoreEndpoints.adminRbac.roles);
  },
  createRole(input: {
    key: string;
    name?: string;
    description?: string;
    permissions?: string[];
  }) {
    return requestProtected<AdminRoleDto>(fitMeetCoreEndpoints.adminRbac.roles, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  userRoles(userId: number) {
    return requestProtected<AdminUserRolesDto>(
      fitMeetCoreEndpoints.adminRbac.userRoles(userId),
    );
  },
  setUserRoles(userId: number, roles: string[]) {
    return requestProtected<AdminUserRolesDto>(
      fitMeetCoreEndpoints.adminRbac.userRoles(userId),
      {
        method: 'PUT',
        body: JSON.stringify({ roles }),
      },
    );
  },
  auditLogs(limit = 100) {
    return requestProtected<AdminAuditLogDto[]>(
      `${fitMeetCoreEndpoints.adminRbac.auditLogs}?limit=${limit}`,
    );
  },
};
