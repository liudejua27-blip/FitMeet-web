import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminRbacController } from './admin-rbac.controller';
import { AdminRbacGuard } from './admin-rbac.guard';
import { AdminRbacService } from './admin-rbac.service';
import {
  AdminAuditLog,
  AdminPermission,
  AdminRole,
  AdminUserRole,
} from './entities/admin-rbac.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminRole,
      AdminPermission,
      AdminUserRole,
      AdminAuditLog,
    ]),
  ],
  controllers: [AdminRbacController],
  providers: [AdminRbacService, AdminRbacGuard],
  exports: [AdminRbacService, AdminRbacGuard, TypeOrmModule],
})
export class AdminRbacModule {}
