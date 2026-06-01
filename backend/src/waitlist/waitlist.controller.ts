import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AdminWaitlistQueryDto,
  CreateInviteCodeDto,
  SubmitAppWaitlistDto,
  TrackWaitlistEventDto,
  ValidateInviteCodeDto,
} from './dto/waitlist.dto';
import { WaitlistService } from './waitlist.service';

@Controller()
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post('waitlist/app')
  submitAppWaitlist(
    @Body() body: SubmitAppWaitlistDto,
    @Req() req: RequestLike,
  ) {
    return this.waitlist.submitAppWaitlist(body, requestMeta(req));
  }

  @Post('waitlist/validate-invite')
  validateInvite(@Body() body: ValidateInviteCodeDto) {
    return this.waitlist.validateInvite(body.inviteCode);
  }

  @Post('waitlist/events')
  async trackEvent(
    @Body() body: TrackWaitlistEventDto,
    @Req() req: RequestLike,
  ) {
    await this.waitlist.track(
      body.eventName,
      this.waitlist.hashIp(requestMeta(req).ip),
      body.metadata ?? {},
    );
    return { ok: true };
  }

  @Get('admin/waitlist')
  @UseGuards(JwtAuthGuard)
  listAdminWaitlist(
    @Query() query: AdminWaitlistQueryDto,
    @Req() req: RequestLike,
  ) {
    this.assertAdmin(req.user?.id);
    return this.waitlist.listAdminWaitlist(query);
  }

  @Get('admin/waitlist/stats')
  @UseGuards(JwtAuthGuard)
  getAdminStats(@Req() req: RequestLike) {
    this.assertAdmin(req.user?.id);
    return this.waitlist.getStats();
  }

  @Post('admin/invite-codes')
  @UseGuards(JwtAuthGuard)
  createInviteCode(@Body() body: CreateInviteCodeDto, @Req() req: RequestLike) {
    this.assertAdmin(req.user?.id);
    return this.waitlist.createInviteCode(body);
  }

  @Get('admin/invite-codes')
  @UseGuards(JwtAuthGuard)
  listInviteCodes(@Req() req: RequestLike) {
    this.assertAdmin(req.user?.id);
    return this.waitlist.listInviteCodes();
  }

  private assertAdmin(userId?: number) {
    const ids = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((id) => Number.isFinite(id));
    const isDevAdmin = process.env.NODE_ENV !== 'production' && userId === 1;
    if (!userId || (!ids.includes(userId) && !isDevAdmin)) {
      throw new ForbiddenException('Admin permission required');
    }
  }
}

type RequestLike = {
  ip?: string;
  user?: { id: number };
  headers?: Record<string, string | string[] | undefined>;
};

function requestMeta(req: RequestLike) {
  return {
    ip:
      req.headers?.['x-forwarded-for'] ??
      req.headers?.['x-real-ip'] ??
      req.ip ??
      '',
    userAgent: String(req.headers?.['user-agent'] ?? ''),
  };
}
