# FitMeet Documentation Index

Last updated: 2026-06-29

This index is the routing table for production documentation. Each document has
an owner, status, and canonical flag. Allowed statuses are `canonical`,
`runbook`, `checklist`, `design`, `archive`, and `deprecated`.

## Architecture

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [architecture/core.md](architecture/core.md) | Engineering | canonical | yes | Product, route, backend module, Agent runtime, and database boundaries. |
| [architecture/data-model.md](architecture/data-model.md) | Backend | canonical | yes | Core schema families, removed table families, and migration policy. |
| [architecture/deprecation-register.md](architecture/deprecation-register.md) | Engineering | canonical | yes | Legacy code registry and deletion prerequisites. |

## Contracts

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [contracts/api-contract.md](contracts/api-contract.md) | Backend/Frontend | canonical | yes | Human-readable API contract index. |
| [contracts/client-api-integration-matrix.md](contracts/client-api-integration-matrix.md) | Frontend | checklist | yes | Client endpoint integration state and hard failure rules. |

## Development

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [development/local-runbook.md](development/local-runbook.md) | Engineering | runbook | yes | Local dependencies, startup, route list, and developer troubleshooting. |

## Deployment

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [deployment/index.md](deployment/index.md) | DevOps | canonical | yes | Deployment entrypoint and topology selector. |
| [deployment/cloud-vercel-railway.md](deployment/cloud-vercel-railway.md) | DevOps | runbook | yes | Vercel + Railway cloud deployment. |
| [deployment/ecs-fallback.md](deployment/ecs-fallback.md) | DevOps | runbook | yes | Aliyun ECS Docker Compose deployment. |
| [deployment/routing.md](deployment/routing.md) | DevOps | runbook | yes | Static frontend and `/api/*` routing boundary. |
| [deployment/cutover-checklist.md](deployment/cutover-checklist.md) | DevOps | checklist | yes | Production cutover checklist. |
| [deployment/secrets-checklist.md](deployment/secrets-checklist.md) | Security | checklist | yes | Production secrets boundary and storage rules. |
| [deployment/staging-validation-runbook.md](deployment/staging-validation-runbook.md) | QA/DevOps | runbook | yes | Staging validation steps. |

## Agent

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [agent/runtime.md](agent/runtime.md) | Agent Runtime | canonical | yes | Social Codex runtime protocol. |
| [agent/social-core-v1.md](agent/social-core-v1.md) | Agent Runtime | design | yes | Social Core v1 design and implementation order. |
| [agent/feature-flags.md](agent/feature-flags.md) | Agent Runtime | runbook | yes | Kill switches and feature flags. |
| [agent/release-gates.md](agent/release-gates.md) | QA/Agent Runtime | checklist | yes | Agent release and E2E matrix. |
| [agent/worker-roles.md](agent/worker-roles.md) | Backend | runbook | yes | API/worker process role separation. |
| [agent/staging-checklist.md](agent/staging-checklist.md) | QA | checklist | yes | Agent staging integration checklist. |
| [agent/ui-reference-boundary.md](agent/ui-reference-boundary.md) | Frontend | canonical | yes | Agent UI reference boundary. |
| [agent-skills/README.md](agent-skills/README.md) | Agent Runtime | canonical | yes | Workflow/skill contract entrypoint. |

## Operations

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [operations/performance-readiness.md](operations/performance-readiness.md) | Engineering/DevOps | canonical | yes | Capacity evidence policy and performance readiness. |
| [operations/incident-runbooks/candidate-pool-readonly-sql.md](operations/incident-runbooks/candidate-pool-readonly-sql.md) | Backend | archive | no | Archived candidate pool incident SQL. |

## Security And Product

| Document | Owner | Status | Canonical | Purpose |
| --- | --- | --- | --- | --- |
| [security/production-baseline.md](security/production-baseline.md) | Security | canonical | yes | Production security baseline and links. |
| [product/brand-manifesto.md](product/brand-manifesto.md) | Product/Brand | design | yes | FitMeet brand and product manifesto. |

## Package-Level Docs

`backend/README.md` and `frontend/README.md` may remain as package-local notes.
They must not redefine production architecture, deployment policy, or product
scope; link back to this index instead.
