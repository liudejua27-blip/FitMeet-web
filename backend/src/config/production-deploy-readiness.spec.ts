import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('production deploy readiness', () => {
  it('keeps backend health checks explicit for Docker Compose and nginx', () => {
    const compose = readRepoFile('docker-compose.prod.yml');
    const dockerfile = readRepoFile('backend/Dockerfile.prod');
    const dockerignore = readRepoFile('backend/.dockerignore');
    const nginx = readRepoFile('nginx/nginx.conf');

    expect(compose).toContain('backend:');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('http://127.0.0.1:3000/api/health');
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('http://localhost:3000/api/health');
    expect(dockerignore).toContain('.env.*');
    expect(dockerignore).toContain('node_modules');
    expect(dockerignore).toContain('public/uploads');
    expect(dockerignore).toContain('.vercel');
    expect(dockerignore).toContain('.railway');
    expect(dockerignore).toContain('test-results');
    expect(nginx).toContain('location /health');
    expect(nginx).toContain('proxy_pass http://backend/api/health');
  });

  it('keeps the production deploy script behind release and env readiness gates', () => {
    const deployScript = readRepoFile('scripts/deploy-production.sh');
    const prodEnvCheck = readRepoFile(
      'backend/scripts/check-production-env.ts',
    );

    expect(deployScript).toContain(
      'RUN_RELEASE_PREFLIGHT="${RUN_RELEASE_PREFLIGHT:-true}"',
    );
    expect(deployScript).toContain('./scripts/release-preflight.sh --web-only');
    expect(deployScript).toContain(
      'pnpm -C backend run check:prod-env -- "../$ENV_FILE"',
    );
    expect(deployScript.indexOf('check:prod-env')).toBeLessThan(
      deployScript.indexOf('Start production dependencies'),
    );
    expect(deployScript.indexOf('migration:run:prod')).toBeLessThan(
      deployScript.indexOf('Start API, worker, and nginx after migrations'),
    );
    expect(deployScript).toContain('pnpm uploads:check:prod');
    expect(deployScript).toContain('pnpm db:check-critical-tables:prod');
    expect(deployScript).toContain(
      'subagent-worker dedicated healthcheck failed after startup',
    );
    expect(deployScript).toContain(
      'node dist/agent-gateway/subagent-worker-healthcheck.js',
    );
    expect(deployScript).not.toContain(' up -d --build');
    expect(deployScript).toContain('./scripts/verify-production.sh');

    const releasePreflight = readRepoFile('scripts/release-preflight.sh');
    expect(releasePreflight).toContain('backend database contract tests');
    expect(releasePreflight).toContain('migration-integrity.spec.ts');
    expect(releasePreflight).toContain(
      'typeorm-launch-config.contract.spec.ts',
    );
    expect(releasePreflight).toContain('seed:living-social-data:dry-run');
    expect(prodEnvCheck).toContain('--from-process');
    expect(prodEnvCheck).toContain('process.env');
    expect(prodEnvCheck).toContain('pnpm check:prod-env -- --from-process');
  });

  it('keeps the ECS upload package self-contained without bundling real env files', () => {
    const ecsTemplate = readRepoFile('deploy/env.production.ecs.example');
    const buildZipScript = readRepoFile('scripts/build-deploy-zip.sh');
    const cloudPreflight = readRepoFile('scripts/cloud-platform-preflight.sh');
    const launchStatus = readRepoFile('scripts/launch-status.sh');
    const vercelPrebuiltDeploy = readRepoFile(
      'scripts/vercel-prebuilt-deploy.sh',
    );
    const railwayDockerBuildCheck = readRepoFile(
      'scripts/railway-docker-build-check.sh',
    );
    const ecsRunbook = readRepoFile('docs/deployment-aliyun-ecs.md');
    const ecsInstallRelease = readRepoFile('scripts/ecs-install-release.sh');
    const ecsUploadRelease = readRepoFile('scripts/ecs-upload-release.sh');
    const ecsPreflight = readRepoFile('scripts/ecs-host-preflight.sh');
    const ecsPostDeploySmoke = readRepoFile('scripts/ecs-post-deploy-smoke.sh');
    const packageJson = readRepoFile('backend/package.json');
    const smokeSeed = readRepoFile(
      'backend/scripts/prepare-app-smoke-users.ts',
    );
    const gitignore = readRepoFile('.gitignore');

    expect(ecsTemplate).toContain('BASE_URL=https://www.ourfitmeet.cn');
    expect(ecsTemplate).toContain(
      'FRONTEND_BASE_URL=https://www.ourfitmeet.cn',
    );
    expect(ecsTemplate).toContain('PUBLIC_BASE_URL=https://www.ourfitmeet.cn');
    expect(ecsTemplate).toContain(
      'PUBLIC_API_BASE_URL=https://www.ourfitmeet.cn/api',
    );
    expect(ecsTemplate).toContain('FITMEET_PROCESS_ROLE=api');
    expect(ecsTemplate).toContain('ENABLE_SCHEDULER=false');
    expect(ecsTemplate).toContain('FITMEET_SUBAGENT_WORKER_HEARTBEAT_MS=10000');
    expect(ecsTemplate).toContain('VITE_API_BASE_URL=/api');
    expect(ecsTemplate).toContain(
      'JWT_SECRET=CHANGE_ME_RANDOM_32_BYTE_HEX_SECRET',
    );
    expect(ecsTemplate).toContain('DEEPSEEK_CHAT_MODEL=deepseek-v4-pro');
    expect(buildZipScript).toContain('deploy/env.production.ecs.example');
    expect(buildZipScript).toContain('docs/deployment-vercel-railway.md');
    expect(buildZipScript).toContain('scripts/cloud-platform-preflight.sh');
    expect(buildZipScript).toContain('scripts/domain-readiness-check.sh');
    expect(buildZipScript).toContain('scripts/launch-status.sh');
    expect(buildZipScript).toContain('scripts/vercel-prebuilt-deploy.sh');
    expect(buildZipScript).toContain('scripts/lib/toolchain.sh');
    expect(buildZipScript).toContain('scripts/ecs-install-release.sh');
    expect(buildZipScript).toContain('scripts/ecs-upload-release.sh');
    expect(buildZipScript).toContain('scripts/ecs-host-preflight.sh');
    expect(buildZipScript).toContain('scripts/ecs-post-deploy-smoke.sh');
    expect(buildZipScript).toContain("--exclude '.vercel/'");
    expect(buildZipScript).toContain("--exclude '.railway/'");
    expect(buildZipScript).toContain('CHECKSUM_OUTPUT="${OUTPUT}.sha256"');
    expect(buildZipScript).toContain(
      'INSTALLER_OUTPUT="${OUTPUT_DIR}/fitmeet-ecs-install-release.sh"',
    );
    expect(buildZipScript).toContain('sha256sum');
    expect(buildZipScript).toContain('shasum -a 256');
    expect(buildZipScript).toContain(
      'cp "${ROOT_DIR}/scripts/ecs-install-release.sh"',
    );
    expect(buildZipScript).toContain('fail_if_entry "env files"');
    expect(buildZipScript).toContain('fail_if_entry "Vercel project metadata"');
    expect(buildZipScript).toContain(
      'fail_if_entry "Railway project metadata"',
    );
    expect(gitignore).toContain('.vercel/');
    expect(gitignore).toContain('.railway/');
    expect(gitignore).toContain('.env.vercel*.local');
    expect(gitignore).toContain('*.zip.sha256');
    expect(gitignore).toContain('fitmeet-ecs-install-release.sh');
    expect(cloudPreflight).toContain('VERCEL_TOKEN');
    expect(cloudPreflight).toContain('fitmeet_bootstrap_toolchain');
    expect(cloudPreflight).toContain('FITMEET_PREFLIGHT_TIMEOUT_SECONDS');
    expect(cloudPreflight).toContain('command_succeeds_with_timeout');
    expect(cloudPreflight).toContain('RAILWAY_TOKEN');
    expect(cloudPreflight).toContain('VERCEL_ORG_ID');
    expect(cloudPreflight).toContain('VERCEL_PROJECT_ID');
    expect(cloudPreflight).toContain('.vercel/project.json');
    expect(cloudPreflight).toContain('Noninteractive Vercel deploy cannot run');
    expect(cloudPreflight).toContain('VITE_API_BASE_URL=/api');
    expect(cloudPreflight).toContain('deploy/env.production.railway.example');
    expect(cloudPreflight).toContain('scripts/domain-readiness-check.sh');
    expect(cloudPreflight).toContain('scripts/vercel-prebuilt-deploy.sh');
    expect(cloudPreflight).toContain('--check-domain');
    expect(cloudPreflight).toContain('--strict');
    expect(launchStatus).toContain('production-deploy-readiness.spec.ts');
    expect(launchStatus).toContain('scripts/cloud-platform-preflight.sh');
    expect(launchStatus).toContain('scripts/domain-readiness-check.sh');
    expect(launchStatus).toContain('scripts/vercel-prebuilt-deploy.sh');
    expect(launchStatus).toContain('scripts/railway-docker-build-check.sh');
    expect(launchStatus).toContain('scripts/ecs-install-release.sh');
    expect(launchStatus).toContain('scripts/ecs-upload-release.sh');
    expect(launchStatus).toContain('FITMEET_APP_DIR');
    expect(launchStatus).toContain('Scripts/testflight-readiness-check.sh');
    expect(launchStatus).toContain('Scripts/testflight-archive.sh');
    expect(launchStatus).toContain('RUN_IOS_TESTFLIGHT_CHECK');
    expect(launchStatus).toContain('iOS TestFlight readiness');
    expect(launchStatus).toContain('RUN_RAILWAY_DOCKER_BUILD');
    expect(launchStatus).toContain('not required for ECS topology');
    expect(launchStatus).toContain('Launch status:');
    expect(launchStatus).toContain('FITMEET_PNPM_BIN_DIR');
    expect(vercelPrebuiltDeploy).toContain('vercel pull --yes --environment');
    expect(vercelPrebuiltDeploy).toContain('vercel build --prod');
    expect(vercelPrebuiltDeploy).toContain('vercel deploy --prebuilt --prod');
    expect(vercelPrebuiltDeploy).toContain('VERCEL_TOKEN');
    expect(vercelPrebuiltDeploy).toContain('VERCEL_ORG_ID');
    expect(vercelPrebuiltDeploy).toContain('VERCEL_PROJECT_ID');
    expect(vercelPrebuiltDeploy).toContain('.vercel/project.json');
    expect(vercelPrebuiltDeploy).toContain(
      'run_with_timeout pnpm dlx vercel whoami',
    );
    expect(vercelPrebuiltDeploy).toContain(
      'VITE_API_BASE_URL="${VITE_API_BASE_URL}"',
    );
    expect(railwayDockerBuildCheck).toContain('backend/Dockerfile.prod');
    expect(railwayDockerBuildCheck).toContain(
      'NODE_IMAGE="${NODE_IMAGE:-node:20-alpine}"',
    );
    expect(railwayDockerBuildCheck).toContain('docker build');
    expect(railwayDockerBuildCheck).toContain('auth\\.docker\\.io');
    expect(railwayDockerBuildCheck).toContain(
      'Railway production Docker image builds locally',
    );
    expect(ecsPreflight).toContain('Docker Compose config validates');
    expect(ecsPreflight).toContain('pnpm -C backend run check:prod-env');
    expect(ecsPreflight).toContain('RUN_PROD_ENV_CHECK');
    expect(ecsPreflight).toContain('FRONTEND_BASE_URL targets');
    expect(ecsPreflight).toContain('PUBLIC_API_BASE_URL targets');
    expect(ecsPreflight).toContain('check_deepseek_models');
    expect(ecsPreflight).toContain('check_worker_env');
    expect(ecsPreflight).toContain('nginx does not depend on subagent-worker');
    expect(ecsPreflight).toContain('backend process role is API-only');
    expect(ecsPreflight).toContain(
      'subagent-worker process role owns scheduler jobs',
    );
    expect(ecsPreflight).toContain('nginx/ssl/fullchain.pem');
    expect(ecsPreflight).toContain('check_port 443');
    expect(ecsInstallRelease).toContain('Checksum verified');
    expect(ecsInstallRelease).toContain('Dry run complete');
    expect(ecsInstallRelease).toContain('rsync -a --delete');
    expect(ecsInstallRelease).toContain("--exclude '.env.production'");
    expect(ecsInstallRelease).toContain("--exclude 'nginx/ssl/'");
    expect(ecsInstallRelease).toContain('Backed up existing target');
    expect(ecsInstallRelease).toContain('while [[ -e "$backup_dir" ]]');
    expect(ecsInstallRelease).toContain(
      'APP_DIR=%s ./scripts/ecs-host-preflight.sh',
    );
    expect(ecsUploadRelease).toContain('ECS_SSH_TARGET');
    expect(ecsUploadRelease).toContain('fitmeet-ecs-deploy.zip.sha256');
    expect(ecsUploadRelease).toContain('fitmeet-ecs-install-release.sh');
    expect(ecsUploadRelease).toContain('Dry run complete');
    expect(ecsUploadRelease).toContain(
      'scp "$ARCHIVE" "$CHECKSUM_FILE" "$INSTALLER"',
    );
    expect(ecsUploadRelease).toContain('--upload');
    expect(packageJson).toContain('seed:app-smoke-users');
    expect(smokeSeed).toContain('APP_SMOKE_SEED_ALLOW_PRODUCTION');
    expect(smokeSeed).toContain('APP_SMOKE_TARGET_USER_ID');
    expect(smokeSeed).toContain('FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID');
    expect(ecsPostDeploySmoke).toContain('--prepare-app-smoke-users');
    expect(ecsPostDeploySmoke).toContain(
      'pnpm -C backend run seed:app-smoke-users',
    );
    expect(ecsPostDeploySmoke).toContain('./scripts/verify-production.sh');
    expect(ecsPostDeploySmoke).toContain('APP_SMOKE_RUN_MUTATIONS');
    expect(ecsPostDeploySmoke).toContain('source "${export_file}"');
    expect(ecsRunbook).toContain(
      'cp deploy/env.production.ecs.example .env.production',
    );
    expect(ecsRunbook).toContain(
      'APP_DIR=/opt/FitMeet-web ./scripts/ecs-host-preflight.sh',
    );
    expect(ecsRunbook).toContain(
      './scripts/ecs-post-deploy-smoke.sh --run-app-smoke',
    );
  });

  it('keeps the ECS critical table check aligned with worker migrations', () => {
    const criticalTableCheck = readRepoFile(
      'backend/src/scripts/check-production-tables.ts',
    );

    for (const table of [
      'users',
      'agent_profiles',
      'user_social_profiles',
      'activity_templates',
      'subagent_worker_jobs',
      'subagent_worker_heartbeats',
      'subagent_worker_failures',
      'agent_activity_logs',
      'social_request_candidates',
      'life_graph_profiles',
    ]) {
      expect(criticalTableCheck).toContain(`'${table}'`);
    }
  });

  it('keeps Vercel and Railway platform deploy config explicit', () => {
    const vercel = readRepoFile('vercel.json');
    const vercelIgnore = readRepoFile('.vercelignore');
    const railway = readRepoFile('backend/railway.json');
    const railwayToml = readRepoFile('backend/railway.toml');
    const railwayEnv = readRepoFile('deploy/env.production.railway.example');
    const vercelEnv = readRepoFile('deploy/env.production.vercel.example');
    const cloudRunbook = readRepoFile('docs/deployment-vercel-railway.md');
    const cutoverChecklist = readRepoFile(
      'docs/production-cutover-checklist.md',
    );
    const secretsChecklist = readRepoFile(
      'docs/production-secrets-checklist.md',
    );
    const readme = readRepoFile('README.md');
    const launchPlan = readRepoFile('docs/launch-readiness-plan.md');

    expect(vercel).toContain('"outputDirectory": "frontend/dist"');
    expect(vercel).toContain('pnpm --dir frontend install --frozen-lockfile');
    expect(vercel).toContain('pnpm --dir frontend build');
    expect(vercel).toContain('"source": "/api/:path*"');
    expect(vercel).toContain(
      '"destination": "https://api.socialworld.world/api/:path*"',
    );
    expect(vercelIgnore).toContain('/backend/');
    expect(vercelIgnore).toContain('/fitmeet-landing/');
    expect(vercelIgnore).toContain('/docs/');
    expect(vercelIgnore).toContain('/*.zip');
    expect(vercelIgnore).toContain('/.vercel/');
    expect(vercelIgnore).toContain('/.railway/');
    expect(vercelIgnore).toContain('**/.env.*');
    expect(vercelIgnore).not.toContain('/frontend/');
    expect(railway).toContain('"builder": "DOCKERFILE"');
    expect(railway).toContain('"dockerfilePath": "Dockerfile.prod"');
    expect(railway).toContain('"startCommand": "node dist/main.js"');
    expect(railway).toContain('"healthcheckPath": "/api/health"');
    expect(railwayToml).toContain('builder = "DOCKERFILE"');
    expect(railwayToml).toContain('dockerfilePath = "Dockerfile.prod"');
    expect(railwayToml).toContain('startCommand = "node dist/main.js"');
    expect(railwayToml).toContain('healthcheckPath = "/api/health"');
    expect(railwayToml).toContain('restartPolicyType = "ON_FAILURE"');
    expect(railwayEnv).toContain('DATABASE_URL=postgresql://CHANGE_ME');
    expect(railwayEnv).toContain('MONGO_URI=mongodb://CHANGE_ME');
    expect(railwayEnv).toContain('REDIS_URL=redis://CHANGE_ME');
    expect(railwayEnv).toContain('ENABLE_KAFKA=false');
    expect(vercelEnv).toContain('VITE_API_BASE_URL=/api');
    expect(vercelEnv).toContain(
      'VITE_WS_BASE_URL=https://api.socialworld.world',
    );
    expect(cloudRunbook).toContain('backend/railway.json');
    expect(cloudRunbook).toContain('backend/railway.toml');
    expect(cloudRunbook).toContain('deploy/env.production.railway.example');
    expect(cloudRunbook).toContain('deploy/env.production.vercel.example');
    expect(cloudRunbook).toContain('pnpm migration:run:prod');
    expect(cloudRunbook).toContain('live: false');
    expect(cloudRunbook).toContain('socialworld.world');
    expect(cloudRunbook).toContain('--print-required-records');
    expect(cloudRunbook).toContain('Do not buy Spacemail');
    expect(cloudRunbook).toContain('LiuChong27/FitMeetweb');
    expect(cloudRunbook).toContain('LiuChong27/FitMeet-Web');
    expect(cutoverChecklist).toContain('Vercel project `fit-meetweb`');
    expect(cutoverChecklist).toContain('`www.ourfitmeet.cn` has no DNS answer');
    expect(cutoverChecklist).toContain('./scripts/launch-status.sh');
    expect(cutoverChecklist).toContain('--print-required-records');
    expect(cutoverChecklist).toContain('Do not buy Spacemail');
    expect(cutoverChecklist).toContain('pnpm migration:run:prod');
    expect(cutoverChecklist).toContain(
      'Scripts/testflight-readiness-check.sh --strict --require-staging',
    );
    expect(cutoverChecklist).toContain('docs/deployment-aliyun-ecs.md');
    expect(cutoverChecklist).toContain('docs/production-secrets-checklist.md');
    expect(secretsChecklist).toContain('Railway Backend');
    expect(secretsChecklist).toContain('Vercel Frontend');
    expect(secretsChecklist).toContain('iOS And TestFlight');
    expect(secretsChecklist).toContain(
      'Never put these in Vercel frontend env',
    );
    expect(secretsChecklist).toContain('S3_PUBLIC_BASE_URL');
    expect(secretsChecklist).toContain(
      'FITMEET_ALPHA_STAGING_MESSAGE_TARGET_USER_ID',
    );
    expect(readme).toContain('deployment-vercel-railway.md');
    expect(readme).toContain('production-cutover-checklist.md');
    expect(readme).toContain('production-secrets-checklist.md');
    expect(readme).toContain('./scripts/cloud-platform-preflight.sh');
    expect(readme).toContain('./scripts/domain-readiness-check.sh');
    expect(launchPlan).toContain('backend/railway.json');
    expect(launchPlan).toContain('production-cutover-checklist.md');
    expect(launchPlan).toContain('production-secrets-checklist.md');
    expect(launchPlan).toContain('cloud-platform-preflight.sh');
    expect(launchPlan).toContain('VITE_API_BASE_URL=/api');
  });

  it('keeps production verification cross-platform and Web/App contract aware', () => {
    const verifier = readRepoFile('scripts/verify-production.sh');
    const domainReadiness = readRepoFile('scripts/domain-readiness-check.sh');

    expect(verifier).toContain('/openapi/fitmeet-core.json');
    expect(verifier).toContain('CHECK_LOCAL_COMPOSE_HEALTH');
    expect(verifier).toContain('--check-local-compose-health');
    expect(verifier).toContain('subagent-worker-healthcheck.js');
    expect(verifier).toContain('/ready');
    for (const webPath of [
      '/public/social-intents',
      '/public/social-intents/{id}',
      '/public/social-intents/{id}/matches',
      '/feed/interactions',
      '/feed/{id}/like',
      '/feed/{id}/save',
      '/feed/{postId}/comments',
      '/feed/comments/{commentId}/like',
      '/messages/public-intents/{id}/start',
      '/agents/inbox/conversations',
      '/agents/inbox/conversations/{conversationId}/messages',
      '/agents/inbox/events',
      '/agents/inbox/events/ack',
      '/agents/inbox/conversations/{conversationId}/reply',
      '/agents/profile-matches',
      '/agents/profile-matches/{id}/ignore',
      '/agents/profile-matches/{id}/favorite',
      '/agents/profile-matches/{id}/draft-opener',
      '/agents/profile-matches/{id}/confirm-contact',
      '/agents/profile-matches/{id}/request-contact-exchange',
      '/agents/profile-matches/{id}/send-intro',
      '/uploads/video',
    ]) {
      expect(verifier).toContain(webPath);
    }
    expect(verifier).toContain('/social-agent/chat/run');
    expect(verifier).toContain('/social-agent/chat/run-async');
    expect(verifier).toContain('/social-agent/chat/route-message');
    expect(verifier).toContain('/social-agent/chat/stream');
    expect(verifier).toContain('/social-agent/chat/stream-user');
    expect(verifier).toContain(
      '/social-agent/chat/tasks/{taskId}/runs/{runId}',
    );
    expect(verifier).toContain(
      '/social-agent/chat/tasks/{taskId}/publish-social-request',
    );
    expect(verifier).toContain('/social-agent/chat/tasks/{taskId}/replan-run');
    expect(verifier).toContain(
      '/social-agent/chat/tasks/{taskId}/append-context',
    );
    expect(verifier).toContain('/social-agent/chat/tasks/{taskId}/actions');
    expect(verifier).toContain('/social-agent/chat/tasks/{taskId}/session');
    expect(verifier).toContain(
      '/social-agent/chat/tasks/{taskId}/send-message',
    );
    expect(verifier).toContain('/social-agent/tasks/{taskId}/events');
    expect(verifier).toContain('/social-agent/tasks/{taskId}/replan');
    expect(verifier).toContain('/auth/profile');
    expect(verifier).toContain('/social-agent/chat/session');
    expect(verifier).toContain('/messages/conversations');
    expect(verifier).toContain(
      'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"',
    );
    expect(verifier).toContain('APP_SMOKE_API_BASE_URL="${API_BASE_URL}"');
    expect(verifier).toContain('APP_SMOKE_ALLOW_REMOTE=true');
    expect(verifier).toContain('RUN_PUBLIC_INTENT_WRITE');
    expect(domainReadiness).toContain(
      'WEB_ORIGIN="${WEB_ORIGIN:-https://www.ourfitmeet.cn}"',
    );
    expect(domainReadiness).toContain(
      'API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"',
    );
    expect(domainReadiness).toContain('FITMEET_LAUNCH_TOPOLOGY');
    expect(domainReadiness).toContain('CHECK_VERCEL_WEB_DNS');
    expect(domainReadiness).toContain(
      'EXPECTED_VERCEL_APEX_A="${EXPECTED_VERCEL_APEX_A:-76.76.21.21}"',
    );
    expect(domainReadiness).toContain('RAILWAY_API_DNS_TARGET');
    expect(domainReadiness).toContain(
      'Required DNS records for the Aliyun ECS same-origin launch path',
    );
    expect(domainReadiness).toContain('--print-required-records');
    expect(domainReadiness).toContain(
      'Required DNS records for the Vercel + Railway launch path',
    );
    expect(domainReadiness).toContain('Do not buy Namecheap hosting');
    expect(domainReadiness).toContain('resolve_host "${web_host}"');
    expect(domainReadiness).toContain('resolve_host "${api_host}"');
    expect(domainReadiness).toContain('check_vercel_web_dns "${web_host}"');
    expect(domainReadiness).toContain('return 0');
    expect(domainReadiness).toContain('Web HTTPS');
    expect(domainReadiness).toContain('API health');
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
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_TOKENS');
    expect(realtimeSmoke).toContain('REALTIME_SMOKE_TOKENS_FILE');
    expect(realtimeSmoke).toContain('distinctTokens');
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
