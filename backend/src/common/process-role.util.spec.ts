import {
  fitMeetProcessRole,
  shouldRunBackgroundJobs,
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

    process.env.ENABLE_SCHEDULER = 'false';
    expect(shouldRunBackgroundJobs()).toBe(false);
  });
});
