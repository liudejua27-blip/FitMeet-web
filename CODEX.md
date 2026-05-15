# Codex Project Guidelines

These rules guide Codex when making changes in this repository. They are adapted from the provided `CLAUDE.md` reference and keep only the parts that improve code quality, reduce unnecessary diffs, and make work easier to verify.

## 1. Understand Before Editing

- Read the relevant existing code before proposing or applying changes.
- State assumptions when they affect behavior, architecture, data, security, or deployment.
- Ask a clarifying question when ambiguity could lead to incompatible implementations.
- For low-risk ambiguity, make a conservative assumption, mention it, and continue.

## 2. Keep Changes Small

- Implement only what the user asked for.
- Avoid speculative features, optional configuration, or broad rewrites.
- Do not add abstractions for single-use logic unless the local codebase already uses that pattern.
- Prefer the simplest implementation that fits the existing design.

## 3. Respect Existing Code

- Match the style, structure, naming, and patterns already present nearby.
- Touch only files and lines that are needed for the requested outcome.
- Do not refactor, reformat, rename, or reorganize unrelated code.
- If unrelated dead code or defects are noticed, mention them instead of fixing them silently.

## 4. Clean Up Only Your Own Changes

- Remove imports, variables, functions, files, and comments made unused by the current change.
- Do not remove pre-existing unused code unless the user explicitly asks.
- Avoid metadata churn, lockfile changes, or formatting changes unless required by the task.

## 5. Work Toward Verifiable Goals

- Define success in terms of observable behavior, tests, builds, lint checks, or manual verification.
- For bug fixes, prefer reproducing the issue before changing the implementation when practical.
- For multi-step work, keep a short plan and update it as the work changes.
- Continue until the change is implemented and reasonably verified, or clearly explain the blocker.

## 6. Prefer Caution on Risky Surfaces

- Be especially careful with authentication, permissions, payments, data migrations, production config, and security-sensitive code.
- Avoid destructive commands and irreversible data changes unless explicitly requested.
- Preserve user changes in the working tree and never revert unrelated edits.

## 7. Final Response Expectations

- Summarize what changed and where.
- Mention the verification performed and any checks that could not be run.
- Keep the final answer concise and focused on the user's goal.
