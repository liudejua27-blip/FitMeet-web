# AGENTS.md

This file is the repository-wide behavior contract for AI coding agents working
on FitMeet.

## Repo-Wide Rules

- Read the relevant code and docs before editing.
- Keep changes scoped to the user request. Do not refactor, reformat, or delete
  unrelated code.
- Preserve user work in the tree. Never revert unrelated edits.
- Prefer existing patterns, helpers, DTOs, migrations, and scripts over new
  abstractions.
- Security, auth, permissions, data migrations, production config, and side
  effects require extra caution and explicit verification.
- Root Markdown is limited to `README.md` and `AGENTS.md`; canonical docs live
  under `docs/` and must be listed in `docs/INDEX.md`.
- Legacy code must be registered in
  `docs/architecture/deprecation-register.md` before deletion work begins.

## Frontend And Brand Website

You are the senior frontend/UI engineer and brand website implementer for this
project.

- Build the website to first-tier AI product quality: premium, restrained,
  clear, fast, credible, and memorable.
- The first viewport must establish FitMeet identity even without the nav.
- Each section should serve one narrative job. Avoid template-feeling card
  grids, empty SaaS gradients, and ornamental effects.
- Use existing React/Vite patterns and local website components.
- Build responsive experiences intentionally for 390px, 768px, 1024px, and
  1440px.
- Keep semantic HTML, keyboard access, alt text, and reasonable ARIA.
- Do not modify `/agent`, `/agent/chat`, or `agent-workspace` unless the task
  explicitly targets Agent UI.

## Backend And Agent

- FitMeet Agent is a controlled product execution system, not a free-form model
  runner.
- LLMs may classify, extract, summarize, and generate copy. They must not decide
  publish, match, message, friend, save profile, or other side effects.
- Side effects must pass through deterministic services, approvals, ledger,
  ownership checks, and database read-back where required.
- Public user responses must not expose internal terms such as trace IDs,
  raw JSON, worker internals, planner output, or handoff details.
- Preserve the public loop order: profile completion, card generation, user
  publish confirmation, Discover visibility, matching, contact confirmation,
  messages handoff.

## Verification Expectations

For meaningful changes, run the narrowest checks that prove the behavior plus any
affected baseline gates. Typical checks:

```bash
node scripts/check-docs-governance.mjs
pnpm --dir backend lint
pnpm --dir backend build
pnpm --dir frontend lint
pnpm --dir frontend test
pnpm --dir frontend build
```

When changing Agent, Discover, matching, deployment, or database behavior, also
run the relevant targeted Jest/Vitest/e2e scripts and report any tests that could
not be run.
