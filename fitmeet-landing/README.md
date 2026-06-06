# FitMeet — Premium Immersive Landing

Enterprise-grade Next.js 14 landing template for the FitMeet connected wellness ecosystem.

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (custom luxury palette)
- Framer Motion (entrance / hover)
- GSAP (available for scroll choreography)
- Lenis (smooth scroll)
- Three.js + React Three Fiber + Drei (digital globe + orbits + particles)

## Run

```bash
cd fitmeet-landing
pnpm install   # or npm install / yarn
pnpm dev       # http://localhost:3000
```

## Verification

```bash
pnpm lint
pnpm build
pnpm test
pnpm test:rendered
```

`pnpm test` checks source-level landing composition, navigation, gateway data, and Agent Hub product copy. `pnpm test:rendered` must run after `pnpm build`; it verifies the prerendered `.next/server/app` HTML for `/`, `/agent-hub`, `/human`, `/pet`, and `/ai`.

## Structure

```
app/
  layout.tsx          Global shell (Navbar / SmoothScroll / Footer)
  page.tsx            Home composition
  globals.css         Tokens + Tailwind layers
components/
  Navbar.tsx          Transparent → glass on scroll
  HeroSection.tsx     Cinematic hero with 3D Earth
  earth/
    EarthScene.tsx        R3F canvas (mobile + WebGL fallback)
    DigitalGlobe.tsx      Wireframe + particle abstract globe
    OrbitingEntities.tsx  5 symbolic orbits
    ParticleField.tsx     Ambient star dust
  BrandPhilosophy.tsx
  EcosystemGateways.tsx   3 hover-expanding portals (data-driven)
  SymbiosisStory.tsx      5-node interactive network (SVG)
  VisionSection.tsx
  FinalCTA.tsx
  Footer.tsx
data/
  nav.ts
  gateways.ts             Three sub-site entries
  ecosystemNodes.ts       Symbiosis nodes
```

## Editorial Direction
- Tone: Aesop / Bottega Veneta — calm, editorial, cinematic.
- Motion: 1.2s ease `[0.22, 1, 0.36, 1]`, opacity + translate only.
- Color: Ivory / Charcoal / Moss / Olive / Silver / Earth (no cheap tech blue).
- A11y: semantic landmarks, focus-visible, prefers-reduced-motion.

All copy is in `data/*` and component props — safe to localize / extend.
