import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ModerationService } from './moderation.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
