import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSocialProfile } from '../users/user-social-profile.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { LifeGraphAuditLog } from './entities/life-graph-audit-log.entity';
import { LifeGraphField } from './entities/life-graph-field.entity';
import { LifeGraphProfile } from './entities/life-graph-profile.entity';
import { LifeGraphProposal } from './entities/life-graph-proposal.entity';
import { LifeGraphController } from './life-graph.controller';
import { LifeGraphExtractionService } from './life-graph-extraction.service';
import { LifeGraphService } from './life-graph.service';

@Module({
  imports: [
    RealtimeModule,
    TypeOrmModule.forFeature([
      LifeGraphProfile,
      LifeGraphField,
      LifeGraphAuditLog,
      LifeGraphProposal,
      UserSocialProfile,
    ]),
  ],
  controllers: [LifeGraphController],
  providers: [LifeGraphService, LifeGraphExtractionService],
  exports: [LifeGraphService, LifeGraphExtractionService, TypeOrmModule],
})
export class LifeGraphModule {}
