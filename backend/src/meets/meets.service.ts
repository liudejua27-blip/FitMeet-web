import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Club } from '../clubs/club.entity';
import { ClubMember } from '../clubs/club-member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityType } from '../activities/entities/activity-template.entity';
import { shouldRunBackgroundJobs } from '../common/process-role.util';
import { Meet } from './meet.entity';
import { MeetParticipant } from './meet-participant.entity';
import { CreateMeetDto } from './dto/create-meet.dto';

type Origin = { lat?: number; lng?: number };
type MeetQuery = {
  type?: string;
  city?: string;
  clubId?: number;
  origin?: Origin;
};

@Injectable()
export class MeetsService {
  constructor(
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    @InjectRepository(MeetParticipant)
    private readonly participantRepo: Repository<MeetParticipant>,
    @InjectRepository(Club)
    private readonly clubRepo: Repository<Club>,
    @InjectRepository(ClubMember)
    private readonly clubMemberRepo: Repository<ClubMember>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => ActivitiesService))
    private readonly activitiesService: ActivitiesService,
  ) {}

  async findAll(query: MeetQuery = {}) {
    const origin = query.origin || {};
    const qb = this.meetRepo
      .createQueryBuilder('meet')
      .leftJoinAndSelect('meet.user', 'user')
      .leftJoinAndSelect('meet.club', 'club')
      .where('meet.status != :cancelled', { cancelled: 'cancelled' })
      .orderBy('meet.createdAt', 'DESC');

    if (query.type && query.type !== 'all') {
      qb.andWhere('meet.type = :type', { type: query.type });
    }
    if (query.city) {
      qb.andWhere('meet.city = :city', { city: query.city });
    }
    if (query.clubId) {
      qb.andWhere('meet.clubId = :clubId', { clubId: query.clubId });
    }

    const meets = await qb.getMany();
    const result = await Promise.all(
      meets.map(async (meet) => {
        const participants = await this.loadParticipants(meet.id);
        return this.toMeetResponse(meet, participants, origin);
      }),
    );

    if (this.hasOrigin(origin)) {
      return result.sort(
        (a, b) =>
          (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
      );
    }

    return result;
  }

  async findOne(id: number, origin: Origin = {}) {
    const meet = await this.meetRepo.findOne({
      where: { id },
      relations: ['user', 'club'],
    });
    if (!meet) throw new NotFoundException('Meet not found');

    const participants = await this.loadParticipants(id);
    return this.toMeetResponse(meet, participants, origin);
  }

  async findTripShare(token: string) {
    const meet = await this.meetRepo.findOne({
      where: { tripShareToken: token },
      relations: ['user'],
    });
    if (meet) {
      return {
        type: 'creator',
        meet: this.toMeetResponse(meet, await this.loadParticipants(meet.id)),
      };
    }

    const participant = await this.participantRepo.findOne({
      where: { tripShareToken: token },
      relations: ['meet', 'meet.user', 'user'],
    });
    if (!participant?.meet) {
      throw new NotFoundException('Trip share not found');
    }

    return {
      type: 'participant',
      participant: {
        id: participant.id,
        name: participant.user?.name || '',
        status: participant.status,
      },
      meet: this.toMeetResponse(
        participant.meet,
        await this.loadParticipants(participant.meetId),
      ),
    };
  }

  async create(userId: number, dto: CreateMeetDto) {
    const clubId = dto.clubId ?? null;
    const club = clubId
      ? await this.clubRepo.findOne({ where: { id: clubId } })
      : null;
    if (clubId && !club) {
      throw new NotFoundException('Club not found');
    }
    if (clubId) {
      await this.assertActiveClubMember(clubId, userId);
    }

    const startAt = this.parseStartAt(dto.startAt || dto.time);
    const autoCancelAt = startAt
      ? new Date(startAt.getTime() - 24 * 60 * 60 * 1000)
      : null;

    const meet = this.meetRepo.create({
      ...dto,
      clubId,
      city: dto.city?.trim() || club?.city || '',
      startAt,
      autoCancelAt,
      cancelReason: null,
      userId,
      price: dto.price || 'free',
      maxSlots: dto.maxSlots || 4,
      level: dto.level || 'all',
      desc: dto.desc || '',
      address: dto.address || '',
      poiId: dto.poiId || null,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      slots: 0,
      status: 'active',
    });
    const saved = await this.meetRepo.save(meet);
    if (clubId) {
      await this.clubRepo.increment({ id: clubId }, 'meetCount', 1);
    }
    return this.findOne(saved.id);
  }

  async join(meetId: number, userId: number) {
    const meet = await this.meetRepo.findOne({ where: { id: meetId } });
    if (!meet) throw new NotFoundException('Meet not found');
    if (meet.status === 'cancelled') {
      throw new BadRequestException('Meet has been cancelled');
    }
    if (meet.userId === userId) {
      throw new BadRequestException('Creator cannot join own meet');
    }
    if (meet.slots >= meet.maxSlots) {
      throw new BadRequestException('Meet is full');
    }

    const existing = await this.participantRepo.findOne({
      where: { meetId, userId },
    });
    if (existing) {
      if (existing.status === 'cancelled') {
        existing.status = 'pending';
        await this.participantRepo.save(existing);
        return { joined: true, status: existing.status };
      }
      throw new BadRequestException('Already requested this meet');
    }

    const participant = await this.participantRepo.save({
      meetId,
      userId,
      status: 'pending',
    });

    return { joined: true, status: participant.status };
  }

  async confirmParticipant(
    meetId: number,
    participantId: number,
    userId: number,
  ) {
    const meet = await this.requireOwnedMeet(meetId, userId);
    if (meet.slots >= meet.maxSlots) {
      throw new BadRequestException('Meet is full');
    }

    const participant = await this.participantRepo.findOne({
      where: { id: participantId, meetId },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    if (participant.status === 'active') {
      return { confirmed: true };
    }

    participant.status = 'active';
    await this.participantRepo.save(participant);
    await this.meetRepo.increment({ id: meetId }, 'slots', 1);

    // Advance the meet to 'matched' once at least one participant is confirmed,
    // so the unified meet→activity flow can surface the right CTA.
    if (meet.status === 'active' || meet.status === 'pending') {
      meet.status = 'matched';
      await this.meetRepo.save(meet);
    }
    return { confirmed: true };
  }

  /**
   * Mark a Meet as having its履约 Activity created. Called from
   * ActivitiesService after a meet-derived activity is persisted.
   */
  async markActivityCreated(meetId: number, activityId: number) {
    await this.meetRepo.update(
      { id: meetId },
      { status: 'activity_created', activityId },
    );
  }

  /**
   * Mark a Meet as completed once the associated activity finishes.
   */
  async markCompletedFromActivity(meetId: number) {
    await this.meetRepo.update({ id: meetId }, { status: 'completed' });
  }

  /**
   * Create the履约 Activity attached to a Meet. Only the meet creator can do
   * this, and only once. The new activity links back via `meetId`, and the
   * meet is moved to `activity_created` with its `activityId` set (this is
   * handled by ActivitiesService.create via markActivityCreated).
   */
  async createActivityForMeet(meetId: number, userId: number) {
    const meet = await this.requireOwnedMeet(meetId, userId);
    if (meet.status === 'cancelled') {
      throw new BadRequestException('Meet has been cancelled');
    }
    if (meet.activityId) {
      return { activityId: meet.activityId, reused: true };
    }

    const participants = await this.loadParticipants(meetId);
    const activeParticipant = participants.find((p) => p.status === 'active');

    const activity = await this.activitiesService.create(userId, {
      type: this.mapMeetTypeToActivityType(meet.type),
      title: meet.title,
      description: meet.desc,
      locationName: meet.loc,
      city: meet.city,
      lat: meet.lat ?? undefined,
      lng: meet.lng ?? undefined,
      startTime: meet.startAt ? meet.startAt.toISOString() : undefined,
      meetId: meet.id,
      invitedUserId: activeParticipant?.userId,
    });

    return { activityId: activity.id, reused: false };
  }

  private mapMeetTypeToActivityType(meetType: string): ActivityType {
    switch ((meetType || '').toLowerCase()) {
      case 'run':
        return ActivityType.Running;
      case 'gym':
      case 'yoga':
      case 'swim':
      case 'martial':
      case 'ball':
        return ActivityType.Fitness;
      case 'outdoor':
        return ActivityType.CityWalk;
      default:
        return ActivityType.Custom;
    }
  }

  async cancel(meetId: number, userId: number) {
    const meet = await this.meetRepo.findOne({ where: { id: meetId } });
    if (!meet) throw new NotFoundException('Meet not found');

    if (meet.userId === userId) {
      const wasActive = meet.status !== 'cancelled';
      meet.status = 'cancelled';
      meet.cancelReason = 'creator_cancelled';
      await this.meetRepo.save(meet);
      await this.participantRepo.update({ meetId }, { status: 'cancelled' });
      if (wasActive && meet.clubId) {
        await this.decrementClubMeetCount(meet.clubId);
      }
      return { cancelled: true, scope: 'meet' };
    }

    const participant = await this.participantRepo.findOne({
      where: { meetId, userId },
    });
    if (!participant) throw new NotFoundException('Participation not found');

    const wasActive = participant.status === 'active';
    participant.status = 'cancelled';
    await this.participantRepo.save(participant);
    if (wasActive && meet.slots > 0) {
      await this.meetRepo.decrement({ id: meetId }, 'slots', 1);
    }
    return { cancelled: true, scope: 'participant' };
  }

  async createTripShare(meetId: number, userId: number) {
    const meet = await this.meetRepo.findOne({ where: { id: meetId } });
    if (!meet) throw new NotFoundException('Meet not found');

    const token = randomUUID();
    if (meet.userId === userId) {
      meet.tripShareToken = token;
      await this.meetRepo.save(meet);
    } else {
      const participant = await this.participantRepo.findOne({
        where: { meetId, userId },
      });
      if (!participant || participant.status === 'cancelled') {
        throw new ForbiddenException('Join the meet before sharing trip');
      }
      participant.tripShareToken = token;
      await this.participantRepo.save(participant);
    }

    const baseUrl =
      this.configService.get<string>('FRONTEND_BASE_URL') ||
      this.configService.get<string>('BASE_URL') ||
      'http://localhost:5173';

    return {
      token,
      url: `${baseUrl.replace(/\/$/, '')}/meet?trip=${token}`,
    };
  }

  async getRecords(userId: number) {
    const hosting = await this.meetRepo.find({
      where: { userId },
      relations: ['user'],
    });
    const hostingRecords = hosting.map((meet) => ({
      id: meet.id,
      title: meet.title,
      sport: meet.sport,
      time: meet.time,
      status: meet.status || 'active',
      partner: meet.user?.name || '',
      loc: meet.loc,
      createdAt: meet.createdAt,
    }));

    const participations = await this.participantRepo.find({
      where: { userId },
      relations: ['meet', 'meet.user'],
    });

    const participationRecords = participations
      .filter((p) => !!p.meet)
      .map((p) => ({
        id: p.meetId,
        title: p.meet.title,
        sport: p.meet.sport,
        time: p.meet.time,
        status: p.status || 'active',
        partner: p.meet.user?.name || '',
        loc: p.meet.loc,
        createdAt: p.createdAt,
      }));

    return [...hostingRecords, ...participationRecords]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((record) => {
        const result: Partial<typeof record> = { ...record };
        delete result.createdAt;
        return result;
      });
  }

  @Cron('*/10 * * * *')
  async cancelExpiredEmptyMeets() {
    if (!shouldRunBackgroundJobs()) return;
    const candidates = await this.meetRepo.find({
      where: {
        status: 'active',
        autoCancelAt: LessThanOrEqual(new Date()),
      },
      relations: ['user'],
      take: 100,
    });

    for (const meet of candidates) {
      const participantCount = await this.participantRepo.count({
        where: {
          meetId: meet.id,
          status: In(['pending', 'active']),
        },
      });
      if (participantCount > 0) continue;

      meet.status = 'cancelled';
      meet.cancelReason = 'no_participants_before_24h';
      await this.meetRepo.save(meet);
      if (meet.clubId) {
        await this.decrementClubMeetCount(meet.clubId);
      }
      await this.safeNotify({
        userId: meet.userId,
        type: 'meet',
        text: `活动「${meet.title}」因开始前24小时仍无人报名，已自动终止`,
        targetId: meet.id,
      });
    }

    return { cancelled: candidates.length };
  }

  private async requireOwnedMeet(meetId: number, userId: number) {
    const meet = await this.meetRepo.findOne({ where: { id: meetId } });
    if (!meet) throw new NotFoundException('Meet not found');
    if (meet.userId !== userId) {
      throw new ForbiddenException('Only creator can manage this meet');
    }
    return meet;
  }

  private loadParticipants(meetId: number) {
    return this.participantRepo.find({
      where: { meetId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  private toMeetResponse(
    meet: Meet,
    participants: MeetParticipant[],
    origin: Origin = {},
  ) {
    const user = meet.user;
    const distanceMeters = this.getDistanceMeters(origin, meet);

    return {
      id: meet.id,
      userId: user?.id,
      title: meet.title,
      type: meet.type,
      sport: meet.sport,
      clubId: meet.clubId,
      clubName: meet.club?.name || '',
      city: meet.city,
      username: user?.name || '',
      color: user?.color || '#C8FF00',
      colorBg: this.getColorBg(user?.color || '#C8FF00'),
      time: meet.time,
      loc: meet.loc,
      address: meet.address || '',
      poiId: meet.poiId,
      lat: meet.lat,
      lng: meet.lng,
      dist: distanceMeters
        ? this.formatDistance(distanceMeters)
        : meet.dist || '',
      distanceMeters,
      price: meet.price,
      slots: meet.slots,
      maxSlots: meet.maxSlots,
      level: meet.level,
      desc: meet.desc,
      status: meet.status,
      participants: participants
        .filter((p) => p.status === 'active')
        .map((p) => p.user?.name || ''),
      participantDetails: participants.map((p) => ({
        participantId: p.id,
        userId: p.userId,
        name: p.user?.name || '',
        avatar: p.user?.avatar || p.user?.name?.[0] || '',
        color: p.user?.color || '#C8FF00',
        status: p.status,
      })),
      cert: user?.singleCert || user?.verified || false,
      rating: Number(meet.rating),
      meetCount: meet.meetCount,
      feeType: meet.feeType,
      groupType: meet.groupType,
      creatorType: meet.creatorType,
      startAt: meet.startAt?.toISOString(),
      autoCancelAt: meet.autoCancelAt?.toISOString(),
      cancelReason: meet.cancelReason,
      activityId: meet.activityId ?? null,
    };
  }

  private async assertActiveClubMember(clubId: number, userId: number) {
    const member = await this.clubMemberRepo.findOne({
      where: { clubId, userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('Join this club before posting a club meet');
    }
    return member;
  }

  private parseStartAt(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private async decrementClubMeetCount(clubId: number) {
    await this.clubRepo
      .createQueryBuilder()
      .update(Club)
      .set({ meetCount: () => 'GREATEST("meetCount" - 1, 0)' })
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
      // Automatic cancellation should not depend on Mongo availability.
    }
  }

  private hasOrigin(origin: Origin): origin is { lat: number; lng: number } {
    return Number.isFinite(origin.lat) && Number.isFinite(origin.lng);
  }

  private getDistanceMeters(origin: Origin, meet: Meet) {
    if (
      !this.hasOrigin(origin) ||
      !Number.isFinite(meet.lat) ||
      !Number.isFinite(meet.lng)
    ) {
      return undefined;
    }

    const earthRadius = 6371000;
    const dLat = this.toRadians((meet.lat as number) - origin.lat);
    const dLng = this.toRadians((meet.lng as number) - origin.lng);
    const fromLat = this.toRadians(origin.lat);
    const toLat = this.toRadians(meet.lat as number);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return Math.round(
      earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
    );
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private formatDistance(meters: number) {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  }

  private getColorBg(color: string): string {
    const map: Record<string, string> = {
      '#C8FF00': '#2a3300',
      '#FF6B9D': '#330020',
      '#A78BFA': '#1a0a2e',
      '#F97316': '#2a1100',
      '#38BDF8': '#001528',
      '#22C55E': '#0a2010',
    };
    return map[color] || '#1a1a1a';
  }
}
