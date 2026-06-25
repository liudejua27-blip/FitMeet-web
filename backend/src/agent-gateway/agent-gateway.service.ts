import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, SelectQueryBuilder } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  AgentConnection,
  AgentPermissionLevel,
  ConnectionStatus,
  KnownAgent,
} from './entities/agent-connection.entity';
import {
  AgentAutonomyLevel,
  AgentProfile,
  AgentProvider,
  AgentType,
} from './entities/agent-profile.entity';
import {
  AgentPermission,
  AgentAction,
} from './entities/agent-permission.entity';
import { UserPreference } from './entities/user-preference.entity';
import {
  MatchCandidate,
  CandidateStatus,
} from './entities/match-candidate.entity';
import {
  AgentActivityLog,
  LoggedAction,
  ActionResult,
} from './entities/agent-activity-log.entity';
import {
  AgentApprovalRequest,
  ApprovalStatus,
  ApprovalType,
} from './entities/agent-approval-request.entity';
import {
  AgentApprovalService,
  detectAlcoholInText,
  detectPaymentInText,
  isNightHour,
} from './agent-approval.service';
import { AgentSettingsService } from './agent-settings.service';
import { AgentWebhookService } from './agent-webhook.service';
import { AgentSettingsMode } from './entities/agent-settings.entity';
import { AgentActionLogService } from './agent-action-log.service';
import {
  AgentActionRiskLevel,
  AgentActionStatus,
  AgentActionType,
} from './entities/agent-action-log.entity';
import {
  SafetyEvent,
  SafetyEventType,
  Severity,
} from './entities/safety-event.entity';
import {
  ContactRequest,
  ContactRequestStatus,
} from './entities/contact-request.entity';
import { SocialRequestStatus } from './entities/social-request.entity';
import { PublicSocialIntent } from './entities/public-social-intent.entity';
import { RegisterAgentDto } from './dto/register-agent.dto';
import {
  CreateSocialRequestDto,
  ConfirmSocialRequestCandidateDto,
  SearchMatchDto,
  SearchNearbyPeopleDto,
  DraftContentDto,
  SendMessageDto,
  ContactRequestDto,
  RespondApprovalDto,
  UpdatePreferencesDto,
} from './dto/agent-gateway.dto';
import { User } from '../users/user.entity';
import { AiDelegateProfile } from '../ai-match/ai-delegate-profile.entity';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { SafetyService } from '../safety/safety.service';
import { RedisService } from '../redis/redis.service';
import { AgentSocialRequestAdapter } from '../social-requests/agent-social-request.adapter';
import { UserSocialRequest } from '../social-requests/social-request.entity';
import { sanitizeCity } from '../common/city.util';
import {
  buildPublicIntentMatchSignal,
  buildPublicIntentMatchSignalFromRequest,
  buildPublicSocialRequestTitle,
  classifyPublicSocialRisk,
  hashPublicIntentBucket,
  hasPublicIntentSensitiveContent,
  normalizePublicIntentHeader,
  normalizePublicIntentIp,
  previewPublicIntentText,
  scorePublicIntentSuspicion,
} from './public-social-intent.helpers';
import {
  buildLegacyAgentActionLogInput,
  numberOrNull,
} from './agent-gateway-legacy-log.mapper';
import {
  buildBlockedSendMessageActionLog,
  buildExecutedSendMessageActionLog,
  buildPendingApprovalSendMessageActionLog,
} from './agent-gateway-message-log.mapper';
import {
  buildPublicSocialCandidates,
  serializePublicSocialCandidates,
  type PublicSocialCandidateCard,
} from './public-social-candidate.presenter';
import {
  normalizePublicSocialIntentListFilters,
  type PublicSocialIntentListFilters,
} from './public-social-intent-list-query';
import { serializePublicSocialIntent } from './public-social-intent.presenter';

// Permission-level capability map
const LEVEL_CAPABILITIES: Record<AgentPermissionLevel, AgentAction[]> = {
  [AgentPermissionLevel.ReadOnly]: [AgentAction.SearchProfiles],
  [AgentPermissionLevel.DraftMode]: [
    AgentAction.CreateSocialRequest,
    AgentAction.SearchProfiles,
    AgentAction.GeneratePost,
    AgentAction.GenerateMessage,
  ],
  [AgentPermissionLevel.Basic]: [
    AgentAction.CreateSocialRequest,
    AgentAction.SearchProfiles,
    AgentAction.GeneratePost,
    AgentAction.GenerateMessage,
    AgentAction.SendMessage,
    AgentAction.ContactRequest,
  ],
  [AgentPermissionLevel.Standard]: [
    AgentAction.CreateSocialRequest,
    AgentAction.SearchProfiles,
    AgentAction.GeneratePost,
    AgentAction.GenerateMessage,
    AgentAction.SendMessage,
    AgentAction.ContactRequest,
  ],
  [AgentPermissionLevel.Open]: Object.values(AgentAction),
  [AgentPermissionLevel.SandboxInternal]: [
    AgentAction.SearchProfiles,
    AgentAction.LabChat,
  ],
};

/** Maximum allowed message length from an agent */
const AGENT_MSG_MAX_LEN = 500;

/** Forbidden content patterns for basic harassment detection */
const HARASSMENT_PATTERNS = [
  /\b(khs|kill yourself|go die)\b/i,
  /(wechat|微信|whatsapp)\s*[:：]?\s*[\d+]/i,
  /\b(sex|nude|naked|nudes)\b/i,
];

type PublicSocialIntentMeta = {
  ip?: string;
  forwardedFor?: string | string[];
  userAgent?: string;
  deviceId?: string | string[];
  origin?: string;
};

type LocalRateBucket = {
  count: number;
  resetAt: number;
};

type AgentConnectionSummary = Pick<
  AgentConnection,
  | 'id'
  | 'agentName'
  | 'agentDisplayName'
  | 'permissionLevel'
  | 'status'
  | 'dailyActionLimit'
  | 'dailyActionsUsed'
  | 'lastActiveAt'
  | 'createdAt'
>;

@Injectable()
export class AgentGatewayService {
  private readonly logger = new Logger(AgentGatewayService.name);

  constructor(
    @InjectRepository(AgentConnection)
    private readonly connRepo: Repository<AgentConnection>,
    @InjectRepository(AgentProfile)
    private readonly profileRepo: Repository<AgentProfile>,
    @InjectRepository(AgentPermission)
    private readonly permRepo: Repository<AgentPermission>,
    @InjectRepository(UserPreference)
    private readonly prefRepo: Repository<UserPreference>,
    @InjectRepository(MatchCandidate)
    private readonly matchRepo: Repository<MatchCandidate>,
    @InjectRepository(AgentActivityLog)
    private readonly logRepo: Repository<AgentActivityLog>,
    @InjectRepository(AgentApprovalRequest)
    private readonly approvalRepo: Repository<AgentApprovalRequest>,
    @InjectRepository(SafetyEvent)
    private readonly safetyRepo: Repository<SafetyEvent>,
    @InjectRepository(ContactRequest)
    private readonly contactRepo: Repository<ContactRequest>,
    @InjectRepository(PublicSocialIntent)
    private readonly publicIntentRepo: Repository<PublicSocialIntent>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AiDelegateProfile)
    private readonly aiDelegateProfileRepo: Repository<AiDelegateProfile>,
    private readonly messagesService: MessagesService,
    private readonly messagesGateway: MessagesGateway,
    private readonly notificationsService: NotificationsService,
    private readonly safetyService: SafetyService,
    private readonly redisService: RedisService,
    private readonly approvalService: AgentApprovalService,
    private readonly settingsService: AgentSettingsService,
    private readonly webhooks: AgentWebhookService,
    private readonly actionLogs: AgentActionLogService,
    @Inject(forwardRef(() => AgentSocialRequestAdapter))
    private readonly socialRequestAdapter: AgentSocialRequestAdapter,
    private readonly dataSource: DataSource,
  ) {}

  private readonly localPublicRateBuckets = new Map<string, LocalRateBucket>();

  // ───────────────────────────────────────────────
  //  REGISTRATION
  // ───────────────────────────────────────────────

  async registerAgent(userId: number, dto: RegisterAgentDto) {
    const permissionLevel = AgentPermissionLevel.Open;
    const actions = LEVEL_CAPABILITIES[permissionLevel] ?? [];

    // If an active connection with the same agentName already exists, return
    // it (without revealing the secret token) rather than creating a duplicate
    // row that may later 500 on a permission unique-constraint or webhook step.
    const existing = await this.connRepo.findOne({
      where: {
        userId,
        agentName: dto.agentName,
        status: ConnectionStatus.Active,
      },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      const existingProfile = await this.profileRepo.findOne({
        where: { agentConnectionId: existing.id },
      });
      throw new ConflictException({
        code: 'AGENT_CONNECTION_ALREADY_EXISTS',
        message:
          'An active agent connection with this agentName already exists. Revoke it before registering a new one.',
        agentConnectionId: existing.id,
        agentProfileId: existingProfile?.id ?? null,
        permissionLevel: existing.permissionLevel,
        grantedActions: actions,
      });
    }

    const rawToken = this.generateToken();
    const tokenPrefix = rawToken.slice(0, 12);
    const hash = await bcrypt.hash(rawToken, 12);

    let saved: AgentConnection;
    let profile: AgentProfile;
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const connRepo = manager.getRepository(AgentConnection);
        const profileRepo = manager.getRepository(AgentProfile);
        const permRepo = manager.getRepository(AgentPermission);

        const conn = connRepo.create({
          userId,
          agentName: dto.agentName,
          agentDisplayName: dto.agentDisplayName,
          agentWebhookUrl: dto.agentWebhookUrl ?? null,
          permissionLevel,
          dailyActionLimit: dto.dailyActionLimit ?? 500,
          agentTokenHash: hash,
          tokenPrefix,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        });

        const savedConn = await connRepo.save(conn);
        const savedProfile = await this.createProfileForConnection(
          savedConn,
          AgentType.ExternalAgent,
          profileRepo,
        );
        await this.grantConnectionPermissions(savedConn.id, actions, permRepo);
        return { saved: savedConn, profile: savedProfile };
      });
      saved = result.saved;
      profile = result.profile;
      await this.settingsService.update(userId, {
        mode: AgentSettingsMode.Open,
        allowSendMessage: true,
        allowAutoReply: true,
        allowCreateActivity: true,
        allowJoinActivity: true,
        allowShareLocation: true,
        allowUploadProof: true,
        allowContactExchange: true,
        requireApprovalForAll: false,
        requireApprovalForFirstMessage: false,
        requireApprovalForOfflineMeeting: false,
        requireApprovalForPhotoUpload: false,
      });
    } catch (err) {
      this.logger.error(
        `registerAgent failed for userId=${userId}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      throw new BadRequestException({
        code: 'AGENT_REGISTER_FAILED',
        message:
          'Failed to register agent. Please retry; partial writes have been rolled back.',
      });
    }

    return {
      agentConnectionId: saved.id,
      agentProfileId: profile.id,
      // Raw token shown exactly once — never stored in plain text
      agentToken: rawToken,
      permissionLevel: saved.permissionLevel,
      grantedActions: actions,
      message: 'Store this token securely. It will not be shown again.',
    };
  }

  async issuePersonalAgentToken(userId: number) {
    const actions = LEVEL_CAPABILITIES[AgentPermissionLevel.Open] ?? [];

    // Pre-flight checks outside the transaction so we don't pollute the tx
    // with eager pessimistic locks on the users table (some prod DBs block).
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.verified) {
      throw new ForbiddenException(
        'Real-name verification is required before issuing a personal agent token',
      );
    }

    const existing = await this.connRepo.findOne({
      where: {
        userId,
        agentName: KnownAgent.FitMeetAgent,
        status: ConnectionStatus.Active,
      },
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      const existingDelegateProfile = await this.aiDelegateProfileRepo.findOne({
        where: { userId },
        select: { id: true },
      });
      throw new ConflictException({
        code: 'AGENT_TOKEN_ALREADY_EXISTS',
        message:
          'An active personal agent token already exists. Revoke it before generating a new one.',
        latestToken: {
          id: existing.id,
          aiDelegateProfileId: existingDelegateProfile?.id ?? null,
          permissionLevel: existing.permissionLevel,
          dailyActionLimit: existing.dailyActionLimit,
          dailyActionsUsed: existing.dailyActionsUsed,
          createdAt: existing.createdAt,
          lastActiveAt: existing.lastActiveAt,
        },
      });
    }

    const rawToken = this.generateToken();
    const tokenPrefix = rawToken.slice(0, 12);
    const hash = await bcrypt.hash(rawToken, 12);

    let saved: AgentConnection;
    let delegateProfile: AiDelegateProfile;
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const connRepo = manager.getRepository(AgentConnection);
        const delegateProfileRepo = manager.getRepository(AiDelegateProfile);
        const permRepo = manager.getRepository(AgentPermission);

        const conn = connRepo.create({
          userId,
          agentName: KnownAgent.FitMeetAgent,
          agentDisplayName: 'FitMeet Agent',
          agentWebhookUrl: null,
          permissionLevel: AgentPermissionLevel.Open,
          dailyActionLimit: 500,
          agentTokenHash: hash,
          tokenPrefix,
          expiresAt: null,
        });

        const savedConn = await connRepo.save(conn);
        const savedDelegateProfile =
          await this.ensureAiDelegateProfileForPersonalToken(
            userId,
            user.name || 'FitMeet Agent',
            delegateProfileRepo,
          );
        await this.grantConnectionPermissions(savedConn.id, actions, permRepo);
        return { saved: savedConn, delegateProfile: savedDelegateProfile };
      });
      saved = result.saved;
      delegateProfile = result.delegateProfile;
      await this.settingsService.update(userId, {
        mode: AgentSettingsMode.Open,
        allowSendMessage: true,
        allowAutoReply: true,
        allowCreateActivity: true,
        allowJoinActivity: true,
        allowShareLocation: true,
        allowUploadProof: true,
        allowContactExchange: true,
        requireApprovalForAll: false,
        requireApprovalForFirstMessage: false,
        requireApprovalForOfflineMeeting: false,
        requireApprovalForPhotoUpload: false,
      });
    } catch (err) {
      this.logger.error(
        `issuePersonalAgentToken failed for userId=${userId}: ${
          err instanceof Error ? err.stack || err.message : String(err)
        }`,
      );
      throw new BadRequestException({
        code: 'AGENT_TOKEN_ISSUE_FAILED',
        message:
          'Failed to issue personal agent token. Please retry; partial writes have been rolled back.',
      });
    }

    return {
      agentConnectionId: saved.id,
      aiDelegateProfileId: delegateProfile.id,
      agentToken: rawToken,
      permissionLevel: saved.permissionLevel,
      grantedActions: actions,
      mode: 'authorized',
      message:
        'Store this token securely as FITMEET_AGENT_TOKEN. It will not be shown again.',
    };
  }

  async getPersonalAgentTokenStatus(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const connections = await this.findConnectionSummaries(userId, {
      agentName: KnownAgent.FitMeetAgent,
      status: ConnectionStatus.Active,
      take: 5,
    });
    if (connections.length) {
      await Promise.all(
        connections.map(async (connection) => {
          const dailyActionLimit = Math.max(
            connection.dailyActionLimit ?? 0,
            500,
          );
          if (
            connection.permissionLevel !== AgentPermissionLevel.Open ||
            connection.dailyActionLimit !== dailyActionLimit
          ) {
            await this.connRepo.update(connection.id, {
              permissionLevel: AgentPermissionLevel.Open,
              dailyActionLimit,
            });
            connection.permissionLevel = AgentPermissionLevel.Open;
            connection.dailyActionLimit = dailyActionLimit;
          }
        }),
      );
      await this.settingsService.update(userId, {
        mode: AgentSettingsMode.Open,
        allowSendMessage: true,
        allowAutoReply: true,
        allowCreateActivity: true,
        allowJoinActivity: true,
        allowShareLocation: true,
        allowUploadProof: true,
        allowContactExchange: true,
        requireApprovalForAll: false,
        requireApprovalForFirstMessage: false,
        requireApprovalForOfflineMeeting: false,
        requireApprovalForPhotoUpload: false,
      });
    }
    const latestDelegateProfile = connections[0]
      ? await this.aiDelegateProfileRepo.findOne({
          where: { userId },
          select: { id: true },
        })
      : null;

    return {
      verified: user.verified,
      canIssueToken: user.verified && connections.length === 0,
      activeTokenCount: connections.length,
      blockReason: !user.verified
        ? 'Real-name verification is required before issuing a personal agent token'
        : connections.length > 0
          ? 'An active personal agent token already exists. Revoke it before generating a new one.'
          : null,
      latestToken: connections[0]
        ? {
            id: connections[0].id,
            aiDelegateProfileId: latestDelegateProfile?.id ?? null,
            permissionLevel: connections[0].permissionLevel,
            dailyActionLimit: connections[0].dailyActionLimit,
            dailyActionsUsed: connections[0].dailyActionsUsed,
            createdAt: connections[0].createdAt,
            lastActiveAt: connections[0].lastActiveAt,
          }
        : null,
    };
  }

  async getFitMeetAgentSetupStatus(
    userId: number,
    subconsciousLoopStatus?: Record<string, unknown>,
  ) {
    const connections = await this.connRepo.find({
      where: {
        userId,
        agentName: KnownAgent.FitMeetAgent,
        status: ConnectionStatus.Active,
      },
      order: { updatedAt: 'DESC' },
      take: 5,
    });
    const latest = connections[0] ?? null;
    return {
      tokenConfigured: connections.length > 0,
      activeTokenCount: connections.length,
      webhookConfigured: Boolean(latest?.agentWebhookUrl),
      heartbeatConfigured: connections.length > 0,
      heartbeatLastSuccessAt: latest?.lastActiveAt ?? null,
      connection: latest
        ? {
            id: latest.id,
            agentName: latest.agentName,
            agentDisplayName: latest.agentDisplayName,
            permissionLevel: latest.permissionLevel,
            status: latest.status,
            dailyActionLimit: latest.dailyActionLimit,
            dailyActionsUsed: latest.dailyActionsUsed,
            webhookConfigured: Boolean(latest.agentWebhookUrl),
            lastActiveAt: latest.lastActiveAt,
            createdAt: latest.createdAt,
          }
        : null,
      subconsciousLoop: subconsciousLoopStatus ?? null,
    };
  }

  async listConnections(userId: number) {
    return this.findConnectionSummaries(userId);
  }

  async revokeConnection(userId: number, connectionId: number) {
    const conn = await this.connRepo.findOne({
      where: { id: connectionId, userId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    conn.status = ConnectionStatus.Revoked;
    const saved = await this.connRepo.save(conn);
    return this.toConnectionSummary(saved);
  }

  /**
   * Pause / resume a connection (suspend or re-activate it without
   * burning the token). Revoked connections cannot be resumed — the
   * owner must register a new agent.
   */
  async setConnectionStatus(
    userId: number,
    connectionId: number,
    next: 'paused' | 'active',
  ) {
    const conn = await this.connRepo.findOne({
      where: { id: connectionId, userId },
    });
    if (!conn) throw new NotFoundException('Connection not found');
    if (conn.status === ConnectionStatus.Revoked) {
      throw new BadRequestException(
        'Revoked connections cannot be resumed; register a new agent.',
      );
    }
    conn.status =
      next === 'paused' ? ConnectionStatus.Suspended : ConnectionStatus.Active;
    const saved = await this.connRepo.save(conn);
    return this.toConnectionSummary(saved);
  }

  private async findConnectionSummaries(
    userId: number,
    filters: {
      agentName?: KnownAgent;
      status?: ConnectionStatus;
      take?: number;
    } = {},
  ): Promise<AgentConnectionSummary[]> {
    const query = this.connRepo
      .createQueryBuilder('connection')
      .select([
        'connection.id',
        'connection.agentName',
        'connection.agentDisplayName',
        'connection.permissionLevel',
        'connection.status',
        'connection.dailyActionLimit',
        'connection.dailyActionsUsed',
        'connection.lastActiveAt',
        'connection.createdAt',
      ])
      .where('connection.userId = :userId', { userId })
      .orderBy('connection.createdAt', 'DESC');

    if (filters.agentName) {
      query.andWhere('connection.agentName = :agentName', {
        agentName: filters.agentName,
      });
    }

    if (filters.status) {
      query.andWhere('connection.status = :status', { status: filters.status });
    }

    if (filters.take) {
      query.take(filters.take);
    }

    const connections = await query.getMany();
    return connections.map((connection) =>
      this.toConnectionSummary(connection),
    );
  }

  private async ensureAiDelegateProfileForPersonalToken(
    userId: number,
    preferredName: string,
    profileRepo: Repository<AiDelegateProfile> = this.aiDelegateProfileRepo,
  ) {
    const existing = await profileRepo.findOne({ where: { userId } });
    if (existing) return existing;

    return profileRepo.save(
      profileRepo.create({
        userId,
        enabled: true,
        privacyConsent: true,
        autoChatEnabled: false,
        dailyAutoChatLimit: 3,
        preferredName,
        city: '',
        favoriteSports: [],
        interests: '',
        workExperience: '',
        idealPartner: '',
        trainingGoals: '',
        boundaries: '',
        availability: '',
      }),
    );
  }

  private createProfileForConnection(
    connection: AgentConnection,
    agentType: AgentType,
    profileRepo: Repository<AgentProfile> = this.profileRepo,
  ) {
    return profileRepo.save(
      profileRepo.create({
        ownerUserId: connection.userId,
        agentConnectionId: connection.id,
        agentName: connection.agentDisplayName || String(connection.agentName),
        agentType,
        provider: this.providerFromKnownAgent(connection.agentName),
        autonomyLevel: this.autonomyFromPermission(connection.permissionLevel),
        lastActiveAt: connection.lastActiveAt,
      }),
    );
  }

  private async grantConnectionPermissions(
    agentConnectionId: number,
    actions: AgentAction[],
    permRepo: Repository<AgentPermission> = this.permRepo,
  ) {
    if (!actions.length) return;
    await permRepo.save(
      actions.map((action) =>
        permRepo.create({
          agentConnectionId,
          action,
          granted: true,
        }),
      ),
    );
  }

  private providerFromKnownAgent(agentName: KnownAgent | string) {
    switch (String(agentName)) {
      case 'fitmeet_agent':
        return AgentProvider.FitMeetAgent;
      case 'codex':
        return AgentProvider.Codex;
      case 'qclaw':
        return AgentProvider.QClaw;
      default:
        return AgentProvider.Custom;
    }
  }

  private autonomyFromPermission(permissionLevel: AgentPermissionLevel) {
    switch (permissionLevel) {
      case AgentPermissionLevel.Open:
        return AgentAutonomyLevel.Open;
      case AgentPermissionLevel.ReadOnly:
      case AgentPermissionLevel.DraftMode:
      case AgentPermissionLevel.Basic:
        return AgentAutonomyLevel.Assisted;
      default:
        return AgentAutonomyLevel.Normal;
    }
  }

  private toConnectionSummary(
    connection: AgentConnection,
  ): AgentConnectionSummary {
    return {
      id: connection.id,
      agentName: connection.agentName,
      agentDisplayName: connection.agentDisplayName,
      permissionLevel: connection.permissionLevel,
      status: connection.status,
      dailyActionLimit: connection.dailyActionLimit,
      dailyActionsUsed: connection.dailyActionsUsed,
      lastActiveAt: connection.lastActiveAt,
      createdAt: connection.createdAt,
    };
  }

  // ───────────────────────────────────────────────
  //  PREFERENCES (user-facing, called via JWT auth)
  // ───────────────────────────────────────────────

  async getPreferences(userId: number) {
    const pref = await this.prefRepo.findOne({ where: { userId } });
    if (!pref) {
      return this.prefRepo.save(this.prefRepo.create({ userId }));
    }
    return pref;
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto) {
    let pref = await this.prefRepo.findOne({ where: { userId } });
    if (!pref) pref = this.prefRepo.create({ userId });
    Object.assign(pref, dto);
    return this.prefRepo.save(pref);
  }

  // Social requests (user + agent-facing task cards)

  /**
   * GET /api/agents/social-requests — delegates to the canonical
   * `user_social_requests` data source via AgentSocialRequestAdapter.
   * Returns the legacy frontend shape for backwards compatibility.
   */
  async listSocialRequests(userId: number) {
    return this.socialRequestAdapter.listForUser(userId);
  }

  /**
   * POST /api/agents/social-requests — writes to `user_social_requests`
   * via SocialRequestsService + MatchService, returns legacy shape.
   */
  async createUserSocialRequest(userId: number, dto: CreateSocialRequestDto) {
    return this.socialRequestAdapter.createFromLegacy(userId, dto, null);
  }

  async submitPublicSocialIntent(
    dto: CreateSocialRequestDto,
    meta: PublicSocialIntentMeta,
  ) {
    const sanitizedDto: CreateSocialRequestDto = {
      ...dto,
      city: sanitizeCity(dto.city),
    };
    await this.enforcePublicSocialIntentAbuseControls(sanitizedDto, meta);

    const rawCandidates = await this.searchSocialCandidates(0, {
      ...sanitizedDto,
      verifiedOnly: sanitizedDto.verifiedOnly ?? true,
      visibility: 'matched_users_only',
      limit: Math.min(sanitizedDto.limit ?? 5, 5),
    });
    const candidates = this.publicVisibleSocialCandidates(rawCandidates, null);
    const riskLevel = classifyPublicSocialRisk(sanitizedDto);
    const matchSignal = buildPublicIntentMatchSignalFromRequest(
      sanitizedDto,
      candidates,
    );
    const intent = await this.publicIntentRepo.save(
      this.publicIntentRepo.create({
        id: `public_${crypto.randomUUID()}`,
        userId: null,
        linkedSocialRequestId: null,
        source: 'public_intent',
        requestType: sanitizedDto.requestType.trim(),
        title:
          sanitizedDto.title?.trim() ||
          buildPublicSocialRequestTitle(sanitizedDto),
        description: sanitizedDto.description.trim(),
        interestTags: sanitizedDto.interests ?? [],
        city: sanitizedDto.city || '',
        loc: sanitizedDto.loc?.trim() || '',
        lat: sanitizedDto.lat ?? null,
        lng: sanitizedDto.lng ?? null,
        radiusKm: sanitizedDto.radiusKm ?? 5,
        timePreference: sanitizedDto.timePreference?.trim() || '',
        locationPreference: sanitizedDto.loc?.trim() || '',
        socialGoal: sanitizedDto.requestType.trim(),
        riskLevel,
        requiresUserConfirmation: true,
        filters: {
          verifiedOnly: sanitizedDto.verifiedOnly ?? true,
          interests: sanitizedDto.interests ?? [],
        },
        candidateUserIds: candidates.map((candidate) => candidate.profile.id),
        matchedCount: candidates.length,
        status:
          candidates.length > 0
            ? SocialRequestStatus.Matched
            : SocialRequestStatus.Searching,
        metadata: {
          source: 'public_intent',
          ipBucket: hashPublicIntentBucket(normalizePublicIntentIp(meta)),
          deviceBucket: hashPublicIntentBucket(
            normalizePublicIntentHeader(meta.deviceId) ||
              `${normalizePublicIntentIp(meta)}:${normalizePublicIntentHeader(meta.userAgent)}`,
          ),
          origin: normalizePublicIntentHeader(meta.origin),
          matchSignal,
        },
      }),
    );

    return {
      publicIntentId: intent.id,
      discoverHref: `/discover?publicIntentId=${encodeURIComponent(intent.id)}`,
      request: serializePublicSocialIntent(intent),
      candidates: serializePublicSocialCandidates(candidates),
    };
  }

  async listPublicSocialIntents(filters: PublicSocialIntentListFilters = {}) {
    const normalized = normalizePublicSocialIntentListFilters(filters);
    const query = this.publicIntentRepo
      .createQueryBuilder('intent')
      .orderBy('intent.createdAt', 'DESC')
      .take(normalized.take)
      .skip(normalized.skip);

    query.andWhere('intent.mode = :mode', { mode: 'public' });
    this.excludeTombstonedPublicIntents(query);
    this.excludeInternalPublicIntentFixtures(query);

    if (normalized.publicIntentId) {
      query.andWhere('intent.id = :publicIntentId', {
        publicIntentId: normalized.publicIntentId,
      });
    }

    if (normalized.city) {
      query.andWhere('LOWER(intent.city) LIKE LOWER(:city)', {
        city: `%${normalized.city}%`,
      });
    }

    if (normalized.requestType) {
      query.andWhere('intent.requestType = :requestType', {
        requestType: normalized.requestType,
      });
    }

    if (normalized.status) {
      query.andWhere('intent.status = :status', { status: normalized.status });
    } else {
      query.andWhere('intent.status IN (:...statuses)', {
        statuses: normalized.statuses,
      });
    }

    if (normalized.q) {
      query.andWhere(
        `(
          LOWER(intent.title) LIKE LOWER(:q)
          OR LOWER(intent.description) LIKE LOWER(:q)
          OR LOWER(intent.city) LIKE LOWER(:q)
          OR LOWER(intent.loc) LIKE LOWER(:q)
          OR LOWER(intent.requestType) LIKE LOWER(:q)
          OR LOWER(CAST(intent.interestTags AS TEXT)) LIKE LOWER(:q)
          OR LOWER(CAST(intent.filters AS TEXT)) LIKE LOWER(:q)
        )`,
        { q: `%${normalized.q}%` },
      );
    }

    const [data, total] = await query.getManyAndCount();
    return {
      data: data.map((intent) => serializePublicSocialIntent(intent)),
      metadata: {
        total,
        page: normalized.page,
        lastPage: Math.ceil(total / normalized.take),
        filters: {
          q: normalized.q,
          city: normalized.city,
          requestType: normalized.requestType,
          publicIntentId: normalized.publicIntentId,
          status: normalized.status ?? 'discoverable',
          statuses: normalized.statuses,
        },
      },
    };
  }

  private excludeInternalPublicIntentFixtures(
    query: SelectQueryBuilder<PublicSocialIntent>,
  ) {
    query.andWhere(
      `(
        LOWER(COALESCE(intent.id, '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(intent.id, '')) NOT LIKE :fixtureSeed
        AND LOWER(COALESCE(intent.id, '')) NOT LIKE :fixtureTest
        AND LOWER(COALESCE(intent.source, '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(intent.source, '')) NOT LIKE :fixtureSeed
        AND LOWER(COALESCE(intent.source, '')) NOT LIKE :fixtureTest
        AND LOWER(COALESCE(intent.title, '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(intent.title, '')) NOT LIKE :fixtureTest
        AND LOWER(COALESCE(intent.description, '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(intent.description, '')) NOT LIKE :fixtureSeed
        AND LOWER(COALESCE(intent.description, '')) NOT LIKE :fixtureTest
        AND LOWER(COALESCE(intent.socialGoal, '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(intent.socialGoal, '')) NOT LIKE :fixtureTest
        AND LOWER(COALESCE(CAST(intent.filters AS TEXT), '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(CAST(intent.filters AS TEXT), '')) NOT LIKE :fixtureSeed
        AND LOWER(COALESCE(CAST(intent.filters AS TEXT), '')) NOT LIKE :fixtureTest
        AND LOWER(COALESCE(CAST(intent.metadata AS TEXT), '')) NOT LIKE :fixtureSmoke
        AND LOWER(COALESCE(CAST(intent.metadata AS TEXT), '')) NOT LIKE :fixtureSeed
        AND LOWER(COALESCE(CAST(intent.metadata AS TEXT), '')) NOT LIKE :fixtureTest
      )`,
      {
        fixtureSmoke: '%smoke%',
        fixtureSeed: '%seed%',
        fixtureTest: '%test%',
      },
    );
  }

  private excludeTombstonedPublicIntents(
    query: SelectQueryBuilder<PublicSocialIntent>,
  ) {
    query.andWhere(
      `COALESCE(intent.metadata ->> 'tombstoned', 'false') <> 'true'`,
    );
  }

  async getPublicSocialIntent(id: string) {
    const intent = await this.publicIntentRepo.findOne({ where: { id } });
    if (!intent || !this.isDiscoverablePublicSocialIntent(intent)) {
      throw new NotFoundException('Public social intent not found');
    }
    return serializePublicSocialIntent(intent);
  }

  async getPublicSocialIntentMatches(id: string) {
    const intent = await this.publicIntentRepo.findOne({ where: { id } });
    if (!intent || !this.isDiscoverablePublicSocialIntent(intent)) {
      throw new NotFoundException('Public social intent not found');
    }
    const rawCandidates = await this.searchSocialCandidates(
      0,
      {
        requestType: intent.requestType,
        title: intent.title,
        description: intent.description,
        city: intent.city,
        loc: intent.loc,
        lat: intent.lat ?? undefined,
        lng: intent.lng ?? undefined,
        radiusKm: intent.radiusKm,
        timePreference: intent.timePreference,
        verifiedOnly: Boolean(intent.filters?.verifiedOnly ?? true),
        interests: Array.isArray(intent.filters?.interests)
          ? (intent.filters.interests as string[])
          : [],
        limit: 5,
      },
      {
        excludedUserIds: intent.userId ? [intent.userId] : [],
      },
    );
    const candidates = this.publicVisibleSocialCandidates(
      rawCandidates,
      intent.userId,
    );
    intent.candidateUserIds = candidates.map(
      (candidate) => candidate.profile.id,
    );
    intent.matchedCount = candidates.length;
    intent.status =
      candidates.length > 0
        ? SocialRequestStatus.Matched
        : SocialRequestStatus.Searching;
    intent.metadata = {
      ...(intent.metadata ?? {}),
      matchSignal: buildPublicIntentMatchSignal(intent, candidates),
    };
    await this.publicIntentRepo.save(intent);
    return {
      request: serializePublicSocialIntent(intent),
      candidates: serializePublicSocialCandidates(candidates),
    };
  }

  private isDiscoverablePublicSocialIntent(intent: PublicSocialIntent) {
    if (intent.mode && intent.mode !== 'public') return false;
    if (
      intent.status &&
      ![
        SocialRequestStatus.Active,
        SocialRequestStatus.Matched,
        SocialRequestStatus.Searching,
      ].includes(intent.status)
    ) {
      return false;
    }
    const metadata = intent.metadata ?? {};
    const tombstoned = this.publicIntentMetadataText(metadata.tombstoned);
    const publishStatus = this.publicIntentMetadataText(metadata.publishStatus);
    return (
      metadata.tombstoned !== true &&
      tombstoned !== 'true' &&
      publishStatus !== 'dismissed'
    );
  }

  private publicIntentMetadataText(value: unknown): string {
    if (typeof value === 'string') return value.trim().toLowerCase();
    if (typeof value === 'boolean' || typeof value === 'number') {
      return String(value).trim().toLowerCase();
    }
    return '';
  }

  private publicVisibleSocialCandidates(
    candidates: PublicSocialCandidateCard[],
    ownerUserId?: number | null,
  ) {
    const ownerId = Number(ownerUserId);
    return candidates.filter((candidate) => {
      const candidateId = Number(candidate.profile?.id);
      if (!Number.isFinite(candidateId) || candidateId <= 0) return false;
      if (Number.isFinite(ownerId) && candidateId === ownerId) return false;
      return ![
        candidate.profile?.name,
        candidate.profile?.bio,
        ...(candidate.profile?.interestTags ?? []),
        candidate.reasonText,
      ].some((value) => this.isInternalPublicText(value));
    });
  }

  private isInternalPublicText(value: string | null | undefined) {
    const normalized = `${value ?? ''}`.trim().replace(/[_-]+/g, ' ');
    return /\b(agent\s*smoke|api\s*smoke|smoke\s*account|smoke|fixture|seed|test\s*account|mock)\b/i.test(
      normalized,
    );
  }

  async createAgentSocialRequest(
    conn: AgentConnection,
    dto: CreateSocialRequestDto,
  ) {
    const result = await this.socialRequestAdapter.createFromLegacy(
      conn.userId,
      dto,
      conn,
    );

    await this.writeLog(
      conn,
      LoggedAction.CreateSocialRequest,
      {
        requestType: dto.requestType,
        requestId: result.request.id,
        resultCount: result.candidates.length,
      },
      ActionResult.Success,
    );

    return result;
  }

  async getSocialRequestMatches(conn: AgentConnection, requestId: number) {
    const result = await this.socialRequestAdapter.getMatchesForRequest(
      conn.userId,
      requestId,
    );

    await this.writeLog(
      conn,
      LoggedAction.Search,
      {
        requestId,
        resultCount: result.candidates.length,
        source: 'fitmeet_matching_engine',
      },
      ActionResult.Success,
    );
    return result;
  }

  /**
   * @deprecated retained for git-history grep; no longer called anywhere.
   * Replaced by AgentSocialRequestAdapter.getMatchesForRequest.
   */
  private __legacyGetSocialRequestMatchesUnused(
    _conn: AgentConnection,
    _requestId: number,
  ): void {
    void _conn;
    void _requestId;
  }

  async decideSocialRequestCandidate(
    conn: AgentConnection,
    requestId: number,
    dto: ConfirmSocialRequestCandidateDto,
  ) {
    const request = await this.socialRequestAdapter.loadOwnedRequest(
      conn.userId,
      requestId,
    );

    if (!dto.ownerConfirmed) {
      throw new BadRequestException(
        'Owner confirmation is required before FitMeet can connect people',
      );
    }

    await this.socialRequestAdapter.assertCandidateBelongsTo(
      requestId,
      dto.candidateUserId,
    );

    await this.writeLog(
      conn,
      LoggedAction.ConfirmSocialRequestCandidate,
      {
        requestId,
        candidateUserId: dto.candidateUserId,
        decision: dto.decision,
        connectionAction: dto.connectionAction ?? 'none',
      },
      ActionResult.Success,
    );

    if (dto.decision === 'reject') {
      return {
        status: 'candidate_rejected',
        requestId,
        candidateUserId: dto.candidateUserId,
        nextStep: 'fitmeet_agent_may_present_another_fitmeet_candidate',
      };
    }

    const connectionAction = dto.connectionAction ?? 'send_intro';
    if (connectionAction === 'none') {
      return {
        status: 'candidate_approved',
        requestId,
        candidateUserId: dto.candidateUserId,
        nextStep: 'no_platform_action_requested',
      };
    }

    if (connectionAction === 'request_contact_exchange') {
      const contact = await this.requestContact(conn, {
        targetUserId: dto.candidateUserId,
        note:
          dto.note ??
          `Owner approved contact exchange from FitMeet social request #${requestId}.`,
      });
      return {
        status: 'contact_exchange_requested',
        requestId,
        candidateUserId: dto.candidateUserId,
        contact,
      };
    }

    const text = dto.note?.trim() || this.buildFitMeetIntroMessage(request);
    const risk = this.computeRisk(text);
    if (risk >= 0.6) {
      await this.writeSafety(
        conn,
        SafetyEventType.HarassmentDetected,
        Severity.High,
        text,
      );
      throw new ForbiddenException('Intro message blocked by safety filter');
    }

    const recipientPref = await this.prefRepo.findOne({
      where: { userId: dto.candidateUserId },
    });
    if (recipientPref && !recipientPref.acceptAgentMessages) {
      throw new ForbiddenException('Recipient has disabled agent messages');
    }

    const { conversationId } = await this.messagesService.startConversation(
      conn.userId,
      dto.candidateUserId,
      {
        agentConnectionId: conn.id,
        ownerUserId: conn.userId,
        actorUserId: conn.userId,
        metadata: {
          source:
            String(conn.agentName) === 'fitmeet_agent'
              ? 'fitmeet_agent'
              : 'agent',
          requestId: request.id,
        },
      },
    );
    const message = await this.messagesService.sendMessage(
      conversationId,
      conn.userId,
      text,
      {
        source: 'ai_delegate',
        senderType: 'agent',
        senderAgentId: conn.id,
        agentConnectionId: conn.id,
        ownerUserId: conn.userId,
        actorUserId: conn.userId,
        metadata: {
          source:
            String(conn.agentName) === 'fitmeet_agent'
              ? 'fitmeet_agent'
              : 'agent',
          actorType: 'agent',
          actorUserId: conn.userId,
          agentConnectionId: conn.id,
          ownerUserId: conn.userId,
          requestId: request.id,
          socialRequestId: request.id,
        },
      },
    );

    // Real-time push to recipient if online (mirrors AgentGatewayService.sendMessage).
    const socketPushed = this.messagesGateway.pushNewMessageToUser(
      dto.candidateUserId,
      message,
    );

    // Notification fan-out so the recipient sees an unread badge even after reload.
    let notificationCreated = false;
    try {
      const sender = await this.userRepo.findOne({
        where: { id: conn.userId },
      });
      await this.notificationsService.create({
        userId: dto.candidateUserId,
        type: 'message',
        text: `${sender?.name ?? '某用户'} 的 AI 代理给你发来一条邀约消息`,
        fromUserId: conn.userId,
        fromUsername: sender?.name,
        fromAvatar: sender?.avatar,
        fromColor: sender?.color,
      });
      notificationCreated = true;
    } catch {
      notificationCreated = false;
    }

    return {
      status: 'intro_sent',
      requestId,
      candidateUserId: dto.candidateUserId,
      source: 'fitmeet_connection_orchestrator',
      riskScore: risk,
      conversationId,
      message,
      delivery: {
        socketPushed,
        notificationCreated,
      },
    };
  }

  async searchNearbyPeople(conn: AgentConnection, dto: SearchNearbyPeopleDto) {
    const candidates = await this.searchSocialCandidates(conn.userId, dto);
    await this.writeLog(
      conn,
      LoggedAction.Search,
      {
        query: dto.description,
        requestType: dto.requestType,
        resultCount: candidates.length,
      },
      ActionResult.Success,
    );
    return { candidates };
  }

  // ───────────────────────────────────────────────
  //  MATCH SEARCH (agent-facing)
  // ───────────────────────────────────────────────

  async searchMatches(conn: AgentConnection, dto: SearchMatchDto) {
    const pref = await this.prefRepo.findOne({
      where: { userId: conn.userId },
    });

    // Build a simple scored candidates list
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.id != :uid', { uid: conn.userId });

    const requestedCity = sanitizeCity(dto.city);
    if (requestedCity)
      qb.andWhere('u.city ILIKE :city', { city: `%${requestedCity}%` });
    if (dto.ageMin) qb.andWhere('u.age >= :ageMin', { ageMin: dto.ageMin });
    if (dto.ageMax) qb.andWhere('u.age <= :ageMax', { ageMax: dto.ageMax });

    const limit = dto.limit ?? 10;
    const users = await qb
      .orderBy('RANDOM()')
      .take(limit * 3)
      .getMany();

    // Pre-fetch owner once to avoid async-in-map
    const owner = await this.userRepo.findOne({ where: { id: conn.userId } });

    // Lightweight scoring: prefer same city, overlapping interests
    const scored = users.map((u) => {
      let score = 0.3;
      if (pref?.idealPartnerDescription && u.bio?.length > 0) score += 0.1;
      if (owner?.city && u.city === owner.city) score += 0.2;
      score += Math.random() * 0.3; // placeholder for real ML
      return { user: u, score: Math.min(score, 1.0) };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    // Persist candidates for Match Review
    const candidates = top.map(({ user: u, score }) =>
      this.matchRepo.create({
        userId: conn.userId,
        agentConnectionId: conn.id,
        candidateUserId: u.id,
        score,
        reasonTags: this.buildReasonTags(u, pref),
        reasonText: `Agent found ${u.name} based on your preferences.`,
      }),
    );
    await this.matchRepo.save(candidates);

    await this.writeLog(
      conn,
      LoggedAction.Search,
      { query: dto.query, resultCount: top.length },
      ActionResult.Success,
    );

    return candidates.map((c, i) => ({
      candidateId: c.id,
      score: c.score,
      reasonTags: c.reasonTags,
      // Only return safe profile data — no contact info
      profile: {
        id: top[i].user.id,
        name: top[i].user.name,
        age: top[i].user.age,
        city: top[i].user.city,
        bio: top[i].user.bio,
        interestTags: top[i].user.interestTags,
      },
    }));
  }

  // ───────────────────────────────────────────────
  //  DRAFT GENERATION (agent-facing)
  // ───────────────────────────────────────────────

  async draftContent(conn: AgentConnection, dto: DraftContentDto) {
    // In production this calls an LLM. Placeholder returns structured template.
    const pref = await this.prefRepo.findOne({
      where: { userId: conn.userId },
    });

    const draft =
      dto.type === 'post'
        ? this.buildPostDraft(pref, dto.context)
        : this.buildMessageDraft(pref, dto.context, dto.tone);

    const action =
      dto.type === 'post' ? LoggedAction.DraftPost : LoggedAction.DraftMessage;
    await this.writeLog(conn, action, { type: dto.type }, ActionResult.Success);

    // Harassment check on generated content
    const risk = this.computeRisk(draft.content);
    if (risk >= 0.7) {
      await this.writeSafety(
        conn,
        SafetyEventType.HarassmentDetected,
        Severity.High,
        draft.content,
      );
      throw new BadRequestException('Draft failed safety check');
    }

    return { draft, riskScore: risk };
  }

  // ───────────────────────────────────────────────
  //  SEND MESSAGE (agent-facing, real end-to-end pipeline)
  // ───────────────────────────────────────────────

  async sendMessage(conn: AgentConnection, dto: SendMessageDto) {
    // 1. Resolve canonical fields (toUserId/content take precedence over legacy
    //    recipientUserId/text). Validate presence here because both halves of
    //    the DTO are optional individually.
    const targetUserId = dto.toUserId ?? dto.recipientUserId;
    const content = (dto.content ?? dto.text ?? '').trim();
    const agentTaskId =
      dto.agentTaskId ?? numberOrNull(dto.metadata?.agentTaskId) ?? null;
    const idempotencyKey =
      typeof dto.metadata?.idempotencyKey === 'string' &&
      dto.metadata.idempotencyKey.trim()
        ? dto.metadata.idempotencyKey.trim().slice(0, 180)
        : dto.approvalRequestId
          ? `approval:${dto.approvalRequestId}:send_message:${targetUserId ?? 'target'}`
          : `agent_message:${conn.id}:${agentTaskId ?? 'task'}:${targetUserId ?? 'target'}:${content.slice(0, 48).replace(/\s+/g, '_')}`.slice(
              0,
              180,
            );
    if (!targetUserId) {
      throw new BadRequestException(
        'toUserId (or recipientUserId) is required',
      );
    }
    if (!content) {
      throw new BadRequestException('content (or text) is required');
    }
    if (targetUserId === conn.userId) {
      throw new BadRequestException('Cannot send a message to yourself');
    }

    // 2. Connection must be active.
    if (conn.status !== ConnectionStatus.Active) {
      throw new ForbiddenException('Agent connection is not active');
    }

    // 3. Sender (delegating user) must exist and not be banned/suspended.
    const sender = await this.userRepo.findOne({ where: { id: conn.userId } });
    if (!sender) {
      throw new NotFoundException('Delegating user not found');
    }
    const senderStatus = (sender as unknown as { status?: string }).status;
    if (senderStatus === 'banned' || senderStatus === 'suspended') {
      throw new ForbiddenException(
        'Delegating user is not allowed to send messages',
      );
    }

    // 4. Recipient must exist.
    const recipient = await this.userRepo.findOne({
      where: { id: targetUserId },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    // 5. Block check: if recipient blocked the sender, intercept.
    const blockedByRecipient =
      await this.safetyService.getBlockedUserIds(targetUserId);
    if (blockedByRecipient.includes(conn.userId)) {
      await this.writeSafety(
        conn,
        SafetyEventType.ContactBypass,
        Severity.Medium,
        `Agent attempted to message a user who blocked the sender (target=${targetUserId})`,
      );
      await this.writeLog(
        conn,
        LoggedAction.Intercepted,
        { targetUserId, reason: 'blocked' },
        ActionResult.Blocked,
        'Recipient has blocked the sender',
      );
      throw new ForbiddenException('Recipient has blocked you');
    }

    // 6. Length + safety filter.
    if (content.length > AGENT_MSG_MAX_LEN) {
      throw new BadRequestException(
        `Message exceeds ${AGENT_MSG_MAX_LEN} character limit`,
      );
    }
    const risk = this.computeRisk(content);
    if (risk >= 0.6) {
      await this.writeSafety(
        conn,
        SafetyEventType.HarassmentDetected,
        Severity.High,
        content,
      );
      await this.writeLog(
        conn,
        LoggedAction.Intercepted,
        { targetUserId, riskScore: risk },
        ActionResult.Blocked,
        'Harassment detected',
        risk,
      );
      throw new ForbiddenException('Message blocked by safety filter');
    }

    // 7. Recipient must accept agent-delegated messages.
    const recipientPref = await this.prefRepo.findOne({
      where: { userId: targetUserId },
    });
    if (recipientPref && !recipientPref.acceptAgentMessages) {
      throw new ForbiddenException('Recipient has disabled agent messages');
    }

    // 8. Permission gate / risk-based approval flow.
    //    Routes through AgentApprovalService.classify() which knows about
    //    the user's AgentSettings (mode + capability switches + per-action
    //    approval gates) AND contextual signals (first contact, night,
    //    alcohol, payment).
    const settings = await this.settingsService.getEffective(
      conn.userId,
      conn.id,
    );

    if (!settings.allowSendMessage) {
      // Sender capability hard-disabled; fall back to legacy permission
      // levels so old connections still work.
      const legacyAllowed =
        conn.permissionLevel === AgentPermissionLevel.Standard ||
        conn.permissionLevel === AgentPermissionLevel.Open ||
        conn.permissionLevel === AgentPermissionLevel.Basic;
      if (!legacyAllowed) {
        throw new ForbiddenException(
          'Agent is not allowed to send messages (settings.allowSendMessage=false)',
        );
      }
    }

    // Pre-existing approval token short-circuits the gate.
    const preApproved = dto.approvalRequestId
      ? await this.approvalRepo.findOne({
          where: {
            id: dto.approvalRequestId,
            userId: conn.userId,
            status: ApprovalStatus.Approved,
          },
        })
      : null;

    if (!preApproved) {
      const existingConv = await this.messagesService.findConversationBetween(
        conn.userId,
        targetUserId,
      );
      const mutualMatch = await this.matchRepo.findOne({
        where: [
          {
            userId: conn.userId,
            candidateUserId: targetUserId,
            status: In([CandidateStatus.Approved, CandidateStatus.Contacted]),
          },
          {
            userId: targetUserId,
            candidateUserId: conn.userId,
            status: In([CandidateStatus.Approved, CandidateStatus.Contacted]),
          },
        ],
      });
      const isFirstContact = !existingConv && !mutualMatch;

      const verdict = this.approvalService.classify({
        type: isFirstContact
          ? ApprovalType.FirstMessage
          : ApprovalType.SendMessage,
        actionType: 'send_message',
        payload: {
          toUserId: targetUserId,
          content,
          messageType: dto.messageType ?? 'text',
          _agentDisplayName: conn.agentDisplayName,
          _targetDisplayName:
            (recipient as unknown as { name?: string }).name ??
            `用户 #${targetUserId}`,
        },
        settings,
        ctx: {
          isFirstContact,
          isNight: isNightHour(),
          involvesAlcohol: detectAlcoholInText(content),
          involvesPayment: detectPaymentInText(content),
        },
      });

      if (verdict.blocked) {
        await this.writeLog(
          conn,
          LoggedAction.SendMessage,
          { targetUserId, reason: verdict.blockedReason },
          ActionResult.Blocked,
          verdict.blockedReason,
        );
        await this.actionLogs.logAgentAction({
          ...buildBlockedSendMessageActionLog({
            conn,
            dto,
            targetUserId,
            content,
            agentTaskId,
            verdict,
            isFirstContact,
          }),
        });
        throw new ForbiddenException(
          verdict.blockedReason ?? 'Action blocked by policy',
        );
      }

      if (verdict.requiresApproval) {
        const req = await this.approvalService.create({
          userId: conn.userId,
          agentConnectionId: conn.id,
          agentTaskId,
          type: isFirstContact
            ? ApprovalType.FirstMessage
            : ApprovalType.SendMessage,
          actionType: 'send_message',
          skillName: 'send_private_message',
          payload: {
            toUserId: targetUserId,
            content,
            messageType: dto.messageType ?? 'text',
            socialRequestId: dto.socialRequestId,
            activityId: dto.activityId,
            agentTaskId,
            metadata: dto.metadata,
          },
          summary: verdict.summary,
          riskLevel: verdict.riskLevel,
          reason: isFirstContact
            ? '首次联系陌生用户，需要主人确认后再发送。'
            : `权限策略要求审批：${verdict.reasons.join(', ')}`,
          createdBy: 'agent',
          relatedSocialRequestId: dto.socialRequestId ?? null,
          rationale: isFirstContact
            ? 'First message to a new user. Owner confirmation required before sending.'
            : `Approval required: ${verdict.reasons.join(', ')}`,
        });
        await this.writeLog(
          conn,
          LoggedAction.SendMessage,
          {
            targetUserId,
            agentTaskId,
            reason: verdict.reasons.join(','),
            approvalId: req.id,
            riskLevel: verdict.riskLevel,
          },
          ActionResult.PendingApproval,
        );
        await this.actionLogs.logAgentAction({
          ...buildPendingApprovalSendMessageActionLog({
            conn,
            dto,
            targetUserId,
            content,
            agentTaskId,
            approvalRequest: req,
            verdict,
            isFirstContact,
          }),
        });
        return {
          success: false,
          requiresApproval: true,
          approvalId: req.id,
          summary: req.summary,
          riskLevel: req.riskLevel,
          reasons: verdict.reasons,
          expiresAt: req.expiresAt,
          reason: req.summary,
        };
      }
    }

    // 9. Real send: create/get conversation and persist message.
    const { conversationId } = await this.messagesService.startConversation(
      conn.userId,
      targetUserId,
      {
        agentConnectionId: conn.id,
        ownerUserId: conn.userId,
        actorUserId: conn.userId,
        agentTaskId,
        idempotencyKey: `${idempotencyKey}:conversation`,
        metadata: {
          source: dto.metadata?.source ?? conn.agentName,
          agentTaskId,
          idempotencyKey: `${idempotencyKey}:conversation`,
          socialRequestId: dto.socialRequestId ?? null,
          activityId: dto.activityId ?? null,
        },
      },
    );
    const message = await this.messagesService.sendMessage(
      conversationId,
      conn.userId,
      content,
      {
        source: 'ai_delegate',
        senderType: 'agent',
        senderAgentId: conn.id,
        agentConnectionId: conn.id,
        ownerUserId: conn.userId,
        actorUserId: conn.userId,
        agentTaskId,
        idempotencyKey,
        metadata: {
          source: dto.metadata?.source ?? conn.agentName,
          actorType: 'agent',
          actorUserId: conn.userId,
          ownerUserId: conn.userId,
          agentConnectionId: conn.id,
          agentTaskId,
          requestId: dto.socialRequestId ?? null,
          candidateRecordId: dto.metadata?.candidateRecordId ?? null,
          socialRequestId: dto.socialRequestId ?? null,
          activityId: dto.activityId ?? null,
          idempotencyKey,
          ...(dto.metadata ?? {}),
        },
      },
    );

    // 10. Socket.IO push to recipient if they are online.
    const socketPushed = this.messagesGateway.pushNewMessageToUser(
      targetUserId,
      message,
    );

    // 11. Notification fan-out.
    let notificationCreated = false;
    try {
      await this.notificationsService.create({
        userId: targetUserId,
        type: 'message',
        text: `${sender.name ?? '某用户'} 的 AI 代理给你发来一条消息`,
        fromUserId: conn.userId,
        fromUsername: sender.name,
        fromAvatar: sender.avatar,
        fromColor: sender.color,
      });
      notificationCreated = true;
    } catch {
      notificationCreated = false;
    }

    // 12. Activity log.
    await this.writeLog(
      conn,
      LoggedAction.SendMessage,
      {
        messageId: message.id,
        conversationId,
        targetUserId,
        textLength: content.length,
        source: dto.metadata?.source ?? conn.agentName,
        socialRequestId: dto.socialRequestId,
        activityId: dto.activityId,
        agentTaskId,
        socketPushed,
        notificationCreated,
      },
      ActionResult.Success,
      null,
      risk,
    );
    await this.actionLogs.logAgentAction({
      ...buildExecutedSendMessageActionLog({
        conn,
        dto,
        targetUserId,
        content,
        agentTaskId,
        risk,
        messageId: message.id,
        conversationId,
        socketPushed,
        notificationCreated,
      }),
    });

    return {
      success: true,
      conversationId,
      messageId: message.id,
      delivery: {
        stored: true,
        socketPushed,
        notificationCreated,
      },
      riskScore: risk,
      message,
    };
  }

  // ───────────────────────────────────────────────
  //  CONTACT REQUEST (agent-facing)
  // ───────────────────────────────────────────────

  async requestContact(conn: AgentConnection, dto: ContactRequestDto) {
    // Prevent bypass: both sides must have not opted out
    const targetPref = await this.prefRepo.findOne({
      where: { userId: dto.targetUserId },
    });
    if (targetPref && !targetPref.acceptAgentMessages) {
      throw new ForbiddenException(
        'Target user does not accept agent-initiated contact',
      );
    }

    // Dedup: no pending request to same target
    const existing = await this.contactRepo.findOne({
      where: {
        requesterId: conn.userId,
        targetUserId: dto.targetUserId,
        status: ContactRequestStatus.Pending,
      },
    });
    if (existing)
      throw new BadRequestException('A pending contact request already exists');

    const risk = this.computeRisk(dto.note ?? '');
    if (risk >= 0.5) {
      await this.writeSafety(
        conn,
        SafetyEventType.ContactBypass,
        Severity.High,
        dto.note ?? '',
      );
      throw new ForbiddenException('Contact request note failed safety check');
    }

    const cr = await this.contactRepo.save(
      this.contactRepo.create({
        requesterId: conn.userId,
        targetUserId: dto.targetUserId,
        agentConnectionId: conn.id,
        note: dto.note ?? '',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }),
    );

    await this.writeLog(
      conn,
      LoggedAction.ContactRequest,
      { targetUserId: dto.targetUserId },
      ActionResult.PendingApproval,
    );
    await this.actionLogs.logAgentAction({
      ownerUserId: conn.userId,
      agentId: conn.id,
      actionType: AgentActionType.AddFriend,
      actionStatus: AgentActionStatus.PendingApproval,
      riskLevel:
        risk >= 0.3 ? AgentActionRiskLevel.Medium : AgentActionRiskLevel.Low,
      targetUserId: dto.targetUserId,
      inputSummary: dto.note ?? null,
      outputSummary: `contact_request_pending: id=${cr.id}`,
      payload: {
        contactRequestId: cr.id,
        riskScore: risk,
      },
      reason: 'agent_request_contact',
    });

    await this.notifyContactRequestReceived({
      contactRequestId: cr.id,
      requesterId: conn.userId,
      targetUserId: dto.targetUserId,
      note: dto.note ?? '',
    });

    return { status: 'pending_target_consent', contactRequestId: cr.id };
  }

  private async notifyContactRequestReceived(input: {
    contactRequestId: number;
    requesterId: number;
    targetUserId: number;
    note?: string;
  }) {
    const targetConnections =
      (await this.connRepo.find({
        where: { userId: input.targetUserId, status: ConnectionStatus.Active },
        take: 20,
      })) ?? [];
    if (!targetConnections.length) return;

    const requester = await this.userRepo.findOne({
      where: { id: input.requesterId },
    });
    const requesterCard = requester
      ? {
          id: requester.id,
          name: requester.name,
          avatar: requester.avatar,
          color: requester.color,
          city: requester.city,
          verified: requester.verified,
        }
      : { id: input.requesterId };
    const contentPreview = `${requester?.name ?? 'FitMeet 用户'} 想添加你为好友`;
    const metadata = {
      contactRequestId: input.contactRequestId,
      requesterId: input.requesterId,
      requester: requesterCard,
      contentPreview,
      notePreview: previewPublicIntentText(input.note ?? ''),
      nextAction: 'ask_owner_whether_to_accept_friend_request',
    };

    for (const targetConn of targetConnections) {
      await this.messagesService.createAgentMessageEvent({
        agentConnectionId: targetConn.id,
        ownerUserId: input.targetUserId,
        eventType: 'contact.request.received',
        requestId: input.contactRequestId,
        fromUserId: input.requesterId,
        contentPreview,
        dedupeKey: `${targetConn.id}:contact.request.received:${input.contactRequestId}`,
        metadata,
      });
      void this.webhooks
        .emitToConnection(targetConn.id, 'contact.request.received', metadata)
        .catch(() => undefined);
    }
  }

  // ───────────────────────────────────────────────
  //  ACTIVITY LOG (user-facing, JWT auth)
  // ───────────────────────────────────────────────

  async getActivity(userId: number, page = 1, limit = 20) {
    return this.actionLogs.list({
      ownerUserId: userId,
      page,
      limit,
    });
  }

  // ───────────────────────────────────────────────
  //  APPROVAL RESPONSE (user-facing, JWT auth)
  // ───────────────────────────────────────────────

  async respondApproval(userId: number, dto: RespondApprovalDto) {
    const req = await this.approvalRepo.findOne({
      where: {
        id: dto.approvalRequestId,
        userId,
        status: ApprovalStatus.Pending,
      },
    });
    if (!req)
      throw new NotFoundException(
        'Approval request not found or already resolved',
      );
    if (req.expiresAt < new Date()) {
      req.status = ApprovalStatus.Expired;
      await this.approvalRepo.save(req);
      throw new BadRequestException('Approval request has expired');
    }

    req.status =
      dto.decision === 'approved'
        ? ApprovalStatus.Approved
        : ApprovalStatus.Rejected;
    req.respondedAt = new Date();
    return this.approvalRepo.save(req);
  }

  async getPendingApprovals(userId: number) {
    return this.approvalRepo.find({
      where: { userId, status: ApprovalStatus.Pending },
      order: { createdAt: 'DESC' },
    });
  }

  async getMatchCandidates(userId: number, page = 1, limit = 10) {
    const [items, total] = await this.matchRepo.findAndCount({
      where: { userId, status: CandidateStatus.PendingReview },
      order: { score: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async reviewCandidate(
    userId: number,
    candidateId: number,
    decision: 'approved' | 'rejected',
    feedback?: string,
  ) {
    const candidate = await this.matchRepo.findOne({
      where: { id: candidateId, userId },
    });
    if (!candidate) throw new NotFoundException();
    candidate.status =
      decision === 'approved'
        ? CandidateStatus.Approved
        : CandidateStatus.Rejected;
    candidate.userFeedback = feedback ?? null;
    return this.matchRepo.save(candidate);
  }

  // ───────────────────────────────────────────────
  //  PRIVATE HELPERS
  // ───────────────────────────────────────────────

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async searchSocialCandidates(
    userId: number,
    dto: SearchNearbyPeopleDto,
    options: { excludedUserIds?: number[] } = {},
  ) {
    const owner = await this.userRepo.findOne({ where: { id: userId } });

    // Origin coordinates: prefer the request's lat/lng (the user's current
    // session location), fall back to the owner's stored fix.
    const ownerLat =
      typeof dto.lat === 'number' ? dto.lat : (owner?.lat ?? null);
    const ownerLng =
      typeof dto.lng === 'number' ? dto.lng : (owner?.lng ?? null);
    const radiusKm = dto.radiusKm ?? 5;
    const haveOrigin =
      typeof ownerLat === 'number' && typeof ownerLng === 'number';

    // Mutual-block list — never surface anyone the caller blocked or who
    // blocked the caller.
    const blockedSet = await this.safetyService.getMutualBlockUserIds(userId);

    const excludedUserIds = [userId, ...(options.excludedUserIds ?? [])].filter(
      (id) => Number.isFinite(id) && id > 0,
    );

    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u."acceptNearbyMatch" = true');

    if (excludedUserIds.length > 0) {
      qb.andWhere('u.id NOT IN (:...excludedUserIds)', {
        excludedUserIds: Array.from(new Set(excludedUserIds)),
      });
    }

    if (blockedSet.size > 0) {
      qb.andWhere('u.id NOT IN (:...blocked)', {
        blocked: Array.from(blockedSet),
      });
    }

    if (dto.verifiedOnly) qb.andWhere('u.verified = true');

    const city = sanitizeCity(dto.city, sanitizeCity(owner?.city));
    if (haveOrigin) {
      // Geo-bbox prefilter: ~1° lat ≈ 111km. Pad by 25% to keep haversine
      // edge cases inside the candidate pool.
      const latDelta = (radiusKm / 111) * 1.25;
      const lngDelta =
        (radiusKm /
          (111 * Math.max(Math.cos((ownerLat * Math.PI) / 180), 0.01))) *
        1.25;
      qb.andWhere('u.lat IS NOT NULL AND u.lng IS NOT NULL')
        .andWhere('u.lat BETWEEN :latMin AND :latMax', {
          latMin: ownerLat - latDelta,
          latMax: ownerLat + latDelta,
        })
        .andWhere('u.lng BETWEEN :lngMin AND :lngMax', {
          lngMin: ownerLng - lngDelta,
          lngMax: ownerLng + lngDelta,
        });
    } else if (city) {
      // No coords on either side → degrade to city ILIKE.
      qb.andWhere('u.city ILIKE :city', { city: `%${city}%` });
    }

    const users = await qb.take(200).getMany();
    if (!users.length) return [];

    // Pull each candidate's UserPreference so we can enforce
    // acceptAgentMessages (the entry-point for agent-mediated intros).
    const prefs = await this.prefRepo.find({
      where: { userId: In(users.map((u) => u.id)) },
    });
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

    return buildPublicSocialCandidates({
      users,
      preferencesByUserId: prefByUser,
      dto,
      ownerLat,
      ownerLng,
      radiusKm,
      city,
    });
  }

  private buildFitMeetIntroMessage(request: UserSocialRequest) {
    const where = request.city || 'nearby';
    const when = request.timeStart
      ? new Date(request.timeStart).toLocaleString()
      : 'recently';
    const title = request.title || request.description || request.type;
    return `Hi, this is a FitMeet agent-assisted intro. My owner is looking for ${title} around ${where} ${when}. Would you like to chat inside FitMeet first?`;
  }

  private computeRisk(text: string): number {
    if (!text) return 0;
    let score = 0;
    for (const pat of HARASSMENT_PATTERNS) {
      if (pat.test(text)) score += 0.4;
    }
    // Penalise very long messages slightly
    if (text.length > 800) score += 0.1;
    return Math.min(score, 1.0);
  }

  private async enforcePublicSocialIntentAbuseControls(
    dto: CreateSocialRequestDto,
    meta: PublicSocialIntentMeta,
  ) {
    const ip = normalizePublicIntentIp(meta);
    const deviceId = normalizePublicIntentHeader(meta.deviceId);
    const userAgent = normalizePublicIntentHeader(meta.userAgent);
    const origin = normalizePublicIntentHeader(meta.origin);
    const text = `${dto.requestType} ${dto.title ?? ''} ${dto.description} ${dto.city ?? ''} ${dto.loc ?? ''}`;

    if (!userAgent || userAgent.length < 8) {
      throw new BadRequestException('Suspicious public intent request');
    }

    if (
      /(curl|wget|python-requests|scrapy|httpclient|bot|spider|crawler)/i.test(
        userAgent,
      )
    ) {
      throw new BadRequestException('Automated public intent request blocked');
    }

    if (
      this.computeRisk(text) >= 0.4 ||
      hasPublicIntentSensitiveContent(text)
    ) {
      throw new BadRequestException(
        'Public social intent failed safety screening',
      );
    }

    const suspiciousScore = scorePublicIntentSuspicion(dto, {
      ip,
      deviceId,
      userAgent,
      origin,
    });
    if (suspiciousScore >= 3) {
      throw new BadRequestException('Suspicious public intent pattern blocked');
    }

    await Promise.all([
      this.consumePublicRateLimit(`public-intent:ip:${ip}`, 8, 60),
      this.consumePublicRateLimit(`public-intent:ip-hour:${ip}`, 40, 3600),
      this.consumePublicRateLimit(
        `public-intent:device:${deviceId || hashPublicIntentBucket(`${ip}:${userAgent}`)}`,
        12,
        3600,
      ),
    ]);
  }

  private async consumePublicRateLimit(
    key: string,
    limit: number,
    ttlSeconds: number,
  ) {
    try {
      const redis = this.redisService.getClient();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, ttlSeconds);
      }
      if (count > limit) {
        throw new BadRequestException(
          'Public social intent rate limit exceeded',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.consumeLocalPublicRateLimit(key, limit, ttlSeconds);
    }
  }

  private consumeLocalPublicRateLimit(
    key: string,
    limit: number,
    ttlSeconds: number,
  ) {
    const now = Date.now();
    const bucket = this.localPublicRateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.localPublicRateBuckets.set(key, {
        count: 1,
        resetAt: now + ttlSeconds * 1000,
      });
      return;
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      throw new BadRequestException('Public social intent rate limit exceeded');
    }
  }

  private buildReasonTags(user: User, pref: UserPreference | null): string[] {
    const tags: string[] = [];
    if (user.city) tags.push('same_region');
    if (user.interestTags?.length) tags.push('shared_interests');
    if (pref?.relationshipGoal) tags.push(`goal_${pref.relationshipGoal}`);
    return tags;
  }

  private buildPostDraft(pref: UserPreference | null, context?: string) {
    const goal = pref?.relationshipGoal ?? 'fitness_buddy';
    return {
      content: `Looking for a ${goal.replace('_', ' ')} in the area. ${context ?? ''} Let's connect over shared fitness goals! 🏃`,
      hashtags: ['#FitMeet', '#FitnessPartner', '#ActiveLifestyle'],
    };
  }

  private buildMessageDraft(
    pref: UserPreference | null,
    context?: string,
    tone?: string,
  ) {
    const style = tone ?? pref?.chatStyle ?? 'warm';
    const openers: Record<string, string> = {
      playful:
        'Hey! I noticed we both love staying active 😄 Want to team up sometime?',
      direct:
        "Hi, I think we'd be a great fitness match. Would you be open to a workout together?",
      intellectual:
        'Hi, I was impressed by your training approach. Would love to exchange ideas.',
      warm: 'Hi! Your profile really caught my eye. Hope we can connect soon 😊',
    };
    return { content: openers[style] ?? openers.warm };
  }

  /** Public wrapper used by skill controllers to record agent actions. */
  async logAgentSkill(
    conn: AgentConnection,
    action: LoggedAction,
    payload: Record<string, unknown>,
    result: ActionResult,
    blockReason?: string | null,
    riskScore = 0,
  ) {
    return this.writeLog(conn, action, payload, result, blockReason, riskScore);
  }

  private async writeLog(
    conn: AgentConnection,
    action: LoggedAction,
    payload: Record<string, unknown>,
    result: ActionResult,
    blockReason?: string | null,
    riskScore = 0,
  ) {
    try {
      await this.logRepo.save(
        this.logRepo.create({
          agentConnectionId: conn.id,
          userId: conn.userId,
          ownerUserId: conn.userId,
          action,
          payload,
          result,
          blockReason: blockReason ?? null,
          riskScore,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Legacy agent_activity_logs write failed for action=${action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    try {
      await this.mirrorLegacyActionLog(
        conn,
        action,
        payload,
        result,
        blockReason,
        riskScore,
      );
    } catch (error) {
      this.logger.warn(
        `Canonical agent_action_logs mirror failed for action=${action}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // persist updated action counter
    await this.connRepo.save(conn);
  }

  private async mirrorLegacyActionLog(
    conn: AgentConnection,
    action: LoggedAction,
    payload: Record<string, unknown>,
    result: ActionResult,
    blockReason?: string | null,
    riskScore = 0,
  ) {
    const logInput = buildLegacyAgentActionLogInput({
      conn,
      action,
      payload,
      result,
      blockReason,
      riskScore,
    });
    if (!logInput) return;

    await this.actionLogs.logAgentAction(logInput);
  }

  private async writeSafety(
    conn: AgentConnection,
    eventType: SafetyEventType,
    severity: Severity,
    description: string,
  ) {
    await this.safetyRepo.save(
      this.safetyRepo.create({
        agentConnectionId: conn.id,
        userId: conn.userId,
        eventType,
        severity,
        description,
      }),
    );
  }
}
