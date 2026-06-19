import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import { AdminRbacGuard } from './admin-rbac.guard';
import { AdminRbacService } from './admin-rbac.service';
import { RequireAdminPermission } from './admin-rbac.decorator';

type AdminRequest = Request & {
  user: { id: number };
};

@Controller('admin/rbac')
@UseGuards(AuthGuard('jwt'), AdminRbacGuard)
@RequireAdminPermission('rbac:manage')
export class AdminRbacController {
  constructor(private readonly rbac: AdminRbacService) {}

  @Get('roles')
  listRoles() {
    return this.rbac.listRoles();
  }

  @Post('roles')
  createRole(
    @Body()
    body: {
      key?: string;
      name?: string;
      description?: string;
      permissions?: string[];
    },
  ) {
    return this.rbac.createRole(body ?? {});
  }

  @Get('users/:userId/roles')
  listUserRoles(@Param('userId', ParseIntPipe) userId: number) {
    return this.rbac.listUserRoles(userId);
  }

  @Put('users/:userId/roles')
  setUserRoles(
    @Req() req: AdminRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { roles?: string[] },
  ) {
    return this.rbac.setUserRoles({
      userId,
      roleKeys: body?.roles ?? [],
      grantedByUserId: req.user.id,
    });
  }

  @Get('audit-logs')
  listAuditLogs(@Query('limit') limit?: string) {
    return this.rbac.listAuditLogs(Number(limit));
  }
}
