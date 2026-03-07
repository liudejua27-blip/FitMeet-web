import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { KafkaService } from './kafka.service';

@Controller('kafka')
export class KafkaController {
  constructor(private readonly kafkaService: KafkaService) {}

  @Post('emit')
  emit(@Body() message: any) {
    // Demo endpoint
    return { status: 'Kafka not fully configured' };
  }
}
