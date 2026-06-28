export type SocialPolicyLevel = 'allow' | 'confirm' | 'deny';

export type SocialPolicyAction =
  | 'public_intent.apply'
  | 'public_intent.application.accept'
  | 'public_intent.application.reject'
  | 'message.send'
  | 'friend.connect'
  | 'activity.create'
  | 'profile.view'
  | 'public_text.inspect';

export type SocialPolicyDecision = {
  allowed: boolean;
  level: SocialPolicyLevel;
  code: string;
  action: SocialPolicyAction;
  publicMessage: string;
  reasons: string[];
  requiredConfirmations: string[];
  metadata?: Record<string, unknown>;
};

export function allowDecision(
  action: SocialPolicyAction,
  options: Partial<
    Omit<SocialPolicyDecision, 'allowed' | 'level' | 'action'>
  > = {},
): SocialPolicyDecision {
  return {
    allowed: true,
    level: options.requiredConfirmations?.length ? 'confirm' : 'allow',
    code: options.code ?? 'allowed',
    action,
    publicMessage: options.publicMessage ?? '',
    reasons: options.reasons ?? [],
    requiredConfirmations: options.requiredConfirmations ?? [],
    metadata: options.metadata,
  };
}

export function denyDecision(
  action: SocialPolicyAction,
  code: string,
  publicMessage: string,
  options: Partial<
    Omit<
      SocialPolicyDecision,
      'allowed' | 'level' | 'action' | 'code' | 'publicMessage'
    >
  > = {},
): SocialPolicyDecision {
  return {
    allowed: false,
    level: 'deny',
    code,
    action,
    publicMessage,
    reasons: options.reasons ?? [code],
    requiredConfirmations: options.requiredConfirmations ?? [],
    metadata: options.metadata,
  };
}
