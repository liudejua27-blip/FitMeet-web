import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { Meet } from '../meets/meet.entity';
import { Club } from './club.entity';
import { ClubMember } from './club-member.entity';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

type ListClubsQuery = {
  city?: string;
  sportType?: string;
  q?: string;
  mine?: boolean;
};

@Injectable()
export class ClubsService {
  constructor(
    @InjectRepository(Club)
    private readonly clubRepo: Repository<Club>,
    @InjectRepository(ClubMember)
    private readonly memberRepo: Repository<ClubMember>,
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: ListClubsQuery, userId?: number) {
    let scopedClubIds: number[] | undefined;
    if (query.mine) {
      if (!userId) return [];
      const memberships = await this.memberRepo.find({
        where: { userId, status: Not('rejected') },
      });
      scopedClubIds = memberships.map((item) => item.clubId);
      if (scopedClubIds.length === 0) return [];
    }

    const where: Record<string, unknown> = {};
    if (query.city) where.city = query.city;
    if (query.sportType && query.sportType !== 'all') {
      where.sportType = query.sportType;
    }
    if (scopedClubIds) where.id = scopedClubIds;

    const qb = this.clubRepo
      .createQueryBuilder('club')
      .leftJoinAndSelect('club.owner', 'owner');
    Object.entries(where).forEach(([key, value]) => {
      qb.andWhere(
        `club.${key} ${key === 'id' ? 'IN (:...ids)' : `= :${key}`}`,
        {
          [key === 'id' ? 'ids' : key]: value,
        },
      );
    });
    if (query.q) {
      qb.andWhere(
        '(club.name ILIKE :q OR club.description ILIKE :q OR club.city ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }
    qb.orderBy('club.updatedAt', 'DESC');

    return this.decorateClubs(await qb.getMany(), userId);
  }

  async create(userId: number, dto: CreateClubDto) {
    const club = await this.clubRepo.save(
      this.clubRepo.create({
        name: dto.name.trim(),
        city: dto.city.trim(),
        sportType: dto.sportType,
        description: dto.description?.trim() || '',
        coverUrl: dto.coverUrl?.trim() || '',
        joinPolicy: dto.joinPolicy || 'open',
        announcement: dto.announcement?.trim() || '',
        ownerId: userId,
        memberCount: 1,
      }),
    );

    await this.memberRepo.save({
      clubId: club.id,
      userId,
      role: 'owner',
      status: 'active',
    });

    return this.findOne(club.id, userId);
  }

  async findOne(id: number, userId?: number) {
    const club = await this.clubRepo.findOne({
      where: { id },
      relations: ['owner'],
    });
    if (!club) throw new NotFoundException('Club not found');

    const [members, pendingCount, activeMeets] = await Promise.all([
      this.memberRepo.find({
        where: { clubId: id, status: 'active' },
        relations: ['user'],
        order: { role: 'ASC', createdAt: 'ASC' },
        take: 24,
      }),
      this.memberRepo.count({ where: { clubId: id, status: 'pending' } }),
      this.meetRepo.count({ where: { clubId: id, status: Not('cancelled') } }),
    ]);

    const [decorated] = await this.decorateClubs([club], userId);
    return {
      ...decorated,
      meetCount: activeMeets,
      pendingCount,
      members: members.map((member) => this.toMemberResponse(member)),
    };
  }

  async update(id: number, userId: number, dto: UpdateClubDto) {
    await this.requireManager(id, userId);
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');

    if (dto.name !== undefined) club.name = dto.name.trim();
    if (dto.city !== undefined) club.city = dto.city.trim();
    if (dto.sportType !== undefined) club.sportType = dto.sportType;
    if (dto.description !== undefined)
      club.description = dto.description.trim();
    if (dto.coverUrl !== undefined) club.coverUrl = dto.coverUrl.trim();
    if (dto.joinPolicy !== undefined) club.joinPolicy = dto.joinPolicy;
    if (dto.announcement !== undefined)
      club.announcement = dto.announcement.trim();

    await this.clubRepo.save(club);
    return this.findOne(id, userId);
  }

  async join(id: number, userId: number) {
    const club = await this.clubRepo.findOne({ where: { id } });
    if (!club) throw new NotFoundException('Club not found');
    if (club.ownerId === userId) {
      return this.findExistingMembership(id, userId);
    }

    const nextStatus = club.joinPolicy === 'open' ? 'active' : 'pending';
    const existing = await this.memberRepo.findOne({
      where: { clubId: id, userId },
      relations: ['user'],
    });

    if (existing) {
      if (existing.status === 'active' || existing.status === 'pending') {
        return this.toMemberResponse(existing);
      }
      existing.status = nextStatus;
      existing.role = 'member';
      await this.memberRepo.save(existing);
      if (nextStatus === 'active') await this.bumpMemberCount(id, 1);
      return this.toMemberResponse(existing);
    }

    const member = await this.memberRepo.save({
      clubId: id,
      userId,
      role: 'member',
      status: nextStatus,
    });
    if (nextStatus === 'active') await this.bumpMemberCount(id, 1);
    if (nextStatus === 'pending') {
      await this.safeNotify({
        userId: club.ownerId,
        type: 'system',
        text: `${club.name} 收到新的入圈申请`,
        targetId: club.id,
      });
    }

    return this.memberRepo
      .findOne({ where: { id: member.id }, relations: ['user'] })
      .then((saved) => this.toMemberResponse(saved || member));
  }

  async approveMember(clubId: number, memberId: number, userId: number) {
    await this.requireManager(clubId, userId);
    const member = await this.requireMember(clubId, memberId);
    if (member.status !== 'active') {
      member.status = 'active';
      await this.memberRepo.save(member);
      await this.bumpMemberCount(clubId, 1);
      await this.safeNotify({
        userId: member.userId,
        type: 'system',
        text: '你的入圈申请已通过',
        targetId: clubId,
      });
    }
    return this.toMemberResponse(member);
  }

  async rejectMember(clubId: number, memberId: number, userId: number) {
    await this.requireManager(clubId, userId);
    const member = await this.requireMember(clubId, memberId);
    if (member.role === 'owner') {
      throw new BadRequestException('Owner membership cannot be rejected');
    }
    const wasActive = member.status === 'active';
    member.status = 'rejected';
    await this.memberRepo.save(member);
    if (wasActive) await this.bumpMemberCount(clubId, -1);
    return this.toMemberResponse(member);
  }

  async removeMember(clubId: number, memberId: number, userId: number) {
    await this.requireManager(clubId, userId);
    const member = await this.requireMember(clubId, memberId);
    if (member.role === 'owner') {
      throw new BadRequestException('Owner cannot be removed');
    }
    if (member.status === 'active') await this.bumpMemberCount(clubId, -1);
    await this.memberRepo.delete({ id: memberId, clubId });
    return { removed: true };
  }

  async assertActiveMember(clubId: number, userId: number) {
    const member = await this.memberRepo.findOne({
      where: { clubId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('Join this club before posting a club meet');
    }
    return member;
  }

  private async findExistingMembership(clubId: number, userId: number) {
    const member = await this.memberRepo.findOne({
      where: { clubId, userId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Membership not found');
    return this.toMemberResponse(member);
  }

  private async requireManager(clubId: number, userId: number) {
    const member = await this.memberRepo.findOne({
      where: { clubId, userId, status: 'active' },
    });
    if (!member || !['owner', 'manager'].includes(member.role)) {
      throw new ForbiddenException('Club manager permission required');
    }
    return member;
  }

  private async requireMember(clubId: number, memberId: number) {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, clubId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Club member not found');
    return member;
  }

  private async decorateClubs(clubs: Club[], userId?: number) {
    const myMemberships =
      userId && clubs.length > 0
        ? await this.memberRepo.find({
            where: { userId, clubId: In(clubs.map((club) => club.id)) },
          })
        : [];
    const membershipByClub = new Map(
      myMemberships.map((item) => [item.clubId, item]),
    );

    return clubs.map((club) => {
      const mine = membershipByClub.get(club.id);
      return {
        id: club.id,
        name: club.name,
        city: club.city,
        sportType: club.sportType,
        description: club.description,
        coverUrl: club.coverUrl,
        joinPolicy: club.joinPolicy,
        announcement: club.announcement,
        memberCount: club.memberCount,
        meetCount: club.meetCount,
        ownerId: club.ownerId,
        ownerName: club.owner?.name || '',
        myStatus: mine?.status,
        myRole: mine?.role,
        createdAt: club.createdAt,
        updatedAt: club.updatedAt,
      };
    });
  }

  private toMemberResponse(member: ClubMember) {
    return {
      id: member.id,
      clubId: member.clubId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      name: member.user?.name || '',
      avatar: member.user?.avatar || member.user?.name?.[0] || '',
      color: member.user?.color || '#C8FF00',
      createdAt: member.createdAt,
    };
  }

  private async bumpMemberCount(clubId: number, delta: number) {
    if (delta > 0) {
      await this.clubRepo.increment({ id: clubId }, 'memberCount', delta);
      return;
    }
    await this.clubRepo
      .createQueryBuilder()
      .update(Club)
      .set({ memberCount: () => 'GREATEST("memberCount" - 1, 0)' })
      .where('id = :clubId', { clubId })
      .execute();
  }

  private async safeNotify(data: {
    userId: number;
    type: string;
    text: string;
    targetId?: number;
  }) {
    try {
      await this.notificationsService.create(data);
    } catch {
      // Notifications are helpful, but club writes should not depend on Mongo.
    }
  }
}
