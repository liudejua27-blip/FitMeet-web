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

type LoopOpenerKind = 'workout' | 'friend' | 'travel';

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
    const loopKind = this.loopKind(input);
    const fallback = this.safeFallback(input.fallbackDraft, loopKind);
    if (!this.toolJson) return fallback;
    const raw = await this.toolJson.callJson({
      purpose: `${loopKind}_opener_draft`,
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
    const loopKind = this.loopKind(input);
    return JSON.stringify({
      instruction: this.instruction(loopKind),
      outputSchema: {
        message: 'string, <= 60 Chinese characters',
      },
      loopKind,
      loopContext: this.loopContext(input.task, loopKind),
      workoutLoop: this.record(this.record(input.task.memory).workoutLoop),
      friendLoop: this.record(this.record(input.task.memory).friendLoop),
      travelLoop: this.record(this.record(input.task.memory).travelLoop),
      socialAgentChat: this.record(
        this.record(input.task.memory).socialAgentChat,
      ),
      candidate: this.publicCandidateSnapshot(input.candidate),
      payload: this.publicCandidateSnapshot(input.payload),
      fallbackDraft: fallback,
      constraints: this.constraints(loopKind),
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

  private safeFallback(value: string, loopKind: LoopOpenerKind): string {
    return (
      this.safeMessage(value) ??
      {
        workout: '你好，看到你也在附近，想先站内聊聊看看是否方便一起约练。',
        friend: '你好，看到你也想认识同城朋友，可以先站内轻松聊聊兴趣吗？',
        travel: '你好，看到你也在找旅行搭子，可以先站内聊聊时间和路线吗？',
      }[loopKind]
    );
  }

  private instruction(loopKind: LoopOpenerKind): string {
    switch (loopKind) {
      case 'friend':
        return 'Write one natural FitMeet friend-making opener in Chinese. Return only JSON. Keep it low-pressure and interest-based. Do not mention body, appearance, sexual preference, phone, WeChat, exact address, off-platform contact, payment, or pressure to meet privately.';
      case 'travel':
        return 'Write one natural FitMeet travel companion opener in Chinese. Return only JSON. Focus on itinerary, dates, budget, travel style, or route overlap. Do not include phone, WeChat, exact hotel/address, off-platform contact, payment, or pressure to meet privately.';
      case 'workout':
        return 'Write one natural FitMeet workout opener in Chinese. Return only JSON. Do not include phone, WeChat, exact address, off-platform contact, payment, or pressure to meet privately.';
    }
  }

  private constraints(loopKind: LoopOpenerKind): string[] {
    const shared = [
      '60 字以内',
      '自然、不油腻',
      '只建议站内先聊',
      '不交换联系方式',
      '不暴露精确地址',
    ];
    switch (loopKind) {
      case 'friend':
        return [
          ...shared,
          '围绕共同兴趣、同城或聊天节奏开场',
          '不要直接提身材、颜值、性暗示或关系压力',
        ];
      case 'travel':
        return [
          ...shared,
          '围绕目的地、时间、预算、路线或旅行偏好开场',
          '不要承诺同行已确认，不透露酒店或精确集合点',
        ];
      case 'workout':
        return [...shared, '不承诺线下见面已经确认'];
    }
  }

  private loopKind(input: {
    task: AgentTask;
    candidate?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  }): LoopOpenerKind {
    const payloadLoop = this.loopKindText(input.payload);
    if (payloadLoop) return payloadLoop;
    const candidateLoop = this.loopKindText(input.candidate);
    if (candidateLoop) return candidateLoop;

    const memory = this.record(input.task.memory);
    if (Object.keys(this.record(memory.friendLoop)).length > 0) return 'friend';
    if (Object.keys(this.record(memory.travelLoop)).length > 0) return 'travel';
    return 'workout';
  }

  private loopKindText(
    value: Record<string, unknown> | undefined,
  ): LoopOpenerKind | null {
    if (!value) return null;
    const metadata = this.record(value.metadata);
    const socialRequest = this.record(value.socialRequest);
    const raw = this.text(
      value.loopKind ??
        value.loop ??
        metadata.loopKind ??
        metadata.loop ??
        socialRequest.loopKind ??
        socialRequest.loop,
    );
    if (raw === 'friend' || raw === 'travel' || raw === 'workout') return raw;
    return null;
  }

  private loopContext(task: AgentTask, loopKind: LoopOpenerKind) {
    const memory = this.record(task.memory);
    switch (loopKind) {
      case 'friend':
        return this.record(memory.friendLoop);
      case 'travel':
        return this.record(memory.travelLoop);
      case 'workout':
        return this.record(memory.workoutLoop);
    }
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
