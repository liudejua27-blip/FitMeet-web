import { SetMetadata } from '@nestjs/common';

import type { AdminPermissionKey } from './admin-rbac.constants';

export const ADMIN_PERMISSION_METADATA = 'fitmeet:admin-permission';

export const RequireAdminPermission = (permission: AdminPermissionKey) =>
  SetMetadata(ADMIN_PERMISSION_METADATA, permission);
