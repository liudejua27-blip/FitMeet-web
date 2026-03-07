import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaService } from './kafka.service';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([{
      name: 'KAFKA_SERVICE',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        transport: Transport.KAFKA,
        options: {
          client: {
            brokers: [configService.get<string>('KAFKA_BROKER') || 'localhost:9092'],
            clientId: 'fitness-app-client',
          },
          consumer: {
            groupId: 'fitness-app-consumer',
          },
        },
      }),
      inject: [ConfigService],
    }]),
  ],
  providers: [KafkaService],
  exports: [ClientsModule, KafkaService],
})
export class KafkaModule {}
