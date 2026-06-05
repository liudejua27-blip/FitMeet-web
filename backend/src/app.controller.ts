import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { fitMeetCoreOpenApi } from './openapi/fitmeet-core.openapi';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('openapi/fitmeet-core.json')
  getFitMeetCoreOpenApi() {
    return fitMeetCoreOpenApi;
  }
}
