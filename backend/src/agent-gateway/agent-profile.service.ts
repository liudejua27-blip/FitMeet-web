import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateAgentProfileDto, UpdateAgentProfileDto } from './dto/agent-profile.dto';
import { AgentConnection } from './entities/agent-connection.entity';
import {
  AgentProfile,
  AgentProfileStatus,
  AgentType,
} from './entities/agent-profile.entity';

@Injectable()
export class AgentProfileService {
  constructor(
    @InjectRepository(AgentProfile)
    private readonly profileRepo: Repository<AgentProfile>,
    @InjectRepository(AgentConnection)
    private readonly connectionRepo: Repository<AgentConnection>,
    private readonly configService: ConfigService,
  ) {}

  async listVisible(requestUserId: number) {
    return this.profileRepo
      .createQueryBuilder('profile')
      .where(
        new Brackets((qb) => {
          qb.where('profile.ownerUserId = :requestUserId', { requestUserId })
            .orWhere('profile.ownerUserId IS NULL');
        }),
      )
      .orderBy('profile.ownerUserId', 'DESC', 'NULLS LAST')
      .addOrderBy('profile.createdAt', 'DESC')
      .getMany();
  }

  async create(requestUserId: number, dto: CreateAgentProfileDto) {
    const agentType = dto.agentType ?? AgentType.UserAgent;
    const ownerUserId =
      agentType === AgentType.PlatformAgent ? null : requestUserId;

    if (agentType === AgentType.PlatformAgent) {
      this.assertAdmin(requestUserId);
    }

    const agentConnectionId = await this.resolveConnectionId(
      requestUserId,
      dto.agentConnectionId,
      ownerUserId,
    );

    const profile = this.profileRepo.create({
      ownerUserId,
      agentConnectionId,
      agentName: dto.agentName,
      agentType,
      provider: dto.provider,
      avatar: dto.avatar,
      bio: dto.bio,
      personality: dto.personality,
      goals: dto.goals,
      interests: dto.interests,
      preferredTargets: dto.preferredTargets,
      boundaries: dto.boundaries,
      autonomyLevel: dto.autonomyLevel,
      status: dto.status ?? AgentProfileStatus.Active,
      lastActiveAt: null,
    });

    return this.profileRepo.save(profile);
  }

  async getVisible(requestUserId: number, id: number) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile || !this.canView(requestUserId, profile)) {
      throw new NotFoundException('Agent profile not found');
    }
    return profile;
  }

  /**
   * Search publicly discoverable agents (active only) for agent-to-agent
   * matching. Excludes blocked / paused. Owner's own agents are excluded so
   * search is for "other" agents.
   */
  async search(
    requestUserId: number,
    opts: {
      q?: string;
      type?: AgentType;
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const qb = this.profileRepo
      .createQueryBuilder('profile')
      .where('profile.status = :active', { active: AgentProfileStatus.Active })
      .andWhere(
        new Brackets((b) => {
          b.where('profile.ownerUserId IS NULL').orWhere(
            'profile.ownerUserId <> :uid',
            { uid: requestUserId },
          );
        }),
      );

    if (opts.type) {
      qb.andWhere('profile.agentType = :t', { t: opts.type });
    }
    if (opts.q && opts.q.trim()) {
      const term = `%${opts.q.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('LOWER(profile.agentName) LIKE :term', { term })
            .orWhere('LOWER(COALESCE(profile.bio, \'\')) LIKE :term', { term });
        }),
      );
    }

    return qb
      .orderBy('profile.lastActiveAt', 'DESC', 'NULLS LAST')
      .addOrderBy('profile.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /** Returns the agent profile if it is publicly discoverable (Active). */
  async getDiscoverable(id: number) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile || profile.status !== AgentProfileStatus.Active) {
      throw new NotFoundException('Agent profile not found');
    }
    return profile;
  }

  async update(requestUserId: number, id: number, dto: UpdateAgentProfileDto) {
    const profile = await this.getEditable(requestUserId, id);

    Object.assign(profile, {
      agentName: dto.agentName ?? profile.agentName,
      provider: dto.provider ?? profile.provider,
      avatar: dto.avatar ?? profile.avatar,
      bio: dto.bio ?? profile.bio,
      personality: dto.personality ?? profile.personality,
      goals: dto.goals ?? profile.goals,
      interests: dto.interests ?? profile.interests,
      preferredTargets: dto.preferredTargets ?? profile.preferredTargets,
      boundaries: dto.boundaries ?? profile.boundaries,
      autonomyLevel: dto.autonomyLevel ?? profile.autonomyLevel,
      status: dto.status ?? profile.status,
    });

    return this.profileRepo.save(profile);
  }

  async pause(requestUserId: number, id: number) {
    const profile = await this.getEditable(requestUserId, id);
    if (profile.status === AgentProfileStatus.Blocked) {
      throw new BadRequestException('Blocked agent profiles cannot be paused');
    }
    profile.status = AgentProfileStatus.Paused;
    return this.profileRepo.save(profile);
  }

  async resume(requestUserId: number, id: number) {
    const profile = await this.getEditable(requestUserId, id);
    if (profile.status === AgentProfileStatus.Blocked) {
      throw new BadRequestException('Blocked agent profiles cannot be resumed');
    }
    profile.status = AgentProfileStatus.Active;
    profile.lastActiveAt = new Date();
    return this.profileRepo.save(profile);
  }

  private async getEditable(requestUserId: number, id: number) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException('Agent profile not found');
    }

    if (profile.ownerUserId === requestUserId || this.isAdmin(requestUserId)) {
      return profile;
    }

    throw new ForbiddenException('Agent profile is not editable by this user');
  }

  private canView(requestUserId: number, profile: AgentProfile) {
    // Owner can always see; platform agents are public; any Active agent
    // is discoverable to other users for agent-to-agent matching.
    if (profile.ownerUserId === null) return true;
    if (profile.ownerUserId === requestUserId) return true;
    return profile.status === AgentProfileStatus.Active;
  }

  private async resolveConnectionId(
    requestUserId: number,
    agentConnectionId: number | undefined,
    ownerUserId: number | null,
  ) {
    if (!agentConnectionId) {
      return null;
    }

    if (ownerUserId === null) {
      throw new BadRequestException(
        'Platform agent profiles cannot be linked to user agent connections',
      );
    }

    const connection = await this.connectionRepo.findOne({
      where: { id: agentConnectionId, userId: requestUserId },
    });
    if (!connection) {
      throw new NotFoundException('Agent connection not found');
    }

    return connection.id;
  }

  private assertAdmin(userId: number) {
    if (!this.isAdmin(userId)) {
      throw new ForbiddenException('Admin permission required');
    }
  }

  private isAdmin(userId: number) {
    const ids = (this.configService.get<string>('ADMIN_USER_IDS') || '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter(Number.isFinite);

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const isDevAdmin = !isProduction && userId === 1;

    return ids.includes(userId) || isDevAdmin;
  }
}
