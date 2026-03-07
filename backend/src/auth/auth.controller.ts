import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /* ========== Email ========== */

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /* ========== SMS / Phone ========== */

  @Public()
  @Post('sms/send')
  sendSmsCode(@Body() dto: SendSmsDto) {
    return this.authService.sendSmsCode(dto);
  }

  @Public()
  @Post('sms/verify')
  loginWithPhone(@Body() dto: PhoneLoginDto) {
    return this.authService.loginWithPhone(dto);
  }

  /* ========== WeChat ========== */

  @Public()
  @Get('wechat/url')
  getWechatLoginUrl() {
    return this.authService.getWechatLoginUrl();
  }

  @Public()
  @Post('wechat/login')
  loginWithWechat(@Body() dto: WechatLoginDto) {
    return this.authService.loginWithWechat(dto);
  }

  /* ========== Refresh Token ========== */

  @Public()
  @Post('refresh')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /* ========== Profile ========== */

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }
}
