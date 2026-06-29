# FitMeet 本地运行指南

本指南只覆盖当前保留的 FitMeet Web + Agent 闭环。旧的独立页面和发布入口已经下线，不应再作为开发或验收目标。

## 前置要求

- Node.js 22+
- pnpm 10.30.3
- Docker Desktop

## 启动依赖

在项目根目录启动后端依赖：

```bash
docker compose up -d postgres mongo redis
```

当前本地开发不需要 Kafka。后端默认采用 migration-first 策略：
`DB_SYNCHRONIZE=false`，需要先运行迁移。

```bash
cd backend
pnpm install --frozen-lockfile
pnpm migration:run
pnpm start:dev
```

后端 API 默认地址：

```text
http://localhost:3000/api
```

## 启动前端

新开一个终端：

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

前端默认地址：

```text
http://localhost:5173
```

## 当前可访问页面

主体验：

- `/`
- `/discover`
- `/features`
- `/agent`
- `/safety`
- `/download`
- `/about`
- `/demo`
- `/login`
- `/user/:id`
- `/public-intent/:id`

隐藏基础页：

- `/messages`
- `/privacy`
- `/terms`
- `/forgot-password`
- `/admin/safety`
- `/admin/waitlist`
- `/admin/agent-l5`

Agent 内部能力：

- `/agent/chat`
- `/agent/chat/:taskId`
- `/agent/profile`

## 核心验收

Agent 约练闭环：

1. 在 `/agent` 输入明确约练需求。
2. Agent 生成约练卡片，草稿态显示 `发布卡片 / 修改信息 / 暂不发布`。
3. 用户确认发布后，后端返回 `publicIntentId` 和 `discoverHref`。
4. `/discover` 能看到真实公开卡片。
5. 卡片详情打开 `/public-intent/:id`。

交友闭环：

1. 用户在 `/agent/profile` 完善基本信息、兴趣、运动偏好和安全边界。
2. Agent 可提出个人信息更新预览，但保存前必须由用户确认。
3. 约练卡片或公开画像进入候选池。
4. Match Agent 返回候选卡，支持查看详情、收藏、开场白预览、邀请、加好友和私信。
5. 邀请、加好友、私信等高风险动作必须 inline 确认。
6. 回复、邀请和私信进入 `/messages`。

Agent 成本边界：

- 普通聊天只走 `Agent Brain`。
- 个人信息补全只走 `Life Graph Agent`，每轮最多 2 个工具。
- 约练、发现同步、候选匹配、邀请/私信/加好友走 `Match Agent`，每轮最多 3 个工具。
- `docs/agent-skills/` 是 workflow/skill 合同，不是额外 subagent。

## 常用验证命令

```bash
pnpm --dir backend lint
pnpm --dir backend build
pnpm --dir frontend lint
pnpm --dir frontend build
node scripts/verify-agent-skills.mjs
node scripts/run-agent-skill-evals.mjs --backend
```

重点 Agent 闭环测试：

```bash
pnpm --dir backend exec jest \
  src/agent-gateway/social-agent-chat.acceptance.spec.ts \
  src/agent-gateway/social-agent-draft-publication.service.spec.ts \
  src/agent-gateway/social-agent-candidate-pool.service.spec.ts \
  src/agent-gateway/public-social-intent-list-query.spec.ts \
  src/agent-gateway/public-social-intent.presenter.spec.ts \
  src/users/social-profile.service.spec.ts --runInBand
```

重点前端路由和 Agent 测试：

```bash
pnpm --dir frontend exec vitest run \
  src/test/AgentRouteIsolation.test.ts \
  src/test/AgentWorkspacePage.test.tsx \
  src/test/DiscoverClosure.test.ts \
  src/test/DiscoverPage.test.tsx \
  src/test/routeBoundaries.test.ts \
  src/test/agentAdapter.test.ts \
  src/test/agentWorkspaceRuntime.test.ts \
  src/test/toolCardActions.test.ts \
  src/test/toolUiSchema.test.ts
```

## 常见问题

如果前端无法请求后端，检查 `frontend/.env.local`：

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

如果登录或 Agent 请求被 CORS 拦截，检查后端 `ALLOWED_ORIGINS` 包含：

```text
http://localhost:5173,http://127.0.0.1:5173
```

如果数据库 schema 异常，先确认当前迁移目录只保留 core baseline：

```bash
find backend/src/database/migrations -maxdepth 1 -type f -print
```

旧生产库不能直接跑新的 baseline。需要先备份，再重建 schema 或做受控数据迁移。
