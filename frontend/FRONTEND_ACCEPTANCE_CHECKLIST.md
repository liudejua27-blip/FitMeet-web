# FitMeet Frontend Acceptance Checklist

Use this checklist before merging website or Agent UI changes.

## Scope

- Website routes: `/`, `/legacy-home`, `/ecosystem`, `/app`, `/life-graph`, `/safety`, `/about`.
- Agent route: `/agent` and logged-in workspace states.
- Non-goals unless explicitly requested: `/hall`, `/meet`, `/profile`, admin pages, city/sport/guide SEO pages.

## Build And Tests

- `pnpm test -- AppWaitlistPage Layout LifeGraphPage`
- `pnpm build`
- No TypeScript errors, Vite overlay, or production API-origin warnings.

## Visual QA

- Desktop screenshots: `/`, `/app`, `/life-graph`, `/safety`, `/agent`.
- Mobile screenshots: `/`, `/agent`, `/app`, `/life-graph`, `/safety`.
- No horizontal scrolling at 390px width.
- First viewport has a visible primary CTA.
- Website remains black-gold brand style.
- Agent remains simple GPT-like workspace and is not affected by website CSS.

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
- Agent-specific CSS belongs in `src/styles/agent-workspace.css`.
- Avoid adding new website or Agent overrides to `src/global.css`.
- Use route-scoped selectors such as `.fitmeet-website--earth` and `.agent-workspace--gpt`.
- When a shared token is needed, define it once and consume it through scoped components.

## Future Visual Regression

- Add Playwright screenshot assertions for `/`, `/app`, `/life-graph`, `/safety`, `/agent`.
- Keep one desktop and one mobile baseline per route.
- Fail CI on horizontal overflow, blank first viewport, missing primary CTA, or broken image loads.
