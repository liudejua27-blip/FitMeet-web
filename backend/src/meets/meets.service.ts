import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Meet } from './meet.entity';
import { MeetParticipant } from './meet-participant.entity';
import { CreateMeetDto } from './dto/create-meet.dto';

@Injectable()
export class MeetsService {
  constructor(
    @InjectRepository(Meet)
    private readonly meetRepo: Repository<Meet>,
    @InjectRepository(MeetParticipant)
    private readonly participantRepo: Repository<MeetParticipant>,
  ) {}

  async findAll(type?: string) {
    const qb = this.meetRepo.createQueryBuilder('meet')
      .leftJoinAndSelect('meet.user', 'user')
      .orderBy('meet.createdAt', 'DESC');

    if (type && type !== 'all') {
      qb.where('meet.type = :type', { type });
    }

    const meets = await qb.getMany();

    // Load participants for each meet
    const result = await Promise.all(
      meets.map(async (m) => {
        const participants = await this.participantRepo.find({
          where: { meetId: m.id },
          relations: ['user'],
        });
        return this.toMeetResponse(m, participants);
      }),
    );
    return result;
  }

  async findOne(id: number) {
    const meet = await this.meetRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!meet) throw new NotFoundException('约练不存在');

    const participants = await this.participantRepo.find({
      where: { meetId: id },
      relations: ['user'],
    });
    return this.toMeetResponse(meet, participants);
  }

  async create(userId: number, dto: CreateMeetDto) {
    const meet = this.meetRepo.create({
      ...dto,
      userId,
      price: dto.price || '免费',
      maxSlots: dto.maxSlots || 4,
      level: dto.level || '全部',
      desc: dto.desc || '',
      slots: 0,
      status: 'active',
    });
    const saved = await this.meetRepo.save(meet);
    return this.findOne(saved.id);
  }

  async join(meetId: number, userId: number) {
    const meet = await this.meetRepo.findOne({ where: { id: meetId } });
    if (!meet) throw new NotFoundException('约练不存在');

    if (meet.slots >= meet.maxSlots) {
      throw new BadRequestException('约练人数已满');
    }

    const existing = await this.participantRepo.findOne({
      where: { meetId, userId },
    });
    if (existing) {
      throw new BadRequestException('你已经加入了这个约练');
    }

    await this.participantRepo.save({ meetId, userId, status: 'active' });
    await this.meetRepo.increment({ id: meetId }, 'slots', 1);

    return { joined: true };
  }

  async getRecords(userId: number) {
    const hosting = await this.meetRepo.find({ where: { userId }, relations: ['user'] });
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
      .map(({ createdAt, ...rest }) => rest);
  }

  private toMeetResponse(meet: Meet, participants: MeetParticipant[]) {
    const user = meet.user;
    return {
      id: meet.id,
      userId: user?.id,
      title: meet.title,
      type: meet.type,
      sport: meet.sport,
      username: user?.name || '',
      color: user?.color || '#C8FF00',
      colorBg: this.getColorBg(user?.color || '#C8FF00'),
      time: meet.time,
      loc: meet.loc,
      dist: meet.dist || '',
      price: meet.price,
      slots: meet.slots,
      maxSlots: meet.maxSlots,
      level: meet.level,
      desc: meet.desc,
      participants: participants.map(p => p.user?.name || ''),
      cert: user?.singleCert || false,
      rating: Number(meet.rating),
      meetCount: meet.meetCount,
      feeType: meet.feeType,
      groupType: meet.groupType,
      creatorType: meet.creatorType,
    };
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
