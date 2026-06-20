# Discover 入口收敛清单（扫描与自动化）

已对 `frontend` 做了二次扫描，重点覆盖：路由层、网关入口、落地页卡片、导航按钮。

## 一、入口收敛现状（按职责面）

### 1) 路由收敛（已完成）
- `frontend/src/lib/scrollNavigation.ts`
  - `DISCOVER_PATH = '/discover'`
  - `DISCOVER_ALIAS_ROUTES = ['/human','/nearby','/meet','/hall','/social-hall','/agent-connect/social-hall']`
  - `ENTRY_ALIAS_ROUTES` 映射包含 `/app` `/download-app` -> `/download`
  - `resolveNavigationAlias` 与 `navigateToRouteWithScrollReset` 提供统一重定向和滚动复位
- `frontend/src/routes/AppRoutes.tsx`
  - `'/hall'/'/nearby'/'/meet'/'/human'/'/social-hall'/'/agent-connect/social-hall'` 全部走 `DiscoverAliasRoute`
  - `'/discover'` 走 `DiscoverPage`
  - `'/download-app'`、`'/app'` 重定向到 `'/download'`
  - `'/legacy-home'` 仅作为兼容别名重定向到 `'/'`，不再渲染独立首页
- `frontend/src/routes/routeBoundaries.ts`
  - `publicWebsiteRoutes` 已包含 `'/discover'`、`'/app'`、`'/download-app'`

### 2) 官网入口（已归一）
- `frontend/src/components/website/WebsitePlatform.tsx`
  - canonical 官网首页和内页入口由该组件承载
  - Discover CTA 直接使用 `/discover` 或 discover-aware navigation
- 旧宇宙首页入口已移除：
  - `frontend/src/pages/HomePage.tsx`
  - `frontend/src/data/gateways.ts`
  - `frontend/src/data/heroCopy.ts`
  - `frontend/src/components/hero/*`
  - `frontend/src/components/showcase/*`

### 3) 落地页卡片入口（统一透传）
- `frontend/src/data/geoLandingPagesData.mjs`
  - 所有场景卡片 action 链路仍统一使用 `/discover` 或 `/discover?category=...`
- `frontend/src/pages/GeoLandingPage.tsx`
  - 入口按钮复用 `actions` 数据并跳转 `/discover`
- canonical 首页由 `frontend/src/pages/PlatformPage.tsx` / `frontend/src/components/website/WebsitePlatform.tsx` 承载
  - 旧 `HomePage.tsx` / `HomePage.legacy.tsx` 已移除；`/legacy-home` 不再是 Discover 入口测试面
- `frontend/src/pages/SportsPage.tsx`
  - `key={s.id} to={`/discover?category=${s.id}`}`
- `frontend/src/pages/CitiesPage.tsx`
  - `to={`/discover?city=${encodeURIComponent(c.city)}`}`

### 4) 导航按钮与内页入口（已集中）
- `frontend/src/components/Layout.tsx`
  - 桌面导航含 `/discover`
  - 底部 Tab `nearby` 配置映射到 `'/discover'`
- `frontend/src/components/website/WebsitePlatform.tsx`
  - 多处主按钮 `to="/discover"` / `to` 配置 `'/discover'`
- `frontend/src/components/agent/AgentConnectPage.tsx`
  - 发现入口 `to="/discover"`
- `frontend/src/pages/DiscoverPage.tsx`
  - 内部导航、返回入口使用 `'/discover'`
- `frontend/src/pages/SocialRequestDetailPage.tsx`
  - 默认落地动作含 `to="/discover"`

### 5) 内容/展示层入口（信息层）
- 旧 `ProductMotionShowcase` / `UniversePortal` / `heroCopy` 不再参与生产入口。
- 新增内容卡片时应直接使用 `SiteLink` / `DiscoverLink` 或 `navigateToRouteWithScrollReset`。

### 6) 生成脚本 / SEO 关联（需要持续检查）
- `frontend/scripts/generate-geo-static.mjs`
  - sitemap/静态页列表仍包含 `'/discover'`、`'/meet'`（`/meet` 是 discover alias）
- `frontend/src/pages/DiscoverPage.tsx`
  - 分享链接 `window.location.origin + '/discover?id=...'`

### 7) 风险点（静态内容）
- `frontend/public/**/*.html` 当前未见 `href="/discover"` 的直接站点入口；
  JSON-LD 中仍有 `/discover` URL，只是内容索引信息，不是交互按钮。
- 若今后迁移静态页面到 SPA 动态路由，应统一复用 `SiteLink` 风格或 `navigateToRouteWithScrollReset` 的能力。

## 二、自动化清单

### A. 静态扫描（新增）
- 执行：`cd frontend && pnpm run check:discover-entrypoints`
- 目标：
  - 检查源码中 `/discover`、`/nearby`、`/meet`、`/hall`、`/social-hall`、`/agent-connect/social-hall`、`/app`、`/download-app` 是否统一走：
    - `SiteLink / DiscoverLink`（或明确映射重定向）
    - `scrollNavigation.resolveNavigationAlias`
    - `navigateToRouteWithScrollReset`
  - 检查 alias 在 `scrollNavigation.ts`、`AppRoutes.tsx`、`routeBoundaries.ts` 一致性
  - 统计 public html 中 /discover 直接 anchor（如为 SEO 静态页，需单独确认）

### A2. Playwright 入口冒烟（新增）
- 先启动本地站点，例如：`cd frontend && pnpm dev -- --host 127.0.0.1`
- 执行：`cd frontend && pnpm run smoke:discover-entrypoints`
- 指定环境执行：
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm run smoke:discover-entrypoints`
  - `FITMEET_E2E_BASE_URL=https://www.ourfitmeet.cn pnpm run smoke:discover-entrypoints`
- 覆盖行为：
  - 扫描关键页面中所有 `data-testid="discover-entry"` 的入口；
  - 逐个点击并断言最终路径为 `/discover`；
  - 保留 `/discover?...` query；
  - 点击后滚动回顶部；
  - 直接访问 `/human`、`/nearby`、`/meet`、`/hall`、`/social-hall`、`/agent-connect/social-hall` 时统一收敛到 `/discover`。

### B. 单测建议（建议补齐）
1. `frontend/src/lib/scrollNavigation.ts` 覆盖：
   - alias 标准化：`/human`/`/hall` -> `/discover`
   - query/hash 保留
   - `navigateToRouteWithScrollReset('/discover?...')` 触发 scroll reset（可配合 mock）
2. `Layout` / `WebsitePlatform` / `HeroNavigation` 导航组件冒烟：
   - 发现入口按钮最终生成 `href="/discover"` 且通过 `SiteLink`
3. `Landing data` 冒烟：
   - `geoLandingPagesData.mjs` 中发现入口应只产生 `/discover*`
4. `AppRoutes + routeBoundaries` 对齐：
   - alias route 都存在
   - `'/app'`、`'/download-app'` 仍映射到 `/download`

### C. 回归防线（CI 建议）
- `pnpm run lint`
- `pnpm run test --discover`（按需拆分对应测试）
- `pnpm run check:discover-entrypoints`
- `pnpm run smoke:discover-entrypoints`
- `pnpm run build`
- 手工回归：
  - `/discover` / `/human` / `/hall` / `/meet` / `/nearby` / `/agent-connect/social-hall` 三端行为一致
  - “进入发现”入口均滚动到页面顶部

## 三、你可直接复用的高风险检查清单
- [ ] 是否存在新的直接 `<a href="/discover...">`（未走 `SiteLink`）？
- [ ] 是否出现新的 `window.location.href = '/discover...'` 直接跳转？
- [ ] 新增入口是否缺少 `scroll reset`？
- [ ] 新增 alias route 是否缺少 `DiscoverAliasRoute` 或 `ENTRY_ALIAS_ROUTES` 映射？
- [ ] `/app`、`/download-app` 是否仍为纯 redirect 到 `/download`，不单独挂载业务页？
- [ ] discover 分享/回链是否仍保留 query 回传？

## 四、V2 全量入口收敛地图（按页面/组件）

以下是按“页面/组件实际触发 Discover 跳转”的全量扫描点（剔除测试文件）：

### A. 路由与边界（唯一真源）
- `frontend/src/lib/scrollNavigation.ts`
  - `DISCOVER_PATH`、`DISCOVER_ALIAS_ROUTES`、`ENTRY_ALIAS_ROUTES`
  - `resolveNavigationAlias`、`isInternalDiscoverRoute`、`navigateToRouteWithScrollReset`
- `frontend/src/routes/AppRoutes.tsx`
  - `/discover`  -> `DiscoverPage`
  - `/human`、`/nearby`、`/meet`、`/social-hall`、`/agent-connect/social-hall` -> `DiscoverAliasRoute`
  - `/app`、`/download-app` -> `/download` redirect
- `frontend/src/routes/routeBoundaries.ts`
  - `publicWebsiteRoutes` 中含 `/discover`、`/app`、`/download-app`

### B. 数据侧入口源（应统一归口）
- 旧 `frontend/src/data/gateways.ts` / `frontend/src/data/heroCopy.ts` 已删除，不能作为入口源回流。
- `frontend/src/data/geoLandingPagesData.mjs`
  - 全量场景卡片按钮统一为 `/discover` / `/discover?category=...`
- `frontend/src/pages/GeoLandingPage.tsx`
  - 继承上述 `actions` 数据渲染 `/discover` 类入口

### C. 导航按钮 / 全站入口（建议必须使用 `SiteLink`）
- `frontend/src/components/Layout.tsx`
  - 底部/主导航中的 `to: '/discover'`
  - `tab.to === '/discover'` 分支逻辑
- `frontend/src/components/website/WebsitePlatform.tsx`
  - 顶部/功能区的 `/discover` CTA 多点入口
- `frontend/src/components/agent/AgentConnectPage.tsx`
  - `href: '/discover'`
- canonical 首页组件
  - 入口必须经 `SiteLink` / `DiscoverLink` 或 `navigateToRouteWithScrollReset`，旧 `HomePage.tsx`、旧 hero/showcase/gateway 入口不得回流
- `frontend/src/pages/SportsPage.tsx`
  - `to={`/discover?category=${s.id}`}`、`to="/discover"`
- `frontend/src/pages/CitiesPage.tsx`
  - `to={`/discover?city=${encodeURIComponent(c.city)}`}`
- `frontend/src/pages/SocialRequestDetailPage.tsx`
  - `to="/discover"`
- `frontend/src/pages/DiscoverPage.tsx`
  - 页面内返回/导航动作指向 `/discover`
- `frontend/index.html`
  - 静态 `<a href="/discover">发现</a>`（注意：静态锚点与 `SiteLink` 行为不一致）

### D. 业务回链
- `frontend/src/components/meet/MeetDetail.tsx`
  - `shareUrl = `${window.location.origin}/discover?id=${meet.id}``
  - 该链路不属于入口点击行为，但属于发现页回链目标

### E. 生成与脚本
- `frontend/scripts/generate-geo-static.mjs`
  - `sitemap/seo` 中出现 `/discover` 与 `/meet`（`/meet` 作为 discover alias）
- `frontend/src/test` 中对应快照/导航测试文件包含 discover 期望（非生产入口）

## 五、V2 自动化检查清单（建议直接接 CI）

### 1) 必选命令（前置）
- `cd frontend && pnpm lint`
- `cd frontend && pnpm test src/test/scrollNavigation.test.ts src/test/routeBoundaries.test.ts src/test/Layout.test.tsx`
- `cd frontend && pnpm test -- runInBand`（或现有等价的项目入口）
- `cd frontend && pnpm build`

### 2) 入口行为契约检查（新增，建议纳入）
1. `pnpm run check:discover-entrypoints`
   - 目标：验证 `target route` 只通过统一 alias 与 discover-aware 入口链路
   - 当前版本若脚本存在警告级别误报，可先在 `--verbose` 下人工核对，再按阶段收敛改造
2. `./scripts/verify-discover-enterprise-routes.mjs`（建议新增）
   - 按以下规则做白名单校验：
     - 所有 `href="/discover...` 在 source 中应为 `SiteLink`/`DiscoverLink` 渲染路径
     - 不应出现 `window.location.*="/discover"` 直接跳转
     - `/discover` 与 `/app` `/download-app` 重定向行为在 route/alias/边界三层必须一致

### 3) 回归 UI 检查（Playwright）
- 以页面集合为单元，点击每个 discover 入口后校验：
  - URL 为 `/discover`（带 query 时保留 query）
  - 导航后窗口滚动到顶部（如产品策略要求）
  - 重复快速点击不产生 history 污染（仅首次滚动到 top + 正常切换）
- 采样检查入口：
  - `/`（首页：主要按钮与底部/顶部入口）
  - `/agent`（若有 discover 引导）
  - `/sports`
  - `/cities`
- 入口行为用例必须覆盖 `/human`、`/nearby`、`/meet`、`/social-hall`

### 4) 风险门槛（发布前）
- 发现任何 `href="/discover"` 的静态锚点直接写入（除 index/SEO 例外）即阻断
- 任何 alias 新增后若未同步 `scrollNavigation` + `AppRoutes` + `routeBoundaries` 即阻断
- `/app`、`/download-app` 必须只允许 redirect 到 `/download`
