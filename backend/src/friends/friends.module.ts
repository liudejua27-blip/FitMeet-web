import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { Follow } from './follow.entity';
import { User } from '../users/user.entity';
import { AgentSideEffectLedger } from '../agent-gateway/entities/agent-side-effect-ledger.entity';
import { AgentSideEffectLedgerService } from '../agent-gateway/agent-side-effect-ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([Follow, User, AgentSideEffectLedger])],
  controllers: [FriendsController],
  providers: [FriendsService, AgentSideEffectLedgerService],
  exports: [FriendsService],
})
export class FriendsModule {}
