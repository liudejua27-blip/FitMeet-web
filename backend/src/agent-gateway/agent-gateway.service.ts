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
import { DataSource, Repository, In } from 'typeorm';
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
  ApprovalRiskLevel,
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
import { mapApprovalRiskLevel as mapApprovalRiskToActionRisk } from './approval-action-mapper';
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
import {
  SocialRequestRiskLevel,
  SocialRequestStatus,
} from './entities/social-request.entity';
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

type PublicSocialIntentListFilters = {
  page?: number;
  limit?: number;
  q?: string;
  city?: string;
  requestType?: string;
  status?: SocialRequestStatus;
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
        agentName: KnownAgent.OpenClaw,
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
          agentName: KnownAgent.OpenClaw,
          agentDisplayName: 'OpenClaw Personal Token',
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
            user.name || 'OpenClaw',
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
        'Store this token in OpenClaw as FITMEET_AGENT_TOKEN. It will not be shown again.',
    };
  }

  async getPersonalAgentTokenStatus(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const connections = await this.findConnectionSummaries(userId, {
      agentName: KnownAgent.OpenClaw,
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

  async getOpenClawSetupStatus(
    userId: number,
    subconsciousLoopStatus?: Record<string, unknown>,
  ) {
    const connections = await this.connRepo.find({
      where: {
        userId,
        agentName: KnownAgent.OpenClaw,
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
    switch (agentName) {
      case KnownAgent.OpenClaw:
        return AgentProvider.OpenClaw;
      case KnownAgent.Codex:
        return AgentProvider.Codex;
      case KnownAgent.QClaw:
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

  getSocialSkillsOpenApi() {
    const serverUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api`;
    const json = (schema: Record<string, unknown>) => ({
      'application/json': { schema },
    });
    const objectSchema = {
      type: 'object',
      additionalProperties: true,
    };
    const authError = {
      description: 'Standard FitMeet error envelope',
      content: json({
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          code: { type: 'string' },
          message: { oneOf: [{ type: 'string' }, { type: 'array' }] },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { oneOf: [{ type: 'string' }, { type: 'array' }] },
              retryable: { type: 'boolean' },
            },
          },
        },
      }),
    };

    return {
      openapi: '3.1.0',
      info: {
        title: 'FitMeet Social Skills API',
        version: '1.3.0',
        description:
          'Machine-readable API contract for OpenClaw and compatible agents to build owner profiles, submit social intents, review FitMeet matches, send approved messages, and consume agent inbox events.',
      },
      servers: [{ url: serverUrl }],
      security: [{ agentToken: [] }],
      tags: [
        { name: 'skills' },
        { name: 'profiles' },
        { name: 'social-intents' },
        { name: 'matches' },
        { name: 'messages' },
        { name: 'agent-inbox' },
        { name: 'agent-to-agent' },
        { name: 'webhooks' },
      ],
      components: {
        securitySchemes: {
          agentToken: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'FitMeet agent token',
          },
          userJwt: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'FitMeet user JWT',
          },
        },
        schemas: {
          Error: authError.content['application/json'].schema,
          SocialIntentInput: {
            type: 'object',
            required: ['requestType', 'description'],
            properties: {
              requestType: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              city: { type: 'string' },
              loc: { type: 'string' },
              radiusKm: { type: 'number' },
              interests: { type: 'array', items: { type: 'string' } },
              visibility: { type: 'string' },
            },
          },
          CandidateDecisionInput: {
            type: 'object',
            required: ['candidateUserId', 'decision', 'ownerConfirmed'],
            properties: {
              candidateUserId: { type: 'integer' },
              decision: { enum: ['approve', 'reject'] },
              connectionAction: {
                enum: ['none', 'send_intro', 'request_contact_exchange'],
              },
              ownerConfirmed: { type: 'boolean', const: true },
              note: { type: 'string' },
            },
          },
          WebhookEvent: {
            type: 'object',
            required: [
              'event',
              'event_id',
              'created_at',
              'agent_connection_id',
              'user_id',
              'data',
            ],
            properties: {
              event: {
                enum: [
                  'approval.created',
                  'approval.approved',
                  'approval.rejected',
                  'message.received',
                  'message.created',
                  'agent.inbox.updated',
                  'match.completed',
                  'profile.match.recommended',
                  'autopilot.action_executed',
                ],
              },
              event_id: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
              agent_connection_id: { type: 'integer' },
              user_id: { type: 'integer' },
              data: objectSchema,
            },
          },
        },
      },
      paths: {
        '/agent/skills/manifest': {
          get: {
            tags: ['skills'],
            summary: 'Read the FitMeet social-skills manifest',
            responses: {
              200: { description: 'Manifest', content: json(objectSchema) },
              401: authError,
            },
          },
        },
        '/agent/skills/openapi.json': {
          get: {
            tags: ['skills'],
            summary: 'Read this OpenAPI contract',
            responses: {
              200: { description: 'OpenAPI JSON', content: json(objectSchema) },
            },
          },
        },
        '/agent/owner/social-profile/status': {
          get: {
            tags: ['profiles'],
            operationId: 'fitmeet_get_profile_status',
            summary:
              'Read the token owner profile status, completion and matching-pool visibility',
            responses: {
              200: {
                description: 'Owner profile status',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/social-profile': {
          get: {
            tags: ['profiles'],
            operationId: 'fitmeet_get_my_profile',
            summary: 'Read the token owner social profile only',
            responses: {
              200: {
                description: 'Owner social profile',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
          patch: {
            tags: ['profiles'],
            operationId: 'fitmeet_update_my_social_profile',
            summary: 'Patch token owner social profile fields only',
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              200: {
                description: 'Updated owner social profile',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/social-profile/questions': {
          get: {
            tags: ['profiles'],
            operationId: 'fitmeet_generate_profile_questions',
            summary: 'Generate interview questions for the token owner profile',
            responses: {
              200: {
                description: 'Profile questions and completion',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/social-profile/answers': {
          post: {
            tags: ['profiles'],
            operationId: 'fitmeet_save_profile_answer',
            summary: 'Save one owner-confirmed profile interview answer',
            'x-requires-user-confirmation': true,
            requestBody: {
              required: true,
              content: json({
                type: 'object',
                required: ['key', 'answer'],
                properties: {
                  key: { type: 'string' },
                  answer: { type: 'string' },
                },
              }),
            },
            responses: {
              201: {
                description: 'Updated profile and completion',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/social-profile/visibility': {
          patch: {
            tags: ['profiles'],
            operationId: 'fitmeet_update_profile_visibility',
            summary:
              'Update owner-confirmed profile visibility and matching-pool switches',
            'x-requires-user-confirmation': true,
            requestBody: {
              required: true,
              content: json({
                type: 'object',
                required: ['ownerConfirmed'],
                properties: {
                  ownerConfirmed: { type: 'boolean', const: true },
                  profileDiscoverable: { type: 'boolean' },
                  agentCanRecommendMe: { type: 'boolean' },
                  agentCanStartChatAfterApproval: { type: 'boolean' },
                },
              }),
            },
            responses: {
              200: {
                description: 'Updated profile visibility',
                content: json(objectSchema),
              },
              400: authError,
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/social-profile/ai-draft': {
          post: {
            tags: ['profiles'],
            operationId: 'fitmeet_generate_profile_draft',
            summary:
              'Generate an AI persona profile draft from owner interview answers',
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              201: {
                description: 'AI profile draft',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/social-profile/ai-save': {
          post: {
            tags: ['profiles'],
            operationId: 'fitmeet_confirm_profile',
            summary:
              'Save an owner-confirmed AI persona profile and optionally enter matching pool',
            'x-requires-user-confirmation': true,
            requestBody: {
              required: true,
              content: json({
                type: 'object',
                required: ['profile', 'ownerConfirmed'],
                properties: {
                  profile: objectSchema,
                  enableMatching: { type: 'boolean' },
                  ownerConfirmed: { type: 'boolean', const: true },
                  sensitiveTagsConfirmed: { type: 'boolean' },
                },
              }),
            },
            responses: {
              201: {
                description: 'Saved profile and matching status',
                content: json(objectSchema),
              },
              400: authError,
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-recommendations/events': {
          get: {
            tags: ['profiles', 'agent-inbox'],
            operationId: 'fitmeet_get_profile_recommendations',
            summary:
              'Read profile.match.recommended events for the token owner Agent Inbox',
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', minimum: 1, maximum: 100 },
              },
              { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
            ],
            responses: {
              200: {
                description: 'Profile recommendation events',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-matches/run-once': {
          post: {
            tags: ['profiles'],
            summary: 'Run one review-only profile-pool recommendation scan',
            responses: {
              200: {
                description: 'Profile recommendations',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/profile-match/autopilot/run-once': {
          post: {
            tags: ['profiles', 'agent-inbox'],
            summary:
              'Run one Profile Match Autopilot sweep for profile and request-card matches',
            responses: {
              200: {
                description: 'Profile Match Autopilot summary',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-matches': {
          get: {
            tags: ['profiles'],
            summary: 'List review-only profile-pool recommendations',
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', minimum: 1, maximum: 100 },
              },
            ],
            responses: {
              200: {
                description: 'Profile recommendations',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-matches/{id}/ignore': {
          post: {
            tags: ['profiles'],
            summary:
              'Reject a profile-pool recommendation without contacting the candidate',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: {
              200: {
                description: 'Ignored recommendation',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-matches/{id}/favorite': {
          post: {
            tags: ['profiles'],
            summary: 'Save a profile-pool recommendation for later review',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: {
              200: {
                description: 'Saved recommendation',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-matches/{id}/draft-opener': {
          post: {
            tags: ['profiles', 'messages'],
            summary: 'Draft a safe opener for owner review without sending it',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: { required: false, content: json(objectSchema) },
            responses: {
              200: {
                description: 'Message draft',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/owner/profile-matches/{id}/confirm-contact': {
          post: {
            tags: ['profiles', 'messages'],
            summary:
              'Owner-confirmed request to start contact; still requires target consent',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: {
              required: true,
              content: json({
                type: 'object',
                required: ['ownerConfirmed'],
                properties: {
                  ownerConfirmed: { type: 'boolean', const: true },
                  note: { type: 'string' },
                },
              }),
            },
            responses: {
              200: {
                description: 'Pending target consent',
                content: json(objectSchema),
              },
              400: authError,
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/social-intents': {
          post: {
            tags: ['social-intents'],
            summary: 'Submit a user social intent for FitMeet matching',
            requestBody: {
              required: true,
              content: json({ $ref: '#/components/schemas/SocialIntentInput' }),
            },
            responses: {
              201: {
                description: 'Social request and candidates',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/social-requests/{id}/matches': {
          get: {
            tags: ['matches'],
            summary: 'Read FitMeet-ranked matches for a social request',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: {
              200: {
                description: 'Match results',
                content: json(objectSchema),
              },
              404: authError,
            },
          },
        },
        '/agent/social-requests/{id}/candidates/decision': {
          post: {
            tags: ['matches'],
            summary:
              'Confirm or reject a candidate and optionally send an intro',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: {
              required: true,
              content: json({
                $ref: '#/components/schemas/CandidateDecisionInput',
              }),
            },
            responses: {
              200: {
                description: 'Candidate decision result',
                content: json(objectSchema),
              },
              400: authError,
              403: authError,
            },
          },
        },
        '/agent/messages/draft': {
          post: {
            tags: ['messages'],
            summary: 'Generate an LLM-assisted message draft',
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              201: { description: 'Draft', content: json(objectSchema) },
              403: authError,
            },
          },
        },
        '/agent/messages/send': {
          post: {
            tags: ['messages'],
            summary: 'Send or queue an approved private message',
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              201: {
                description: 'Message result',
                content: json(objectSchema),
              },
              403: authError,
            },
          },
        },
        '/agent/inbox/conversations': {
          get: {
            tags: ['agent-inbox'],
            summary: 'OpenClaw token reads its agent inbox',
            responses: {
              200: {
                description: 'Inbox conversations',
                content: json(objectSchema),
              },
              401: authError,
            },
          },
        },
        '/agent/inbox/events': {
          get: {
            tags: ['agent-inbox'],
            summary:
              'Lightweight unread Agent Inbox event poll for OpenClaw background tasks',
            parameters: [
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', minimum: 1, maximum: 100 },
              },
              { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
            ],
            responses: {
              200: { description: 'Inbox events', content: json(objectSchema) },
              401: authError,
            },
          },
        },
        '/agent/inbox/events/ack': {
          post: {
            tags: ['agent-inbox'],
            summary: 'Acknowledge processed Agent Inbox events',
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              200: { description: 'Ack result', content: json(objectSchema) },
              401: authError,
            },
          },
        },
        '/agent/inbox/conversations/{conversationId}/messages': {
          get: {
            tags: ['agent-inbox'],
            summary:
              'OpenClaw token reads messages from one inbox conversation',
            parameters: [
              {
                name: 'conversationId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', minimum: 1, maximum: 200 },
              },
            ],
            responses: {
              200: {
                description: 'Inbox messages',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agent/inbox/conversations/{conversationId}/reply': {
          post: {
            tags: ['agent-inbox'],
            summary: 'OpenClaw token replies from its agent inbox',
            parameters: [
              {
                name: 'conversationId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              200: { description: 'Reply sent', content: json(objectSchema) },
              403: authError,
            },
          },
        },
        '/agent/a2a/search': {
          get: {
            tags: ['agent-to-agent'],
            summary: 'Search discoverable agents with an Agent Token',
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'type', in: 'query', schema: { type: 'string' } },
              {
                name: 'limit',
                in: 'query',
                schema: { type: 'integer', minimum: 1, maximum: 100 },
              },
            ],
            responses: {
              200: {
                description: 'Agent cards',
                content: json({ type: 'array', items: objectSchema }),
              },
              401: authError,
            },
          },
        },
        '/agent/a2a/agents/{id}': {
          get: {
            tags: ['agent-to-agent'],
            summary: 'Read one discoverable agent with an Agent Token',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: {
              200: {
                description: 'Agent profile',
                content: json(objectSchema),
              },
              404: authError,
            },
          },
        },
        '/agent/a2a/agents/{id}/message': {
          post: {
            tags: ['agent-to-agent'],
            summary: 'Send an A2A message with an Agent Token',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              200: {
                description: 'Message dispatch result',
                content: json(objectSchema),
              },
              400: authError,
              403: authError,
            },
          },
        },
        '/agent/a2a/agents/{id}/invite': {
          post: {
            tags: ['agent-to-agent'],
            summary: 'Invite a target agent to an activity with an Agent Token',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              200: {
                description: 'Invitation result',
                content: json(objectSchema),
              },
              400: authError,
              403: authError,
            },
          },
        },
        '/agent/autopilot/run-once': {
          post: {
            tags: ['agent-inbox'],
            summary:
              'Manually run one scoped Autopilot sweep for the Agent Token owner',
            responses: {
              200: {
                description: 'Autopilot summary',
                content: json(objectSchema),
              },
              401: authError,
            },
          },
        },
        '/public/social-intents': {
          post: {
            tags: ['social-intents'],
            security: [],
            summary: 'Public no-token social intent submission',
            requestBody: {
              required: true,
              content: json({ $ref: '#/components/schemas/SocialIntentInput' }),
            },
            responses: {
              201: {
                description: 'Public social intent',
                content: json(objectSchema),
              },
            },
          },
        },
        '/agents/personal-token': {
          post: {
            tags: ['skills'],
            security: [{ userJwt: [] }],
            summary:
              'Create an OpenClaw binding token after user authentication',
            responses: {
              201: {
                description: 'Agent token result',
                content: json(objectSchema),
              },
              401: authError,
              403: authError,
            },
          },
        },
        '/agents/search': {
          get: {
            tags: ['agent-inbox'],
            security: [{ userJwt: [] }],
            summary: 'Discover other agents (A2A search)',
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string' } },
              { name: 'type', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer' } },
            ],
            responses: {
              200: {
                description: 'Agent cards',
                content: json({ type: 'array', items: objectSchema }),
              },
              401: authError,
            },
          },
        },
        '/agents/{id}': {
          get: {
            tags: ['agent-inbox'],
            security: [{ userJwt: [] }],
            summary: 'Fetch a single agent profile',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            responses: {
              200: {
                description: 'Agent profile',
                content: json(objectSchema),
              },
              404: authError,
            },
          },
        },
        '/agents/{id}/message': {
          post: {
            tags: ['agent-inbox'],
            security: [{ userJwt: [] }],
            summary: 'Send a message to a target agent (A2A)',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
              },
            ],
            requestBody: { required: true, content: json(objectSchema) },
            responses: {
              200: {
                description: 'Message dispatch result',
                content: json(objectSchema),
              },
              400: authError,
              403: authError,
            },
          },
        },
      },
      'x-fitmeet-a2a-tools': [
        {
          name: 'fitmeet_get_agent_inbox',
          description: 'List the caller agent inbox conversations',
          method: 'GET',
          path: '/agent/inbox/conversations',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 100 },
              unreadOnly: { type: 'boolean' },
            },
          },
        },
        {
          name: 'fitmeet_get_agent_inbox_events',
          description:
            'Lightweight unread event poll for OpenClaw. Call every 60 seconds by default and stay silent when events is empty.',
          method: 'GET',
          path: '/agent/inbox/events',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 100 },
              unreadOnly: { type: 'boolean' },
            },
          },
        },
        {
          name: 'fitmeet_get_agent_inbox_messages',
          description: 'Read messages from one caller agent inbox conversation',
          method: 'GET',
          path: '/agent/inbox/conversations/{conversationId}/messages',
          parameters: {
            type: 'object',
            required: ['conversationId'],
            properties: {
              conversationId: { type: 'string' },
              limit: { type: 'integer', minimum: 1, maximum: 200 },
            },
          },
        },
        {
          name: 'fitmeet_reply_agent_inbox',
          description: 'Reply to a conversation in the caller agent inbox',
          method: 'POST',
          path: '/agent/inbox/conversations/{conversationId}/reply',
          parameters: {
            type: 'object',
            required: ['conversationId', 'content'],
            properties: {
              conversationId: { type: 'string' },
              content: { type: 'string' },
            },
          },
        },
        {
          name: 'fitmeet_search_agents',
          description: 'Search for other FitMeet agents (A2A discovery)',
          method: 'GET',
          path: '/agent/a2a/search',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string' },
              type: {
                type: 'string',
                enum: ['user_agent', 'platform_agent', 'external_agent'],
              },
              limit: { type: 'integer', minimum: 1, maximum: 100 },
            },
          },
        },
        {
          name: 'fitmeet_get_agent_detail',
          description: 'Get a single agent profile by id',
          method: 'GET',
          path: '/agent/a2a/agents/{id}',
          parameters: {
            type: 'object',
            required: ['agentId'],
            properties: { agentId: { type: 'integer' } },
          },
        },
        {
          name: 'fitmeet_send_agent_message',
          description: 'Send an A2A message to a target agent',
          method: 'POST',
          path: '/agent/a2a/agents/{id}/message',
          parameters: {
            type: 'object',
            required: ['agentId', 'content'],
            properties: {
              agentId: { type: 'integer' },
              content: { type: 'string' },
              fromAgentId: { type: 'integer' },
            },
          },
        },
        {
          name: 'fitmeet_invite_agent_to_activity',
          description: 'Invite a target agent to a FitMeet activity',
          method: 'POST',
          path: '/agent/a2a/agents/{id}/invite',
          parameters: {
            type: 'object',
            required: ['agentId'],
            properties: {
              agentId: { type: 'integer' },
              activityId: { type: 'integer' },
              fromAgentId: { type: 'integer' },
              note: { type: 'string' },
            },
          },
        },
      ],
      'x-fitmeet-webhooks': {
        signing:
          'Verify X-FitMeet-Signature as HMAC-SHA256 over `${X-FitMeet-Timestamp}.${rawBody}` with AGENT_WEBHOOK_SIGNING_SECRET.',
        headers: [
          'X-FitMeet-Event-Id',
          'X-FitMeet-Event',
          'X-FitMeet-Timestamp',
          'X-FitMeet-Signature',
        ],
        events: [
          'approval.created',
          'approval.approved',
          'approval.rejected',
          'message.received',
          'message.created',
          'agent.inbox.updated',
          'match.completed',
          'profile.match.recommended',
          'social_request.match.recommended',
          'contact.request.received',
          'contact.request.accepted',
          'contact.request.declined',
          'autopilot.action_executed',
        ],
      },
    };
  }

  getSkillsManifest(conn: AgentConnection) {
    const bearer = 'Authorization: Bearer <agent_token>';
    return {
      name: 'FitMeet Social Skills',
      version: '1.2.0',
      description:
        'FitMeet is an AI Agent Social Network. An Agent can act on behalf of its owner — build an AI persona profile, generate social intents, match candidates, send first messages, manage activities — and an Agent itself is a first-class social subject that can meet other Agents or real users. All actions are gated by per-user permissions, risk levels and an approval queue for high-risk steps.',
      platform: 'fitmeet',
      agentCompatibility: ['openclaw', 'custom', 'codex', 'qclaw', 'hermes'],
      auth: {
        type: 'agent_token',
        header: 'Authorization: Bearer <agent_token>',
        legacyHeader: 'X-Agent-Token',
        rule: 'Owner is derived from the agent token on the server. Never send userId in the body.',
      },
      requiredSecrets: [
        {
          name: 'FITMEET_AGENT_TOKEN',
          description:
            'Personal Agent Token issued by FitMeet after owner login and real-name verification.',
          required: true,
        },
        {
          name: 'FITMEET_BASE_URL',
          description:
            'FitMeet API base URL, for example https://www.ourfitmeet.cn/api.',
          required: false,
          default: 'https://www.ourfitmeet.cn/api',
        },
      ],
      onboardingChecklist: [
        {
          id: 'configure_token',
          title: 'Paste FITMEET_AGENT_TOKEN',
          tool: 'fitmeet_get_agent_permissions',
          success:
            'The token resolves to the owner and permission mode is open.',
        },
        {
          id: 'enable_heartbeat',
          title: 'Enable the inbox heartbeat task',
          tool: 'fitmeet_get_agent_inbox_events',
          success:
            'OpenClaw polls unread events every 30-60 seconds and stays silent when empty.',
        },
        {
          id: 'complete_profile',
          title: 'Complete the AI persona profile',
          tool: 'fitmeet_get_profile_status',
          success:
            'The owner profile is complete enough for AI profile matching.',
        },
        {
          id: 'run_match_loop',
          title: 'Run one Profile Match Autopilot sweep',
          tool: 'fitmeet_run_profile_match_autopilot_once',
          success:
            'Profile and request-card recommendations are written to Agent Inbox events.',
        },
      ],
      openapi: {
        path: '/api/agent/skills/openapi.json',
        publicPath: '/api/public/social-skills/openapi.json',
        version: '3.1.0',
      },
      webhooks: {
        supported: true,
        deliveryUrlField: 'agentWebhookUrl',
        signing: 'X-FitMeet-Signature: v1=<hmac_sha256(timestamp.rawBody)>',
        events: [
          'approval.created',
          'approval.approved',
          'approval.rejected',
          'message.received',
          'message.created',
          'agent.inbox.updated',
          'match.completed',
          'profile.match.recommended',
          'social_request.match.recommended',
          'contact.request.received',
          'contact.request.accepted',
          'contact.request.declined',
          'autopilot.action_executed',
        ],
      },
      backgroundTasks: [
        {
          name: 'fitmeet_agent_inbox_poll',
          enabledByDefault: true,
          intervalSeconds: 60,
          tool: 'fitmeet_get_agent_inbox_events',
          args: { limit: 20, unreadOnly: true },
          silentWhenEmpty: true,
          notifyOnEvents: [
            'message.received',
            'agent.inbox.updated',
            'match.completed',
            'profile.match.recommended',
            'social_request.match.recommended',
            'contact.request.received',
            'contact.request.accepted',
            'contact.request.declined',
          ],
          fallback:
            'Keep polling enabled even when webhook delivery is configured.',
        },
        {
          name: 'fitmeet_profile_match_autopilot',
          enabledByDefault: true,
          intervalSeconds: 900,
          tool: 'fitmeet_run_profile_match_autopilot_once',
          args: {},
          silentWhenEmpty: true,
          notifyOnEvents: [
            'profile.match.recommended',
            'social_request.match.recommended',
          ],
          fallback:
            'If OpenClaw cannot run background tasks, call this tool when the owner asks to refresh profile or request-card matches.',
        },
      ],
      pushNotifications: {
        mode: 'webhook',
        optional: true,
        deliveryUrlField: 'agentWebhookUrl',
        events: [
          'message.received',
          'agent.inbox.updated',
          'message.created',
          'profile.match.recommended',
          'social_request.match.recommended',
          'contact.request.received',
          'contact.request.accepted',
          'contact.request.declined',
        ],
        signature:
          'X-FitMeet-Signature: v1=<hmac_sha256(`${timestamp}.${rawBody}`)>',
        deliveryRule:
          'Webhook is best-effort realtime delivery; the background poll is the source of truth for missed events.',
      },
      errorModel: {
        codeField: 'code',
        retryableField: 'error.retryable',
        docs: '/api/public/social-skills/openapi.json#/components/schemas/Error',
      },
      permissions: ['basic', 'standard', 'open'],
      userAuth: {
        type: 'fitmeet_user_jwt',
        rule: 'OpenClaw may call these endpoints only with explicit user consent and user-provided credentials. It must not store passwords or bypass real-name verification.',
        endpoints: [
          {
            name: 'register_user',
            method: 'POST',
            path: '/api/auth/register',
            returns: 'access_token, optional refresh_token, user',
          },
          {
            name: 'login_user',
            method: 'POST',
            path: '/api/auth/login',
            returns: 'access_token, optional refresh_token, user',
          },
          {
            name: 'read_authenticated_profile',
            method: 'GET',
            path: '/api/auth/profile',
            auth: 'Authorization: Bearer <access_token>',
          },
          {
            name: 'create_personal_agent_token',
            method: 'POST',
            path: '/api/agents/personal-token',
            auth: 'Authorization: Bearer <access_token>',
            requires: 'approved real-name verification',
          },
        ],
      },
      agent: {
        connectionId: conn.id,
        name: conn.agentName,
        displayName: conn.agentDisplayName,
        permissionLevel: conn.permissionLevel,
        dailyActionLimit: conn.dailyActionLimit,
        dailyActionsUsed: conn.dailyActionsUsed,
      },
      principles: [
        'fitmeet_is_an_ai_agent_social_network',
        'agent_can_represent_user_and_also_be_a_social_subject',
        'agent_can_meet_humans_or_other_agents',
        'fitmeet_owns_matching_and_safety_ranking',
        'external_agents_submit_intents_not_raw_search_decisions',
        'human_confirmation_for_risky_actions',
        'privacy_by_default',
        'safe_profile_data_only',
        'audit_every_agent_action',
      ],
      riskLevels: {
        low: [
          'online_chat',
          'fitness_recommendation',
          'public_interest_matching',
        ],
        medium: ['offline_meeting', 'travel', 'pet_meetup', 'photo_meetup'],
        high: [
          'alcohol',
          'emergency',
          'payment',
          'contact_exchange',
          'sensitive_photos',
        ],
      },
      tools: this.buildAgentSocialToolList(bearer),
      skills: [
        {
          name: 'create_social_request',
          method: 'POST',
          path: '/api/agent/social-requests',
          description:
            'Create a structured social request from user intent (running partner, coffee chat, etc.).',
          permission: AgentAction.CreateSocialRequest,
          requires_user_confirmation: false,
          risk_level: 'medium',
        },
        {
          name: 'search_nearby_people',
          method: 'POST',
          path: '/api/agent/nearby/search',
          description:
            'Search nearby FitMeet users matching a brief and basic filters (city, radius, interests).',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'match_partner',
          method: 'POST',
          path: '/api/agent/match/partner',
          description:
            'Score and rank candidate users for a given social request or query. Returns a ranked list with reasons.',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'draft_message',
          method: 'POST',
          path: '/api/agent/messages/draft',
          description:
            'Generate an icebreaker / first private-message draft for human review. Does not send.',
          permission: AgentAction.GenerateMessage,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'fitmeet_generate_profile_draft',
          method: 'POST',
          path: '/api/agent/owner/social-profile/ai-draft',
          description:
            'Generate a structured AI persona card from owner interview answers. The card is a draft and must be shown to the owner before saving.',
          permission: 'profile.update_preferences',
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'fitmeet_confirm_profile',
          method: 'POST',
          path: '/api/agent/owner/social-profile/ai-save',
          description:
            'Save the owner-confirmed AI persona card and optionally enable profile-based matching even when the owner has not posted a social request. Requires ownerConfirmed=true.',
          permission: 'profile.update_preferences',
          requires_user_confirmation: true,
          risk_level: 'medium',
        },
        {
          name: 'fitmeet_update_profile_visibility',
          method: 'PATCH',
          path: '/api/agent/owner/social-profile/visibility',
          description:
            'Update owner-confirmed profile discoverability and matching-pool switches. Requires ownerConfirmed=true.',
          permission: 'profile.update_preferences',
          requires_user_confirmation: true,
          risk_level: 'medium',
        },
        {
          name: 'run_profile_match_once',
          method: 'POST',
          path: '/api/agent/owner/profile-matches/run-once',
          description:
            'Run one profile-pool scan and write review-only recommendations to Agent Inbox/Webhook. Does not contact candidates.',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'fitmeet_run_profile_match_autopilot_once',
          method: 'POST',
          path: '/api/agent/profile-match/autopilot/run-once',
          description:
            'Run one Profile Match Autopilot sweep: scan authorized persona profiles and active request cards, use MatchService hard filters and scoring, create safe LLM-explained recommendations, notify both sides to confirm, and write agent inbox events. Does not auto-friend or auto-contact.',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'fitmeet_get_profile_recommendations',
          method: 'GET',
          path: '/api/agent/owner/profile-recommendations/events',
          description:
            'Read profile.match.recommended Agent Inbox events for the token owner. Any outbound action still requires owner confirmation.',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'ignore_profile_match_recommendation',
          method: 'POST',
          path: '/api/agent/owner/profile-matches/{id}/ignore',
          description:
            'Reject a profile-only recommendation. Does not notify or contact the candidate.',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'save_profile_match_recommendation',
          method: 'POST',
          path: '/api/agent/owner/profile-matches/{id}/favorite',
          description:
            'Save a profile-only recommendation for later owner review. Does not contact the candidate.',
          permission: AgentAction.SearchProfiles,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'draft_profile_match_opener',
          method: 'POST',
          path: '/api/agent/owner/profile-matches/{id}/draft-opener',
          description:
            'Draft a safe first message from public recommendation context. Draft only; sending requires owner confirmation.',
          permission: AgentAction.GenerateMessage,
          requires_user_confirmation: false,
          risk_level: 'low',
        },
        {
          name: 'confirm_profile_match_contact',
          method: 'POST',
          path: '/api/agent/owner/profile-matches/{id}/confirm-contact',
          description:
            'Submit an owner-confirmed contact request for a profile recommendation. It still waits for target consent.',
          permission: AgentAction.ContactRequest,
          requires_user_confirmation: true,
          risk_level: 'high',
        },
        {
          name: 'send_private_message',
          method: 'POST',
          path: '/api/agent/messages/send',
          description:
            'Send an in-platform private message on behalf of the user. Requires user confirmation unless the connection is in standard or open mode and risk score is low.',
          permission: AgentAction.SendMessage,
          requires_user_confirmation: true,
          risk_level: 'high',
        },
        {
          name: 'create_activity',
          method: 'POST',
          path: '/api/agent/activities',
          description:
            'Create a public meet/activity (sport, time, location, slots). Persists to the FitMeet activities table.',
          permission: AgentAction.CreateActivity,
          requires_user_confirmation: true,
          risk_level: 'high',
        },
        {
          name: 'join_activity',
          method: 'POST',
          path: '/api/agent/activities/{id}/join',
          description:
            'Request to join an existing activity on behalf of the user (status starts as pending until host approves).',
          permission: AgentAction.JoinActivity,
          requires_user_confirmation: false,
          risk_level: 'medium',
        },
        {
          name: 'report_risk',
          method: 'POST',
          path: '/api/agent/safety/report',
          description:
            'File a safety report against a user / post / meet / comment with reason and description.',
          permission: AgentAction.ReportRisk,
          requires_user_confirmation: false,
          risk_level: 'medium',
        },
        {
          name: 'submit_completion_proof',
          method: 'POST',
          path: '/api/agent/activities/{id}/proof',
          description:
            'Submit a proof-of-completion (photo URL, note, GPS sample) for a finished activity. Stored as a pending approval entry pending user/host confirmation.',
          permission: AgentAction.SubmitCompletionProof,
          requires_user_confirmation: true,
          risk_level: 'high',
        },
      ],
      scenarios: [
        'fitness_partner',
        'offline_friend',
        'dog_walking',
        'bar_friend',
        'travel_partner',
        'photo_partner',
      ],
      recommendedFlow: [
        'openclaw_collects_owner_need',
        'openclaw_submits_social_intent_to_fitmeet',
        'fitmeet_matches_ranks_and_risk_scores_candidates',
        'openclaw_presents_results_to_owner',
        'owner_confirms_candidate_and_action',
        'fitmeet_executes_intro_or_contact_request_inside_platform_boundaries',
      ],
    };
  }

  /**
   * The 17-tool catalog OpenClaw / QClaw consumes to drive the end-to-end
   * AI Agent Social Network loop on behalf of its owner. Auth is uniformly
   * `Authorization: Bearer <agent_token>`; the owner is derived from the
   * token server-side and must NEVER be sent in the body.
   */
  private buildAgentSocialToolList(bearer: string) {
    const obj = (props: Record<string, string>, required: string[] = []) => ({
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(props).map(([k, t]) => [k, { type: t }]),
      ),
      required,
    });
    return [
      {
        name: 'fitmeet_get_profile_status',
        description:
          "Read the token owner's profile status, completion, visibility switches, and matching-pool state.",
        method: 'GET',
        path: '/api/agent/owner/social-profile/status',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({
          profile: 'object',
          completion: 'object',
          visibility: 'object',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_my_profile',
        description:
          "Read the owner's social profile (city, interests, ageRange, nearbyArea, fitnessGoals, availableTimes, socialPreference, rejectRules, privacyBoundary).",
        method: 'GET',
        path: '/api/agent/owner/social-profile',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({
          city: 'string',
          interestTags: 'array',
          ageRange: 'string',
          nearbyArea: 'string',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_update_my_social_profile',
        description:
          "Patch the owner's social profile fields. Only profile fields — no userId.",
        method: 'PATCH',
        path: '/api/agent/owner/social-profile',
        auth: bearer,
        input_schema: obj({
          city: 'string',
          interestTags: 'array',
          ageRange: 'string',
          nearbyArea: 'string',
          fitnessGoals: 'array',
          availableTimes: 'array',
          socialPreference: 'string',
          rejectRules: 'string',
          privacyBoundary: 'string',
        }),
        output_schema: obj({ ok: 'boolean' }),
        requires_user_confirmation: true,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_update_profile_visibility',
        description:
          'Update profile visibility and matching-pool switches after explicit owner confirmation. Only the token owner is affected.',
        method: 'PATCH',
        path: '/api/agent/owner/social-profile/visibility',
        auth: bearer,
        input_schema: obj(
          {
            ownerConfirmed: 'boolean',
            profileDiscoverable: 'boolean',
            agentCanRecommendMe: 'boolean',
            agentCanStartChatAfterApproval: 'boolean',
          },
          ['ownerConfirmed'],
        ),
        output_schema: obj({
          profileDiscoverable: 'boolean',
          agentCanRecommendMe: 'boolean',
        }),
        requires_user_confirmation: true,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_generate_profile_questions',
        description:
          'Return the canonical question set the agent should ask the owner in order to complete the social profile.',
        method: 'GET',
        path: '/api/agent/owner/social-profile/questions',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({ questions: 'array' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_save_profile_answer',
        description:
          'Save a single answer to a profile question (key + answer). The agent calls this once per turn during the onboarding interview.',
        method: 'POST',
        path: '/api/agent/owner/social-profile/answers',
        auth: bearer,
        input_schema: obj({ key: 'string', answer: 'string' }, [
          'key',
          'answer',
        ]),
        output_schema: obj({ ok: 'boolean', completion: 'number' }),
        requires_user_confirmation: true,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_generate_profile_draft',
        description:
          'Generate a structured AI persona card from the owner interview. The result is a draft for owner review, not an automatic publish.',
        method: 'POST',
        path: '/api/agent/owner/social-profile/ai-draft',
        auth: bearer,
        input_schema: obj({
          answers: 'array',
          rawText: 'string',
          source: 'string',
        }),
        output_schema: obj({
          draft: 'object',
          mode: 'string',
          completion: 'object',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_confirm_profile',
        description:
          'Save an owner-confirmed AI persona card and sync it into the AI matching pool when enableMatching is true. Requires ownerConfirmed=true.',
        method: 'POST',
        path: '/api/agent/owner/social-profile/ai-save',
        auth: bearer,
        input_schema: obj(
          {
            profile: 'object',
            enableMatching: 'boolean',
            ownerConfirmed: 'boolean',
            sensitiveTagsConfirmed: 'boolean',
          },
          ['profile', 'ownerConfirmed'],
        ),
        output_schema: obj({ profile: 'object', matchingEnabled: 'boolean' }),
        requires_user_confirmation: true,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_get_profile_completion',
        description:
          "Get how much of the owner's social profile is filled in, with a list of missing fields the agent should still ask about.",
        method: 'GET',
        path: '/api/agent/owner/social-profile/completion',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({ completion: 'number', missing: 'array' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_run_profile_match_once',
        description:
          'Run one profile-pool recommendation scan for the owner. This never sends messages; it writes review-only recommendations to Agent Inbox/Webhook.',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/run-once',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({
          matchedCount: 'number',
          recommendations: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_profile_recommendations',
        description:
          'Read profile.match.recommended Agent Inbox events generated from AI persona recommendations. Contact still requires owner confirmation.',
        method: 'GET',
        path: '/api/agent/owner/profile-recommendations/events',
        auth: bearer,
        input_schema: obj({ limit: 'integer', unreadOnly: 'boolean' }),
        output_schema: obj({ events: 'array' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_ignore_profile_match_recommendation',
        description:
          'Reject a profile-only recommendation. Does not notify or contact the candidate.',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/:id/ignore',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({ ok: 'boolean', status: 'string' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_save_profile_match_recommendation',
        description:
          'Save a profile-only recommendation for later owner review. Does not notify or contact the candidate.',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/:id/favorite',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({ ok: 'boolean', status: 'string' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_draft_profile_match_opener',
        description:
          'Draft a safe opener for a profile-only recommendation. Draft only; it never sends a message.',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/:id/draft-opener',
        auth: bearer,
        input_schema: obj({ id: 'integer', tone: 'string' }, ['id']),
        output_schema: obj({
          draft: 'object',
          requiresOwnerConfirmation: 'boolean',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_confirm_profile_match_contact',
        description:
          'Create an owner-confirmed contact request for a profile-only recommendation. The target user must still consent.',
        method: 'POST',
        path: '/api/agent/owner/profile-matches/:id/confirm-contact',
        auth: bearer,
        input_schema: obj(
          { id: 'integer', ownerConfirmed: 'boolean', note: 'string' },
          ['id', 'ownerConfirmed'],
        ),
        output_schema: obj({ status: 'string', contactRequestId: 'integer' }),
        requires_user_confirmation: true,
        risk_level: 'high',
      },
      {
        name: 'fitmeet_create_ai_social_request',
        description:
          'Create a structured social request (running partner, coffee chat, dog walk, ...) on behalf of the owner. Returns the persisted request and an initial candidate list.',
        method: 'POST',
        path: '/api/agent/social-requests',
        auth: bearer,
        input_schema: obj(
          {
            requestType: 'string',
            description: 'string',
            city: 'string',
            timePreference: 'string',
            interests: 'array',
          },
          ['requestType', 'description'],
        ),
        output_schema: obj({
          request: 'object',
          candidates: 'array',
          handoff: 'object',
        }),
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_submit_social_intent',
        description:
          "Alias for the canonical OpenClaw flow: submit the owner's social intent to FitMeet and receive candidates plus handoff instructions.",
        method: 'POST',
        path: '/api/agent/social-requests',
        auth: bearer,
        input_schema: obj(
          {
            requestType: 'string',
            description: 'string',
            city: 'string',
            timePreference: 'string',
            interests: 'array',
          },
          ['requestType', 'description'],
        ),
        output_schema: obj({
          request: 'object',
          candidates: 'array',
          handoff: 'object',
        }),
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_publish_ai_social_request',
        description:
          'Publish an existing social request to the public hall (sync as a PublicSocialIntent) so other users / agents in the network can discover it.',
        method: 'POST',
        path: '/api/agent/social-requests/:id/publish',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({ publicIntentId: 'string', synced: 'boolean' }),
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_run_match',
        description:
          'Recompute the top-K candidate list for a given social request. Idempotent; replaces previous suggestions.',
        method: 'POST',
        path: '/api/agent/social-requests/:id/match',
        auth: bearer,
        input_schema: obj({ id: 'integer', limit: 'integer' }, ['id']),
        output_schema: obj({
          socialRequestId: 'integer',
          candidates: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_candidates',
        description:
          'Read the persisted candidate list for a social request, ordered by score DESC.',
        method: 'GET',
        path: '/api/agent/social-requests/:id/candidates',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({
          socialRequestId: 'integer',
          candidates: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_matches',
        description:
          'Refresh/read FitMeet-produced matches for a social request.',
        method: 'GET',
        path: '/api/agent/social-requests/:id/matches',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({
          request: 'object',
          candidates: 'array',
          handoff: 'object',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_decide_candidate',
        description:
          "Submit the owner's approve/reject decision for a candidate and optional bounded connection action.",
        method: 'POST',
        path: '/api/agent/social-requests/:id/candidates/decision',
        auth: bearer,
        input_schema: obj(
          {
            id: 'integer',
            candidateUserId: 'integer',
            decision: 'string',
            connectionAction: 'string',
            ownerConfirmed: 'boolean',
            note: 'string',
          },
          ['id', 'candidateUserId', 'decision', 'ownerConfirmed'],
        ),
        output_schema: obj({
          status: 'string',
          conversationId: 'string',
          message: 'object',
        }),
        requires_user_confirmation: true,
        risk_level: 'high',
      },
      {
        name: 'fitmeet_send_invite',
        description:
          "Send the first private invite message from the owner to a matched candidate, opening (or reusing) the FitMeet conversation and marking the candidate as `messaged`. High-risk — should respect the owner's approval policy.",
        method: 'POST',
        path: '/api/agent/social-requests/:id/candidates/:candidateId/send-invite',
        auth: bearer,
        input_schema: obj(
          {
            id: 'integer',
            candidateId: 'integer',
            targetUserId: 'integer',
            text: 'string',
          },
          ['id', 'candidateId', 'targetUserId', 'text'],
        ),
        output_schema: obj({
          ok: 'boolean',
          conversationId: 'string',
          messageId: 'string',
        }),
        requires_user_confirmation: true,
        risk_level: 'high',
      },
      {
        name: 'fitmeet_mark_candidate_messaged',
        description:
          'Mark a candidate as `messaged` after the agent has sent the first message through some other channel (idempotent).',
        method: 'POST',
        path: '/api/agent/social-requests/:id/candidates/:candidateId/mark-messaged',
        auth: bearer,
        input_schema: obj({ id: 'integer', candidateId: 'integer' }, [
          'id',
          'candidateId',
        ]),
        output_schema: obj({ id: 'integer', status: 'string' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_agent_inbox_events',
        description:
          'Lightweight heartbeat receive loop for OpenClaw. Poll unread inbox events every 30-60 seconds; stay silent when no events are returned, then ack events after reporting them to the owner.',
        method: 'GET',
        path: '/api/agent/inbox/events',
        auth: bearer,
        input_schema: obj({
          limit: 'integer',
          unreadOnly: 'boolean',
        }),
        output_schema: obj({
          events: 'array',
          total: 'integer',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
        background_task: {
          enabled_by_default: true,
          interval_seconds: 60,
          silent_when_empty: true,
        },
      },
      {
        name: 'fitmeet_ack_agent_inbox_events',
        description:
          'Mark processed Agent Inbox events as read after OpenClaw has reported them to the owner. Use event ids returned by fitmeet_get_agent_inbox_events.',
        method: 'POST',
        path: '/api/agent/inbox/events/ack',
        auth: bearer,
        input_schema: obj({ eventIds: 'array' }, ['eventIds']),
        output_schema: obj({
          ok: 'boolean',
          requested: 'integer',
          acknowledged: 'integer',
          eventIds: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_agent_inbox',
        description:
          'Read durable Agent Inbox conversation state plus recent events. Prefer fitmeet_get_agent_inbox_events for the background poll.',
        method: 'GET',
        path: '/api/agent/inbox/conversations',
        auth: bearer,
        input_schema: obj({
          limit: 'integer',
          unreadOnly: 'boolean',
        }),
        output_schema: obj({
          conversations: 'array',
          events: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_agent_inbox_messages',
        description:
          'Read one Agent Inbox conversation. This clears only the conversation unread counter; event processing still uses fitmeet_ack_agent_inbox_events after OpenClaw reports to the owner.',
        method: 'GET',
        path: '/api/agent/inbox/conversations/:conversationId/messages',
        auth: bearer,
        input_schema: obj(
          {
            conversationId: 'string',
            limit: 'integer',
          },
          ['conversationId'],
        ),
        output_schema: obj({
          conversationId: 'string',
          messages: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_get_agent_permissions',
        description:
          "Read the agent's current permission mode (assisted/basic/normal/standard/open), capability switches, daily quotas and per-action approval gates.",
        method: 'GET',
        path: '/api/agent/owner/permissions',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({
          mode: 'string',
          maxDailyMessages: 'integer',
          requireApprovalForAll: 'boolean',
        }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_update_agent_permissions',
        description:
          "Patch the agent's permission mode / capability switches / daily quotas. Cannot bypass platform safety filters.",
        method: 'PATCH',
        path: '/api/agent/owner/permissions',
        auth: bearer,
        input_schema: obj({
          mode: 'string',
          allowSendMessage: 'boolean',
          allowCreateActivity: 'boolean',
          maxDailyMessages: 'integer',
          requireApprovalForAll: 'boolean',
        }),
        output_schema: obj({ ok: 'boolean' }),
        requires_user_confirmation: true,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_run_ai_social_autopilot_once',
        description:
          'Run one autopilot tick for the owner: pick the next under-served social request, rerun match, and queue any high-risk action into the approval queue. Used by OpenClaw to drive the loop forward when allowed.',
        method: 'POST',
        path: '/api/agent/social-autopilot/run-once',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({
          ok: 'boolean',
          actions: 'array',
          pendingApprovals: 'array',
        }),
        requires_user_confirmation: false,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_get_pending_approvals',
        description:
          "List all pending approval requests created by the agent that are waiting on the owner's decision.",
        method: 'GET',
        path: '/api/agent/owner/pending-approvals',
        auth: bearer,
        input_schema: obj({}),
        output_schema: obj({ items: 'array' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
      {
        name: 'fitmeet_approve_action',
        description:
          'Approve a pending agent action by its approval id. Triggers automatic dispatch of the underlying action.',
        method: 'POST',
        path: '/api/agent/owner/approvals/:id/approve',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({ ok: 'boolean', dispatched: 'boolean' }),
        requires_user_confirmation: true,
        risk_level: 'medium',
      },
      {
        name: 'fitmeet_reject_action',
        description:
          'Reject a pending agent action by its approval id. The action will not be dispatched.',
        method: 'POST',
        path: '/api/agent/owner/approvals/:id/reject',
        auth: bearer,
        input_schema: obj({ id: 'integer' }, ['id']),
        output_schema: obj({ ok: 'boolean' }),
        requires_user_confirmation: false,
        risk_level: 'low',
      },
    ];
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
    await this.enforcePublicSocialIntentAbuseControls(dto, meta);

    const candidates = await this.searchSocialCandidates(0, {
      ...dto,
      verifiedOnly: dto.verifiedOnly ?? true,
      visibility: 'matched_users_only',
      limit: Math.min(dto.limit ?? 5, 5),
    });
    const riskLevel = this.classifySocialRisk(dto);
    const matchSignal = this.buildPublicIntentMatchSignalFromRequest(
      dto,
      candidates,
    );
    const intent = await this.publicIntentRepo.save(
      this.publicIntentRepo.create({
        id: `public_${crypto.randomUUID()}`,
        userId: null,
        linkedSocialRequestId: null,
        source: 'public_social_skills',
        requestType: dto.requestType.trim(),
        title: dto.title?.trim() || this.buildSocialRequestTitle(dto),
        description: dto.description.trim(),
        interestTags: dto.interests ?? [],
        city: dto.city?.trim() || '',
        loc: dto.loc?.trim() || '',
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        radiusKm: dto.radiusKm ?? 5,
        timePreference: dto.timePreference?.trim() || '',
        locationPreference: dto.loc?.trim() || '',
        socialGoal: dto.requestType.trim(),
        riskLevel,
        requiresUserConfirmation: true,
        filters: {
          verifiedOnly: dto.verifiedOnly ?? true,
          interests: dto.interests ?? [],
        },
        candidateUserIds: candidates.map((candidate) => candidate.profile.id),
        matchedCount: candidates.length,
        status:
          candidates.length > 0
            ? SocialRequestStatus.Matched
            : SocialRequestStatus.Searching,
        metadata: {
          source: 'public_social_skills',
          ipBucket: this.hashForBucket(this.normalizeIp(meta)),
          deviceBucket: this.hashForBucket(
            this.normalizeHeader(meta.deviceId) ||
              `${this.normalizeIp(meta)}:${this.normalizeHeader(meta.userAgent)}`,
          ),
          origin: this.normalizeHeader(meta.origin),
          matchSignal,
        },
      }),
    );

    return {
      mode: 'public',
      request: {
        id: intent.id,
        requestType: intent.requestType,
        title: intent.title,
        description: intent.description,
        city: intent.city,
        loc: intent.loc,
        radiusKm: intent.radiusKm,
        timePreference: intent.timePreference,
        riskLevel: intent.riskLevel,
        requiresUserConfirmation: intent.requiresUserConfirmation,
        matchedCount: intent.matchedCount,
        matchSignal,
        status: intent.status,
        createdAt: intent.createdAt,
      },
      candidates,
      matchedBy: 'fitmeet_matching_engine',
      limitations: [
        'no_owner_long_term_preferences',
        'no_history_management',
        'no_autonomous_message_send',
        'no_contact_exchange',
        'no_payment_or_funds_related_actions',
      ],
      upgrade: {
        mode: 'authorized',
        requirement: 'login_once_and_complete_real_name_verification',
        tokenEndpoint: '/api/agents/personal-token',
      },
    };
  }

  async listPublicSocialIntents(filters: PublicSocialIntentListFilters = {}) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const take = Math.min(Math.max(Number(filters.limit) || 30, 1), 50);
    const skip = (page - 1) * take;
    const query = this.publicIntentRepo
      .createQueryBuilder('intent')
      .orderBy('intent.createdAt', 'DESC')
      .take(take)
      .skip(skip);

    const city = filters.city?.trim();
    if (city) {
      query.andWhere('LOWER(intent.city) LIKE LOWER(:city)', {
        city: `%${city}%`,
      });
    }

    const requestType = filters.requestType?.trim();
    if (requestType) {
      query.andWhere('intent.requestType = :requestType', { requestType });
    }

    const status = Object.values(SocialRequestStatus).includes(
      filters.status as SocialRequestStatus,
    )
      ? filters.status
      : undefined;
    if (status) {
      query.andWhere('intent.status = :status', { status });
    }

    const q = filters.q?.trim();
    if (q) {
      query.andWhere(
        `(
          LOWER(intent.title) LIKE LOWER(:q)
          OR LOWER(intent.description) LIKE LOWER(:q)
          OR LOWER(intent.city) LIKE LOWER(:q)
          OR LOWER(intent.loc) LIKE LOWER(:q)
          OR LOWER(intent.requestType) LIKE LOWER(:q)
        )`,
        { q: `%${q}%` },
      );
    }

    const [data, total] = await query.getManyAndCount();
    return {
      data: data.map((intent) => this.serializePublicSocialIntent(intent)),
      metadata: {
        total,
        page,
        lastPage: Math.ceil(total / take),
        filters: {
          q: q || undefined,
          city: city || undefined,
          requestType: requestType || undefined,
          status,
        },
      },
    };
  }

  async getPublicSocialIntent(id: string) {
    const intent = await this.publicIntentRepo.findOne({ where: { id } });
    if (!intent) throw new NotFoundException('Public social intent not found');
    return this.serializePublicSocialIntent(intent);
  }

  async getPublicSocialIntentMatches(id: string) {
    const intent = await this.publicIntentRepo.findOne({ where: { id } });
    if (!intent) throw new NotFoundException('Public social intent not found');
    const candidates = await this.searchSocialCandidates(0, {
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
    });
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
      matchSignal: this.buildPublicIntentMatchSignal(intent, candidates),
    };
    await this.publicIntentRepo.save(intent);
    return {
      request: this.serializePublicSocialIntent(intent),
      candidates,
      matchedBy: 'fitmeet_matching_engine',
    };
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
  private async __legacyGetSocialRequestMatchesUnused(
    _conn: AgentConnection,
    _requestId: number,
  ): Promise<void> {
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
        nextStep: 'openclaw_may_present_another_fitmeet_candidate',
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
          source: conn.agentName === KnownAgent.OpenClaw ? 'openclaw' : 'agent',
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
          source: conn.agentName === KnownAgent.OpenClaw ? 'openclaw' : 'agent',
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

    if (dto.city) qb.andWhere('u.city ILIKE :city', { city: `%${dto.city}%` });
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
          ownerUserId: conn.userId,
          actionType: AgentActionType.SendMessage,
          actionStatus: AgentActionStatus.Failed,
          riskLevel: AgentActionRiskLevel.High,
          targetUserId,
          inputSummary: content,
          outputSummary: `blocked_by_policy: ${verdict.blockedReason ?? 'policy'}`,
          payload: {
            agentTaskId,
            messageType: dto.messageType ?? 'text',
            reasons: verdict.reasons,
            isFirstContact,
          },
          reason: verdict.blockedReason ?? 'blocked_by_policy',
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
          riskLevel: verdict.riskLevel as ApprovalRiskLevel,
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
          ownerUserId: conn.userId,
          actionType: AgentActionType.SendMessage,
          actionStatus: AgentActionStatus.PendingApproval,
          agentTaskId,
          riskLevel: mapApprovalRiskToActionRisk(
            verdict.riskLevel as ApprovalRiskLevel,
          ),
          targetUserId,
          relatedSocialRequestId: dto.socialRequestId ?? null,
          relatedActivityId: dto.activityId ?? null,
          inputSummary: content,
          outputSummary: `pending_approval: ${req.summary}`,
          payload: {
            approvalId: req.id,
            agentTaskId,
            approvalType: isFirstContact
              ? ApprovalType.FirstMessage
              : ApprovalType.SendMessage,
            reasons: verdict.reasons,
            messageType: dto.messageType ?? 'text',
          },
          reason: req.reason ?? null,
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
        metadata: {
          source: dto.metadata?.source ?? conn.agentName,
          agentTaskId,
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
      ownerUserId: conn.userId,
      actionType: AgentActionType.SendMessage,
      actionStatus: AgentActionStatus.Executed,
      agentTaskId,
      riskLevel:
        risk >= 0.4 ? AgentActionRiskLevel.Medium : AgentActionRiskLevel.Low,
      targetUserId,
      relatedSocialRequestId: dto.socialRequestId ?? null,
      relatedActivityId: dto.activityId ?? null,
      inputSummary: content,
      outputSummary: `message_sent: id=${message.id} conv=${conversationId}`,
      payload: {
        messageId: message.id,
        conversationId,
        messageType: dto.messageType ?? 'text',
        agentTaskId,
        socketPushed,
        notificationCreated,
        approvalRequestId: dto.approvalRequestId ?? null,
        source: dto.metadata?.source ?? conn.agentName,
      },
      reason: 'agent_send_message',
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
      notePreview: this.previewText(input.note ?? ''),
      nextAction: 'ask_owner_whether_to_accept_friend_request',
    };

    for (const targetConn of targetConnections) {
      await this.messagesService.createAgentInboxEvent({
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
    const [items, total] = await this.logRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
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

    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.id != :uid', { uid: userId })
      .andWhere('u."acceptNearbyMatch" = true');

    if (blockedSet.size > 0) {
      qb.andWhere('u.id NOT IN (:...blocked)', {
        blocked: Array.from(blockedSet),
      });
    }

    if (dto.verifiedOnly) qb.andWhere('u.verified = true');

    const city = dto.city?.trim() || owner?.city || '';
    if (haveOrigin) {
      // Geo-bbox prefilter: ~1° lat ≈ 111km. Pad by 25% to keep haversine
      // edge cases inside the candidate pool.
      const latDelta = (radiusKm / 111) * 1.25;
      const lngDelta =
        (radiusKm /
          (111 * Math.max(Math.cos((ownerLat! * Math.PI) / 180), 0.01))) *
        1.25;
      qb.andWhere('u.lat IS NOT NULL AND u.lng IS NOT NULL')
        .andWhere('u.lat BETWEEN :latMin AND :latMax', {
          latMin: ownerLat! - latDelta,
          latMax: ownerLat! + latDelta,
        })
        .andWhere('u.lng BETWEEN :lngMin AND :lngMax', {
          lngMin: ownerLng! - lngDelta,
          lngMax: ownerLng! + lngDelta,
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

    // Time-window parsing (best-effort): tokenise dto.timePreference into
    // morning/afternoon/evening/night/weekend so we can bonus-score users
    // whose stored interestTags or bio match.
    const timeTokens = this.parseTimeWindow(dto.timePreference);

    const desiredTags = new Set(
      [
        dto.requestType,
        ...(dto.interests ?? []),
        ...this.extractRequestKeywords(dto.description),
      ]
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    );

    const now = Date.now();
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;

    const candidates = users
      .map((user) => {
        // acceptAgentMessages: if the candidate has an explicit pref row and
        // it's `false`, drop them. Missing pref row = default-true.
        const pref = prefByUser.get(user.id);
        if (pref && pref.acceptAgentMessages === false) return null;

        // Distance: haversine when both sides have coords.
        let distanceKm: number | null = null;
        if (
          haveOrigin &&
          typeof user.lat === 'number' &&
          typeof user.lng === 'number'
        ) {
          distanceKm = haversineKm(ownerLat!, ownerLng!, user.lat, user.lng);
          if (distanceKm > radiusKm) return null; // hard radius filter
        }

        const userTags = (user.interestTags ?? []).map((tag) =>
          tag.toLowerCase(),
        );
        const overlap = userTags.filter((tag) => desiredTags.has(tag));

        let score = 45;
        const reasonTags: string[] = [];

        // Distance decay: closer = higher bonus, up to +30.
        if (distanceKm != null) {
          const decay = Math.max(0, 1 - distanceKm / radiusKm);
          score += Math.round(decay * 30);
          reasonTags.push(`within_${radiusKm}km`);
        } else if (city && user.city === city) {
          score += 15;
          reasonTags.push('same_city');
        }

        if (user.verified) {
          score += 10;
          reasonTags.push('verified');
        }
        score += Math.min(overlap.length * 10, 25);
        overlap.forEach((tag) => reasonTags.push(`interest_${tag}`));
        if (user.bio) score += 5;

        // Stale-fix penalty: discourage surfacing users whose last known
        // location is more than a week old when caller is geo-searching.
        if (haveOrigin) {
          const fixAge = user.locationUpdatedAt
            ? now - new Date(user.locationUpdatedAt).getTime()
            : Infinity;
          if (fixAge > STALE_MS) {
            score -= 10;
            reasonTags.push('stale_location');
          }
        }

        // Time window: bonus when candidate signals match (interest tag or
        // bio mentions the same window). No hard filter — availability is
        // not modelled per user yet.
        if (timeTokens.length) {
          const haystack =
            `${user.bio ?? ''} ${userTags.join(' ')}`.toLowerCase();
          const matchedWindow = timeTokens.find((t) => haystack.includes(t));
          if (matchedWindow) {
            score += 5;
            reasonTags.push(`time_${matchedWindow}`);
          }
        }

        return {
          profile: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            color: user.color,
            age: user.age,
            city: user.city,
            bio: user.bio,
            verified: user.verified,
            interestTags: user.interestTags ?? [],
            distanceKm:
              distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
          },
          score: Math.min(Math.max(score, 0), 98),
          reasonTags,
          reasonText: this.buildSocialCandidateReason(
            user,
            dto,
            overlap,
            distanceKm,
          ),
          nextAction: 'draft_invitation',
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, dto.limit ?? 10);

    return candidates;
  }

  /**
   * Parse a free-text time preference (e.g. "工作日晚上", "weekend morning")
   * into normalised tokens for scoring.
   */
  private parseTimeWindow(text?: string): string[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    const tokens: string[] = [];
    if (/(早晨|早上|morning|上午|am)/.test(lower)) tokens.push('morning');
    if (/(中午|noon|午间)/.test(lower)) tokens.push('noon');
    if (/(下午|afternoon|pm)/.test(lower)) tokens.push('afternoon');
    if (/(傍晚|晚上|evening|夜里|tonight)/.test(lower)) tokens.push('evening');
    if (/(深夜|凌晨|night|midnight)/.test(lower)) tokens.push('night');
    if (/(周末|weekend|周六|周日|saturday|sunday)/.test(lower))
      tokens.push('weekend');
    if (/(工作日|weekday|平日)/.test(lower)) tokens.push('weekday');
    return tokens;
  }

  private classifySocialRisk(
    dto: CreateSocialRequestDto,
  ): SocialRequestRiskLevel {
    const text = `${dto.requestType} ${dto.description}`.toLowerCase();
    if (/(酒|bar|pub|drink|drinking|急救|受伤|help|emergency)/i.test(text)) {
      return SocialRequestRiskLevel.High;
    }
    if (
      /(线下|见面|旅游|travel|trip|遛狗|dog|pet|搭车|自驾|offline)/i.test(text)
    ) {
      return SocialRequestRiskLevel.Medium;
    }
    return SocialRequestRiskLevel.Low;
  }

  private buildSocialRequestTitle(dto: CreateSocialRequestDto) {
    const labels: Record<string, string> = {
      fitness_partner: '寻找附近约练搭子',
      dog_walking: '寻找附近遛狗搭子',
      bar_friend: '寻找同场酒搭子',
      travel_partner: '寻找旅游出行搭子',
      offline_friend: '寻找附近线下朋友',
      photo_partner: '寻找拍照搭子',
    };
    return labels[dto.requestType] ?? `寻找${dto.requestType}`;
  }

  private extractRequestKeywords(text = '') {
    const lowered = text.toLowerCase();
    const pairs: Array<[RegExp, string]> = [
      [/健身|约练|gym|fitness|workout/, 'fitness'],
      [/跑步|run|running/, 'running'],
      [/遛狗|狗|dog|pet|宠物/, 'pet'],
      [/酒|bar|pub|喝酒|drinking/, 'bar'],
      [/旅游|旅行|travel|trip/, 'travel'],
      [/拍照|摄影|photo|camera/, 'photography'],
      [/咖啡|coffee/, 'coffee'],
    ];
    return pairs
      .filter(([pattern]) => pattern.test(lowered))
      .map(([, tag]) => tag);
  }

  private buildSocialCandidateReason(
    user: User,
    dto: CreateSocialRequestDto,
    overlap: string[],
    distanceKm: number | null = null,
  ) {
    const parts: string[] = [];
    if (distanceKm != null) {
      parts.push(`距离约 ${distanceKm.toFixed(2)}km`);
    } else if (dto.city && user.city === dto.city) {
      parts.push(`同在${user.city}`);
    }
    if (user.verified) parts.push('已完成认证');
    if (overlap.length) parts.push(`兴趣重合：${overlap.join('、')}`);
    if (!parts.length) parts.push('资料与本次需求有基础匹配');
    return `${parts.join('，')}，建议先发送礼貌邀约并等待对方确认。`;
  }

  private buildFitMeetIntroMessage(request: UserSocialRequest) {
    const where = request.city || 'nearby';
    const when = request.timeStart
      ? new Date(request.timeStart).toLocaleString()
      : 'recently';
    const title = request.title || request.description || request.type;
    return `Hi, this is a FitMeet agent-assisted intro. My owner is looking for ${title} around ${where} ${when}. Would you like to chat inside FitMeet first?`;
  }

  private serializePublicSocialIntent(intent: PublicSocialIntent) {
    return {
      id: intent.id,
      userId: intent.userId,
      linkedSocialRequestId: intent.linkedSocialRequestId,
      source: intent.source,
      mode: intent.mode,
      requestType: intent.requestType,
      title: intent.title,
      description: intent.description,
      interestTags: intent.interestTags ?? [],
      city: intent.city,
      loc: intent.loc,
      lat: intent.lat,
      lng: intent.lng,
      radiusKm: intent.radiusKm,
      timePreference: intent.timePreference,
      locationPreference: intent.locationPreference,
      socialGoal: intent.socialGoal,
      riskLevel: intent.riskLevel,
      requiresUserConfirmation: intent.requiresUserConfirmation,
      filters: intent.filters,
      candidateUserIds: intent.candidateUserIds,
      matchedCount: intent.matchedCount,
      matchSignal: this.buildPublicIntentMatchSignal(intent),
      status: intent.status,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    };
  }

  private buildPublicIntentMatchSignal(
    intent: PublicSocialIntent,
    candidates: Array<{ score?: number; reasonTags?: string[] }> = [],
  ) {
    const metadataSignal = intent.metadata?.matchSignal;
    if (
      metadataSignal &&
      typeof metadataSignal === 'object' &&
      typeof (metadataSignal as { score?: unknown }).score === 'number'
    ) {
      return metadataSignal;
    }
    return this.buildPublicIntentMatchSignalFromRequest(
      {
        requestType: intent.requestType,
        title: intent.title,
        description: intent.description,
        city: intent.city,
        loc: intent.loc,
        timePreference: intent.timePreference,
        interests: intent.interestTags ?? [],
        verifiedOnly: Boolean(intent.filters?.verifiedOnly),
      } as CreateSocialRequestDto,
      candidates,
      intent.matchedCount,
    );
  }

  private buildPublicIntentMatchSignalFromRequest(
    dto: CreateSocialRequestDto,
    candidates: Array<{ score?: number; reasonTags?: string[] }> = [],
    matchedCount = candidates.length,
  ) {
    const scored = candidates
      .map((candidate) => Number(candidate.score))
      .filter((score) => Number.isFinite(score));
    const topScore = scored.length ? Math.max(...scored) : 0;
    const averageTop = scored.length
      ? scored.slice(0, 5).reduce((sum, score) => sum + score, 0) /
        Math.min(scored.length, 5)
      : 0;
    const signalCount =
      (dto.city ? 1 : 0) +
      (dto.loc ? 1 : 0) +
      (dto.timePreference ? 1 : 0) +
      ((dto.interests ?? []).length > 0 ? 1 : 0) +
      ((dto.description ?? '').trim().length >= 20 ? 1 : 0) +
      (dto.verifiedOnly ? 1 : 0);
    const fallbackScore = 38 + signalCount * 6 + Math.min(matchedCount, 5) * 5;
    const score = Math.round(
      Math.max(
        28,
        Math.min(
          98,
          topScore > 0 ? topScore * 0.7 + averageTop * 0.3 : fallbackScore,
        ),
      ),
    );
    const reasons = [
      dto.city ? `城市信号：${dto.city}` : '',
      dto.timePreference ? `时间偏好：${dto.timePreference}` : '',
      (dto.interests ?? []).length
        ? `兴趣重合：${(dto.interests ?? []).slice(0, 3).join('、')}`
        : '',
      dto.verifiedOnly ? '优先实名认证用户' : '',
      matchedCount > 0
        ? `已找到 ${matchedCount} 个候选`
        : '候选池仍在等待画像信号',
    ].filter(Boolean);

    return {
      score,
      confidence: matchedCount > 0 ? (score >= 75 ? 'high' : 'medium') : 'low',
      source:
        process.env.DEEPSEEK_API_KEY || process.env.ENABLE_MATCH_REASONER_LLM
          ? 'ai_dynamic_with_deterministic_fallback'
          : 'deterministic_fallback',
      reasons,
      updatedAt: new Date().toISOString(),
    };
  }

  private previewText(text: string, max = 160): string {
    const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
    return normalized.length > max
      ? `${normalized.slice(0, Math.max(0, max - 3))}...`
      : normalized;
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
    const ip = this.normalizeIp(meta);
    const deviceId = this.normalizeHeader(meta.deviceId);
    const userAgent = this.normalizeHeader(meta.userAgent);
    const origin = this.normalizeHeader(meta.origin);
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
      this.hasPublicIntentSensitiveContent(text)
    ) {
      throw new BadRequestException(
        'Public social intent failed safety screening',
      );
    }

    const suspiciousScore = this.scorePublicIntentSuspicion(dto, {
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
        `public-intent:device:${deviceId || this.hashForBucket(`${ip}:${userAgent}`)}`,
        12,
        3600,
      ),
    ]);
  }

  private hasPublicIntentSensitiveContent(text: string) {
    return /(微信|wechat|手机号|phone|电话|email|邮箱|转账|打钱|付款|裸照|私密照片|身份证|酒店房间|住址|home address|payment|bank|crypto|usdt)/i.test(
      text,
    );
  }

  private scorePublicIntentSuspicion(
    dto: CreateSocialRequestDto,
    meta: {
      ip: string;
      deviceId: string;
      userAgent: string;
      origin: string;
    },
  ) {
    let score = 0;
    if (!meta.deviceId) score += 1;
    if (!meta.origin) score += 1;
    if ((dto.description ?? '').length < 12) score += 1;
    if ((dto.description ?? '').length > 1200) score += 1;
    if ((dto.limit ?? 5) > 10) score += 1;
    if ((dto.radiusKm ?? 5) > 25) score += 1;
    if (!dto.city && !dto.loc && (!dto.lat || !dto.lng)) score += 1;
    return score;
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

  private normalizeIp(meta: PublicSocialIntentMeta) {
    const forwarded = this.normalizeHeader(meta.forwardedFor);
    return (forwarded.split(',')[0] || meta.ip || 'unknown').trim();
  }

  private normalizeHeader(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }

  private hashForBucket(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
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
    // persist updated action counter
    await this.connRepo.save(conn);
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

/** Great-circle distance in kilometres. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
