import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { FindOptionsWhere, ILike, MoreThan, Repository } from 'typeorm';
import {
  AdminWaitlistQueryDto,
  CreateInviteCodeDto,
  SubmitAppWaitlistDto,
} from './dto/waitlist.dto';
import { InviteCode } from './entities/invite-code.entity';
import { WaitlistAnalyticsEvent } from './entities/waitlist-analytics-event.entity';
import { WaitlistAppEntry } from './entities/waitlist-app-entry.entity';
import { WaitlistQualityScoringService } from './waitlist-quality-scoring.service';
import { WaitlistStatus } from './waitlist.enums';

export interface WaitlistRequestMeta {
  ip?: string | string[];
  userAgent?: string;
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(WaitlistAppEntry)
    private readonly entries: Repository<WaitlistAppEntry>,
    @InjectRepository(InviteCode)
    private readonly inviteCodes: Repository<InviteCode>,
    @InjectRepository(WaitlistAnalyticsEvent)
    private readonly events: Repository<WaitlistAnalyticsEvent>,
    private readonly scoring: WaitlistQualityScoringService,
  ) {}

  async submitAppWaitlist(
    input: SubmitAppWaitlistDto,
    meta: WaitlistRequestMeta = {},
  ) {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const ipHash = this.hashIp(meta.ip);
    await this.assertIpLimit(ipHash);
    await this.track('waitlist_submit', ipHash, {
      deviceType: input.deviceType,
      city: input.city,
      source: input.source ?? 'app_page',
    });

    const existingByEmail = await this.entries.findOne({ where: { email } });
    const existingByPhone = phone
      ? await this.entries.findOne({ where: { phone } })
      : null;
    if (existingByPhone && existingByPhone.email !== email) {
      await this.track('waitlist_submit_failed', ipHash, {
        reason: 'duplicate_phone',
      });
      throw new ConflictException('这个手机号已经提交过内测申请。');
    }

    const inviteCode = normalizeInviteCode(input.inviteCode);
    const invite = inviteCode
      ? await this.getUsableInviteOrThrow(inviteCode)
      : null;
    const quality = this.scoring.score({
      city: input.city,
      scenarios: cleanList(input.scenarios),
      interviewWilling: input.interviewWilling,
      inviteCode,
      deviceType: input.deviceType,
      userRole: input.userRole,
    });

    const entry = existingByEmail ?? this.entries.create({ email });
    entry.phone = phone;
    entry.country = cleanText(input.country, 80);
    entry.region = cleanText(input.region, 80);
    entry.city = cleanText(input.city, 80);
    entry.preferredLanguage = cleanText(input.preferredLanguage, 20) || 'zh-CN';
    entry.timezone = cleanText(input.timezone, 80) || 'Asia/Shanghai';
    entry.deviceType = input.deviceType;
    entry.scenarios = cleanList(input.scenarios);
    entry.interests = cleanList(input.interests ?? []);
    entry.userRole = input.userRole;
    entry.interviewWilling = input.interviewWilling;
    entry.inviteCode = inviteCode || entry.inviteCode;
    entry.source = cleanText(input.source, 80) || 'app_page';
    entry.qualityScore = quality.qualityScore;
    entry.qualityLevel = quality.qualityLevel;
    entry.qualityReasons = quality.qualityReasons;
    entry.status = existingByEmail?.status ?? WaitlistStatus.Pending;
    entry.ipHash = ipHash;
    entry.userAgent = cleanText(meta.userAgent, 500);

    const saved = await this.entries.save(entry);
    if (invite && !existingByEmail?.inviteCode) {
      invite.usedCount += 1;
      await this.inviteCodes.save(invite);
      await this.track('invite_code_used', ipHash, {
        code: invite.code,
        batchName: invite.batchName,
        city: invite.city,
      });
    }
    await this.track('waitlist_submit_success', ipHash, {
      entryId: saved.id,
      qualityLevel: saved.qualityLevel,
      deviceType: saved.deviceType,
      city: saved.city,
    });
    this.logSafe('waitlist_submit_success', {
      entryId: saved.id,
      city: saved.city,
      qualityLevel: saved.qualityLevel,
      source: saved.source,
    });
    return this.toPublicEntry(saved);
  }

  async validateInvite(code: string) {
    const normalized = normalizeInviteCode(code);
    if (!normalized) throw new BadRequestException('请输入邀请码。');
    const invite = await this.inviteCodes.findOne({
      where: { code: normalized },
    });
    if (!invite) return { valid: false, reason: '邀请码不存在' };
    const reason = this.inviteInvalidReason(invite);
    if (reason) return { valid: false, reason };
    return {
      valid: true,
      code: invite.code,
      batchName: invite.batchName,
      source: invite.source,
      city: invite.city,
      scenario: invite.scenario,
      remainingUses: Math.max(0, invite.maxUses - invite.usedCount),
    };
  }

  async createInviteCode(input: CreateInviteCodeDto) {
    const code = normalizeInviteCode(input.code) || this.generateInviteCode();
    const existing = await this.inviteCodes.findOne({ where: { code } });
    if (existing) throw new ConflictException('邀请码已存在。');
    const invite = await this.inviteCodes.save(
      this.inviteCodes.create({
        code,
        batchName: cleanText(input.batchName, 120),
        source: cleanText(input.source, 80),
        city: cleanText(input.city, 80),
        scenario: cleanText(input.scenario, 120),
        maxUses: Math.max(1, Math.min(100000, Number(input.maxUses ?? 1))),
        usedCount: 0,
        active: input.active ?? true,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }),
    );
    return this.toInviteDto(invite);
  }

  async listInviteCodes() {
    const codes = await this.inviteCodes.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 200,
    });
    return codes.map((code) => this.toInviteDto(code));
  }

  async listAdminWaitlist(query: AdminWaitlistQueryDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 30)));
    const where:
      | FindOptionsWhere<WaitlistAppEntry>[]
      | FindOptionsWhere<WaitlistAppEntry> = this.adminWhere(query);
    const [items, total] = await this.entries.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: items.map((entry) => this.toAdminEntry(entry)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getStats() {
    const entries = await this.entries.find({ take: 5000 });
    const inviteCodes = await this.inviteCodes.find({ take: 1000 });
    return {
      total: entries.length,
      highQuality: entries.filter(
        (entry) => String(entry.qualityLevel) === 'high',
      ).length,
      interviewWilling: entries.filter((entry) => entry.interviewWilling)
        .length,
      byCountry: countBy(entries, (entry) => entry.country || '未填写'),
      byCity: countBy(entries, (entry) => entry.city || '未填写'),
      byDevice: countBy(entries, (entry) => entry.deviceType),
      byScenario: countArray(entries, (entry) => entry.scenarios),
      byUserRole: countBy(entries, (entry) => entry.userRole),
      byInviteSource: countBy(
        entries,
        (entry) =>
          inviteCodes.find((code) => code.code === entry.inviteCode)?.source ||
          entry.source ||
          'organic',
      ),
    };
  }

  async track(
    eventName: string,
    ipHash = '',
    metadata: Record<string, unknown> = {},
  ) {
    const allowed = new Set([
      'app_page_view',
      'waitlist_submit',
      'waitlist_submit_success',
      'waitlist_submit_failed',
      'invite_code_used',
      'scenario_selected',
      'city_selected',
    ]);
    if (!allowed.has(eventName)) return;
    await this.events.save(
      this.events.create({
        eventName,
        ipHash,
        metadata: redactMetadata(metadata),
      }),
    );
  }

  hashIp(value?: string | string[]): string {
    const raw = Array.isArray(value) ? value[0] : value;
    const text = String(raw ?? '')
      .split(',')[0]
      .trim();
    if (!text) return '';
    return createHash('sha256')
      .update(
        `${text}:${process.env.WAITLIST_IP_HASH_SALT ?? 'fitmeet_waitlist'}`,
      )
      .digest('hex');
  }

  private async assertIpLimit(ipHash: string) {
    if (!ipHash) return;
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.entries.count({
      where: { ipHash, createdAt: MoreThan(since) },
    });
    if (count >= 5) throw new BadRequestException('提交太频繁，请稍后再试。');
  }

  private async getUsableInviteOrThrow(code: string) {
    const invite = await this.inviteCodes.findOne({ where: { code } });
    if (!invite) throw new BadRequestException('邀请码不存在，请检查后重试。');
    const reason = this.inviteInvalidReason(invite);
    if (reason) throw new BadRequestException(reason);
    return invite;
  }

  private inviteInvalidReason(invite: InviteCode) {
    if (!invite.active) return '邀请码已停用。';
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now())
      return '邀请码已过期。';
    if (invite.usedCount >= invite.maxUses) return '邀请码使用次数已满。';
    return '';
  }

  private adminWhere(query: AdminWaitlistQueryDto) {
    const base: FindOptionsWhere<WaitlistAppEntry> = {};
    if (query.city) base.city = query.city;
    if (query.deviceType) base.deviceType = query.deviceType;
    if (query.status) base.status = query.status;
    if (query.qualityLevel) base.qualityLevel = query.qualityLevel as never;
    if (!query.q) return base;
    const q = `%${query.q}%`;
    return [
      { ...base, email: ILike(q) },
      { ...base, phone: ILike(q) },
      { ...base, city: ILike(q) },
      { ...base, inviteCode: ILike(q) },
    ];
  }

  private generateInviteCode() {
    return randomBytes(5).toString('hex').toUpperCase();
  }

  private toPublicEntry(entry: WaitlistAppEntry) {
    return {
      id: entry.id,
      email: maskEmail(entry.email),
      phone: maskPhone(entry.phone),
      country: entry.country,
      city: entry.city,
      deviceType: entry.deviceType,
      scenarios: entry.scenarios,
      userRole: entry.userRole,
      interviewWilling: entry.interviewWilling,
      qualityLevel: entry.qualityLevel,
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private toAdminEntry(entry: WaitlistAppEntry) {
    return {
      id: entry.id,
      email: maskEmail(entry.email),
      phone: maskPhone(entry.phone),
      country: entry.country,
      region: entry.region,
      city: entry.city,
      preferredLanguage: entry.preferredLanguage,
      timezone: entry.timezone,
      deviceType: entry.deviceType,
      scenarios: entry.scenarios,
      interests: entry.interests,
      userRole: entry.userRole,
      interviewWilling: entry.interviewWilling,
      inviteCode: entry.inviteCode,
      source: entry.source,
      qualityScore: entry.qualityScore,
      qualityLevel: entry.qualityLevel,
      qualityReasons: entry.qualityReasons,
      status: entry.status,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private toInviteDto(invite: InviteCode) {
    return {
      id: invite.id,
      code: invite.code,
      batchName: invite.batchName,
      source: invite.source,
      city: invite.city,
      scenario: invite.scenario,
      maxUses: invite.maxUses,
      usedCount: invite.usedCount,
      active: invite.active,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      createdAt: invite.createdAt.toISOString(),
      updatedAt: invite.updatedAt.toISOString(),
    };
  }

  private logSafe(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...redactMetadata(payload) }));
  }
}

function normalizeEmail(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizePhone(value?: string | null) {
  const phone = String(value ?? '').trim();
  return phone || null;
}

function normalizeInviteCode(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function cleanText(value: unknown, maxLength: number) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return '';
  }
  return String(value).trim().slice(0, maxLength);
}

function cleanList(value: unknown[]) {
  return Array.from(
    new Set(
      value
        .map((item) => cleanText(item, 80))
        .filter(Boolean)
        .slice(0, 12),
    ),
  );
}

function maskEmail(value: string) {
  const [name, domain] = value.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value: string | null) {
  if (!value) return null;
  return value.length > 7
    ? `${value.slice(0, 3)}****${value.slice(-4)}`
    : '****';
}

function redactMetadata(metadata: Record<string, unknown>) {
  const next = { ...metadata };
  if ('email' in next) next.email = '[redacted]';
  if ('phone' in next) next.phone = '[redacted]';
  return next;
}

function countBy<T>(items: T[], getter: (item: T) => string) {
  return sortCounts(
    items.reduce<Record<string, number>>((acc, item) => {
      const key = getter(item) || 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  );
}

function countArray<T>(items: T[], getter: (item: T) => string[]) {
  return sortCounts(
    items.reduce<Record<string, number>>((acc, item) => {
      for (const key of getter(item) ?? []) {
        acc[key] = (acc[key] ?? 0) + 1;
      }
      return acc;
    }, {}),
  );
}

function sortCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
