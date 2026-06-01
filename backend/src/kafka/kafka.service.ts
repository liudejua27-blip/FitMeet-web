import {
  Injectable,
  Inject,
  OnModuleInit,
  Optional,
  Logger,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

/**
 * KafkaService — thin wrapper around the optional Kafka client.
 *
 * When ENABLE_KAFKA!=true the KafkaModule registers this service WITHOUT a
 * ClientKafka, so all methods become no-ops and nothing prevents the app from
 * booting. When enabled, connect errors are downgraded to warnings so a
 * temporarily unavailable broker cannot crash the whole app.
 */
@Injectable()
export class KafkaService implements OnModuleInit {
  private readonly logger = new Logger(KafkaService.name);

  constructor(
    @Optional() @Inject('KAFKA_SERVICE') private readonly client?: ClientKafka,
  ) {}

  async onModuleInit() {
    if (!this.client) {
      this.logger.log(
        'Kafka disabled (ENABLE_KAFKA!=true) — using no-op client',
      );
      return;
    }
    try {
      this.client.subscribeToResponseOf('fitness_topics');
      await this.client.connect();
      this.logger.log('Kafka client connected');
    } catch (err) {
      this.logger.warn(
        `Kafka connect failed, continuing without Kafka: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  emit(topic: string, data: unknown) {
    if (!this.client) return undefined;
    try {
      return this.client.emit(topic, data);
    } catch (err) {
      this.logger.warn(
        `Kafka emit(${topic}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }
}
