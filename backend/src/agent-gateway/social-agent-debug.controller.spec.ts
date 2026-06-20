import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { ADMIN_PERMISSION_METADATA } from '../admin-rbac/admin-rbac.decorator';
import { AdminRbacGuard } from '../admin-rbac/admin-rbac.guard';
import { SocialAgentDebugController } from './social-agent-debug.controller';

describe('SocialAgentDebugController', () => {
  it('keeps Social Agent debug endpoints behind admin RBAC', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SocialAgentDebugController,
    ) as unknown[];

    expect(Reflect.getMetadata(PATH_METADATA, SocialAgentDebugController)).toBe(
      'social-agent/debug',
    );
    expect(guards).toEqual(expect.arrayContaining([AdminRbacGuard]));
    expect(
      Reflect.getMetadata(
        ADMIN_PERMISSION_METADATA,
        SocialAgentDebugController,
      ),
    ).toBe('agent:l5:read');
  });

  it('requires write permission for route-message debug execution', () => {
    expect(
      Reflect.getMetadata(
        ADMIN_PERMISSION_METADATA,
        SocialAgentDebugController.prototype.routeMessageDebug,
      ),
    ).toBe('agent:l5:write');
    expect(
      Reflect.getMetadata(
        ADMIN_PERMISSION_METADATA,
        SocialAgentDebugController.prototype.getCandidatePoolDebug,
      ),
    ).toBeUndefined();
  });
});
