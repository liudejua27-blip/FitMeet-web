import { Controller, Get } from '@nestjs/common';
import { GiftsService } from './gifts.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('gifts')
export class GiftsController {
  constructor(private readonly giftsService: GiftsService) {}

  @Public()
  @Get()
  findAll() {
    return this.giftsService.findAll();
  }
}
