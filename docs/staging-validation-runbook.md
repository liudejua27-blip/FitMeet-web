# FitMeet Staging Validation Runbook

This is the release gate after PR #13. Do not deploy production from local
tests alone. Use an isolated staging host and staging-only data services.

## Required Staging Resources

- Staging Web domain, for example `https://staging.example.com`
- Staging API origin, for example `https://staging.example.com/api`
- Independent PostgreSQL, Redis, MongoDB, object storage, SSL files, and QA users
- Two QA accounts that can be reset or safely mutated by staging tests
- Current `main` release zip, sha256 file, and installer

Never point these scripts at:

```text
https://www.ourfitmeet.cn
https://ourfitmeet.cn
```

The staging scripts refuse those domains.

## Install And Deploy

On the staging ECS host:

```bash
cd /opt
ARCHIVE=/tmp/fitmeet-ecs-deploy.zip \
CHECKSUM_FILE=/tmp/fitmeet-ecs-deploy.zip.sha256 \
TARGET_DIR=/opt/fitmeet-staging \
bash ./fitmeet-ecs-install-release.sh --install

cd /opt/fitmeet-staging
PUBLIC_BASE_URL=https://staging.example.com \
PUBLIC_API_BASE_URL=https://staging.example.com/api \
RUN_STAGING_VERIFY=true \
RUN_STAGING_E2E=false \
bash ./scripts/deploy-staging-safe-ecs.sh
```

The deploy script records:

- release commit, source, builtAt
- redacted environment key list
- sanitized Docker Compose service summary only: service names, images, ports,
  and health check timing/retry metadata. Health check commands are redacted
  because Compose can expand Redis/Mongo passwords into those commands. Full
  resolved environment values are not written to evidence.
- migration output
- critical table check output
- compose status and recent logs
- rollback command with explicit code backup and database backup reference

## Full E2E

After the basic deploy is healthy:

```bash
cd /opt/fitmeet-staging
PUBLIC_BASE_URL=https://staging.example.com \
PUBLIC_API_BASE_URL=https://staging.example.com/api \
BASE_URL=https://staging.example.com \
API_BASE_URL=https://staging.example.com/api \
FITMEET_AGENT_BROWSER_QA_ALLOW_REMOTE=true \
STAGING_USER_A_EMAIL='qa-a@example.com' \
STAGING_USER_A_PASSWORD='...' \
STAGING_USER_B_EMAIL='qa-b@example.com' \
STAGING_USER_B_PASSWORD='...' \
RUN_STAGING_E2E=true \
bash ./scripts/verify-staging.sh
```

The browser E2E validates:

```text
A/B profile readiness
matching authorization
A publish request with missing safety boundary
slot completion card
browser refresh
manual "按默认安全设置处理"
activity card generation
publish confirmation
Discover detail and list read-back
matching result reaches current page/session
conversation handoff with B
```

The script writes screenshots and JSON/Markdown evidence under
`artifacts/staging-*`.

## Fault Injection

Only run on isolated staging:

```bash
cd /opt/fitmeet-staging
BASE_URL=https://staging.example.com \
API_BASE_URL=https://staging.example.com/api \
RUN_DESTRUCTIVE_FAULTS=true \
bash ./scripts/staging-fault-injection.sh
```

The harness collects state before and after:

- deterministic publish flow that creates a real `matching_jobs` row
- recorded `matchingJobId`, forced running lease, worker kill, lease expiry,
  and second worker recovery
- duplicate matching job and duplicate candidate-row checks for that
  `matchingJobId`
- worker restart
- Redis pause/recovery
- Mongo pause/recovery
- matching job and social request status summaries

Publish/dismiss concurrency and message timeout failures still require the
corresponding E2E request evidence and service logs. Record every failure with:

- reproduction steps
- request/response
- `taskId`
- `socialRequestId`
- `publicIntentId`
- `matchingJobId`
- backend and worker logs
- final database state
- root cause
- minimal fix PR

## Rollback

If validation fails after installing a release:

```bash
cd /opt/fitmeet-staging
APP_DIR=/opt/fitmeet-staging \
PUBLIC_BASE_URL=https://staging.example.com \
PUBLIC_API_BASE_URL=https://staging.example.com/api \
ROLLBACK_SOURCE=/opt/fitmeet-staging.backup.<timestamp> \
ROLLBACK_DB_BACKUP_REF=backup/staging-before-<timestamp>.sql \
ROLLBACK_MIGRATION_COMPATIBILITY_ACK=true \
bash ./scripts/rollback-staging-ecs.sh
```

`ROLLBACK_SOURCE` is required. The script will not auto-select the latest
backup because that can roll back to the wrong release. `ROLLBACK_DB_BACKUP_REF`
is also required so the rollback evidence identifies the database backup or
snapshot captured before rollback. The script restores code only; it does not
restore PostgreSQL, Redis, MongoDB, or object storage. Set
`ROLLBACK_MIGRATION_COMPATIBILITY_ACK=true` only after confirming the target
code can run against the current staging database schema, or after separately
restoring the referenced database backup.

The rollback preserves `.env.production` and `nginx/ssl/`.

## Go / No-Go

Go requires all of:

- `scripts/verify-staging.sh` passes for the deployed commit
- full E2E evidence includes non-empty `publicIntentId`
- Discover list and detail read back the same card
- matching reaches candidates or explicit no-candidates state
- current page updates without refresh
- B inbox receives the conversation
- fault injection recovers without duplicate active public intent or stuck jobs

Until this evidence exists, production remains No-Go.
