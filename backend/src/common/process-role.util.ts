export type FitMeetProcessRole = 'api' | 'worker' | 'all';

export function fitMeetProcessRole(): FitMeetProcessRole {
  const raw = String(process.env.FITMEET_PROCESS_ROLE ?? 'api')
    .trim()
    .toLowerCase();
  if (raw === 'worker' || raw === 'all') return raw;
  return 'api';
}

export function shouldRunBackgroundJobs(): boolean {
  const scheduler = process.env.ENABLE_SCHEDULER;
  if (scheduler !== undefined && !isTruthyEnv(scheduler)) return false;
  return fitMeetProcessRole() === 'worker' || fitMeetProcessRole() === 'all';
}

function isTruthyEnv(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}
