import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { WechatMiniLoginDto } from './dto/wechat-mini-login.dto';
import { DevLoginDto } from './dto/dev-login.dto';
import { RedisService } from '../redis/redis.service';

const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days
const SMS_CODE_TTL = 300; // 5 minutes
const PLACEHOLDER_PATTERN =
  /^(|change_me.*|your-.*|replace-.*|.*_here|secret_key|password)$/i;

interface WeChatTokenResponse {
  errcode?: number;
  errmsg?: string;
  openid: string;
  access_token: string;
}

interface WeChatUserInfoResponse {
  errcode?: number;
  errmsg?: string;
  nickname: string;
  headimgurl: string;
  sex: number;
  city: string;
  province?: string;
  country?: string;
}

interface WeChatMiniSessionResponse {
  errcode?: number;
  errmsg?: string;
  openid?: string;
  session_key?: string;
  unionid?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private get isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private hasConfiguredValue(value?: string | null): value is string {
    return !!value?.trim() && !PLACEHOLDER_PATTERN.test(value.trim());
  }

  /* ========== Email Auth ========== */

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const name = dto.name.trim();
    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new ConflictException('该邮箱已被注册');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const colors = [
      '#C8FF00',
      '#FF6B9D',
      '#A78BFA',
      '#F97316',
      '#38BDF8',
      '#22C55E',
    ];

    const user = this.userRepo.create({
      email,
      password: hashedPassword,
      name,
      avatar: name[0]?.toUpperCase() || 'U',
      color: colors[Math.floor(Math.random() * colors.length)],
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`User registered: ${saved.id} (${saved.email})`);
    return this.issueTokens(saved);
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.findUserByEmail(email);
    if (!user) {
      this.logger.warn(`Failed login attempt for email: ${email}`);
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      this.logger.warn(`Failed login attempt for user: ${user.id}`);
      throw new UnauthorizedException('邮箱或密码错误');
    }

    this.logger.log(`User logged in: ${user.id}`);
    return this.issueTokens(user);
  }

  /* ========== SMS / Phone Auth ========== */

  async sendSmsCode(dto: SendSmsDto) {
    const redis = this.redisService.getClient();
    const throttleKey = `sms:throttle:${dto.phone}`;

    // Rate limit: 1 SMS per 60s
    const throttled = await redis.get(throttleKey);
    if (throttled) {
      throw new BadRequestException('发送过于频繁，请稍后再试');
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeKey = `sms:code:${dto.phone}`;

    await redis.setex(codeKey, SMS_CODE_TTL, code);
    await redis.setex(throttleKey, 60, '1');

    this.dispatchSms(dto.phone, code);

    return { message: '验证码已发送', expiresIn: SMS_CODE_TTL };
  }

  private dispatchSms(phone: string, code: string) {
    const smsAccessKey = this.configService.get<string>('SMS_ACCESS_KEY');
    const smsSecretKey = this.configService.get<string>('SMS_SECRET_KEY');
    const hasSmsConfig =
      this.hasConfiguredValue(smsAccessKey) &&
      this.hasConfiguredValue(smsSecretKey);

    if (this.isProduction && !hasSmsConfig) {
      this.logger.error('SMS configuration missing in production environment');
      throw new BadRequestException('短信服务配置错误'); // Don't crash, but fail gracefully
    }

    if (hasSmsConfig) {
      // TODO: Integrate actual SMS provider SDK here (e.g., Aliyun, Tencent)
      // For now, simulating the external call
      this.logger.log(
        `[SMS PROD] Sending code ${code} to ${phone} via provider...`,
      );
      // this.smsProvider.send(phone, code);
    } else {
      // Dev mode: log the code
      this.logger.log(`[SMS DEV] Phone: ${phone}, Code: ${code}`);
    }
  }

  async loginWithPhone(dto: PhoneLoginDto) {
    const redis = this.redisService.getClient();
    const codeKey = `sms:code:${dto.phone}`;

    const storedCode = await redis.get(codeKey);
    if (!storedCode || storedCode !== dto.code) {
      throw new UnauthorizedException('验证码错误或已过期');
    }

    // Delete used code
    await redis.del(codeKey);

    return this.ensureUserByPhone(dto.phone);
  }

  private async ensureUserByPhone(phone: string) {
    let user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      const colors = [
        '#C8FF00',
        '#FF6B9D',
        '#A78BFA',
        '#F97316',
        '#38BDF8',
        '#22C55E',
      ];
      user = this.userRepo.create({
        phone,
        email: `${phone}@phone.local`, // TODO: Consider nullable email or enforced binding
        password: await bcrypt.hash(randomUUID(), 10), // random password
        name: `用户${phone.slice(-4)}`,
        avatar: '📱',
        color: colors[Math.floor(Math.random() * colors.length)],
      });
      user = await this.userRepo.save(user);
      this.logger.log(`New user created via phone: ${user.id}`);
    } else {
      this.logger.log(`User logged in via phone: ${user.id}`);
    }
    return this.issueTokens(user);
  }

  /* ========== WeChat OAuth ========== */

  getWechatLoginUrl() {
    const appId = this.configService.get<string>('WECHAT_APP_ID');
    const redirectUri =
      this.configService.get<string>('WECHAT_REDIRECT_URI') ||
      'http://localhost:3000/api/auth/wechat/callback';

    if (!this.hasConfiguredValue(appId)) {
      this.logger.warn('WECHAT_APP_ID not configured');
      // In strict production, might want to throw error.
      // But for now, returning a generic error URL or fallback.
      if (this.isProduction) {
        throw new BadRequestException('微信登录服务未配置');
      }
      return { url: '' }; // Client handle empty
    }

    const encodedRedirect = encodeURIComponent(redirectUri);
    // CSRF protection: state should be random string stored in session/redis
    const state = randomUUID();
    // Ideally store state in redis to verify on callback
    const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodedRedirect}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
    return { url };
  }

  async loginWithWechat(dto: WechatLoginDto) {
    const appId = this.configService.get<string>('WECHAT_APP_ID');
    const appSecret = this.configService.get<string>('WECHAT_APP_SECRET');

    if (
      !this.hasConfiguredValue(appId) ||
      !this.hasConfiguredValue(appSecret)
    ) {
      if (this.isProduction) {
        throw new BadRequestException('微信登录服务配置错误');
      }
      // Dev mode fallback
      this.logger.warn('[DEV] WeChat OAuth not configured, using mock login');
      return this.mockWechatLogin(dto.code);
    }

    try {
      const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${dto.code}&grant_type=authorization_code`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = (await tokenRes.json()) as WeChatTokenResponse;

      if (tokenData.errcode) {
        this.logger.error(`WeChat Token Error: ${tokenData.errmsg}`);
        throw new UnauthorizedException(`微信授权失败: ${tokenData.errmsg}`);
      }

      const { openid, access_token: wxToken } = tokenData;

      const userInfoUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${wxToken}&openid=${openid}&lang=zh_CN`;
      const userInfoRes = await fetch(userInfoUrl);
      const userInfo = (await userInfoRes.json()) as WeChatUserInfoResponse;

      if (userInfo.errcode) {
        this.logger.error(`WeChat UserInfo Error: ${userInfo.errmsg}`);
        throw new UnauthorizedException('无法获取微信用户信息');
      }

      return this.ensureUserByWechat(openid, userInfo);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('WeChat login unexpected error', error);
      throw new UnauthorizedException('微信登录服务暂时不可用');
    }
  }

  async loginWithWechatMini(dto: WechatMiniLoginDto) {
    const appId =
      this.configService.get<string>('WECHAT_MINI_APP_ID') ||
      this.configService.get<string>('WECHAT_APP_ID');
    const appSecret =
      this.configService.get<string>('WECHAT_MINI_APP_SECRET') ||
      this.configService.get<string>('WECHAT_APP_SECRET');

    if (
      !this.hasConfiguredValue(appId) ||
      !this.hasConfiguredValue(appSecret)
    ) {
      if (this.isProduction) {
        throw new BadRequestException('WeChat Mini Program login is not configured');
      }
      this.logger.warn('[DEV] WeChat Mini Program not configured, using mock login');
      return this.ensureUserByWechatMini(`dev_mini_${dto.code}`, dto);
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(
      appId,
    )}&secret=${encodeURIComponent(appSecret)}&js_code=${encodeURIComponent(
      dto.code,
    )}&grant_type=authorization_code`;

    try {
      const res = await fetch(url);
      const data = (await res.json()) as WeChatMiniSessionResponse;
      if (data.errcode || !data.openid) {
        this.logger.error(
          `WeChat Mini session error: ${data.errmsg ?? data.errcode}`,
        );
        throw new UnauthorizedException(
          `WeChat Mini Program login failed: ${data.errmsg ?? ''}`.trim(),
        );
      }
      return this.ensureUserByWechatMini(data.openid, dto);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error('WeChat Mini login unexpected error', error);
      throw new UnauthorizedException('WeChat Mini Program login is temporarily unavailable');
    }
  }

  /* ========== Dev Quick Login ========== */

  async devLogin(dto: DevLoginDto) {
    if (this.isProduction) {
      throw new BadRequestException('开发登录仅限非生产环境');
    }

    const requiredToken = this.configService.get<string>('DEV_LOGIN_TOKEN');
    if (requiredToken && dto.token !== requiredToken) {
      throw new UnauthorizedException('开发登录口令不正确');
    }

    const email = this.normalizeEmail(dto.email || 'dev@fitmeet.local');
    const name = dto.name?.trim() || '开发者';

    let user = await this.findUserByEmail(email);
    if (!user) {
      const colors = [
        '#C8FF00',
        '#FF6B9D',
        '#A78BFA',
        '#F97316',
        '#38BDF8',
        '#22C55E',
      ];
      user = this.userRepo.create({
        email,
        password: await bcrypt.hash(randomUUID(), 10),
        name,
        avatar: name[0]?.toUpperCase() || 'U',
        color: colors[Math.floor(Math.random() * colors.length)],
      });
      user = await this.userRepo.save(user);
      this.logger.log(`Dev user created: ${user.id} (${user.email})`);
    }

    return this.issueTokens(user);
  }

  private async ensureUserByWechat(
    openid: string,
    userInfo: WeChatUserInfoResponse,
  ) {
    let user = await this.userRepo.findOne({ where: { wechatOpenId: openid } });

    if (!user) {
      const colors = [
        '#C8FF00',
        '#FF6B9D',
        '#A78BFA',
        '#F97316',
        '#38BDF8',
        '#22C55E',
      ];
      user = this.userRepo.create({
        wechatOpenId: openid,
        email: `wx_${openid.slice(0, 10)}@wechat.local`,
        password: await bcrypt.hash(randomUUID(), 10),
        name: userInfo.nickname || `微信用户`,
        avatar: userInfo.headimgurl || '',
        color: colors[Math.floor(Math.random() * colors.length)],
        gender: userInfo.sex === 1 ? '男' : userInfo.sex === 2 ? '女' : '',
        city: userInfo.city || '',
      });
      user = await this.userRepo.save(user);
      this.logger.log(`New user created via WeChat: ${user.id}`);
    } else {
      // Optional: Update user info on login
      if (userInfo.headimgurl && user.avatar !== userInfo.headimgurl) {
        user.avatar = userInfo.headimgurl;
        await this.userRepo.save(user);
      }
      this.logger.log(`User logged in via WeChat: ${user.id}`);
    }

    return this.issueTokens(user);
  }

  private async ensureUserByWechatMini(
    openid: string,
    dto: Pick<WechatMiniLoginDto, 'nickname' | 'avatarUrl' | 'city'> = {},
  ) {
    const scopedOpenId = `mini:${openid}`;
    let user = await this.userRepo.findOne({
      where: { wechatOpenId: scopedOpenId },
    });

    if (!user) {
      const colors = [
        '#C8FF00',
        '#FF6B9D',
        '#A78BFA',
        '#F97316',
        '#38BDF8',
        '#22C55E',
      ];
      const name = dto.nickname?.trim() || `FitMeet User ${openid.slice(-4)}`;
      user = this.userRepo.create({
        wechatOpenId: scopedOpenId,
        email: `wxmini_${openid.slice(0, 18)}@wechat-mini.local`,
        password: await bcrypt.hash(randomUUID(), 10),
        name,
        avatar: dto.avatarUrl?.trim() || name[0]?.toUpperCase() || 'F',
        color: colors[Math.floor(Math.random() * colors.length)],
        city: dto.city?.trim() || '',
      });
      user = await this.userRepo.save(user);
      this.logger.log(`New user created via WeChat Mini: ${user.id}`);
    } else {
      let changed = false;
      if (dto.nickname?.trim() && user.name !== dto.nickname.trim()) {
        user.name = dto.nickname.trim();
        changed = true;
      }
      if (dto.avatarUrl?.trim() && user.avatar !== dto.avatarUrl.trim()) {
        user.avatar = dto.avatarUrl.trim();
        changed = true;
      }
      if (dto.city?.trim() && user.city !== dto.city.trim()) {
        user.city = dto.city.trim();
        changed = true;
      }
      if (changed) await this.userRepo.save(user);
      this.logger.log(`User logged in via WeChat Mini: ${user.id}`);
    }

    return this.issueTokens(user);
  }

  /** Dev mode only */
  private async mockWechatLogin(code: string) {
    const fakeOpenId = `dev_wx_${code}`;
    const mockUserInfo: WeChatUserInfoResponse = {
      nickname: `微信用户${code.slice(-4)}`,
      headimgurl: '',
      sex: 1,
      city: 'DevCity',
    };
    return this.ensureUserByWechat(fakeOpenId, mockUserInfo);
  }

  /* ========== Refresh Token ========== */

  async refreshAccessToken(refreshToken: string) {
    const redis = this.redisService.getClient();
    const key = `refresh:${refreshToken}`;
    const userId = await redis.get(key);

    if (!userId) {
      throw new UnauthorizedException('Refresh token 无效或已过期');
    }

    const user = await this.userRepo.findOne({
      where: { id: parseInt(userId) },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // Rotate: delete old refresh token, issue new pair
    await redis.del(key);
    return this.issueTokens(user);
  }

  /* ========== Profile ========== */

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.sanitizeUser(user);
  }

  /* ========== Helpers ========== */

  private async issueTokens(user: User) {
    const accessToken = this.generateAccessToken(user);
    let refreshToken = '';
    try {
      refreshToken = await this.generateRefreshToken(user);
    } catch (error) {
      this.logger.error(
        `Failed to issue refresh token for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  private generateAccessToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });
  }

  private async generateRefreshToken(user: User): Promise<string> {
    const redis = this.redisService.getClient();
    const token = randomUUID();
    await redis.setex(
      `refresh:${token}`,
      REFRESH_TOKEN_TTL,
      user.id.toString(),
    );
    return token;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private findUserByEmail(email: string) {
    return this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: this.normalizeEmail(email) })
      .getOne();
  }

  private sanitizeUser(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = user;
    return result;
  }
}
