import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  AgentSettings,
  AgentSettingsMode,
} from './entities/agent-settings.entity';

/** All editable boolean / number switches on AgentSettings. */
export interface UpdateAgentSettingsInput {
  mode?: AgentSettingsMode;
  allowSearch?: boolean;
  allowDraftMessage?: boolean;
  allowSendMessage?: boolean;
  allowAutoReply?: boolean;
  allowCreateActivity?: boolean;
  allowJoinActivity?: boolean;
  allowShareLocation?: boolean;
  allowUploadProof?: boolean;
  allowContactExchange?: boolean;
  maxDailyMessages?: number;
  requireApprovalForFirstMessage?: boolean;
  requireApprovalForOfflineMeeting?: boolean;
  requireApprovalForPhotoUpload?: boolean;
  requireApprovalForAll?: boolean;
}

const ALLOWED_FIELDS: (keyof UpdateAgentSettingsInput)[] = [
  'mode',
  'allowSearch',
  'allowDraftMessage',
  'allowSendMessage',
  'allowAutoReply',
  'allowCreateActivity',
  'allowJoinActivity',
  'allowShareLocation',
  'allowUploadProof',
  'allowContactExchange',
  'maxDailyMessages',
  'requireApprovalForFirstMessage',
  'requireApprovalForOfflineMeeting',
  'requireApprovalForPhotoUpload',
  'requireApprovalForAll',
];

@Injectable()
export class AgentSettingsService {
  constructor(
    @InjectRepository(AgentSettings)
    private readonly repo: Repository<AgentSettings>,
  ) {}

  /**
   * Get the user's "default" (agent-agnostic) settings record. Lazily
   * creates one on first access so every authenticated user has a
   * baseline policy without an explicit migration.
   */
  async getOrCreate(userId: number): Promise<AgentSettings> {
    let row = await this.repo.findOne({
      where: { userId, agentConnectionId: IsNull() },
    });
    if (!row) {
      row = await this.repo.save(
        this.repo.create({ userId, agentConnectionId: null }),
      );
    }
    return row;
  }

  /** Looks up the per-connection override, falling back to the default. */
  async getEffective(
    userId: number,
    agentConnectionId?: number | null,
  ): Promise<AgentSettings> {
    if (agentConnectionId != null) {
      const override = await this.repo.findOne({
        where: { userId, agentConnectionId },
      });
      if (override) return override;
    }
    return this.getOrCreate(userId);
  }

  async update(
    userId: number,
    patch: UpdateAgentSettingsInput,
  ): Promise<AgentSettings> {
    const row = await this.getOrCreate(userId);
    for (const field of ALLOWED_FIELDS) {
      if (patch[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (row as any)[field] = patch[field];
      }
    }
    if (patch.mode !== undefined) {
      this.applyModeDefaults(row, patch.mode);
      for (const field of ALLOWED_FIELDS) {
        if (field !== 'mode' && patch[field] !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (row as any)[field] = patch[field];
        }
      }
    }
    if (
      patch.maxDailyMessages !== undefined &&
      (patch.maxDailyMessages < 0 || patch.maxDailyMessages > 1000)
    ) {
      throw new NotFoundException('maxDailyMessages out of range');
    }
    return this.repo.save(row);
  }

  private applyModeDefaults(row: AgentSettings, mode: AgentSettingsMode) {
    if (mode === AgentSettingsMode.Assisted || mode === AgentSettingsMode.Basic) {
      row.allowSearch = true;
      row.allowDraftMessage = true;
      row.allowSendMessage = false;
      row.allowAutoReply = false;
      row.allowCreateActivity = false;
      row.allowJoinActivity = false;
      row.allowContactExchange = false;
      row.requireApprovalForAll = true;
      row.requireApprovalForFirstMessage = true;
      row.requireApprovalForOfflineMeeting = true;
      row.requireApprovalForPhotoUpload = true;
      return;
    }
    if (mode === AgentSettingsMode.Normal || mode === AgentSettingsMode.Standard) {
      row.allowSearch = true;
      row.allowDraftMessage = true;
      row.allowSendMessage = true;
      row.allowAutoReply = true;
      row.allowCreateActivity = false;
      row.allowJoinActivity = false;
      row.allowContactExchange = false;
      row.requireApprovalForAll = false;
      row.requireApprovalForFirstMessage = false;
      row.requireApprovalForOfflineMeeting = true;
      row.requireApprovalForPhotoUpload = true;
      return;
    }
    if (mode === AgentSettingsMode.Open) {
      row.allowSearch = true;
      row.allowDraftMessage = true;
      row.allowSendMessage = true;
      row.allowAutoReply = true;
      row.allowCreateActivity = true;
      row.allowJoinActivity = true;
      row.allowContactExchange = false;
      row.requireApprovalForAll = false;
      row.requireApprovalForFirstMessage = false;
      row.requireApprovalForOfflineMeeting = false;
      row.requireApprovalForPhotoUpload = true;
    }
  }
}
