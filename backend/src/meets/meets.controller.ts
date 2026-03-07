import {
  Controller, Get, Post, Param, Query, Body,
  UseGuards, Request, ParseIntPipe,
} from '@nestjs/common';
import { MeetsService } from './meets.service';
import { CreateMeetDto } from './dto/create-meet.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller('meets')
export class MeetsController {
  constructor(private readonly meetsService: MeetsService) {}

  @Public()
  @Get()
  findAll(@Query('type') type?: string) {
    return this.meetsService.findAll(type);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.meetsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req, @Body() dto: CreateMeetDto) {
    return this.meetsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  join(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.meetsService.join(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('records/me')
  getRecords(@Request() req) {
    return this.meetsService.getRecords(req.user.id);
  }
}
