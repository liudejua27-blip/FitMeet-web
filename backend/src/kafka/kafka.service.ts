import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class KafkaService implements OnModuleInit {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly client: ClientKafka,
  ) {}

  async onModuleInit() {
    this.client.subscribeToResponseOf('fitness_topics');
    await this.client.connect();
  }

  emit(topic: string, data: any) {
    return this.client.emit(topic, data);
  }
}
