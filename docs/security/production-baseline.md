# Production Security Baseline

Last updated: 2026-06-29

This document replaces the old root-level security checklist. It is a stable
baseline, not a running issue list.

## Required Production Defaults

- `NODE_ENV=production`
- `DB_SYNCHRONIZE=false`
- HTTPS-only public `BASE_URL` and `FRONTEND_BASE_URL`
- explicit `ALLOWED_ORIGINS` / `CORS_ORIGIN`; never `*`
- `JWT_SECRET` and webhook signing secrets stored only in server-side secret
  stores
- Redis-backed Agent cache in production:
  - `SOCIAL_AGENT_CACHE_BACKEND=redis` or `hybrid`
  - `SOCIAL_AGENT_TOOL_RESULT_CACHE_BACKEND=redis`
- DeepSeek/API model keys and object storage credentials never exposed to the
  frontend bundle.

## Agent And Social Loop Safety

- Profile saves, matching authorization, public Discover publishing, contact
  exchange, messages, friend requests, precise location, and sensitive memory
  writes require explicit confirmation according to their risk level.
- LLM output cannot execute side effects directly. It may classify, extract, and
  generate copy; deterministic backend services execute writes.
- Public user responses must not expose trace IDs, raw JSON, worker internals,
  planner data, or diagnostic handoff details.
- Discover publishing must read back the public intent and verify owner,
  linked request, active status, expiry, and source version before matching.

## Operational Checks

- Use [../deployment/secrets-checklist.md](../deployment/secrets-checklist.md)
  when filling production secrets.
- Use [../deployment/cutover-checklist.md](../deployment/cutover-checklist.md)
  before production cutover.
- Use [../agent/feature-flags.md](../agent/feature-flags.md) for Agent kill
  switches and feature flags.

## Supply Chain Gates

- Dependabot monitors backend, frontend, GitHub Actions, and the backend Docker
  base image.
- The `Security Baseline` GitHub Actions workflow runs CodeQL, dependency
  review for pull requests, Gitleaks secret scanning, and warning-level
  production dependency audits.
- Release archives still require local forbidden-file scans and SHA256 output.
  Artifact signing or attestation is not yet implemented and remains a release
  hardening item before enterprise-grade production claims.

## Deprecated Security Notes

Per-incident or one-off security findings should live in incident runbooks or
issue trackers. Do not place time-sensitive "fixed/not fixed" notes in this
baseline.
