import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftsController } from './gifts.controller';
import { GiftsService } from './gifts.service';
import { Gift } from './gift.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Gift])],
  controllers: [GiftsController],
  providers: [GiftsService],
  exports: [GiftsService],
})
export class GiftsModule {}
