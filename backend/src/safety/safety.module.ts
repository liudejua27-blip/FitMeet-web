import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { EmergencyContact } from './emergency-contact.entity';
import { SafetyReport } from './report.entity';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { UserBlock } from './user-block.entity';
import { VerificationRequest } from './verification-request.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      SafetyReport,
      UserBlock,
      VerificationRequest,
      EmergencyContact,
      User,
    ]),
  ],
  controllers: [SafetyController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
