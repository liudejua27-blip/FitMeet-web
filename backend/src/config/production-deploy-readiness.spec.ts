import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('production deploy readiness', () => {
  it('keeps backend health checks explicit for Docker Compose and nginx', () => {
    const compose = readRepoFile('docker-compose.prod.yml');
    const dockerfile = readRepoFile('backend/Dockerfile.prod');
    const nginx = readRepoFile('nginx/nginx.conf');

    expect(compose).toContain('backend:');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('http://127.0.0.1:3000/api/health');
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('http://localhost:3000/api/health');
    expect(nginx).toContain('location /health');
    expect(nginx).toContain('proxy_pass http://backend/api/health');
  });

  it('keeps the production deploy script behind release and env readiness gates', () => {
    const deployScript = readRepoFile('scripts/deploy-production.sh');

    expect(deployScript).toContain(
      'RUN_RELEASE_PREFLIGHT="${RUN_RELEASE_PREFLIGHT:-true}"',
    );
    expect(deployScript).toContain('./scripts/release-preflight.sh --web-only');
    expect(deployScript).toContain(
      'pnpm -C backend run check:prod-env -- "../$ENV_FILE"',
    );
    expect(deployScript.indexOf('check:prod-env')).toBeLessThan(
      deployScript.indexOf(
        'docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build',
      ),
    );
    expect(deployScript).toContain('./scripts/verify-production.sh');
  });

  it('keeps production verification cross-platform and App contract aware', () => {
    const verifier = readRepoFile('scripts/verify-production.sh');

    expect(verifier).toContain('/openapi/fitmeet-core.json');
    expect(verifier).toContain('/social-agent/chat/tasks/{taskId}/session');
    expect(verifier).toContain(
      '/social-agent/chat/tasks/{taskId}/send-message',
    );
    expect(verifier).toContain('/auth/profile');
    expect(verifier).toContain('/social-agent/chat/session');
    expect(verifier).toContain('/messages/conversations');
    expect(verifier).toContain(
      'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"',
    );
    expect(verifier).toContain('APP_SMOKE_API_BASE_URL="${API_BASE_URL}"');
    expect(verifier).toContain('APP_SMOKE_ALLOW_REMOTE=true');
    expect(verifier).toContain('RUN_PUBLIC_INTENT_WRITE');
  });

  it('keeps the 1000-concurrency load smoke read-only and remote-guarded', () => {
    const loadSmoke = readRepoFile('scripts/load-1000-readonly.mjs');
    const releasePreflight = readRepoFile('scripts/release-preflight.sh');

    expect(loadSmoke).toContain('LOAD_TEST_CONCURRENCY, 1000');
    expect(loadSmoke).toContain('/api/health');
    expect(loadSmoke).toContain('/api/feed?page=1&limit=5');
    expect(loadSmoke).toContain('/api/openapi/fitmeet-core.json');
    expect(loadSmoke).toContain('LOAD_TEST_ALLOW_REMOTE');
    expect(loadSmoke).toContain("method: 'GET'");
    expect(loadSmoke).not.toContain("method: 'POST'");
    expect(loadSmoke).not.toContain("method: 'PUT'");
    expect(loadSmoke).not.toContain("method: 'DELETE'");
    expect(releasePreflight).toContain('--include-load-smoke');
    expect(releasePreflight).toContain('scripts/load-1000-readonly.mjs');
  });

  it('keeps the realtime 1000-online smoke authenticated and remote-guarded', () => {
    const realtimeSmoke = readRepoFile(
      'scripts/realtime-1000-online-smoke.mjs',
    );
    const releasePreflight = readRepoFile('scripts/release-preflight.sh');

    expect(realtimeSmoke).toContain('REALTIME_SMOKE_CONNECTIONS, 1000');
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_NAMESPACES');
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_TOKEN');
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_EMAIL');
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_PASSWORD');
    expect(realtimeSmoke).toContain('/api/auth/login');
    expect(realtimeSmoke).toContain('/realtime');
    expect(realtimeSmoke).toContain('realtime,messages');
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_ALLOW_REMOTE');
    expect(releasePreflight).toContain('--include-realtime-smoke');
    expect(releasePreflight).toContain(
      'scripts/realtime-1000-online-smoke.mjs',
    );
  });
});

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
