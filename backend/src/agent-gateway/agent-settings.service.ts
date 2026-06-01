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
      row = this.repo.create({
        userId,
        agentConnectionId: null,
        mode: AgentSettingsMode.Open,
      });
      this.applyModeDefaults(row, AgentSettingsMode.Open);
      row = await this.repo.save(row);
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
    if (
      patch.maxDailyMessages !== undefined &&
      (patch.maxDailyMessages < 0 || patch.maxDailyMessages > 1000)
    ) {
      throw new NotFoundException('maxDailyMessages out of range');
    }

    const row = await this.getOrCreate(userId);
    if (patch.mode !== undefined) {
      this.applyModeDefaults(row, patch.mode);
    }
    this.applyExplicitPatch(row, patch);
    return this.repo.save(row);
  }

  private applyExplicitPatch(
    row: AgentSettings,
    patch: UpdateAgentSettingsInput,
  ): void {
    if (patch.mode !== undefined) row.mode = patch.mode;
    if (patch.allowSearch !== undefined) row.allowSearch = patch.allowSearch;
    if (patch.allowDraftMessage !== undefined) {
      row.allowDraftMessage = patch.allowDraftMessage;
    }
    if (patch.allowSendMessage !== undefined) {
      row.allowSendMessage = patch.allowSendMessage;
    }
    if (patch.allowAutoReply !== undefined) {
      row.allowAutoReply = patch.allowAutoReply;
    }
    if (patch.allowCreateActivity !== undefined) {
      row.allowCreateActivity = patch.allowCreateActivity;
    }
    if (patch.allowJoinActivity !== undefined) {
      row.allowJoinActivity = patch.allowJoinActivity;
    }
    if (patch.allowShareLocation !== undefined) {
      row.allowShareLocation = patch.allowShareLocation;
    }
    if (patch.allowUploadProof !== undefined) {
      row.allowUploadProof = patch.allowUploadProof;
    }
    if (patch.allowContactExchange !== undefined) {
      row.allowContactExchange = patch.allowContactExchange;
    }
    if (patch.maxDailyMessages !== undefined) {
      row.maxDailyMessages = patch.maxDailyMessages;
    }
    if (patch.requireApprovalForFirstMessage !== undefined) {
      row.requireApprovalForFirstMessage = patch.requireApprovalForFirstMessage;
    }
    if (patch.requireApprovalForOfflineMeeting !== undefined) {
      row.requireApprovalForOfflineMeeting =
        patch.requireApprovalForOfflineMeeting;
    }
    if (patch.requireApprovalForPhotoUpload !== undefined) {
      row.requireApprovalForPhotoUpload = patch.requireApprovalForPhotoUpload;
    }
    if (patch.requireApprovalForAll !== undefined) {
      row.requireApprovalForAll = patch.requireApprovalForAll;
    }
  }

  private applyModeDefaults(row: AgentSettings, mode: AgentSettingsMode) {
    if (
      mode === AgentSettingsMode.Assisted ||
      mode === AgentSettingsMode.Basic
    ) {
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
    if (
      mode === AgentSettingsMode.Normal ||
      mode === AgentSettingsMode.Standard
    ) {
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
      row.allowShareLocation = true;
      row.allowUploadProof = true;
      row.allowContactExchange = true;
      row.requireApprovalForAll = false;
      row.requireApprovalForFirstMessage = false;
      row.requireApprovalForOfflineMeeting = false;
      row.requireApprovalForPhotoUpload = false;
    }
  }
}
