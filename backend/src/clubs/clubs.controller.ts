import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import type {
  AuthenticatedRequest,
  OptionalAuthenticatedRequest,
} from '../common/types/authenticated-request';
import { MeetsService } from '../meets/meets.service';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@Controller('clubs')
export class ClubsController {
  constructor(
    private readonly clubsService: ClubsService,
    private readonly meetsService: MeetsService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(
    @Request() req: OptionalAuthenticatedRequest,
    @Query('city') city?: string,
    @Query('sportType') sportType?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('mine') mine?: string,
  ) {
    return this.clubsService.findAll(
      { city, sportType: sportType || type, q, mine: mine === 'true' },
      req.user?.id,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateClubDto) {
    return this.clubsService.create(req.user.id, dto);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: OptionalAuthenticatedRequest,
  ) {
    return this.clubsService.findOne(id, req.user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateClubDto,
  ) {
    return this.clubsService.update(id, req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  join(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clubsService.join(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/members/:memberId/approve')
  approveMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clubsService.approveMember(id, memberId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/members/:memberId/reject')
  rejectMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clubsService.rejectMember(id, memberId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.clubsService.removeMember(id, memberId, req.user.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/meets')
  getClubMeets(
    @Param('id', ParseIntPipe) id: number,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.meetsService.findAll({
      clubId: id,
      origin: {
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
      },
    });
  }
}
