import { BadRequestException, Injectable } from '@nestjs/common';

import { ActivitiesService } from '../activities/activities.service';
import { CreateActivityDto } from '../activities/dto/activity.dto';
import { SocialActivity } from '../activities/entities/activity.entity';
import {
  ActivityProofPolicy,
  ActivityType,
} from '../activities/entities/activity-template.entity';
import { sanitizeCity } from '../common/city.util';
import { MessagesService } from '../messages/messages.service';
import { AgentTask } from './entities/agent-task.entity';
import {
  appendSocialAgentLoopValue,
  buildSocialAgentActivityInviteDedupeKey,
  socialAgentLoopStringArray,
  type SocialAgentLoopMemory,
} from './social-agent-loop-state';
import {
  buildSocialAgentConversationOptions,
  buildSocialAgentDelegateMessageOptions,
} from './social-agent-message-options';
import type { SocialAgentSentMessageMemoryInput } from './social-agent-message-tool.service';
import { SocialAgentToolInputParserService } from './social-agent-tool-input-parser.service';
import { SocialAgentToolName } from './social-agent-tool.types';

export type SocialAgentActivityToolResult = {
  output: unknown;
  loopUpdates?: Partial<SocialAgentLoopMemory>;
  sentMessage?: SocialAgentSentMessageMemoryInput;
};

@Injectable()
export class SocialAgentActivityToolService {
  constructor(
    private readonly activities: ActivitiesService,
    private readonly messages: MessagesService,
    private readonly toolInput: SocialAgentToolInputParserService,
  ) {}

  async createActivity(
    task: AgentTask,
    input: Record<string, unknown>,
    toolName: SocialAgentToolName,
    stepId: string,
  ): Promise<SocialAgentActivityToolResult> {
    const invitedUserId = this.toolInput.number(
      input.invitedUserId ?? input.targetUserId,
    );
    if (toolName === SocialAgentToolName.OfflineMeeting && !invitedUserId) {
      throw new BadRequestException(
        'targetUserId or invitedUserId is required',
      );
    }

    const dto = this.buildActivityDto(task, input, toolName, invitedUserId);
    const activityDedupeKey = buildSocialAgentActivityInviteDedupeKey(
      toolName,
      dto,
    );
    if (this.hasActivityInviteKey(task, activityDedupeKey)) {
      return {
        output: {
          skipped: true,
          duplicate: true,
          reason: 'duplicate_activity_invite',
          toolName,
          targetUserId: invitedUserId ?? null,
          title: dto.title,
          startTime: dto.startTime ?? null,
        },
      };
    }

    const activity = await this.activities.create(task.ownerUserId, dto);
    const baseLoopUpdates: Partial<SocialAgentLoopMemory> = {
      activityInviteKeys: this.appendActivityInviteKey(task, activityDedupeKey),
      sourceTool: toolName,
    };

    if (toolName !== SocialAgentToolName.OfflineMeeting) {
      return { output: activity, loopUpdates: baseLoopUpdates };
    }

    const offlineTargetUserId = invitedUserId;
    if (!offlineTargetUserId) {
      throw new BadRequestException(
        'targetUserId or invitedUserId is required',
      );
    }

    const invite = await this.sendOfflineMeetingInvite(
      task,
      input,
      stepId,
      activity,
      offlineTargetUserId,
    );

    return {
      output: {
        id: activity.id,
        activityId: activity.id,
        status: activity.status,
        invitedUserId: offlineTargetUserId,
        conversationId: invite.conversationId,
        messageId: invite.messageId,
        activity,
        inviteMessage: invite.message,
      },
      loopUpdates: {
        ...baseLoopUpdates,
        conversationId: invite.conversationId,
        targetUserId: offlineTargetUserId,
        lastMessageId: invite.messageId,
        lastAgentMessageId: invite.messageId,
        sourceTool: SocialAgentToolName.OfflineMeeting,
        activityId: activity.id,
      },
      sentMessage: {
        id: invite.messageId,
        conversationId: invite.conversationId,
        targetUserId: offlineTargetUserId,
        textPreview: this.preview(invite.text),
        toolName: SocialAgentToolName.OfflineMeeting,
        stepId,
      },
    };
  }

  async joinActivity(
    task: AgentTask,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const activityId = this.toolInput.number(input.activityId ?? input.id);
    if (!activityId) throw new BadRequestException('activityId is required');
    const activity = await this.activities.join(activityId, task.ownerUserId);
    return {
      ...this.toolInput.asRecord(activity),
      activityId,
      joined: true,
    };
  }

  private buildActivityDto(
    task: AgentTask,
    input: Record<string, unknown>,
    toolName: SocialAgentToolName,
    invitedUserId: number | undefined,
  ): CreateActivityDto {
    const allowPreciseLocation =
      this.toolInput.bool(input.allowPreciseLocation) === true;
    const icebreakerTasks = this.toolInput.stringArray(input.icebreakerTasks);

    return {
      type:
        this.toolInput.activityType(input.type ?? input.activityType) ??
        ActivityType.Custom,
      title:
        this.toolInput.string(input.title ?? task.title) ||
        this.activityTitle(toolName),
      description: this.toolInput.string(
        input.description ?? input.note ?? task.goal,
      ),
      city: sanitizeCity(input.city),
      locationName:
        this.toolInput.string(input.locationName ?? input.location) ??
        '公共场所待确认',
      lat: allowPreciseLocation ? this.toolInput.number(input.lat) : undefined,
      lng: allowPreciseLocation ? this.toolInput.number(input.lng) : undefined,
      startTime: this.toolInput.string(input.startTime ?? input.timeStart),
      durationMinutes: this.toolInput.number(input.durationMinutes) ?? 45,
      socialRequestId:
        this.toolInput.number(input.socialRequestId) ?? undefined,
      meetId: this.toolInput.number(input.meetId) ?? undefined,
      matchedCandidateId:
        this.toolInput.number(
          input.matchedCandidateId ?? input.candidateRecordId,
        ) ?? undefined,
      icebreakerTasks: icebreakerTasks.length
        ? icebreakerTasks
        : ['到达后先确认彼此状态和活动节奏。', '活动结束后互相确认是否完成。'],
      proofRequired: this.toolInput.bool(input.proofRequired) ?? true,
      proofPolicy:
        this.toolInput.activityProofPolicy(input.proofPolicy) ??
        ActivityProofPolicy.MutualOrProof,
      invitedUserId: invitedUserId ?? undefined,
    };
  }

  private async sendOfflineMeetingInvite(
    task: AgentTask,
    input: Record<string, unknown>,
    stepId: string,
    activity: SocialActivity,
    targetUserId: number,
  ): Promise<{
    conversationId: string;
    messageId: string | null;
    message: Record<string, unknown>;
    text: string;
  }> {
    const conversation = await this.messages.startConversation(
      task.ownerUserId,
      targetUserId,
      buildSocialAgentConversationOptions(task, stepId, {
        toolName: SocialAgentToolName.OfflineMeeting,
        activityId: activity.id,
        targetUserId,
      }),
    );
    const conversationId = conversation.conversationId;
    const text = this.offlineMeetingInviteText(input, activity);
    const message = await this.messages.sendMessage(
      conversationId,
      task.ownerUserId,
      text,
      buildSocialAgentDelegateMessageOptions(task, stepId, {
        ...(this.toolInput.isRecord(input.metadata) ? input.metadata : {}),
        toolName: SocialAgentToolName.OfflineMeeting,
        activityId: activity.id,
        targetUserId,
      }),
    );
    const messageRecord = this.toolInput.asRecord(message);
    return {
      conversationId,
      messageId:
        this.toolInput.string(messageRecord.id ?? messageRecord.messageId) ??
        null,
      message: { ...messageRecord, conversationId },
      text,
    };
  }

  private socialLoopMemory(task: AgentTask): SocialAgentLoopMemory {
    const memory = this.toolInput.isRecord(task.memory) ? task.memory : {};
    return this.toolInput.isRecord(memory.socialLoop)
      ? (memory.socialLoop as SocialAgentLoopMemory)
      : {};
  }

  private hasActivityInviteKey(task: AgentTask, key: string): boolean {
    return socialAgentLoopStringArray(
      this.socialLoopMemory(task).activityInviteKeys,
    ).includes(key);
  }

  private appendActivityInviteKey(task: AgentTask, key: string): string[] {
    return appendSocialAgentLoopValue(
      socialAgentLoopStringArray(
        this.socialLoopMemory(task).activityInviteKeys,
      ),
      key,
    );
  }

  private activityTitle(toolName: SocialAgentToolName): string {
    if (toolName === SocialAgentToolName.OfflineMeeting) return '线下见面安排';
    if (toolName === SocialAgentToolName.CreateActivity) return '约练活动';
    return '约练邀请';
  }

  private offlineMeetingInviteText(
    input: Record<string, unknown>,
    activity: SocialActivity,
  ): string {
    const explicit = this.toolInput.string(
      input.text ?? input.message ?? input.content ?? input.inviteMessage,
    );
    if (explicit) return explicit;

    const parts = [`我已为你发起线下见面安排：${activity.title || '线下见面'}`];
    if (activity.city || activity.locationName) {
      parts.push(
        `地点：${[activity.city, activity.locationName].filter(Boolean).join(' ')}`,
      );
    }
    if (activity.startTime) {
      parts.push(
        `时间：${activity.startTime.toLocaleString('zh-CN', { hour12: false })}`,
      );
    }
    parts.push('请在 FitMeet 中确认是否参加。');
    return parts.join('\n');
  }

  private preview(value: unknown, max = 160): string {
    const text = this.toolInput.string(value) ?? '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }
}
