import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { MeetsService } from './meets.service';
import { CreateMeetDto } from './dto/create-meet.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';

@Controller('meets')
export class MeetsController {
  constructor(private readonly meetsService: MeetsService) {}

  @Public()
  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('city') city?: string,
    @Query('clubId') clubId?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.meetsService.findAll({
      type,
      city,
      clubId: clubId ? Number(clubId) : undefined,
      origin: {
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
      },
    });
  }

  @Public()
  @Get('trip/:token')
  findTripShare(@Param('token') token: string) {
    return this.meetsService.findTripShare(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('records/me')
  getRecords(@Request() req: AuthenticatedRequest) {
    return this.meetsService.getRecords(req.user.id);
  }

  @Public()
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.meetsService.findOne(id, {
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateMeetDto) {
    return this.meetsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  join(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.meetsService.join(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/participants/:participantId/confirm')
  confirmParticipant(
    @Param('id', ParseIntPipe) id: number,
    @Param('participantId', ParseIntPipe) participantId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.meetsService.confirmParticipant(id, participantId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.meetsService.cancel(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/trip-share')
  createTripShare(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.meetsService.createTripShare(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/create-activity')
  createActivity(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.meetsService.createActivityForMeet(id, req.user.id);
  }
}
