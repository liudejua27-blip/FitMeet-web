import { Injectable, Optional } from '@nestjs/common';

import type { StreamEmit } from './social-agent-chat.types';
import { AgentObservabilityService } from './agent-observability.service';

@Injectable()
export class SocialAgentStreamingResponseService {
  constructor(
    @Optional()
    private readonly observability?: AgentObservabilityService,
  ) {}

  async streamAssistantText(input: {
    emit: StreamEmit;
    messageId: string;
    text: string;
    traceId?: string | null;
  }): Promise<boolean> {
    const startedAt = Date.now();
    const text = input.text.trim();
    if (!text) return false;
    let firstTokenLatencyMs: number | null = null;
    let tokenCount = 0;
    for (const delta of this.chunkText(text)) {
      firstTokenLatencyMs ??= Date.now() - startedAt;
      tokenCount += this.countTokens(delta);
      await input.emit({
        type: 'assistant_delta',
        messageId: input.messageId,
        delta,
        source: 'fallback',
      });
    }
    await input.emit({
      type: 'assistant_done',
      messageId: input.messageId,
      source: 'fallback',
    });
    this.observability?.recordLlmCall({
      traceId: input.traceId,
      taskId: null,
      useCase: 'fallback_stream',
      model: 'fallback',
      success: true,
      latencyMs: Date.now() - startedAt,
      firstTokenLatencyMs,
      tokenCount,
    });
    return true;
  }

  chunkText(text: string): string[] {
    const compact = text.replace(/\s+/g, ' ').trim();
    if (!compact) return [];
    const chunks: string[] = [];
    let buffer = '';
    for (const token of compact.match(
      /[\u4e00-\u9fff]|[^\u4e00-\u9fff\s]+|\s+/g,
    ) ?? [compact]) {
      buffer += token;
      if (buffer.length >= 12 || /[。！？!?]\s*$/.test(buffer)) {
        chunks.push(buffer);
        buffer = '';
      }
    }
    if (buffer) chunks.push(buffer);
    return chunks;
  }

  private countTokens(delta: string): number {
    return delta.match(/[\u4e00-\u9fff]|[a-zA-Z0-9_]+|[^\s]/g)?.length ?? 0;
  }
}
