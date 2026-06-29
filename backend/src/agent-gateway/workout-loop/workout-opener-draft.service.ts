import { Injectable, Optional } from '@nestjs/common';
import { z } from 'zod';

import { cleanDisplayText } from '../../common/display-text.util';
import type { AgentTask } from '../entities/agent-task.entity';
import { SocialAgentToolJsonModelService } from '../social-agent-tool-json-model.service';

const WorkoutOpenerSchema = z.object({
  message: z.string().optional(),
  opener: z.string().optional(),
  source: z.string().optional(),
  fallbackReason: z.string().optional(),
});

@Injectable()
export class WorkoutOpenerDraftService {
  constructor(
    @Optional()
    private readonly toolJson?: SocialAgentToolJsonModelService,
  ) {}

  async draft(input: {
    task: AgentTask;
    candidate: Record<string, unknown>;
    payload: Record<string, unknown>;
    fallbackDraft: string;
    signal?: AbortSignal | null;
  }): Promise<string> {
    const fallback = this.safeFallback(input.fallbackDraft);
    if (!this.toolJson) return fallback;
    const raw = await this.toolJson.callJson({
      purpose: 'workout_opener_draft',
      taskId: input.task.id,
      signal: input.signal ?? null,
      prompt: this.prompt(input, fallback),
      fallback: () => ({
        message: fallback,
        source: 'fallback',
        fallbackReason: 'tool_json_unavailable',
      }),
    });
    const parsed = WorkoutOpenerSchema.parse(raw);
    const candidate = cleanDisplayText(parsed.message ?? parsed.opener, '');
    return this.safeMessage(candidate) ?? fallback;
  }

  private prompt(
    input: {
      task: AgentTask;
      candidate: Record<string, unknown>;
      payload: Record<string, unknown>;
    },
    fallback: string,
  ): string {
    return JSON.stringify({
      instruction:
        'Write one natural FitMeet workout opener in Chinese. Return only JSON. Do not include phone, WeChat, exact address, off-platform contact, payment, or pressure to meet privately.',
      outputSchema: {
        message: 'string, <= 60 Chinese characters',
      },
      workoutLoop: this.record(this.record(input.task.memory).workoutLoop),
      socialAgentChat: this.record(
        this.record(input.task.memory).socialAgentChat,
      ),
      candidate: this.publicCandidateSnapshot(input.candidate),
      payload: this.publicCandidateSnapshot(input.payload),
      fallbackDraft: fallback,
      constraints: [
        '60 字以内',
        '自然、不油腻',
        '只建议站内先聊',
        '不交换联系方式',
        '不暴露精确地址',
        '不承诺线下见面已经确认',
      ],
    });
  }

  private publicCandidateSnapshot(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      displayName: this.text(value.displayName ?? value.nickname),
      city: this.text(value.city),
      distanceKm: value.distanceKm,
      commonTags: Array.isArray(value.commonTags) ? value.commonTags : [],
      matchReasons: Array.isArray(value.matchReasons)
        ? value.matchReasons
        : Array.isArray(value.reasons)
          ? value.reasons
          : [],
      suggestedOpener: this.text(value.suggestedOpener),
      suggestedMessage: this.text(value.suggestedMessage),
    };
  }

  private safeFallback(value: string): string {
    return (
      this.safeMessage(value) ??
      '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。'
    );
  }

  private safeMessage(value: string): string | null {
    const text = this.clip(this.text(value), 60);
    if (!text) return null;
    if (this.containsUnsafeContact(text)) return null;
    if (this.containsPreciseLocation(text)) return null;
    return text;
  }

  private containsUnsafeContact(value: string): boolean {
    return (
      /(?:微信|vx|v信|手机号|手机|电话|加我|联系方式|二维码|QQ|qq)/i.test(
        value,
      ) || /\b1[3-9]\d{9}\b/.test(value)
    );
  }

  private containsPreciseLocation(value: string): boolean {
    return /\d+\s*(号|室|单元|栋|幢|楼|层)/.test(value);
  }

  private clip(value: string, limit: number): string {
    return Array.from(value).slice(0, limit).join('').trim();
  }

  private record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private text(value: unknown): string {
    return cleanDisplayText(value, '').trim();
  }
}
