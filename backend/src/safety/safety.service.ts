import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateVerificationDto } from './dto/create-verification.dto';
import { EmergencyContactDto } from './dto/emergency-contact.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { EmergencyContact } from './emergency-contact.entity';
import { SafetyReport } from './report.entity';
import { UserBlock } from './user-block.entity';
import { VerificationRequest } from './verification-request.entity';
import { ContactPolicyService } from '../social-loop/contact-policy.service';

@Injectable()
export class SafetyService {
  constructor(
    @InjectRepository(SafetyReport)
    private readonly reportRepo: Repository<SafetyReport>,
    @InjectRepository(UserBlock)
    private readonly blockRepo: Repository<UserBlock>,
    @InjectRepository(VerificationRequest)
    private readonly verificationRepo: Repository<VerificationRequest>,
    @InjectRepository(EmergencyContact)
    private readonly emergencyContactRepo: Repository<EmergencyContact>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly contactPolicy: ContactPolicyService,
  ) {}

  async createReport(reporterId: number, dto: CreateReportDto) {
    if (dto.targetType === 'user' && dto.targetId === reporterId) {
      throw new BadRequestException('Cannot report yourself');
    }

    return this.reportRepo.save({
      reporterId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      description: dto.description || '',
      status: 'pending',
    });
  }

  async blockUser(blockerId: number, blockedId: number) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const user = await this.userRepo.findOne({ where: { id: blockedId } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.blockRepo.findOne({
      where: { blockerId, blockedId },
    });
    if (existing) {
      await this.contactPolicy.closeForBlock(blockerId, blockedId);
      return { blocked: true };
    }

    await this.blockRepo.save({ blockerId, blockedId });
    await this.contactPolicy.closeForBlock(blockerId, blockedId);
    return { blocked: true };
  }

  async unblockUser(blockerId: number, blockedId: number) {
    await this.blockRepo.delete({ blockerId, blockedId });
    return { blocked: false };
  }

  async getBlockedUserIds(blockerId: number) {
    const blocks = await this.blockRepo.find({ where: { blockerId } });
    return blocks.map((block) => block.blockedId);
  }

  /** IDs of users who have blocked `userId` (the inverse direction). */
  async getUsersWhoBlocked(userId: number) {
    const blocks = await this.blockRepo.find({ where: { blockedId: userId } });
    return blocks.map((block) => block.blockerId);
  }

  /** Both directions: anyone the user must not appear next to in matching. */
  async getMutualBlockUserIds(userId: number): Promise<Set<number>> {
    const [iBlocked, blockedMe] = await Promise.all([
      this.getBlockedUserIds(userId),
      this.getUsersWhoBlocked(userId),
    ]);
    return new Set<number>([...iBlocked, ...blockedMe]);
  }

  /**
   * Conservative exclusion set for Agent-driven stranger recommendations.
   * Pending/reviewing reports are treated as risk until reviewed; rejected
   * reports are excluded from this gate so false reports do not permanently
   * suppress a user.
   */
  async getAgentRecommendationExcludedUserIds(
    userId: number,
  ): Promise<Set<number>> {
    const [blockedIds, reportedUsers] = await Promise.all([
      this.getMutualBlockUserIds(userId),
      this.reportRepo.find({
        where: { targetType: 'user' },
        select: ['targetId', 'status'],
      }),
    ]);
    const riskStatuses = new Set(['pending', 'reviewing', 'resolved']);
    for (const report of reportedUsers) {
      if (report.targetId !== userId && riskStatuses.has(report.status)) {
        blockedIds.add(report.targetId);
      }
    }
    return blockedIds;
  }

  async createVerificationRequest(userId: number, dto: CreateVerificationDto) {
    const pending = await this.verificationRepo.findOne({
      where: { userId, type: dto.type, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const request =
      pending ??
      this.verificationRepo.create({
        userId,
        type: dto.type,
      });

    request.realName = dto.realName || request.realName || '';
    request.idNumberMasked = dto.idNumberMasked || request.idNumberMasked || '';
    request.certName = dto.certName || request.certName || '';
    request.certImageUrl = dto.certImageUrl || request.certImageUrl || '';
    request.status = 'approved';
    request.adminNote = request.adminNote || 'Auto-approved on submission';
    request.handledById = null;

    const saved = await this.verificationRepo.save(request);
    await this.applyApprovedVerificationToUser(saved);
    return saved;
  }

  getMyVerificationRequests(userId: number) {
    return this.verificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async addEmergencyContact(userId: number, dto: EmergencyContactDto) {
    const count = await this.emergencyContactRepo.count({ where: { userId } });
    if (count >= 5) {
      throw new BadRequestException('Emergency contact limit reached');
    }

    return this.emergencyContactRepo.save({
      userId,
      name: dto.name,
      phone: dto.phone,
      relation: dto.relation,
    });
  }

  getEmergencyContacts(userId: number) {
    return this.emergencyContactRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteEmergencyContact(userId: number, id: number) {
    await this.emergencyContactRepo.delete({ id, userId });
    return { deleted: true };
  }

  async listReports(adminId: number) {
    this.assertAdmin(adminId);
    return this.reportRepo.find({ order: { createdAt: 'DESC' }, take: 200 });
  }

  async updateReport(adminId: number, id: number, dto: UpdateReportStatusDto) {
    this.assertAdmin(adminId);
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');

    report.status = dto.status;
    report.adminNote = dto.adminNote || '';
    report.handledById = adminId;
    return this.reportRepo.save(report);
  }

  async listVerificationRequests(adminId: number) {
    this.assertAdmin(adminId);
    return this.verificationRepo.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async updateVerificationRequest(
    adminId: number,
    id: number,
    dto: UpdateVerificationStatusDto,
  ) {
    this.assertAdmin(adminId);
    const request = await this.verificationRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Verification not found');

    request.status = dto.status;
    request.adminNote = dto.adminNote || '';
    request.handledById = adminId;
    const saved = await this.verificationRepo.save(request);

    if (dto.status === 'approved') {
      await this.applyApprovedVerificationToUser(request);
    }

    return saved;
  }

  private async applyApprovedVerificationToUser(request: VerificationRequest) {
    const update: Partial<User> = {};
    if (request.type === 'real_name') {
      update.verified = true;
    }
    if (request.type === 'coach') {
      update.singleCert = true;
    }

    if (Object.keys(update).length > 0) {
      await this.userRepo.update(request.userId, update);
    }
  }

  private assertAdmin(userId: number) {
    const ids = (this.configService.get<string>('ADMIN_USER_IDS') || '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter(Number.isFinite);

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const isDevAdmin = !isProduction && userId === 1;

    if (!ids.includes(userId) && !isDevAdmin) {
      throw new ForbiddenException('Admin permission required');
    }
  }
}
