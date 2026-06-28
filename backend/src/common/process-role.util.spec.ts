import {
  fitMeetProcessRole,
  shouldRunBackgroundJobs,
  shouldRunWorkerRole,
} from './process-role.util';

describe('process role', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to api and does not run background jobs', () => {
    delete process.env.FITMEET_PROCESS_ROLE;
    delete process.env.ENABLE_SCHEDULER;

    expect(fitMeetProcessRole()).toBe('api');
    expect(shouldRunBackgroundJobs()).toBe(false);
  });

  it('runs background jobs only for worker/all roles when scheduler is enabled', () => {
    process.env.FITMEET_PROCESS_ROLE = 'worker';
    process.env.ENABLE_SCHEDULER = 'true';

    expect(shouldRunBackgroundJobs()).toBe(true);
    expect(shouldRunWorkerRole('worker-matching')).toBe(true);

    process.env.ENABLE_SCHEDULER = 'false';
    expect(shouldRunBackgroundJobs()).toBe(false);
    expect(shouldRunWorkerRole('worker-matching')).toBe(false);
  });

  it('supports precise worker roles without enabling legacy broad background jobs', () => {
    process.env.FITMEET_PROCESS_ROLE = 'worker-matching';
    process.env.ENABLE_SCHEDULER = 'true';

    expect(fitMeetProcessRole()).toBe('worker-matching');
    expect(shouldRunBackgroundJobs()).toBe(false);
    expect(shouldRunWorkerRole('worker-matching')).toBe(true);
    expect(shouldRunWorkerRole('worker-outbox')).toBe(false);
  });

  it('keeps all role as a compatibility mode for every worker role', () => {
    process.env.FITMEET_PROCESS_ROLE = 'all';
    process.env.ENABLE_SCHEDULER = 'true';

    expect(shouldRunBackgroundJobs()).toBe(true);
    expect(shouldRunWorkerRole('worker-matching')).toBe(true);
    expect(shouldRunWorkerRole('worker-outbox')).toBe(true);
    expect(shouldRunWorkerRole('worker-reminder')).toBe(true);
  });
});
