import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

export const SocialLoopErrorCode = {
  SocialProfileNotReady: 'SOCIAL_PROFILE_NOT_READY',
  UserBlocked: 'USER_BLOCKED',
  ContactNotAllowed: 'CONTACT_NOT_ALLOWED',
  OpenerAlreadySent: 'OPENER_ALREADY_SENT',
  ConnectionRequestNotFound: 'CONNECTION_REQUEST_NOT_FOUND',
  ConnectionRequestAlreadyResolved: 'CONNECTION_REQUEST_ALREADY_RESOLVED',
  PublicIntentNotActive: 'PUBLIC_INTENT_NOT_ACTIVE',
  PublicIntentFull: 'PUBLIC_INTENT_FULL',
  PublicIntentApplicationDuplicate: 'PUBLIC_INTENT_APPLICATION_DUPLICATE',
  PublicIntentApplicationNotFound: 'PUBLIC_INTENT_APPLICATION_NOT_FOUND',
  PublicIntentApplicationAlreadyResolved:
    'PUBLIC_INTENT_APPLICATION_ALREADY_RESOLVED',
  IdempotencyKeyReused: 'IDEMPOTENCY_KEY_REUSED',
  ConversationProvisioning: 'CONVERSATION_PROVISIONING',
} as const;

export type SocialLoopErrorCode =
  (typeof SocialLoopErrorCode)[keyof typeof SocialLoopErrorCode];

type ErrorOptions = {
  message?: string;
  details?: Record<string, unknown>;
};

function body(code: SocialLoopErrorCode, options: ErrorOptions = {}) {
  return {
    code,
    message: options.message ?? code,
    ...(options.details ? { details: options.details } : {}),
  };
}

export function socialBadRequest(
  code: SocialLoopErrorCode,
  options?: ErrorOptions,
) {
  return new BadRequestException(body(code, options));
}

export function socialForbidden(
  code: SocialLoopErrorCode,
  options?: ErrorOptions,
) {
  return new ForbiddenException(body(code, options));
}

export function socialNotFound(
  code: SocialLoopErrorCode,
  options?: ErrorOptions,
) {
  return new NotFoundException(body(code, options));
}

export function socialConflict(
  code: SocialLoopErrorCode,
  options?: ErrorOptions,
) {
  return new ConflictException(body(code, options));
}

export function socialUnavailable(
  code: SocialLoopErrorCode,
  options?: ErrorOptions,
) {
  return new ServiceUnavailableException(body(code, options));
}
