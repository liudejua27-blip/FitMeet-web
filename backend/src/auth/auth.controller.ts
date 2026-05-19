import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { WechatMiniLoginDto } from './dto/wechat-mini-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Throttle({ short: { limit: 10, ttl: 3600000 } })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('sms/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 1, ttl: 60000 } })
  sendSmsCode(@Body() dto: SendSmsDto) {
    return this.authService.sendSmsCode(dto);
  }

  @Post('sms/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  loginWithPhone(@Body() dto: PhoneLoginDto) {
    return this.authService.loginWithPhone(dto);
  }

  @Get('wechat/url')
  getWechatLoginUrl() {
    return this.authService.getWechatLoginUrl();
  }

  @Post('wechat/login')
  @HttpCode(HttpStatus.OK)
  loginWithWechat(@Body() dto: WechatLoginDto) {
    return this.authService.loginWithWechat(dto);
  }

  @Post('wechat-mini/login')
  @HttpCode(HttpStatus.OK)
  loginWithWechatMini(@Body() dto: WechatMiniLoginDto) {
    return this.authService.loginWithWechatMini(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@CurrentUser() user: User) {
    return this.authService.getProfile(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  logout() {
    return undefined;
  }
}
