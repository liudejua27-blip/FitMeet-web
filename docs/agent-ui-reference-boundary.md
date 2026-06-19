# FitMeet Agent UI Reference Boundary

This document locks the reference scope for the FitMeet Agent product work.
Do not expand the reference set unless the product direction is explicitly reopened.

## Current Mainline

FitMeet Agent should be built from this fixed combination:

1. `assistant-ui` ChatGPT Clone
   - Owns the primary frontend shell and chat details.
   - Use it for Thread, Composer, Message, ThreadList, ActionBar, BranchPicker, message density, attachments, focus states, hover states, and empty state.

2. `assistant-ui` Tool UI
   - Owns tool, approval, and generative card rendering.
   - Tool calls, approvals, candidate cards, Life Graph diffs, and Meet Loop state must be represented as message parts.
   - Do not restore page-level workbench panels for the main `/agent/chat` experience.

3. LangGraph interrupts
   - Owns backend checkpoint, resume, replay, and fork semantics.
   - Interrupt payloads must be durable, JSON-serializable, tied to a thread/run id, and safe to resume with idempotent side effects.

4. `langchain-ai/agent-chat-ui`
   - Reference only for tool process UI details.
   - Borrow patterns for tool timelines, interrupt/resume UI, tool result summaries, retry, replay, fork, and trace folding.
   - Do not migrate its overall shell, routing, state model, or backend protocol.

5. Lobe Chat
   - Deferred reference only after the main assistant-ui chat experience is stable.
   - Use later for multi-session maturity, settings, plugin/preferences, and account-level product details.

## Explicit Non-Goals For This Stage

- Do not add more frontend reference projects.
- Do not migrate the main shell away from assistant-ui.
- Do not bring back FitMeet workbench-style panels in `/agent/chat`.
- Do not make Codex pet or business cards part of the default main chat shell.
- Do not use external memory/chat products as runtime dependencies for Life Graph.

## Acceptance Rule

Any new Agent frontend or backend recovery change should answer:

- Does the main chat shell still follow assistant-ui ChatGPT Clone?
- Are tools and approvals represented as assistant-ui message parts?
- Do checkpoint/resume/replay/fork semantics follow LangGraph interrupt principles?
- Are tool process details borrowed only from agent-chat-ui, without migrating its product shell?
- Is Lobe Chat limited to later product maturity work?

If any answer is no, the change should be redesigned before implementation.
