export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

export function resolveDeepSeekModel(value?: string | null): string {
  const configured = value?.trim();

  // Older FitMeet env files used this pre-release name. DeepSeek now requires
  // the explicit flash or pro model id.
  if (!configured || configured === 'deepseek-v4') {
    return DEFAULT_DEEPSEEK_MODEL;
  }

  return configured;
}
