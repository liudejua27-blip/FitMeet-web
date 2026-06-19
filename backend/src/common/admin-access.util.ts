import { ForbiddenException } from '@nestjs/common';

export function isConfiguredAdmin(
  userId: number | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!userId) return false;
  const ids = (env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isFinite(id));
  const isDevAdmin = env.NODE_ENV !== 'production' && userId === 1;
  return ids.includes(userId) || isDevAdmin;
}

export function assertConfiguredAdmin(
  userId: number | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isConfiguredAdmin(userId, env)) {
    throw new ForbiddenException('Admin permission required');
  }
}
