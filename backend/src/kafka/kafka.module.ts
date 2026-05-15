import { Global, Module, Logger, type DynamicModule } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';

/**
 * Kafka is an optional dependency. Set ENABLE_KAFKA=true to register the real
 * ClientKafka; anything else (including unset) skips ClientsModule entirely
 * so KafkaService falls back to its no-op mode and the app boots cleanly
 * without a broker. See backend/.env.example.
 */
const KAFKA_ENABLED = process.env.ENABLE_KAFKA === 'true';

@Global()
@Module({})
export class KafkaModule {
  static forRoot(): DynamicModule {
    if (!KAFKA_ENABLED) {
      new Logger(KafkaModule.name).log(
        'ENABLE_KAFKA!=true — registering KafkaService in no-op mode',
      );
      return {
        module: KafkaModule,
        providers: [KafkaService],
        exports: [KafkaService],
      };
    }

    return {
      module: KafkaModule,
      imports: [
        ClientsModule.registerAsync([
          {
            name: 'KAFKA_SERVICE',
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
              transport: Transport.KAFKA,
              options: {
                client: {
                  brokers: (
                    configService.get<string>('KAFKA_BROKERS') ||
                    configService.get<string>('KAFKA_BROKER') ||
                    'localhost:9092'
                  )
                    .split(',')
                    .map((broker) => broker.trim())
                    .filter(Boolean),
                  clientId:
                    configService.get<string>('KAFKA_CLIENT_ID') ||
                    'fitness-app-client',
                },
                consumer: {
                  groupId: 'fitness-app-consumer',
                },
              },
            }),
            inject: [ConfigService],
          },
        ]),
      ],
      providers: [KafkaService],
      exports: [ClientsModule, KafkaService],
    };
  }
}
