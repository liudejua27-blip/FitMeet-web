import { ForbiddenException, HttpException, Injectable } from '@nestjs/common';

import {
  ActivityProofPolicy,
  ActivityType,
} from '../activities/entities/activity-template.entity';
import { SocialRequestType } from '../social-requests/social-request.entity';
import { PaymentIntentStatus } from './entities/payment-intent.entity';

@Injectable()
export class SocialAgentToolInputParserService {
  asRecord(output: unknown): Record<string, unknown> {
    if (this.isRecord(output)) return output;
    return { value: output };
  }

  errorPayload(error: unknown): Record<string, unknown> {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const responseRecord = this.isRecord(response) ? response : {};
      return {
        code:
          this.string(responseRecord.code) ??
          (error instanceof ForbiddenException
            ? 'tool_permission_blocked'
            : 'TOOL_EXECUTION_FAILED'),
        message:
          this.string(responseRecord.message) ??
          (error instanceof Error ? error.message : String(error)),
        statusCode: error.getStatus(),
      };
    }
    return {
      code:
        error instanceof ForbiddenException
          ? 'tool_permission_blocked'
          : 'tool_execution_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  stringList(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : value ? [value] : [];
    return raw
      .map((item) => this.string(item))
      .filter((item): item is string => Boolean(item));
  }

  safeUnknownText(value: unknown): string {
    if (value == null) return 'null';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint' ||
      typeof value === 'symbol'
    ) {
      return String(value);
    }
    try {
      return JSON.stringify(value) ?? '[unserializable]';
    } catch {
      return '[unserializable]';
    }
  }

  number(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  positiveAmount(value: unknown): number | undefined {
    const amount = this.number(value);
    if (amount == null || amount <= 0) return undefined;
    return Math.round(amount * 100) / 100;
  }

  paymentIntentStatus(value: unknown): PaymentIntentStatus | undefined {
    return typeof value === 'string' &&
      Object.values(PaymentIntentStatus).includes(value as PaymentIntentStatus)
      ? (value as PaymentIntentStatus)
      : undefined;
  }

  bool(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y', '是'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n', '否'].includes(normalized)) return false;
    }
    return undefined;
  }

  stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }

  isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  socialRequestType(value: unknown): SocialRequestType | undefined {
    return typeof value === 'string' &&
      Object.values(SocialRequestType).includes(value as SocialRequestType)
      ? (value as SocialRequestType)
      : undefined;
  }

  activityType(value: unknown): ActivityType | undefined {
    return typeof value === 'string' &&
      Object.values(ActivityType).includes(value as ActivityType)
      ? (value as ActivityType)
      : undefined;
  }

  activityProofPolicy(value: unknown): ActivityProofPolicy | undefined {
    return typeof value === 'string' &&
      Object.values(ActivityProofPolicy).includes(value as ActivityProofPolicy)
      ? (value as ActivityProofPolicy)
      : undefined;
  }
}
