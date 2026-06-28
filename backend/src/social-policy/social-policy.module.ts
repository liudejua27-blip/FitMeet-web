import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBlock } from '../safety/user-block.entity';
import { UsersModule } from '../users/users.module';
import { SocialPolicyService } from './social-policy.service';

@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([UserBlock])],
  providers: [SocialPolicyService],
  exports: [SocialPolicyService],
})
export class SocialPolicyModule {}
