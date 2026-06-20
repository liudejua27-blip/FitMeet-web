import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { ADMIN_PERMISSION_METADATA } from '../admin-rbac/admin-rbac.decorator';
import { AdminRbacGuard } from '../admin-rbac/admin-rbac.guard';
import { AgentUserController } from './agent-gateway.controller';

describe('AgentUserController RBAC boundaries', () => {
  it('keeps profile-match autopilot debug behind admin RBAC', () => {
    const handler = AgentUserController.prototype.getProfileMatchAutopilotDebug;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'profile-match/autopilot/debug',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
      expect.arrayContaining([AdminRbacGuard]),
    );
    expect(Reflect.getMetadata(ADMIN_PERMISSION_METADATA, handler)).toBe(
      'agent:l5:read',
    );
  });
});
