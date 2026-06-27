import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveUploadTempDir } from './upload-paths';
import { MediaAsset } from '../users/media-asset.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaAsset]),
    MulterModule.register({
      dest: resolveUploadTempDir(),
    }),
    ConfigModule,
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
