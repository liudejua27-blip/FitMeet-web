import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateVerificationDto } from './dto/create-verification.dto';
import { EmergencyContactDto } from './dto/emergency-contact.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { SafetyService } from './safety.service';

@Controller('safety')
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Post('reports')
  createReport(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateReportDto,
  ) {
    return this.safetyService.createReport(req.user.id, dto);
  }

  @Post('blocks/:id')
  blockUser(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.safetyService.blockUser(req.user.id, id);
  }

  @Delete('blocks/:id')
  unblockUser(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.safetyService.unblockUser(req.user.id, id);
  }

  @Get('blocks/ids')
  getBlockedUserIds(@Request() req: AuthenticatedRequest) {
    return this.safetyService.getBlockedUserIds(req.user.id);
  }

  @Post('verifications')
  createVerification(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateVerificationDto,
  ) {
    return this.safetyService.createVerificationRequest(req.user.id, dto);
  }

  @Get('verifications/me')
  getMyVerifications(@Request() req: AuthenticatedRequest) {
    return this.safetyService.getMyVerificationRequests(req.user.id);
  }

  @Get('emergency-contacts')
  getEmergencyContacts(@Request() req: AuthenticatedRequest) {
    return this.safetyService.getEmergencyContacts(req.user.id);
  }

  @Post('emergency-contacts')
  addEmergencyContact(
    @Request() req: AuthenticatedRequest,
    @Body() dto: EmergencyContactDto,
  ) {
    return this.safetyService.addEmergencyContact(req.user.id, dto);
  }

  @Delete('emergency-contacts/:id')
  deleteEmergencyContact(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.safetyService.deleteEmergencyContact(req.user.id, id);
  }

  @Get('admin/reports')
  listReports(@Request() req: AuthenticatedRequest) {
    return this.safetyService.listReports(req.user.id);
  }

  @Patch('admin/reports/:id')
  updateReport(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.safetyService.updateReport(req.user.id, id, dto);
  }

  @Get('admin/verifications')
  listVerifications(@Request() req: AuthenticatedRequest) {
    return this.safetyService.listVerificationRequests(req.user.id);
  }

  @Patch('admin/verifications/:id')
  updateVerification(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVerificationStatusDto,
  ) {
    return this.safetyService.updateVerificationRequest(req.user.id, id, dto);
  }
}
