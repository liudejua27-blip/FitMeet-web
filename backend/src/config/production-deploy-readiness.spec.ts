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
  });
});

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}
