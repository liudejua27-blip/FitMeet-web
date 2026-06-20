# FitMeet Frontend Acceptance Checklist

Use this checklist before merging website or Agent UI changes.

## Scope

- Website routes: `/`, `/ecosystem`, `/app`, `/life-graph`, `/safety`, `/about`.
- Compatibility aliases such as `/legacy-home` must redirect to the canonical route instead of rendering duplicate product surfaces.
- Agent route: `/agent/chat` plus logged-in thread, streaming, Tool UI, approval, and restore states.
- Non-goals unless explicitly requested: deprecated `/hall`, legacy workspace shells, pet experiments, admin pages, city/sport/guide SEO pages.

## Build And Tests

- `pnpm --dir frontend exec tsc -b`
- `pnpm --dir frontend exec vitest run src/test/AgentWorkspacePage.test.tsx src/test/AgentRouteIsolation.test.ts src/test/AgentPageModuleAudit.test.ts src/test/toolProcessModel.test.ts src/test/agentAdapter.test.ts`
- `pnpm --dir frontend build`
- No TypeScript errors, Vite overlay, or production API-origin warnings.

## Visual QA

- Desktop screenshots: `/`, `/app`, `/life-graph`, `/safety`, `/agent/chat`.
- Mobile screenshots: `/`, `/agent/chat`, `/app`, `/life-graph`, `/safety`.
- No horizontal scrolling at 390px width.
- First viewport has a visible primary CTA.
- Website remains black-gold brand style.
- Agent remains assistant-ui ChatGPT-style chat and is not affected by website CSS.
- Agent process UI defaults to one covering status line, with detailed trace collapsed behind “查看过程”.

## Assets

- Hero and proof images use WebP `srcSet` with PNG fallback.
- Non-critical proof images use `loading="lazy"` and `decoding="async"`.
- Hero image stays visually sharp while avoiding full-size PNG download in modern browsers.
- New images must be added in at least two display widths when used above repeated cards.

## SEO

- `index.html` has clean Chinese title, description, keywords, canonical, OG, Twitter, and JSON-LD.
- Website routes update title, description, keywords, canonical, OG title, OG description, and OG URL.
- Core keywords remain represented: 需求流社交、同城社交、约练、找搭子、AI 社交平台、Life Graph、Agent.

## Accessibility

- All forms have labels or explicit `aria-label`.
- Icon-only buttons have `aria-label`.
- Keyboard focus is visible on website and Agent surfaces.
- CTA text is descriptive, not only an icon.
- Images that communicate product context have useful `alt`; decorative images use empty `alt`.
- Text contrast remains readable on black-gold surfaces.

## Regression Guard

- Website-specific CSS belongs in `src/styles/website-platform.css`.
- Agent chat UI belongs in `src/components/assistant-ui/*` and route-scoped assistant-ui components.
- Avoid adding new website or Agent overrides to `src/global.css`.
- Use route-scoped selectors such as `.fitmeet-website--earth` and assistant-ui component classes.
- When a shared token is needed, define it once and consume it through scoped components.

## Agent Chat Guard

- The Agent mainline must not render legacy workspace shells, pet DOM, old workbench panels, or old `agent-gpt-*` classes.
- Ordinary chat must not show social recommendation cards, Discover publishing prompts, or approval panels.
- Social/meet intent may show message-part Tool UI only: process status, SlotMemoryCard, OpportunityCard, CandidateCards, ApprovalPanel, MeetLoopTimeline.
- `replay.summary` and live SocialAgentEventV2 progress must render as one replaceable visible status. Raw JSON, tool names, trace IDs, planner text, and hidden chain-of-thought must not appear.
- Required test command: `pnpm --dir frontend exec vitest run src/test/AgentWorkspacePage.test.tsx src/test/AgentRouteIsolation.test.ts src/test/AgentPageModuleAudit.test.ts src/test/toolProcessModel.test.ts src/test/agentAdapter.test.ts`
- Manual spot-check:
  - 首 token 前应显示“正在理解/整理…”这类轻量状态，而不是空白等待。
  - 后端连续发多个过程事件时，UI 应覆盖更新同一条状态，不应默认追加长时间线。
  - 展开“查看过程”后只能看到用户可理解的审计摘要，不能看到内部协议名或调试字段。
  - 刷新后恢复 thread、messages、task slots、pending approval 和最新 run 状态，不应新建无意义会话。

## Future Visual Regression

- Add Playwright screenshot assertions for `/`, `/app`, `/life-graph`, `/safety`, `/agent/chat`.
- Keep one desktop and one mobile baseline per route.
- Fail CI on horizontal overflow, blank first viewport, missing primary CTA, or broken image loads.
