export type FitMeetProcessRole =
  | 'api'
  | 'worker'
  | 'all'
  | 'worker-matching'
  | 'worker-outbox'
  | 'worker-reminder'
  | 'worker-agent-eval';

export type FitMeetWorkerRole = Exclude<FitMeetProcessRole, 'api'>;

export function fitMeetProcessRole(): FitMeetProcessRole {
  const raw = String(process.env.FITMEET_PROCESS_ROLE ?? 'api')
    .trim()
    .toLowerCase();
  if (
    raw === 'worker' ||
    raw === 'all' ||
    raw === 'worker-matching' ||
    raw === 'worker-outbox' ||
    raw === 'worker-reminder' ||
    raw === 'worker-agent-eval'
  ) {
    return raw;
  }
  return 'api';
}

export function shouldRunBackgroundJobs(): boolean {
  if (!schedulerEnabled()) return false;
  const role = fitMeetProcessRole();
  return role === 'worker' || role === 'all';
}

export function shouldRunWorkerRole(targetRole: FitMeetWorkerRole): boolean {
  if (!schedulerEnabled()) return false;
  const role = fitMeetProcessRole();
  if (role === 'worker' || role === 'all') return true;
  return role === targetRole;
}

function schedulerEnabled(): boolean {
  const scheduler = process.env.ENABLE_SCHEDULER;
  return scheduler === undefined || isTruthyEnv(scheduler);
}

function isTruthyEnv(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}
